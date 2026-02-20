/**
 * GitHub Discovery
 *
 * Searches GitHub for AI/ML repositories using topic-based queries.
 */

export interface GitHubCandidate {
  name: string
  fullName: string // owner/repo
  description: string
  owner: string
  stars: number
  language: string | null
  topics: string[]
  updatedAt: string
  homepage: string | null
}

const GITHUB_API = 'https://api.github.com'

const SEARCH_QUERIES = [
  'topic:mcp stars:>50',
  'topic:ai-agent stars:>100',
  'topic:llm-tool stars:>100',
  'topic:langchain stars:>200',
  'topic:vector-database stars:>100',
]

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

export async function searchGitHub(query: string, limit = 30): Promise<GitHubCandidate[]> {
  try {
    const res = await fetch(
      `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`,
      { headers: githubHeaders() }
    )
    if (!res.ok) return []

    const data = await res.json()
    return (data.items ?? []).map((repo: any) => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description ?? '',
      owner: repo.owner?.login ?? 'unknown',
      stars: repo.stargazers_count,
      language: repo.language,
      topics: repo.topics ?? [],
      updatedAt: repo.updated_at,
      homepage: repo.homepage,
    }))
  } catch {
    return []
  }
}

export async function discoverGitHubRepos(): Promise<GitHubCandidate[]> {
  const allCandidates: GitHubCandidate[] = []
  const seen = new Set<string>()

  for (const query of SEARCH_QUERIES) {
    const results = await searchGitHub(query)
    for (const repo of results) {
      if (!seen.has(repo.fullName)) {
        seen.add(repo.fullName)
        allCandidates.push(repo)
      }
    }
  }

  return allCandidates
}
