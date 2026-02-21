import { createServerClient } from '@/lib/supabase/server'
import { discoverNpmPackages, type NpmCandidate } from './npm'
import { discoverPyPIPackages, type PyPICandidate } from './pypi'
import { discoverGitHubRepos, type GitHubCandidate } from './github'
import { discoverHuggingFaceModels, getHFCategory, type HuggingFaceCandidate } from './huggingface'

// Category classification based on keywords/topics
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'llm': ['llm', 'large-language-model', 'gpt', 'chatbot', 'chat', 'language-model'],
  'agent': ['agent', 'multi-agent', 'autonomous', 'crewai', 'autogen', 'mcp'],
  'embedding': ['embedding', 'embeddings', 'vector', 'semantic-search'],
  'infra': ['inference', 'deployment', 'serverless', 'gpu', 'vector-database', 'database'],
  'code': ['code-generation', 'copilot', 'code-assistant', 'ide'],
  'image-generation': ['image-generation', 'text-to-image', 'diffusion', 'stable-diffusion'],
  'speech': ['text-to-speech', 'speech-to-text', 'tts', 'stt', 'audio'],
  'web-search': ['search', 'web-search', 'crawl', 'scrape'],
  'vision': ['computer-vision', 'image-recognition', 'ocr', 'object-detection'],
  'data-api': ['api', 'data', 'rest-api'],
}

function classifyCategory(keywords: string[]): string {
  const lower = keywords.map(k => k.toLowerCase())

  for (const [category, categoryKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of categoryKeywords) {
      if (lower.some(k => k.includes(kw))) {
        return category
      }
    }
  }

  return 'infra' // default fallback
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const ICON_MAP: Record<string, string> = {
  'image-generation': '◆',
  'llm': '◇',
  'web-search': '⊕',
  'code': '⟨⟩',
  'speech': '♫',
  'data-api': '◈',
  'embedding': '⊡',
  'vision': '◉',
  'agent': '⚡',
  'infra': '△',
}

// Map known tags/pipeline_tags to human-readable capability strings
const CAPABILITY_MAP: Record<string, string> = {
  'text-generation': 'Text generation',
  'text2text-generation': 'Text-to-text generation',
  'conversational': 'Conversational AI',
  'text-to-image': 'Image generation',
  'image-to-image': 'Image transformation',
  'unconditional-image-generation': 'Image generation',
  'automatic-speech-recognition': 'Speech recognition',
  'text-to-speech': 'Text-to-speech',
  'feature-extraction': 'Feature extraction',
  'sentence-similarity': 'Semantic similarity',
  'image-classification': 'Image classification',
  'object-detection': 'Object detection',
  'image-segmentation': 'Image segmentation',
  'token-classification': 'Named entity recognition',
  'question-answering': 'Question answering',
  'summarization': 'Summarization',
  'translation': 'Translation',
  'fill-mask': 'Masked language modeling',
  'zero-shot-classification': 'Zero-shot classification',
  'depth-estimation': 'Depth estimation',
  'reinforcement-learning': 'Reinforcement learning',
  'image-to-text': 'Image captioning',
  'video-classification': 'Video classification',
  'audio-classification': 'Audio classification',
  'voice-activity-detection': 'Voice activity detection',
  // Common tags
  'pytorch': 'PyTorch',
  'tensorflow': 'TensorFlow',
  'transformers': 'Transformers',
  'onnx': 'ONNX',
  'safetensors': 'Safetensors',
  'tool-use': 'Tool use',
  'function-calling': 'Function calling',
  'vision': 'Vision',
  'multilingual': 'Multilingual',
  'code': 'Code generation',
  'rag': 'RAG',
  'embedding': 'Embeddings',
  'embeddings': 'Embeddings',
  'fine-tuning': 'Fine-tuning support',
  'mcp': 'Model Context Protocol',
  'agent': 'AI Agent',
  'langchain': 'LangChain',
  'openai': 'OpenAI compatible',
  'vector-database': 'Vector database',
  'semantic-search': 'Semantic search',
  'web-search': 'Web search',
  'search': 'Search',
  'diffusion': 'Diffusion model',
  'stable-diffusion': 'Stable Diffusion',
}

export function deriveCapabilities(tags: string[], pipelineTag?: string | null): string[] {
  const caps: string[] = []
  const seen = new Set<string>()

  // Pipeline tag first
  if (pipelineTag && CAPABILITY_MAP[pipelineTag]) {
    caps.push(CAPABILITY_MAP[pipelineTag])
    seen.add(CAPABILITY_MAP[pipelineTag])
  }

  // Then from tags (up to 5 more)
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    const cap = CAPABILITY_MAP[lower]
    if (cap && !seen.has(cap) && caps.length < 6) {
      caps.push(cap)
      seen.add(cap)
    }
  }

  return caps
}

export async function runDiscoveryPipeline(): Promise<{
  discovered: number
  added: number
  skipped: number
}> {
  const supabase = createServerClient()

  // Fetch existing service slugs to avoid duplicates
  const { data: existing } = await supabase.from('services').select('slug')
  const existingSlugs = new Set(existing?.map(s => s.slug) ?? [])

  // Run discovery from all sources in parallel
  const [npmCandidates, pypiCandidates, githubCandidates] = await Promise.all([
    discoverNpmPackages(),
    discoverPyPIPackages(),
    discoverGitHubRepos(),
  ])

  let discovered = 0
  let added = 0
  let skipped = 0

  // Process npm candidates
  for (const pkg of npmCandidates) {
    discovered++
    const slug = toSlug(pkg.name)
    if (existingSlugs.has(slug)) { skipped++; continue }

    await addDiscoveredService({
      name: pkg.name,
      slug,
      publisher: pkg.publisher,
      description: pkg.description,
      category: classifyCategory(pkg.keywords),
      npm_package: pkg.name,
      source: 'npm',
      capabilities: deriveCapabilities(pkg.keywords),
      pricing: { model: 'open-source' },
      tags: pkg.keywords,
    })
    existingSlugs.add(slug)
    added++
  }

  // Process PyPI candidates
  for (const pkg of pypiCandidates) {
    discovered++
    const slug = toSlug(pkg.name)
    if (existingSlugs.has(slug)) { skipped++; continue }

    await addDiscoveredService({
      name: pkg.name,
      slug,
      publisher: pkg.publisher,
      description: pkg.description,
      category: classifyCategory(pkg.keywords),
      pypi_package: pkg.name,
      source: 'pypi',
      capabilities: deriveCapabilities(pkg.keywords),
      pricing: { model: 'open-source' },
      tags: pkg.keywords,
      homepage_url: pkg.projectUrl !== `https://pypi.org/project/${pkg.name}` ? pkg.projectUrl : undefined,
    })
    existingSlugs.add(slug)
    added++
  }

  // Process GitHub candidates
  for (const repo of githubCandidates) {
    discovered++
    const slug = toSlug(repo.name)
    if (existingSlugs.has(slug)) { skipped++; continue }

    await addDiscoveredService({
      name: repo.name,
      slug,
      publisher: repo.owner,
      description: repo.description,
      category: classifyCategory(repo.topics),
      github_repo: repo.fullName,
      source: 'github',
      capabilities: deriveCapabilities(repo.topics),
      tags: repo.topics,
      language: repo.language ?? undefined,
      homepage_url: repo.homepage ?? undefined,
    })
    existingSlugs.add(slug)
    added++
  }

  return { discovered, added, skipped }
}

/**
 * Batched discovery for a single source (e.g. huggingface).
 * Auto-calculates offset from existing services with that source.
 */
export async function runBatchDiscovery(
  source: string,
  batchSize: number,
): Promise<{ discovered: number; added: number; skipped: number; failed: number; offset: number; errors: string[]; existingSlugsCount: number; sampleSkipped: string[] }> {
  const supabase = createServerClient()

  // Determine offset by counting completed batches for this source
  const { count: batchCount, error: countError } = await supabase
    .from('discovery_queue')
    .select('*', { count: 'exact', head: true })
    .eq('source', `${source}_batch`)
    .eq('status', 'completed')
  if (countError) console.error('Batch count query failed:', countError)
  const offset = (batchCount ?? 0) * batchSize

  // Fetch existing slugs for dedup
  const { data: existing } = await supabase.from('services').select('slug')
  const existingSlugs = new Set(existing?.map(s => s.slug) ?? [])

  let discovered = 0
  let added = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []
  const sampleSkipped: string[] = []
  const existingSlugsCount = existingSlugs.size

  if (source === 'huggingface') {
    const candidates = await discoverHuggingFaceModels(offset, batchSize)

    for (const candidate of candidates) {
      discovered++
      const slug = toSlug(candidate.modelId)
      if (existingSlugs.has(slug)) {
        skipped++
        if (sampleSkipped.length < 5) sampleSkipped.push(`${candidate.modelId} → ${slug}`)
        continue
      }

      const category = getHFCategory(candidate)
      const result = await addDiscoveredService({
        name: candidate.name,
        slug,
        publisher: candidate.author,
        description: candidate.description,
        category,
        source: 'huggingface',
        capabilities: deriveCapabilities(candidate.tags, candidate.pipelineTag),
        pricing: { model: 'open-weight' },
        tags: candidate.tags,
      })
      existingSlugs.add(slug)
      if (result === true) {
        added++
      } else {
        failed++
        if (errors.length < 5) errors.push(`${slug}: ${result}`)
      }
    }
  }

  // Record batch completion so next run advances the offset
  if (discovered > 0) {
    await supabase.from('discovery_queue').insert({
      source: `${source}_batch`,
      query: `offset_${offset}`,
      status: 'completed',
      result: { offset, discovered, added, skipped, failed },
      processed_at: new Date().toISOString(),
    })
  }

  return { discovered, added, skipped, failed, offset, errors, existingSlugsCount, sampleSkipped }
}

async function addDiscoveredService(params: {
  name: string
  slug: string
  publisher: string
  description: string
  category: string
  npm_package?: string
  pypi_package?: string
  github_repo?: string
  source: string
  capabilities?: string[]
  pricing?: { model: string; tiers?: { label: string; value: string }[] } | null
  tags?: string[]
  language?: string
  homepage_url?: string
}): Promise<true | string> {
  const supabase = createServerClient()
  const publisherSlug = toSlug(params.publisher)

  // Ensure publisher exists — try upsert on slug, fall back to lookup by slug
  const { error: upsertError } = await supabase
    .from('publishers')
    .upsert({ name: params.publisher, slug: publisherSlug }, { onConflict: 'slug' })
  if (upsertError) {
    // Name conflict — publisher exists with same slug but different name. Just look it up.
    console.warn(`Publisher upsert warning for "${params.publisher}":`, upsertError.message)
  }

  const { data: publisher } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', publisherSlug)
    .single()

  if (!publisher) {
    return `publisher "${publisherSlug}": upsert=${upsertError?.message ?? 'ok'}, then not found`
  }

  const icon = ICON_MAP[params.category] ?? '◇'

  const { error: insertError } = await supabase.from('services').insert({
    name: params.name,
    slug: params.slug,
    publisher_id: publisher.id,
    category: params.category,
    description: params.description,
    icon,
    npm_package: params.npm_package ?? null,
    pypi_package: params.pypi_package ?? null,
    github_repo: params.github_repo ?? null,
    discovered_from: params.source,
    capabilities: params.capabilities?.length ? params.capabilities : [],
    pricing: params.pricing ?? null,
    tags: params.tags?.length ? params.tags : [],
    language: params.language ?? null,
    homepage_url: params.homepage_url ?? null,
    // Signals default to 3.0 — collectors will update on next daily run
    composite_score: 3.0,
    status: 'caution',
  })

  if (insertError) {
    return `insert: ${insertError.message}`
  }

  // Log the discovery
  await supabase.from('discovery_queue').insert({
    source: params.source,
    query: params.name,
    package_name: params.name,
    status: 'completed',
    result: { slug: params.slug, category: params.category },
    processed_at: new Date().toISOString(),
  })

  return true
}
