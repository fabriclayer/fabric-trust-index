import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverSmitheryServers, type SmitheryDebug } from '@/lib/discovery/smithery'
import { discoverMcpSoServers } from '@/lib/discovery/mcpso'
import {
  queueForReview,
  classifyCategory,
  deriveCapabilities,
  toSlug,
} from '@/lib/discovery/pipeline'

export const maxDuration = 300

const DEFAULT_LIMIT = 200

interface SourceResult {
  source: string
  totalCandidates: number
  totalAfterDedup: number
  offset: number
  limit: number
  processed: number
  added: number
  skipped: number
  hasMore: boolean
  nextOffset: number | null
  errors: string[]
}

async function processSource(
  sourceName: string,
  candidates: Array<{ name: string; description: string; publisher: string; githubRepo: string; homepage: string }>,
  existingSlugs: Set<string>,
  existingGithubRepos: Set<string>,
  seenGithubRepos: Set<string>,
  offset: number,
  limit: number,
): Promise<SourceResult> {
  const totalCandidates = candidates.length

  // Dedup against existing DB + already-seen in this run
  // Use github_repo (owner/repo) for slug to avoid collisions (many repos named "mcp")
  const toAdd: Array<typeof candidates[number] & { slug: string }> = []
  for (const c of candidates) {
    // Try short slug first (repo name), fall back to owner-repo if collision
    let slug = toSlug(c.name)
    if (existingSlugs.has(slug) || toAdd.some(a => a.slug === slug)) {
      slug = toSlug(c.githubRepo) // e.g. "owner-repo-name"
    }
    if (
      existingSlugs.has(slug) ||
      existingGithubRepos.has(c.githubRepo) ||
      seenGithubRepos.has(c.githubRepo)
    ) {
      continue
    }
    toAdd.push({ ...c, slug })
  }

  const totalAfterDedup = toAdd.length
  const batch = toAdd.slice(offset, offset + limit)
  const hasMore = offset + limit < totalAfterDedup

  console.log(
    `Processing ${sourceName} batch: offset=${offset}, limit=${limit}, candidates=${totalAfterDedup}, batch=${batch.length}`,
  )

  let added = 0
  let skipped = 0
  const errors: string[] = []

  for (const c of batch) {
    const slug = c.slug
    const keywords = ['mcp', 'mcp-server', 'model-context-protocol']

    let classifyWords = keywords
    if (sourceName === 'mcpso' && c.description) {
      const descWords = c.description.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      classifyWords = [...keywords, ...descWords]
    }

    const category = classifyCategory(classifyWords, slug)

    const result = await queueForReview({
      name: c.name,
      slug,
      publisher: c.publisher,
      description: c.description,
      category: category === 'infra' ? 'agent' : category,
      github_repo: c.githubRepo,
      source: sourceName,
      capabilities: deriveCapabilities(keywords),
      tags: keywords,
      homepage_url: c.homepage,
    })

    if (result === 'queued') {
      added++
      existingSlugs.add(slug)
      seenGithubRepos.add(c.githubRepo)
    } else {
      skipped++
      if (result !== 'duplicate' && errors.length < 10) errors.push(`${sourceName}/${c.githubRepo}: ${result}`)
    }
  }

  return {
    source: sourceName,
    totalCandidates,
    totalAfterDedup,
    offset,
    limit,
    processed: batch.length,
    added,
    skipped,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    errors,
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const source = request.nextUrl.searchParams.get('source')
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)

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
        .filter((r): r is string => !!r) ?? [],
    )

    const seenGithubRepos = new Set<string>()
    const results: SourceResult[] = []
    let smitheryDebug: SmitheryDebug | undefined

    // --- Smithery ---
    if (!source || source === 'smithery') {
      const { candidates, debug } = await discoverSmitheryServers()
      smitheryDebug = debug
      const result = await processSource(
        'smithery', candidates, existingSlugs, existingGithubRepos, seenGithubRepos, offset, limit,
      )
      results.push(result)
    }

    // --- awesome-mcp-servers ---
    if (!source || source === 'mcpso') {
      const candidates = await discoverMcpSoServers()
      const result = await processSource(
        'mcpso', candidates, existingSlugs, existingGithubRepos, seenGithubRepos, offset, limit,
      )
      results.push(result)
    }

    // Flatten for single-source requests, nest for multi-source
    if (results.length === 1) {
      const r = results[0]
      return NextResponse.json({
        ok: true,
        ...r,
        errors: r.errors.length > 0 ? r.errors : undefined,
        debug: smitheryDebug && r.source === 'smithery' ? smitheryDebug : undefined,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      ok: true,
      sources: results.map(r => ({
        ...r,
        errors: r.errors.length > 0 ? r.errors : undefined,
      })),
      debug: smitheryDebug ? { smithery: smitheryDebug } : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('MCP discovery failed:', err)
    return NextResponse.json(
      {
        error: 'MCP discovery failed',
        message: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 500 },
    )
  }
}
