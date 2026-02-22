/**
 * OpenHub Discovery
 *
 * Searches OpenHub for open-source AI/ML projects.
 * OpenHub API returns XML — uses fast-xml-parser to parse responses.
 * Rate limit: 1000 requests/day, 25 items per page.
 */

import { XMLParser } from 'fast-xml-parser'

export interface OpenHubCandidate {
  name: string
  urlName: string
  description: string
  homepageUrl: string | null
  githubRepo: string | null
  tags: string[]
  language: string | null
  license: string | null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === 'project' || name === 'tag' || name === 'enlistment' || name === 'license',
})

const SEARCH_QUERIES = [
  'machine learning',
  'artificial intelligence',
  'deep learning',
  'neural network',
  'natural language processing',
  'large language model',
  'text generation',
  'computer vision',
  'image generation',
  'embedding',
  'mcp server',
  'ai agent',
  'chatbot',
  'diffusion model',
  'transformers',
  'inference',
  'vector database',
]

function getApiKey(): string {
  return process.env.OPENHUB_API_KEY ?? ''
}

/**
 * Extract GitHub owner/repo from a repository URL.
 * e.g. "https://github.com/owner/repo.git" → "owner/repo"
 */
function extractGitHubRepo(url: string): string | null {
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/)
  return match ? match[1] : null
}

/**
 * Fetch one page of OpenHub projects for a search query.
 */
export async function searchOpenHub(query: string, page = 1): Promise<OpenHubCandidate[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  try {
    const url = `https://www.openhub.net/projects.xml?api_key=${apiKey}&query=${encodeURIComponent(query)}&sort=new_activity&page=${page}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
      redirect: 'follow',
    })
    if (!res.ok) {
      console.error(`OpenHub search returned ${res.status} for query "${query}" page ${page}`)
      return []
    }

    const xml = await res.text()
    const parsed = parser.parse(xml)

    const projects = parsed?.response?.result?.project
    if (!projects || !Array.isArray(projects)) return []

    return projects.map((p: any) => {
      const tags: string[] = []
      if (p.tags?.tag) {
        const rawTags = Array.isArray(p.tags.tag) ? p.tags.tag : [p.tags.tag]
        tags.push(...rawTags.map((t: any) => typeof t === 'string' ? t : String(t)))
      }

      let license: string | null = null
      if (p.licenses?.license) {
        const licenses = Array.isArray(p.licenses.license) ? p.licenses.license : [p.licenses.license]
        license = licenses[0]?.name ?? null
      }

      const language = p.analysis?.main_language_name ?? null

      return {
        name: p.name ?? '',
        urlName: p.vanity_url ?? p.url_name ?? '',
        description: p.description ?? '',
        homepageUrl: p.homepage_url || null,
        githubRepo: null, // populated later via fetchEnlistments
        tags,
        language: typeof language === 'string' ? language : null,
        license,
      }
    }).filter((c: OpenHubCandidate) => c.name && c.urlName)
  } catch (err) {
    console.error(`OpenHub search failed for query "${query}":`, err)
    return []
  }
}

/**
 * Fetch repository URLs for an OpenHub project via the enlistments endpoint.
 * Returns the GitHub owner/repo if the project is hosted on GitHub, else null.
 */
export async function fetchEnlistments(urlName: string): Promise<string | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  try {
    const url = `https://www.openhub.net/projects/${encodeURIComponent(urlName)}/enlistments.xml?api_key=${apiKey}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
      redirect: 'follow',
    })
    if (!res.ok) return null

    const xml = await res.text()
    const parsed = parser.parse(xml)

    const enlistments = parsed?.response?.result?.enlistment
    if (!enlistments || !Array.isArray(enlistments)) return null

    for (const e of enlistments) {
      const repoUrl = e?.repository?.url ?? ''
      const ghRepo = extractGitHubRepo(repoUrl)
      if (ghRepo) return ghRepo
    }

    return null
  } catch {
    return null
  }
}

/**
 * Discover AI/ML projects from OpenHub.
 * Searches multiple queries (2 pages each), then fetches enlistments
 * for GitHub repo URLs.
 */
export async function discoverOpenHubProjects(): Promise<OpenHubCandidate[]> {
  const allCandidates: OpenHubCandidate[] = []
  const seen = new Set<string>()

  // Phase 1: Search queries
  for (const query of SEARCH_QUERIES) {
    for (let page = 1; page <= 5; page++) {
      const results = await searchOpenHub(query, page)
      if (results.length === 0) break // no more pages

      for (const project of results) {
        if (!seen.has(project.urlName)) {
          seen.add(project.urlName)
          allCandidates.push(project)
        }
      }

      // Small delay between requests to respect rate limits
      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Phase 2: Fetch enlistments for GitHub repo URLs
  for (const candidate of allCandidates) {
    const ghRepo = await fetchEnlistments(candidate.urlName)
    if (ghRepo) {
      candidate.githubRepo = ghRepo
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 100))
  }

  return allCandidates
}
