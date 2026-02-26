/**
 * AI News Discovery Scanner
 *
 * Multi-source scanner that finds new AI services the registry crawlers miss.
 *
 * Sources:
 * 1. Watchlist — curated list of known services to auto-add (platforms, no npm/PyPI)
 * 2. GitHub Trending — trending repos in AI/ML topics (catches new launches)
 * 3. Hacker News — top stories mentioning AI tools/launches
 *
 * Runs daily after the main discover cron. Designed for Vercel serverless
 * (300s max, no persistent state, idempotent).
 */

import { WATCHLIST, type WatchlistEntry } from './watchlist'

// ─── Types ──────────────────────────────────────────────────────────

export interface NewsCandidate {
  name: string
  slug: string
  description: string
  publisher: string
  homepage_url: string
  github_org?: string
  github_repo?: string
  logo_url: string
  category: string
  tags: string[]
  npm_package?: string
  pypi_package?: string
  source: string // 'watchlist' | 'github-trending' | 'hackernews'
}

export interface DiscoverNewsResult {
  sources: {
    watchlist: { checked: number; added: number; skipped: number }
    githubTrending: { fetched: number; relevant: number; added: number; skipped: number }
    hackerNews: { fetched: number; relevant: number; added: number; skipped: number }
  }
  totalAdded: number
  totalSkipped: number
  errors: string[]
  durationMs: number
}

// ─── AI Relevance Detection ─────────────────────────────────────────

/** Keywords that indicate an AI/ML-related project */
const AI_KEYWORDS = new Set([
  'ai', 'ml', 'llm', 'gpt', 'chatbot', 'agent', 'mcp', 'rag',
  'embedding', 'vector', 'transformer', 'diffusion', 'neural',
  'deep-learning', 'machine-learning', 'nlp', 'computer-vision',
  'text-to-image', 'text-to-speech', 'speech-to-text', 'generative',
  'foundation-model', 'fine-tuning', 'inference', 'langchain',
  'llamaindex', 'openai', 'anthropic', 'huggingface', 'stable-diffusion',
  'copilot', 'code-assistant', 'autonomous', 'multimodal',
])

/** Check if text/topics suggest AI relevance */
function isAIRelevant(text: string, topics: string[] = []): boolean {
  const lower = text.toLowerCase()
  const allTokens = [
    ...lower.split(/[\s\-_./]+/),
    ...topics.map(t => t.toLowerCase()),
  ]
  return allTokens.some(token => AI_KEYWORDS.has(token))
}

/** Simple slug generator (matches pipeline.ts toSlug) */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ─── Source 1: Watchlist ────────────────────────────────────────────

function watchlistToCandidates(): NewsCandidate[] {
  return WATCHLIST.map((w: WatchlistEntry) => ({
    name: w.name,
    slug: w.slug,
    description: w.description,
    publisher: w.publisher,
    homepage_url: w.homepage_url,
    github_org: w.github_org,
    logo_url: w.logo_url,
    category: w.category,
    tags: w.tags,
    npm_package: w.npm_package,
    pypi_package: w.pypi_package,
    source: 'watchlist',
  }))
}

// ─── Source 2: GitHub Trending ───────────────────────────────────────

interface GitHubTrendingRepo {
  author: string
  name: string
  description: string
  url: string
  language: string
  stars: number
  forks: number
  builtBy: Array<{ username: string }>
}

/**
 * Fetch trending GitHub repos. Uses the unofficial github-trending-api
 * or falls back to scraping the trending page.
 */
async function fetchGitHubTrending(): Promise<NewsCandidate[]> {
  const candidates: NewsCandidate[] = []

  try {
    // Try the community trending API first (more reliable than scraping)
    const res = await fetch(
      'https://api.gitterapp.com/repositories?language=python&since=weekly',
      { headers: { 'User-Agent': 'FabricTrustIndex/1.0' } }
    )

    if (res.ok) {
      const repos: GitHubTrendingRepo[] = await res.json()
      for (const repo of repos) {
        if (!isAIRelevant(`${repo.name} ${repo.description ?? ''}`, [])) continue
        if (repo.stars < 100) continue

        candidates.push({
          name: repo.name,
          slug: toSlug(repo.name),
          description: repo.description ?? '',
          publisher: repo.author,
          homepage_url: repo.url,
          github_org: repo.author,
          github_repo: `${repo.author}/${repo.name}`,
          logo_url: `https://github.com/${repo.author}.png?size=80`,
          category: 'infra', // will be reclassified by pipeline
          tags: ['github-trending', repo.language?.toLowerCase() ?? ''].filter(Boolean),
          source: 'github-trending',
        })
      }
    }

    // Also try TypeScript/JavaScript trending for npm-ecosystem AI tools
    const resJS = await fetch(
      'https://api.gitterapp.com/repositories?language=typescript&since=weekly',
      { headers: { 'User-Agent': 'FabricTrustIndex/1.0' } }
    )

    if (resJS.ok) {
      const repos: GitHubTrendingRepo[] = await resJS.json()
      for (const repo of repos) {
        if (!isAIRelevant(`${repo.name} ${repo.description ?? ''}`, [])) continue
        if (repo.stars < 100) continue
        // Skip if already added from Python trending
        if (candidates.some(c => c.github_repo === `${repo.author}/${repo.name}`)) continue

        candidates.push({
          name: repo.name,
          slug: toSlug(repo.name),
          description: repo.description ?? '',
          publisher: repo.author,
          homepage_url: repo.url,
          github_org: repo.author,
          github_repo: `${repo.author}/${repo.name}`,
          logo_url: `https://github.com/${repo.author}.png?size=80`,
          category: 'infra',
          tags: ['github-trending', 'typescript'],
          source: 'github-trending',
        })
      }
    }
  } catch (err) {
    console.warn('GitHub trending fetch failed:', err)
  }

  // Fallback: use GitHub search API for recently created repos with high stars
  if (candidates.length === 0) {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      const queries = [
        `topic:llm created:>${oneWeekAgo} stars:>50`,
        `topic:ai-agent created:>${oneWeekAgo} stars:>50`,
        `topic:mcp created:>${oneWeekAgo} stars:>20`,
        `topic:generative-ai created:>${oneWeekAgo} stars:>50`,
      ]

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FabricTrustIndex/1.0',
      }
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      }

      for (const q of queries) {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`,
          { headers }
        )
        if (!res.ok) continue

        const data = await res.json()
        for (const repo of data.items ?? []) {
          if (candidates.some(c => c.github_repo === repo.full_name)) continue

          candidates.push({
            name: repo.name,
            slug: toSlug(repo.name),
            description: repo.description ?? '',
            publisher: repo.owner?.login ?? 'unknown',
            homepage_url: repo.html_url,
            github_org: repo.owner?.login,
            github_repo: repo.full_name,
            logo_url: `https://github.com/${repo.owner?.login}.png?size=80`,
            category: 'infra',
            tags: [...(repo.topics ?? []), 'github-new'].slice(0, 10),
            source: 'github-trending',
          })
        }
      }
    } catch (err) {
      console.warn('GitHub search fallback failed:', err)
    }
  }

  return candidates
}

// ─── Source 3: Hacker News ──────────────────────────────────────────

interface HNItem {
  id: number
  title: string
  url?: string
  score: number
  by: string
}

/**
 * Fetch recent Hacker News top stories and filter for AI launches.
 * HN is where most AI tools get announced first.
 */
async function fetchHackerNews(): Promise<NewsCandidate[]> {
  const candidates: NewsCandidate[] = []

  try {
    // Fetch top 100 story IDs
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
    if (!topRes.ok) return candidates

    const topIds: number[] = await topRes.json()
    const batch = topIds.slice(0, 60) // Check top 60

    // Fetch story details in parallel (batches of 10)
    for (let i = 0; i < batch.length; i += 10) {
      const chunk = batch.slice(i, i + 10)
      const stories = await Promise.all(
        chunk.map(async (id): Promise<HNItem | null> => {
          try {
            const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            if (!res.ok) return null
            return res.json()
          } catch { return null }
        })
      )

      for (const story of stories) {
        if (!story || !story.url || story.score < 50) continue

        // Check if the title/URL suggests an AI product launch
        const titleLower = story.title.toLowerCase()
        const isLaunch = /launch|release|announc|introduc|open.?source|new:|show hn/i.test(story.title)
        const isAI = isAIRelevant(titleLower)

        if (!isAI || !isLaunch) continue

        // Extract domain for homepage
        let domain = ''
        try {
          const url = new URL(story.url)
          domain = url.hostname.replace('www.', '')
        } catch { continue }

        // Skip known non-product domains
        const skipDomains = ['arxiv.org', 'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'medium.com', 'substack.com']
        if (skipDomains.some(d => domain.includes(d))) continue

        // Try to extract a product name from the title
        // "Show HN: MyTool – An AI thing" → "MyTool"
        let name = story.title
          .replace(/^show hn:\s*/i, '')
          .replace(/\s*[-–—|]\s*.+$/, '')
          .replace(/\s*\(.+\)$/, '')
          .trim()

        if (name.length > 40 || name.length < 2) continue

        candidates.push({
          name,
          slug: toSlug(name),
          description: story.title,
          publisher: story.by,
          homepage_url: story.url,
          logo_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
          category: 'infra',
          tags: ['hackernews', 'launch'],
          source: 'hackernews',
        })
      }
    }
  } catch (err) {
    console.warn('Hacker News fetch failed:', err)
  }

  return candidates
}

// ─── Main Scanner ───────────────────────────────────────────────────

export async function discoverFromNews(
  existingSlugs: Set<string>,
  existingGithubRepos: Set<string>,
): Promise<{ candidates: NewsCandidate[]; result: DiscoverNewsResult }> {
  const start = Date.now()
  const errors: string[] = []

  // Fetch from all sources in parallel
  const [watchlistCandidates, trendingCandidates, hnCandidates] = await Promise.allSettled([
    Promise.resolve(watchlistToCandidates()),
    fetchGitHubTrending(),
    fetchHackerNews(),
  ])

  const watchlist = watchlistCandidates.status === 'fulfilled' ? watchlistCandidates.value : []
  const trending = trendingCandidates.status === 'fulfilled' ? trendingCandidates.value : []
  const hn = hnCandidates.status === 'fulfilled' ? hnCandidates.value : []

  if (watchlistCandidates.status === 'rejected') errors.push(`watchlist: ${watchlistCandidates.reason}`)
  if (trendingCandidates.status === 'rejected') errors.push(`trending: ${trendingCandidates.reason}`)
  if (hnCandidates.status === 'rejected') errors.push(`hn: ${hnCandidates.reason}`)

  // Dedup all candidates against existing DB
  const allCandidates = [...watchlist, ...trending, ...hn]
  const newCandidates: NewsCandidate[] = []
  const seenSlugs = new Set<string>()

  let watchlistSkipped = 0
  let trendingSkipped = 0
  let hnSkipped = 0

  for (const c of allCandidates) {
    const isDuplicate =
      existingSlugs.has(c.slug) ||
      seenSlugs.has(c.slug) ||
      (c.github_repo && existingGithubRepos.has(c.github_repo))

    if (isDuplicate) {
      if (c.source === 'watchlist') watchlistSkipped++
      else if (c.source === 'github-trending') trendingSkipped++
      else hnSkipped++
      continue
    }

    seenSlugs.add(c.slug)
    newCandidates.push(c)
  }

  const watchlistAdded = watchlist.length - watchlistSkipped
  const trendingRelevant = trending.length
  const trendingAdded = newCandidates.filter(c => c.source === 'github-trending').length
  const hnRelevant = hn.length
  const hnAdded = newCandidates.filter(c => c.source === 'hackernews').length

  return {
    candidates: newCandidates,
    result: {
      sources: {
        watchlist: { checked: watchlist.length, added: watchlistAdded, skipped: watchlistSkipped },
        githubTrending: { fetched: trending.length, relevant: trendingRelevant, added: trendingAdded, skipped: trendingSkipped },
        hackerNews: { fetched: hn.length, relevant: hnRelevant, added: hnAdded, skipped: hnSkipped },
      },
      totalAdded: newCandidates.length,
      totalSkipped: watchlistSkipped + trendingSkipped + hnSkipped,
      errors,
      durationMs: Date.now() - start,
    },
  }
}
