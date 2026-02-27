import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverFromNews } from '@/lib/discovery/ai-news'
import {
  queueForReview,
  classifyCategory,
  deriveCapabilities,
} from '@/lib/discovery/pipeline'
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

    // ── Queue ALL candidates for manual review ──
    let pendingCount = 0
    let duplicateCount = 0
    const insertErrors: string[] = []

    for (const c of toProcess) {
      const category = c.category || classifyCategory(c.tags, c.slug)
      const queueResult = await queueForReview({
        name: c.name,
        slug: c.slug,
        publisher: c.publisher,
        description: c.description,
        category,
        npm_package: c.npm_package,
        pypi_package: c.pypi_package,
        github_repo: c.github_repo,
        github_org: c.github_org,
        source: `ai-news:${c.source}`,
        capabilities: deriveCapabilities(c.tags),
        tags: c.tags,
        homepage_url: c.homepage_url,
        logo_url: c.logo_url,
      })

      if (queueResult === 'queued') {
        pendingCount++
      } else if (queueResult === 'duplicate') {
        duplicateCount++
      } else {
        if (insertErrors.length < 20) insertErrors.push(`${c.slug}: ${queueResult}`)
      }
    }

    // ── Send email digest ──
    let emailSent = false
    if (pendingCount > 0) {
      emailSent = await sendDiscoveryDigest(toProcess)
    }

    return NextResponse.json({
      ok: true,
      ...result,
      pendingReview: pendingCount,
      duplicates: duplicateCount,
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
