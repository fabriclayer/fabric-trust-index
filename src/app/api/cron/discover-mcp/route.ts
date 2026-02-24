import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverSmitheryServers } from '@/lib/discovery/smithery'
import { discoverMcpSoServers } from '@/lib/discovery/mcpso'
import {
  addDiscoveredService,
  classifyCategory,
  deriveCapabilities,
  toSlug,
} from '@/lib/discovery/pipeline'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const source = request.nextUrl.searchParams.get('source') // 'smithery' | 'mcpso' | null (both)

  try {
    const supabase = createServerClient()

    // Fetch existing slugs for dedup
    const { data: existingServices } = await supabase
      .from('services')
      .select('slug, github_repo')

    const existingSlugs = new Set(existingServices?.map(s => s.slug) ?? [])
    const existingGithubRepos = new Set(
      existingServices
        ?.map(s => s.github_repo)
        .filter((r): r is string => !!r) ?? [],
    )

    // Track github repos seen in this run for cross-source dedup
    const seenGithubRepos = new Set<string>()

    let totalDiscovered = 0
    let totalAdded = 0
    let totalSkipped = 0
    let totalFailed = 0
    const errors: string[] = []
    const sourcesRun: string[] = []

    // --- Smithery ---
    if (!source || source === 'smithery') {
      sourcesRun.push('smithery')
      const candidates = await discoverSmitheryServers()

      for (const c of candidates) {
        totalDiscovered++
        const slug = toSlug(c.name)

        if (
          existingSlugs.has(slug) ||
          existingGithubRepos.has(c.githubRepo) ||
          seenGithubRepos.has(c.githubRepo)
        ) {
          totalSkipped++
          continue
        }

        const keywords = ['mcp', 'mcp-server', 'model-context-protocol']
        const category = classifyCategory(keywords, slug)

        const result = await addDiscoveredService({
          name: c.name,
          slug,
          publisher: c.publisher,
          description: c.description,
          category: category === 'infra' ? 'agent' : category, // default MCP to agent
          github_repo: c.githubRepo,
          source: 'smithery',
          capabilities: deriveCapabilities(keywords),
          tags: keywords,
          homepage_url: c.homepage,
        })

        if (result === true) {
          totalAdded++
          existingSlugs.add(slug)
          seenGithubRepos.add(c.githubRepo)
        } else {
          totalFailed++
          if (errors.length < 10) errors.push(`smithery/${c.githubRepo}: ${result}`)
        }

        // Small delay to avoid overwhelming DB
        if (totalAdded % 50 === 0) {
          await new Promise(r => setTimeout(r, 100))
        }
      }
    }

    // --- awesome-mcp-servers ---
    if (!source || source === 'mcpso') {
      sourcesRun.push('mcpso')
      const candidates = await discoverMcpSoServers()

      for (const c of candidates) {
        totalDiscovered++
        const slug = toSlug(c.name)

        if (
          existingSlugs.has(slug) ||
          existingGithubRepos.has(c.githubRepo) ||
          seenGithubRepos.has(c.githubRepo)
        ) {
          totalSkipped++
          continue
        }

        const keywords = ['mcp', 'mcp-server', 'model-context-protocol']
        const descWords = c.description.toLowerCase().split(/\s+/)
        const allKeywords = [...keywords, ...descWords.filter(w => w.length > 3)]
        const category = classifyCategory(allKeywords, slug)

        const result = await addDiscoveredService({
          name: c.name,
          slug,
          publisher: c.publisher,
          description: c.description,
          category: category === 'infra' ? 'agent' : category,
          github_repo: c.githubRepo,
          source: 'mcpso',
          capabilities: deriveCapabilities(keywords),
          tags: keywords,
          homepage_url: c.homepage,
        })

        if (result === true) {
          totalAdded++
          existingSlugs.add(slug)
          seenGithubRepos.add(c.githubRepo)
        } else {
          totalFailed++
          if (errors.length < 10) errors.push(`mcpso/${c.githubRepo}: ${result}`)
        }

        if (totalAdded % 50 === 0) {
          await new Promise(r => setTimeout(r, 100))
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sources: sourcesRun,
      discovered: totalDiscovered,
      added: totalAdded,
      skipped: totalSkipped,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
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
