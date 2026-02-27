import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverFromNews, type NewsCandidate } from '@/lib/discovery/ai-news'
import {
  addDiscoveredService,
  classifyCategory,
  deriveCapabilities,
} from '@/lib/discovery/pipeline'
import { resolveServiceMetadata } from '@/lib/discovery/enrich'
import { sendDiscoveryDigest } from '@/lib/alerts/email'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional: run only a specific source
  const sourceFilter = request.nextUrl.searchParams.get('source')

  try {
    const supabase = createServerClient()

    // Fetch existing slugs + github_repos for dedup (paginate past 1000-row limit)
    const allServices: { slug: string; github_repo: string | null }[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase
        .from('services')
        .select('slug, github_repo')
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      allServices.push(...data)
      if (data.length < PAGE) break
      offset += PAGE
    }
    const existingServices = allServices

    const existingSlugs = new Set(existingServices?.map(s => s.slug) ?? [])
    const existingGithubRepos = new Set(
      existingServices
        ?.map(s => s.github_repo)
        .filter((r): r is string => !!r) ?? []
    )

    // Run the multi-source scanner
    const { candidates, result } = await discoverFromNews(existingSlugs, existingGithubRepos)

    // Filter by source if requested
    const toProcess = sourceFilter
      ? candidates.filter(c => c.source === sourceFilter)
      : candidates

    // Split: watchlist auto-inserts, everything else goes to review
    const autoInsert = toProcess.filter(c => c.source === 'watchlist')
    const forReview = toProcess.filter(c => c.source !== 'watchlist')

    // ── Auto-insert watchlist entries ──
    let inserted = 0
    let failed = 0
    const insertErrors: string[] = []

    for (const c of autoInsert) {
      const insertResult = await addDiscoveredService({
        name: c.name,
        slug: c.slug,
        publisher: c.publisher,
        description: c.description,
        category: c.category,
        npm_package: c.npm_package,
        pypi_package: c.pypi_package,
        github_repo: c.github_repo,
        source: `ai-news:${c.source}`,
        capabilities: deriveCapabilities(c.tags),
        tags: c.tags,
        homepage_url: c.homepage_url,
      })

      if (insertResult === true) {
        inserted++
        existingSlugs.add(c.slug)

        // Enrich: resolve missing github_repo, npm/pypi packages + set logo
        const enriched = await resolveServiceMetadata({
          slug: c.slug,
          name: c.name,
          github_org: c.github_org,
          github_repo: c.github_repo,
          npm_package: c.npm_package,
          pypi_package: c.pypi_package,
        })
        const updates: Record<string, string> = {}
        if (enriched.github_repo) updates.github_repo = enriched.github_repo
        if (enriched.npm_package) updates.npm_package = enriched.npm_package
        if (enriched.pypi_package) updates.pypi_package = enriched.pypi_package
        if (c.logo_url) updates.logo_url = c.logo_url
        if (Object.keys(updates).length > 0) {
          await supabase.from('services').update(updates).eq('slug', c.slug)
        }
      } else {
        failed++
        if (insertErrors.length < 20) {
          insertErrors.push(`${c.slug}: ${insertResult}`)
        }
      }
    }

    // ── Store uncurated candidates for review ──
    let pendingCount = 0
    for (const c of forReview) {
      const category = classifyCategory(c.tags, c.slug)
      await supabase.from('discovery_queue').insert({
        source: `ai-news:${c.source}`,
        query: c.name,
        package_name: c.slug,
        status: 'pending',
        result: {
          name: c.name,
          slug: c.slug,
          description: c.description,
          publisher: c.publisher,
          homepage_url: c.homepage_url,
          github_org: c.github_org,
          github_repo: c.github_repo,
          logo_url: c.logo_url,
          category,
          tags: c.tags,
          npm_package: c.npm_package,
          pypi_package: c.pypi_package,
        },
      })
      pendingCount++
    }

    // ── Send email digest ──
    let emailSent = false
    if (forReview.length > 0) {
      emailSent = await sendDiscoveryDigest(forReview)
    }

    return NextResponse.json({
      ok: true,
      ...result,
      inserted,
      failed,
      pendingReview: pendingCount,
      emailSent,
      insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
      sourceFilter: sourceFilter ?? 'all',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('AI news discovery failed:', err)
    return NextResponse.json(
      {
        error: 'AI news discovery failed',
        message: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 500 }
    )
  }
}
