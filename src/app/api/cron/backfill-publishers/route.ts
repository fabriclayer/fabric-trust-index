import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { CI_BOT_NAMES } from '@/lib/discovery/bot-filter'

export const maxDuration = 300

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/**
 * Backfill: fix services with missing or "Unknown" publishers.
 *
 * Resolution priority:
 * 1. npm org scope — @scope/pkg → scope
 * 2. npm maintainers API — registry.npmjs.org/{pkg} → maintainers[0].name
 * 3. PyPI author — pypi.org/pypi/{pkg}/json → info.author
 * 4. GitHub repo owner — owner/repo → owner
 *
 * Also resolves publisher website_url from npm homepage or PyPI project URL.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Fetch all services with their current publisher name
  const allServices: Array<{
    id: string
    name: string
    publisher_id: string
    publisher_name: string
    npm_package: string | null
    pypi_package: string | null
    github_repo: string | null
  }> = []

  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, publisher_id, npm_package, pypi_package, github_repo, publisher:publishers(name)')
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const row of data) {
      allServices.push({
        id: row.id,
        name: row.name,
        publisher_id: row.publisher_id,
        publisher_name: (row.publisher as any)?.name ?? 'Unknown',
        npm_package: row.npm_package,
        pypi_package: row.pypi_package,
        github_repo: row.github_repo,
      })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // Identify services needing fix: publisher is "Unknown", empty, or a CI bot
  const needsFix = allServices.filter(s => {
    const name = s.publisher_name.toLowerCase()
    return name === 'unknown' || name === '' || CI_BOT_NAMES.has(name)
  })

  // Pre-load existing publishers for fast lookup
  const publisherCache = new Map<string, string>() // slug → id
  const { data: existingPubs } = await supabase.from('publishers').select('id, slug')
  if (existingPubs) {
    for (const p of existingPubs) {
      publisherCache.set(p.slug, p.id)
    }
  }

  let fixedCount = 0
  const stillUnknown: Array<{ name: string; reason: string }> = []
  const fixedSamples: Array<{ service: string; old_publisher: string; new_publisher: string; source: string }> = []

  for (const service of needsFix) {
    let resolvedName: string | null = null
    let source = ''
    let npmOrg: string | null = null
    let githubOrg: string | null = null
    let websiteUrl: string | null = null

    // 1. npm org scope
    if (!resolvedName && service.npm_package?.startsWith('@')) {
      const scope = service.npm_package.split('/')[0].slice(1)
      if (scope && !CI_BOT_NAMES.has(scope.toLowerCase())) {
        resolvedName = scope
        source = 'npm_scope'
        npmOrg = scope
      }
    }

    // 2. npm maintainers API (also grabs homepage for website_url)
    if (!resolvedName && service.npm_package) {
      try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(service.npm_package)}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          const candidates = [
            data.maintainers?.[0]?.name,
            data.author?.name,
          ].filter(Boolean)
          for (const name of candidates) {
            if (!CI_BOT_NAMES.has(name.toLowerCase()) && name.toLowerCase() !== 'unknown') {
              resolvedName = name
              source = 'npm_maintainer'
              break
            }
          }
          // Extract homepage for publisher website
          if (data.homepage) websiteUrl = data.homepage
        }
      } catch { /* timeout or network error */ }
    }

    // 3. PyPI author (also grabs project URLs for website)
    if (!resolvedName && service.pypi_package) {
      try {
        const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(service.pypi_package)}/json`, {
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          const candidates = [data.info?.author, data.info?.maintainer].filter(Boolean)
          for (const name of candidates) {
            if (!CI_BOT_NAMES.has(name.toLowerCase()) && name.toLowerCase() !== 'unknown') {
              resolvedName = name
              source = 'pypi_author'
              break
            }
          }
          // Extract website from project URLs or home_page
          if (!websiteUrl) {
            websiteUrl = data.info?.home_page || data.info?.project_urls?.Homepage || null
          }
        }
      } catch { /* timeout or network error */ }
    }

    // 4. GitHub repo owner
    if (!resolvedName && service.github_repo) {
      const owner = service.github_repo.split('/')[0]
      if (owner && !CI_BOT_NAMES.has(owner.toLowerCase())) {
        resolvedName = owner
        source = 'github_owner'
      }
    }

    // Derive github_org from github_repo regardless of resolution source
    if (service.github_repo) {
      githubOrg = service.github_repo.split('/')[0] || null
    }

    // Derive npm_org from scoped package regardless of resolution source
    if (service.npm_package?.startsWith('@')) {
      npmOrg = service.npm_package.split('/')[0].slice(1) || null
    }

    // Build github website fallback
    if (!websiteUrl && githubOrg) {
      websiteUrl = `https://github.com/${githubOrg}`
    }

    if (!resolvedName) {
      const reasons: string[] = []
      if (!service.npm_package) reasons.push('no npm')
      if (!service.pypi_package) reasons.push('no pypi')
      if (!service.github_repo) reasons.push('no github')
      if (reasons.length === 0) reasons.push('all lookups returned bots/empty')
      stillUnknown.push({ name: service.name, reason: reasons.join(', ') })
      continue
    }

    // Find or create publisher
    const slug = toSlug(resolvedName)
    let pubId = publisherCache.get(slug)

    if (!pubId) {
      // Create new publisher
      const newPub: Record<string, unknown> = { name: resolvedName, slug }
      if (githubOrg) newPub.github_org = githubOrg
      if (npmOrg) newPub.npm_org = npmOrg
      if (websiteUrl) newPub.website_url = websiteUrl

      const { error: upsertErr } = await supabase
        .from('publishers')
        .upsert(newPub, { onConflict: 'slug' })

      if (!upsertErr) {
        const { data: created } = await supabase
          .from('publishers')
          .select('id')
          .eq('slug', slug)
          .single()
        if (created) {
          pubId = created.id
          publisherCache.set(slug, created.id)
        }
      }
    } else {
      // Update existing publisher with org info if missing — never overwrite website_url
      const { data: existingPub } = await supabase
        .from('publishers')
        .select('github_org, npm_org, website_url')
        .eq('id', pubId)
        .single()
      const updates: Record<string, string> = {}
      if (githubOrg && !existingPub?.github_org) updates.github_org = githubOrg
      if (npmOrg && !existingPub?.npm_org) updates.npm_org = npmOrg
      if (websiteUrl && !existingPub?.website_url) updates.website_url = websiteUrl
      if (Object.keys(updates).length > 0) {
        await supabase.from('publishers').update(updates).eq('id', pubId)
      }
    }

    if (!pubId) {
      stillUnknown.push({ name: service.name, reason: 'failed to create publisher' })
      continue
    }

    // Link service to publisher
    await supabase.from('services').update({ publisher_id: pubId }).eq('id', service.id)

    fixedSamples.push({
      service: service.name,
      old_publisher: service.publisher_name,
      new_publisher: resolvedName,
      source,
    })
    fixedCount++
  }

  return NextResponse.json({
    ok: true,
    total_services: allServices.length,
    missing_before: needsFix.length,
    fixed: fixedCount,
    still_unknown: stillUnknown.length,
    still_unknown_reasons: stillUnknown.slice(0, 20),
    sample_fixed: fixedSamples.slice(0, 10),
    all_fixed: fixedSamples,
    timestamp: new Date().toISOString(),
  })
}
