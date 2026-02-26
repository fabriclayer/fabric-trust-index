import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverFromNews, type NewsCandidate } from '@/lib/discovery/ai-news'
import {
  addDiscoveredService,
  classifyCategory,
  deriveCapabilities,
} from '@/lib/discovery/pipeline'

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

    // Fetch existing slugs + github_repos for dedup
    const { data: existingServices } = await supabase
      .from('services')
      .select('slug, github_repo')

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

    // Insert new services
    let inserted = 0
    let failed = 0
    const insertErrors: string[] = []

    for (const c of toProcess) {
      // Use the candidate's category if from watchlist (curated), otherwise classify
      const category = c.source === 'watchlist'
        ? c.category
        : classifyCategory(c.tags, c.slug)

      const insertResult = await addDiscoveredService({
        name: c.name,
        slug: c.slug,
        publisher: c.publisher,
        description: c.description,
        category,
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

        // For watchlist entries, also update logo_url directly
        // (addDiscoveredService doesn't set logo_url)
        if (c.logo_url) {
          await supabase
            .from('services')
            .update({ logo_url: c.logo_url })
            .eq('slug', c.slug)
        }
      } else {
        failed++
        if (insertErrors.length < 20) {
          insertErrors.push(`${c.slug}: ${insertResult}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      inserted,
      failed,
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
