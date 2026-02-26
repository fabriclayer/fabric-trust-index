/**
 * AI News Discovery Scanner v2
 *
 * Multi-source scanner that finds new AI services the registry crawlers miss.
 *
 * Sources:
 * 1. Watchlist — curated list of known services to auto-add (platforms, no npm/PyPI)
 * 2. GitHub Trending — trending repos in AI/ML topics (catches new launches)
 * 3. Hacker News — Show HN posts mentioning AI tools/launches
 * 4. Product Hunt — top AI product launches (requires PRODUCT_HUNT_TOKEN)
 * 5. YC Launches — Launch HN posts from YC startups (via Algolia API)
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
  source: string // 'watchlist' | 'github-trending' | 'hackernews' | 'producthunt' | 'yc-launches'
}

export interface DiscoverNewsResult {
  sources: {
    watchlist: { checked: number; added: number; skipped: number }
    githubTrending: { fetched: number; relevant: number; added: number; skipped: number }
    hackerNews: { fetched: number; relevant: number; added: number; skipped: number }
    productHunt: { fetched: number; relevant: number; added: number; skipped: number }
    ycLaunches: { fetched: number; relevant: number; added: number; skipped: number }
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
  'chatgpt', 'claude', 'gemini', 'mistral', 'ollama', 'groq',
  'voice-ai', 'ai-agent', 'ai-coding', 'agentic', 'retrieval',
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

// ─── Source 3: Hacker News (Show HN) ────────────────────────────────

interface HNItem {
  id: number
  title: string
  url?: string
  score: number
  by: string
}

/**
 * Fetch recent Show HN stories and filter for AI launches.
 * Uses /showstories endpoint to get only Show HN posts — eliminates
 * junk name extractions from regular top stories.
 */
async function fetchHackerNews(): Promise<NewsCandidate[]> {
  const candidates: NewsCandidate[] = []

  try {
    // Fetch Show HN story IDs (only "Show HN:" posts)
    const showRes = await fetch('https://hacker-news.firebaseio.com/v0/showstories.json')
    if (!showRes.ok) return candidates

    const showIds: number[] = await showRes.json()
    const batch = showIds.slice(0, 60) // Check top 60

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
        if (!story || !story.url || story.score < 30) continue

        // Only parse titles starting with "Show HN:"
        if (!/^show hn:/i.test(story.title)) continue

        // Check if the title/URL suggests an AI product
        const titleLower = story.title.toLowerCase()
        if (!isAIRelevant(titleLower)) continue

        // Extract domain for homepage
        let domain = ''
        try {
          const url = new URL(story.url)
          domain = url.hostname.replace('www.', '')
        } catch { continue }

        // Skip known non-product domains
        const skipDomains = [
          'arxiv.org', 'reddit.com', 'twitter.com', 'x.com',
          'youtube.com', 'medium.com', 'substack.com',
          'news.ycombinator.com',
        ]
        if (skipDomains.some(d => domain.includes(d))) continue

        // Extract product name: "Show HN: MyTool – An AI thing" → "MyTool"
        let name = story.title
          .replace(/^show hn:\s*/i, '')
          .replace(/\s*[-–—|:]\s*.+$/, '')
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
          tags: ['hackernews', 'show-hn'],
          source: 'hackernews',
        })
      }
    }
  } catch (err) {
    console.warn('Hacker News fetch failed:', err)
  }

  return candidates
}

// ─── Source 4: Product Hunt ─────────────────────────────────────────

/** Product Hunt AI-related topic slugs */
const PH_AI_TOPICS = new Set([
  'artificial-intelligence', 'machine-learning', 'developer-tools',
  'saas', 'productivity', 'no-code', 'api', 'open-source',
  'tech', 'bots', 'chatgpt', 'ai', 'automation',
  'data-science', 'natural-language-processing',
])

/**
 * Fetch today's top Product Hunt launches and filter for AI products.
 * Requires PRODUCT_HUNT_TOKEN env var (client credentials bearer token).
 * Silently returns empty if token not set.
 */
async function fetchProductHunt(): Promise<NewsCandidate[]> {
  const token = process.env.PRODUCT_HUNT_TOKEN
  if (!token) return []

  const candidates: NewsCandidate[] = []

  try {
    const query = `{
      posts(order: VOTES, first: 50) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            votesCount
            website
            thumbnail { url }
            topics { edges { node { slug name } } }
            makers { username }
          }
        }
      }
    }`

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'FabricTrustIndex/1.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.warn(`Product Hunt API returned ${res.status}`)
      return candidates
    }

    const json = await res.json()
    const posts = json.data?.posts?.edges ?? []

    for (const { node: post } of posts) {
      if (!post || post.votesCount < 5) continue

      const topicSlugs: string[] = (post.topics?.edges ?? []).map(
        (e: { node: { slug: string } }) => e.node.slug
      )
      const hasTopic = topicSlugs.some(s => PH_AI_TOPICS.has(s))
      const fullText = `${post.name} ${post.tagline ?? ''} ${post.description ?? ''}`
      const hasKeyword = isAIRelevant(fullText, topicSlugs)

      if (!hasTopic && !hasKeyword) continue

      const homepage = post.website || post.url
      let domain = ''
      try {
        domain = new URL(homepage).hostname.replace('www.', '')
      } catch { /* use empty */ }

      const publisher = post.makers?.[0]?.username ?? (domain || 'unknown')
      const logoUrl = post.thumbnail?.url
        || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '')

      candidates.push({
        name: post.name,
        slug: toSlug(post.name),
        description: post.tagline ?? post.description ?? '',
        publisher,
        homepage_url: homepage,
        logo_url: logoUrl,
        category: 'infra', // reclassified by pipeline
        tags: [...topicSlugs.slice(0, 5), 'producthunt'],
        source: 'producthunt',
      })
    }
  } catch (err) {
    console.warn('Product Hunt fetch failed:', err)
  }

  return candidates
}

// ─── Source 5: YC Launches (Launch HN) ──────────────────────────────

/**
 * Fetch recent "Launch HN" posts from the HN Algolia API.
 * These are official YC company launches — high signal, no auth needed.
 */
async function fetchYCLaunches(): Promise<NewsCandidate[]> {
  const candidates: NewsCandidate[] = []

  try {
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)

    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=%22Launch%20HN%22&tags=story&numericFilters=created_at_i>${sevenDaysAgo}&hitsPerPage=50`,
      { signal: AbortSignal.timeout(10000) }
    )

    if (!res.ok) return candidates

    const data = await res.json()
    const hits: Array<{
      title: string
      url: string | null
      points: number
      author: string
      objectID: string
    }> = data.hits ?? []

    for (const hit of hits) {
      if (!hit.title || !hit.url) continue
      if (!/^launch hn:/i.test(hit.title)) continue
      if (!isAIRelevant(hit.title)) continue

      // Extract domain
      let domain = ''
      try {
        domain = new URL(hit.url).hostname.replace('www.', '')
      } catch { continue }

      // Skip non-product domains
      const skipDomains = [
        'arxiv.org', 'reddit.com', 'twitter.com', 'x.com',
        'youtube.com', 'medium.com', 'substack.com',
        'news.ycombinator.com',
      ]
      if (skipDomains.some(d => domain.includes(d))) continue

      // Extract product name: "Launch HN: MyTool – description" → "MyTool"
      let name = hit.title
        .replace(/^launch hn:\s*/i, '')
        .replace(/\s*[-–—|:]\s*.+$/, '')
        .replace(/\s*\(.+\)$/, '')
        .trim()

      if (name.length > 40 || name.length < 2) continue

      candidates.push({
        name,
        slug: toSlug(name),
        description: hit.title,
        publisher: hit.author,
        homepage_url: hit.url,
        logo_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        category: 'infra',
        tags: ['yc', 'launch-hn'],
        source: 'yc-launches',
      })
    }
  } catch (err) {
    console.warn('YC Launches fetch failed:', err)
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

  // Fetch from all 5 sources in parallel
  const [
    watchlistResult,
    trendingResult,
    hnResult,
    phResult,
    ycResult,
  ] = await Promise.allSettled([
    Promise.resolve(watchlistToCandidates()),
    fetchGitHubTrending(),
    fetchHackerNews(),
    fetchProductHunt(),
    fetchYCLaunches(),
  ])

  const watchlist = watchlistResult.status === 'fulfilled' ? watchlistResult.value : []
  const trending = trendingResult.status === 'fulfilled' ? trendingResult.value : []
  const hn = hnResult.status === 'fulfilled' ? hnResult.value : []
  const ph = phResult.status === 'fulfilled' ? phResult.value : []
  const yc = ycResult.status === 'fulfilled' ? ycResult.value : []

  if (watchlistResult.status === 'rejected') errors.push(`watchlist: ${watchlistResult.reason}`)
  if (trendingResult.status === 'rejected') errors.push(`trending: ${trendingResult.reason}`)
  if (hnResult.status === 'rejected') errors.push(`hn: ${hnResult.reason}`)
  if (phResult.status === 'rejected') errors.push(`producthunt: ${phResult.reason}`)
  if (ycResult.status === 'rejected') errors.push(`yc-launches: ${ycResult.reason}`)

  // Dedup all candidates against existing DB
  const allCandidates = [...watchlist, ...trending, ...hn, ...ph, ...yc]
  const newCandidates: NewsCandidate[] = []
  const seenSlugs = new Set<string>()

  let watchlistSkipped = 0
  let trendingSkipped = 0
  let hnSkipped = 0
  let phSkipped = 0
  let ycSkipped = 0

  for (const c of allCandidates) {
    const isDuplicate =
      existingSlugs.has(c.slug) ||
      seenSlugs.has(c.slug) ||
      (c.github_repo && existingGithubRepos.has(c.github_repo))

    if (isDuplicate) {
      if (c.source === 'watchlist') watchlistSkipped++
      else if (c.source === 'github-trending') trendingSkipped++
      else if (c.source === 'hackernews') hnSkipped++
      else if (c.source === 'producthunt') phSkipped++
      else if (c.source === 'yc-launches') ycSkipped++
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
  const phRelevant = ph.length
  const phAdded = newCandidates.filter(c => c.source === 'producthunt').length
  const ycRelevant = yc.length
  const ycAdded = newCandidates.filter(c => c.source === 'yc-launches').length

  return {
    candidates: newCandidates,
    result: {
      sources: {
        watchlist: { checked: watchlist.length, added: watchlistAdded, skipped: watchlistSkipped },
        githubTrending: { fetched: trending.length, relevant: trendingRelevant, added: trendingAdded, skipped: trendingSkipped },
        hackerNews: { fetched: hn.length, relevant: hnRelevant, added: hnAdded, skipped: hnSkipped },
        productHunt: { fetched: ph.length, relevant: phRelevant, added: phAdded, skipped: phSkipped },
        ycLaunches: { fetched: yc.length, relevant: ycRelevant, added: ycAdded, skipped: ycSkipped },
      },
      totalAdded: newCandidates.length,
      totalSkipped: watchlistSkipped + trendingSkipped + hnSkipped + phSkipped + ycSkipped,
      errors,
      durationMs: Date.now() - start,
    },
  }
}
