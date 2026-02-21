/**
 * npm Registry Discovery
 *
 * Searches npm for AI/ML packages using keyword-based queries.
 * Returns candidate packages for trust scoring.
 */

export interface NpmCandidate {
  name: string
  description: string
  publisher: string
  version: string
  keywords: string[]
  date: string
}

const SEARCH_QUERIES = [
  // Original queries
  'keywords:mcp',
  'keywords:ai-agent',
  'keywords:llm',
  'keywords:langchain',
  'keywords:openai',
  'keywords:anthropic',
  'keywords:embedding',
  'keywords:vector-database',
  // Frameworks & libraries
  'keywords:transformers',
  'keywords:huggingface',
  'keywords:model-context-protocol',
  'keywords:tensorflow',
  'keywords:pytorch',
  'keywords:machine-learning',
  // Tasks
  'keywords:nlp',
  'keywords:computer-vision',
  'keywords:text-to-speech',
  'keywords:stable-diffusion',
  'keywords:image-generation',
  'keywords:chatgpt',
  'keywords:rag',
  'keywords:retrieval-augmented',
  'keywords:fine-tuning',
  // Infrastructure
  'keywords:mlops',
  'keywords:inference',
  'keywords:tokenizer',
  // Models & providers
  'keywords:whisper',
  'keywords:diffusion',
  'keywords:gpt',
  'keywords:claude',
  'keywords:gemini',
  'keywords:mistral',
  'keywords:ollama',
  'keywords:groq',
  'keywords:replicate',
  // SDKs
  'keywords:ai-sdk',
  'keywords:vercel-ai',
]

export async function searchNpm(query: string, limit = 50): Promise<NpmCandidate[]> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}&quality=0.5&popularity=0.5&maintenance=0.0`
    )
    if (!res.ok) return []

    const data = await res.json()
    return (data.objects ?? []).map((obj: any) => ({
      name: obj.package.name,
      description: obj.package.description ?? '',
      publisher: obj.package.publisher?.username ?? obj.package.author?.name ?? 'unknown',
      version: obj.package.version,
      keywords: obj.package.keywords ?? [],
      date: obj.package.date,
    }))
  } catch {
    return []
  }
}

export async function discoverNpmPackages(): Promise<NpmCandidate[]> {
  const allCandidates: NpmCandidate[] = []
  const seen = new Set<string>()

  for (const query of SEARCH_QUERIES) {
    const results = await searchNpm(query)
    for (const pkg of results) {
      if (!seen.has(pkg.name)) {
        seen.add(pkg.name)
        allCandidates.push(pkg)
      }
    }
  }

  return allCandidates
}
