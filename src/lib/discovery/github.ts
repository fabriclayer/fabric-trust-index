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
  // Original
  'topic:mcp stars:>50',
  'topic:ai-agent stars:>100',
  'topic:llm-tool stars:>100',
  'topic:langchain stars:>200',
  'topic:vector-database stars:>100',
  // ML & AI broad
  'topic:machine-learning stars:>500',
  'topic:deep-learning stars:>500',
  'topic:artificial-intelligence stars:>500',
  'topic:generative-ai stars:>200',
  // NLP
  'topic:natural-language-processing stars:>300',
  'topic:text-generation stars:>100',
  'topic:chatgpt stars:>200',
  'topic:large-language-model stars:>100',
  // Vision
  'topic:computer-vision stars:>300',
  'topic:object-detection stars:>200',
  'topic:image-generation stars:>100',
  // Diffusion & generation
  'topic:diffusion-models stars:>100',
  'topic:stable-diffusion stars:>200',
  // Retrieval & search
  'topic:rag stars:>100',
  'topic:semantic-search stars:>100',
  // Ops & serving
  'topic:mlops stars:>200',
  'topic:model-serving stars:>100',
  'topic:fine-tuning stars:>100',
  // Frameworks
  'topic:transformers stars:>300',
  'topic:huggingface stars:>100',
  'topic:ollama stars:>100',
  // Providers
  'topic:openai-api stars:>100',
  'topic:anthropic stars:>50',
  // Audio
  'topic:speech-recognition stars:>200',
  'topic:text-to-speech stars:>100',
  // Embeddings
  'topic:embeddings stars:>100',
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

export async function searchGitHub(query: string, limit = 100): Promise<GitHubCandidate[]> {
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
