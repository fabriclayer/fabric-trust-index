/**
 * Hugging Face Hub Discovery
 *
 * Discovers AI models from the Hugging Face Hub API.
 * Paginated — each call fetches a batch of models sorted by downloads.
 */

export interface HuggingFaceCandidate {
  modelId: string       // e.g. "meta-llama/Llama-3.3-70B-Instruct"
  name: string          // e.g. "Llama-3.3-70B-Instruct"
  author: string        // e.g. "meta-llama"
  description: string
  pipelineTag: string | null
  downloads: number
  likes: number
  tags: string[]
}

const HF_API = 'https://huggingface.co/api'

// Map HF pipeline_tag to our categories
const PIPELINE_TAG_MAP: Record<string, string> = {
  // LLM
  'text-generation': 'llm',
  'text2text-generation': 'llm',
  'conversational': 'llm',
  'text-classification': 'llm',
  'token-classification': 'llm',
  'question-answering': 'llm',
  'summarization': 'llm',
  'translation': 'llm',
  'fill-mask': 'llm',
  'zero-shot-classification': 'llm',
  'table-question-answering': 'llm',
  // Image generation
  'text-to-image': 'image-generation',
  'image-to-image': 'image-generation',
  'unconditional-image-generation': 'image-generation',
  // Vision
  'image-classification': 'vision',
  'object-detection': 'vision',
  'image-segmentation': 'vision',
  'image-to-text': 'vision',
  'depth-estimation': 'vision',
  'video-classification': 'vision',
  'image-feature-extraction': 'vision',
  // Speech
  'automatic-speech-recognition': 'speech',
  'text-to-speech': 'speech',
  'audio-classification': 'speech',
  'audio-to-audio': 'speech',
  'voice-activity-detection': 'speech',
  // Embedding
  'feature-extraction': 'embedding',
  'sentence-similarity': 'embedding',
  // Other
  'reinforcement-learning': 'agent',
  'robotics': 'agent',
  'tabular-classification': 'data-api',
  'tabular-regression': 'data-api',
}

function classifyFromPipelineTag(tag: string | null): string {
  if (!tag) return 'infra'
  return PIPELINE_TAG_MAP[tag] ?? 'infra'
}

function hfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'FabricTrustIndex/1.0',
  }
  if (process.env.HF_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_TOKEN}`
  }
  return headers
}

/**
 * Fetch a page of HF models sorted by downloads (descending).
 * HF API returns up to 100 models per request.
 */
async function fetchHFPage(skip: number, limit: number): Promise<any[]> {
  try {
    const url = `${HF_API}/models?sort=downloads&direction=-1&limit=${Math.min(limit, 100)}&skip=${skip}`
    const res = await fetch(url, { headers: hfHeaders() })
    if (!res.ok) {
      console.error(`HF API returned ${res.status} at skip ${skip}`)
      return []
    }
    return await res.json()
  } catch (err) {
    console.error(`HF API fetch failed at skip ${skip}:`, err)
    return []
  }
}

/**
 * Discover HF models in batches. Fetches multiple pages up to `totalLimit`.
 * Only includes models with downloads >= minDownloads.
 */
export async function discoverHuggingFaceModels(
  offset: number,
  totalLimit: number,
  minDownloads = 1000,
): Promise<HuggingFaceCandidate[]> {
  const candidates: HuggingFaceCandidate[] = []
  const pageSize = 100
  let currentOffset = offset

  while (candidates.length < totalLimit) {
    const models = await fetchHFPage(currentOffset, pageSize)
    if (models.length === 0) break // No more results

    for (const model of models) {
      // Stop if downloads drop below threshold
      if ((model.downloads ?? 0) < minDownloads) {
        return candidates
      }

      const modelId: string = model.modelId ?? model.id ?? ''
      const parts = modelId.split('/')
      const author = parts.length > 1 ? parts[0] : 'unknown'
      const name = parts.length > 1 ? parts[1] : modelId

      candidates.push({
        modelId,
        name,
        author,
        description: model.description ?? model.pipeline_tag ?? '',
        pipelineTag: model.pipeline_tag ?? null,
        downloads: model.downloads ?? 0,
        likes: model.likes ?? 0,
        tags: model.tags ?? [],
      })

      if (candidates.length >= totalLimit) break
    }

    currentOffset += pageSize

    // Small delay between pages to be respectful
    await new Promise(r => setTimeout(r, 100))
  }

  return candidates
}

/**
 * Get the category for an HF candidate using pipeline_tag and tags.
 */
export function getHFCategory(candidate: HuggingFaceCandidate): string {
  return classifyFromPipelineTag(candidate.pipelineTag)
}
