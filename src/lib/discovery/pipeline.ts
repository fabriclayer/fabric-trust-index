import { createServerClient } from '@/lib/supabase/server'
import { discoverNpmPackages, type NpmCandidate } from './npm'
import { discoverPyPIPackages, type PyPICandidate } from './pypi'
import { discoverGitHubRepos, type GitHubCandidate } from './github'
import { resolveGitHubFromNpm } from './github-resolver'
import { resolveServiceMetadata } from './enrich'
// HF discovery disabled — 1,452 models imported with no scoreable data sources.
// Re-enable when model-specific scoring pipeline is built (safetensors check,
// model card quality, licence, publisher verification).
// import { discoverHuggingFaceModels, getHFCategory, type HuggingFaceCandidate } from './huggingface'

// Category classification based on keywords/topics
// Order matters: framework must come before llm to prevent over-matching
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['framework', ['framework', 'langchain', 'llamaindex', 'haystack', 'semantic-kernel', 'toolkit', 'orchestration']],
  ['agent', ['agent', 'multi-agent', 'autonomous', 'crewai', 'autogen', 'mcp', 'mcp-server', 'mcp-tool']],
  ['llm', ['llm', 'large-language-model', 'gpt', 'chatbot', 'chat', 'language-model']],
  ['embedding', ['embedding', 'embeddings', 'vector', 'semantic-search']],
  ['code', ['code-generation', 'copilot', 'code-assistant', 'ide']],
  ['image-generation', ['image-generation', 'text-to-image', 'diffusion', 'stable-diffusion']],
  ['speech', ['text-to-speech', 'speech-to-text', 'tts', 'stt', 'audio']],
  ['web-search', ['search', 'web-search', 'crawl', 'scrape']],
  ['vision', ['computer-vision', 'image-recognition', 'ocr', 'object-detection']],
  ['data-api', ['api', 'data', 'rest-api']],
  ['infra', ['inference', 'deployment', 'serverless', 'gpu', 'vector-database', 'database']],
]

// Override list for known miscategorised packages
const CATEGORY_OVERRIDES: Record<string, string> = {
  'langchain': 'framework',
  '@langchain/core': 'framework',
  '@langchain/community': 'framework',
  '@langchain/openai': 'framework',
  '@langchain/anthropic': 'framework',
  'langchain-core': 'framework',
  'langchain-community': 'framework',
  'langchain-openai': 'framework',
  'langchain-anthropic': 'framework',
  'llamaindex': 'framework',
  'llama-index': 'framework',
  'haystack-ai': 'framework',
  'semantic-kernel': 'framework',
  'crewai': 'agent',
  'autogen': 'agent',
}

export function classifyCategory(keywords: string[], packageName?: string): string {
  // Check override list first
  if (packageName && CATEGORY_OVERRIDES[packageName]) {
    return CATEGORY_OVERRIDES[packageName]
  }

  const lower = keywords.map(k => k.toLowerCase())

  for (const [category, categoryKeywords] of CATEGORY_KEYWORDS) {
    for (const kw of categoryKeywords) {
      if (lower.some(k => k.includes(kw))) {
        return category
      }
    }
  }

  return 'infra' // default fallback
}

export function toSlug(name: string): string {
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
  'framework': '⬡',
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

  // Run discovery from all active sources in parallel
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

    // Resolve GitHub repo from npm registry metadata
    const githubRepo = await resolveGitHubFromNpm(pkg.name)

    await addDiscoveredService({
      name: pkg.name,
      slug,
      publisher: pkg.publisher,
      description: pkg.description,
      category: classifyCategory(pkg.keywords, pkg.name),
      npm_package: pkg.name,
      github_repo: githubRepo ?? undefined,
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
      category: classifyCategory(pkg.keywords, pkg.name),
      pypi_package: pkg.name,
      github_repo: pkg.githubRepo ?? undefined,
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
      category: classifyCategory(repo.topics, repo.name),
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

  // HF discovery disabled — 1,452 models imported with no scoreable data sources.
  // Re-enable when model-specific scoring pipeline is built (safetensors check,
  // model card quality, licence, publisher verification).
  if (source === 'huggingface') {
    return { discovered: 0, added: 0, skipped: 0, failed: 0, offset, errors: ['HF discovery disabled'], existingSlugsCount, sampleSkipped }
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

export async function addDiscoveredService(params: {
  name: string
  slug: string
  publisher: string
  description: string
  category: string
  npm_package?: string
  pypi_package?: string
  github_repo?: string
  github_org?: string
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

  // Set publisher github_org from github_repo owner if not already set
  if (params.github_repo) {
    const owner = params.github_repo.split('/')[0]
    if (owner) {
      const { data: pub } = await supabase
        .from('publishers')
        .select('github_org')
        .eq('id', publisher.id)
        .single()
      if (pub && !pub.github_org) {
        await supabase
          .from('publishers')
          .update({ github_org: owner })
          .eq('id', publisher.id)
      }
    }
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
    // New services start as pending — collectors will score on next daily run
    composite_score: 0,
    status: 'pending',
    active_modifiers: ['pending_evaluation'],
  })

  if (insertError) {
    return `insert: ${insertError.message}`
  }

  // Log the discovery (skip for monitor:approved — approval handler updates the existing queue entry)
  if (params.source !== 'monitor:approved') {
    await supabase.from('discovery_queue').insert({
      source: params.source,
      query: params.name,
      package_name: params.name,
      status: 'completed',
      result: { slug: params.slug, name: params.name, category: params.category },
      processed_at: new Date().toISOString(),
    })
  }

  // Post-insert enrichment: resolve missing github_repo, npm/pypi packages
  if (!params.github_repo || !params.npm_package || !params.pypi_package) {
    try {
      const ghOwner = params.github_repo?.split('/')[0] ?? null
      const enriched = await resolveServiceMetadata({
        slug: params.slug,
        name: params.name,
        github_org: params.github_org ?? ghOwner,
        github_repo: params.github_repo,
        npm_package: params.npm_package,
        pypi_package: params.pypi_package,
      })
      const updates: Record<string, string> = {}
      if (enriched.github_repo) updates.github_repo = enriched.github_repo
      if (enriched.npm_package) updates.npm_package = enriched.npm_package
      if (enriched.pypi_package) updates.pypi_package = enriched.pypi_package
      if (Object.keys(updates).length > 0) {
        await supabase.from('services').update(updates).eq('slug', params.slug)
      }
    } catch { /* don't fail insert on enrichment failure */ }
  }

  return true
}

/**
 * Queue a discovered service for manual review instead of auto-inserting.
 * Inserts into discovery_queue with status='pending'. Dedupes against
 * existing pending/completed entries by package_name.
 */
export async function queueForReview(params: {
  name: string
  slug: string
  publisher: string
  description: string
  category: string
  npm_package?: string
  pypi_package?: string
  github_repo?: string
  github_org?: string
  source: string
  capabilities?: string[]
  pricing?: { model: string; tiers?: { label: string; value: string }[] } | null
  tags?: string[]
  language?: string
  homepage_url?: string
  logo_url?: string
}): Promise<'queued' | 'duplicate' | string> {
  const supabase = createServerClient()

  // Check for existing queue entry with same slug (pending or completed)
  const { data: existing } = await supabase
    .from('discovery_queue')
    .select('id')
    .eq('package_name', params.slug)
    .in('status', ['pending', 'completed'])
    .limit(1)

  if (existing && existing.length > 0) {
    return 'duplicate'
  }

  const { error } = await supabase.from('discovery_queue').insert({
    source: params.source,
    query: params.name,
    package_name: params.slug,
    status: 'pending',
    result: {
      name: params.name,
      slug: params.slug,
      description: params.description,
      publisher: params.publisher,
      homepage_url: params.homepage_url,
      github_org: params.github_org,
      github_repo: params.github_repo,
      logo_url: params.logo_url,
      category: params.category,
      tags: params.tags ?? [],
      npm_package: params.npm_package,
      pypi_package: params.pypi_package,
      language: params.language,
      capabilities: params.capabilities,
      pricing: params.pricing,
    },
  })

  if (error) return `queue insert: ${error.message}`
  return 'queued'
}
