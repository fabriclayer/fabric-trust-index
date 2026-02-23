/**
 * npm Registry Discovery
 *
 * Searches npm for AI/ML packages using keyword-based queries.
 * Returns candidate packages for trust scoring.
 */

import { CI_BOT_NAMES } from './bot-filter'

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

/**
 * Resolve the true publisher for an npm package.
 * Priority: scoped org > author.name > publisher.username
 * Skips known CI bot names.
 */
function resolveNpmPublisher(pkg: any): string {
  const candidates: string[] = []

  // 1. If scoped package (@org/name), use the org
  if (pkg.name?.startsWith('@')) {
    const scope = pkg.name.split('/')[0].slice(1)
    if (scope) candidates.push(scope)
  }

  // 2. Author name
  if (pkg.author?.name) candidates.push(pkg.author.name)

  // 3. Publisher username
  if (pkg.publisher?.username) candidates.push(pkg.publisher.username)

  // 4. First maintainer
  if (pkg.maintainers?.[0]?.name) candidates.push(pkg.maintainers[0].name)

  // Return first non-bot candidate
  for (const name of candidates) {
    if (!CI_BOT_NAMES.has(name.toLowerCase())) {
      return name
    }
  }

  return candidates[0] ?? 'unknown'
}

export async function searchNpm(query: string, limit = 50): Promise<NpmCandidate[]> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}&quality=0.5&popularity=0.5&maintenance=0.0`
    )
    if (!res.ok) return []

    const data = await res.json()
    return (data.objects ?? []).map((obj: any) => {
      const pkg = obj.package
      const publisher = resolveNpmPublisher(pkg)
      return {
        name: pkg.name,
        description: pkg.description ?? '',
        publisher,
        version: pkg.version,
        keywords: pkg.keywords ?? [],
        date: pkg.date,
      }
    })
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
