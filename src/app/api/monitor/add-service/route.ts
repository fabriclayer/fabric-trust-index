import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { addDiscoveredService, classifyCategory, deriveCapabilities } from '@/lib/discovery/pipeline'
import { resolveServiceMetadata } from '@/lib/discovery/enrich'
import { runAllCollectors } from '@/lib/collectors/runner'
import { generateAssessment } from '@/lib/assessment-generator'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, homepage_url } = body
  // Normalize github_repo: strip full URL to owner/repo format
  let github_repo: string | undefined = body.github_repo
  if (github_repo) {
    github_repo = github_repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\/$/, '')
  }

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Derive slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Derive publisher from github org or name
  const githubOrg = github_repo ? github_repo.split('/')[0] : undefined
  const publisher = githubOrg || name

  // Run enrichment to discover metadata from GitHub, npm, PyPI
  const enriched = await resolveServiceMetadata({
    slug,
    name,
    github_org: githubOrg,
    github_repo: github_repo || undefined,
    homepage_url: homepage_url || undefined,
  })

  // Use enriched topics + slug for better category classification
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
    // Check if it's a duplicate — if so, re-score the existing service
    const { data: existing } = await supabase
      .from('services')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!existing) {
      return NextResponse.json({ error: `Failed to add service: ${insertResult}` }, { status: 500 })
    }
    isRescore = true

    // Update existing service metadata with any new values from the form + enrichment
    const updates: Record<string, string | null> = {}
    if (github_repo) updates.github_repo = github_repo
    if (homepage_url) updates.homepage_url = homepage_url
    if (enriched.npm_package && !existing.npm_package) updates.npm_package = enriched.npm_package
    if (enriched.pypi_package && !existing.pypi_package) updates.pypi_package = enriched.pypi_package
    if (enriched.github_repo && !existing.github_repo && !github_repo) updates.github_repo = enriched.github_repo
    // Reclassify if category was 'skill' (ClawHub default) — likely wrong for real services
    if (existing.category === 'skill') updates.category = category
    if (Object.keys(updates).length > 0) {
      await supabase.from('services').update(updates).eq('slug', slug)
    }

    // Log re-score to discovery_queue so it appears in Added Services list
    await supabase.from('discovery_queue').insert({
      source: 'monitor:manual',
      query: name,
      package_name: name,
      status: 'completed',
      result: { slug, name, category },
      processed_at: new Date().toISOString(),
    })
  }

  // Apply enriched metadata to the service record
  const metaUpdates: Record<string, string | null> = {}
  if (enriched.description && !isRescore) metaUpdates.description = enriched.description
  if (enriched.logo_url) metaUpdates.logo_url = enriched.logo_url
  if (enriched.docs_url) metaUpdates.docs_url = enriched.docs_url
  if (enriched.x_url) metaUpdates.x_url = enriched.x_url
  if (enriched.discord_url) metaUpdates.discord_url = enriched.discord_url
  if (enriched.license) metaUpdates.license = enriched.license
  if (enriched.endpoint_url) metaUpdates.endpoint_url = enriched.endpoint_url
  if (Object.keys(metaUpdates).length > 0) {
    await supabase.from('services').update(metaUpdates).eq('slug', slug)
  }

  // Also update publisher with website_url if we found a homepage
  if (enriched.homepage_url || homepage_url) {
    const { data: svc } = await supabase.from('services').select('publisher_id').eq('slug', slug).single()
    if (svc?.publisher_id) {
      const { data: pub } = await supabase.from('publishers').select('website_url').eq('id', svc.publisher_id).single()
      if (pub && !pub.website_url) {
        await supabase.from('publishers').update({ website_url: homepage_url || enriched.homepage_url }).eq('id', svc.publisher_id)
      }
    }
  }

  // Fetch the service for scoring
  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .single()

  // Score and generate assessment in the background so the form responds immediately
  after(async () => {
    if (service) {
      try {
        await runAllCollectors(service)
      } catch (err) {
        console.error(`Scoring failed for ${slug}:`, err)
      }
      try {
        await generateAssessment(service.id)
      } catch (err) {
        console.error(`Assessment failed for ${slug}:`, err)
      }
    }
  })

  return NextResponse.json({
    ok: true,
    slug,
    rescore: isRescore,
    enriched: {
      github_repo: enriched.github_repo || undefined,
      npm_package: enriched.npm_package || undefined,
      pypi_package: enriched.pypi_package || undefined,
      description: enriched.description ? true : undefined,
      logo_url: enriched.logo_url ? true : undefined,
      docs_url: enriched.docs_url || undefined,
      x_url: enriched.x_url || undefined,
      discord_url: enriched.discord_url || undefined,
      license: enriched.license || undefined,
      language: enriched.language || undefined,
    },
    scoring: { queued: true },
  })
}
