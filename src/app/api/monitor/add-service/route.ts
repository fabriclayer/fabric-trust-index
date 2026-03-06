import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { addDiscoveredService, classifyCategory, deriveCapabilities } from '@/lib/discovery/pipeline'
import { resolveServiceMetadata } from '@/lib/discovery/enrich'
import { runAllCollectors } from '@/lib/collectors/runner'
import { generateAssessment } from '@/lib/assessment-generator'

export const maxDuration = 300

// ── Helper: add (or re-score) a single service ──
async function addSingleService({ name, github_repo, homepage_url, x_url }: {
  name: string; github_repo?: string; homepage_url?: string; x_url?: string
}): Promise<{ slug: string; rescore: boolean; error?: string }> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const githubOrg = github_repo ? github_repo.split('/')[0] : undefined
  const publisher = githubOrg || name

  const enriched = await resolveServiceMetadata({
    slug,
    name,
    github_org: githubOrg,
    github_repo: github_repo || undefined,
    homepage_url: homepage_url || undefined,
  })

  const categoryKeywords = enriched.category_keywords ?? []
  const category = classifyCategory(categoryKeywords, slug)

  const insertResult = await addDiscoveredService({
    name,
    slug,
    publisher,
    description: enriched.description || '',
    category,
    npm_package: enriched.npm_package,
    pypi_package: enriched.pypi_package,
    github_repo: github_repo || enriched.github_repo || undefined,
    github_org: githubOrg,
    source: 'monitor:manual',
    capabilities: deriveCapabilities(categoryKeywords),
    tags: categoryKeywords,
    homepage_url: homepage_url || enriched.homepage_url || undefined,
    language: enriched.language,
  })

  const supabase = createServerClient()
  let isRescore = false

  if (insertResult !== true) {
    const { data: existing } = await supabase
      .from('services')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!existing) {
      return { slug, rescore: false, error: `Failed to add service: ${insertResult}` }
    }
    isRescore = true

    const updates: Record<string, string | null> = {}
    if (github_repo) updates.github_repo = github_repo
    if (homepage_url) updates.homepage_url = homepage_url
    if (x_url) updates.x_url = x_url
    if (enriched.npm_package && !existing.npm_package) updates.npm_package = enriched.npm_package
    if (enriched.pypi_package && !existing.pypi_package) updates.pypi_package = enriched.pypi_package
    if (enriched.github_repo && !existing.github_repo && !github_repo) updates.github_repo = enriched.github_repo
    if (existing.category === 'skill') updates.category = category
    if (Object.keys(updates).length > 0) {
      await supabase.from('services').update(updates).eq('slug', slug)
    }

    await supabase.from('discovery_queue').insert({
      source: 'monitor:manual',
      query: name,
      package_name: name,
      status: 'completed',
      result: { slug, name, category },
      processed_at: new Date().toISOString(),
    })
  }

  // Apply enriched metadata
  const metaUpdates: Record<string, string | null> = {}
  if (enriched.description && !isRescore) metaUpdates.description = enriched.description
  if (enriched.logo_url) metaUpdates.logo_url = enriched.logo_url
  if (enriched.docs_url) metaUpdates.docs_url = enriched.docs_url
  if (x_url) metaUpdates.x_url = x_url
  else if (enriched.x_url) metaUpdates.x_url = enriched.x_url
  if (enriched.discord_url) metaUpdates.discord_url = enriched.discord_url
  if (enriched.license) metaUpdates.license = enriched.license
  if (enriched.endpoint_url) metaUpdates.endpoint_url = enriched.endpoint_url
  if (Object.keys(metaUpdates).length > 0) {
    await supabase.from('services').update(metaUpdates).eq('slug', slug)
  }

  // Update publisher website_url
  if (enriched.homepage_url || homepage_url) {
    const { data: svc } = await supabase.from('services').select('publisher_id').eq('slug', slug).single()
    if (svc?.publisher_id) {
      const { data: pub } = await supabase.from('publishers').select('website_url').eq('id', svc.publisher_id).single()
      if (pub && !pub.website_url) {
        await supabase.from('publishers').update({ website_url: homepage_url || enriched.homepage_url }).eq('id', svc.publisher_id)
      }
    }
  }

  // Score + assess in the background
  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .single()

  after(async () => {
    if (service) {
      try { await runAllCollectors(service) } catch (err) {
        console.error(`Scoring failed for ${slug}:`, err)
      }
      try { await generateAssessment(service.id) } catch (err) {
        console.error(`Assessment failed for ${slug}:`, err)
      }
    }
  })

  return { slug, rescore: isRescore }
}

// ── Derive a human-readable name from a repo name ──
function repoNameToTitle(repoName: string): string {
  return repoName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, homepage_url, x_url } = body

  // Normalize github_repo: strip full URL to owner/repo or org format
  let github_repo: string | undefined = body.github_repo
  if (github_repo) {
    github_repo = github_repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\/$/, '')
  }

  // ── Org mode: fetch all repos and add each as a service ──
  const isOrg = github_repo && !github_repo.includes('/')
  if (isOrg) {
    const orgName = github_repo!
    const res = await fetch(`https://api.github.com/orgs/${orgName}/repos?type=sources&per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch repos for org "${orgName}": ${res.status}` }, { status: 502 })
    }
    const repos = (await res.json()) as Array<{ name: string; archived: boolean; full_name: string }>

    // Filter out archived repos
    const activeRepos = repos.filter(r => !r.archived)

    if (activeRepos.length === 0) {
      return NextResponse.json({ error: `No active repos found for org "${orgName}"` }, { status: 404 })
    }

    const added: string[] = []
    const skipped: string[] = []

    for (const repo of activeRepos) {
      const serviceName = repoNameToTitle(`${orgName}-${repo.name}`)
      const result = await addSingleService({
        name: serviceName,
        github_repo: repo.full_name,
        homepage_url: homepage_url || undefined,
        x_url: x_url || undefined,
      })
      if (result.error) {
        skipped.push(repo.name)
      } else {
        added.push(result.slug)
      }
    }

    return NextResponse.json({
      ok: true,
      org: orgName,
      added,
      skipped,
      total: activeRepos.length,
    })
  }

  // ── Single service mode ──
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const result = await addSingleService({ name, github_repo, homepage_url, x_url })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    slug: result.slug,
    rescore: result.rescore,
    scoring: { queued: true },
  })
}
