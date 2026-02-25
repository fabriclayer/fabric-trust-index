/**
 * PyPI Discovery
 *
 * Searches PyPI for AI/ML packages.
 * PyPI doesn't have a search API, so we use the JSON API
 * with known package names and classifiers.
 */

import { CI_BOT_NAMES } from './bot-filter'
import { extractGitHubRepo } from './github-resolver'

export interface PyPICandidate {
  name: string
  description: string
  publisher: string
  version: string
  keywords: string[]
  projectUrl: string
  githubRepo: string | null
}

// Well-known AI/ML packages to scan
const KNOWN_PREFIXES = [
  // Original
  'langchain',
  'llama-index',
  'openai',
  'anthropic',
  'transformers',
  'torch',
  'tensorflow',
  'chromadb',
  'pinecone',
  'weaviate',
  'qdrant',
  'mcp',
  'crewai',
  'autogen',
  // HuggingFace ecosystem
  'huggingface-hub',
  'datasets',
  'diffusers',
  'accelerate',
  'safetensors',
  'tokenizers',
  'peft',
  'trl',
  // Embeddings & vector
  'sentence-transformers',
  'faiss-cpu',
  'annoy',
  'pymilvus',
  // ML frameworks
  'scikit-learn',
  'xgboost',
  'lightgbm',
  'catboost',
  'keras',
  'jax',
  'flax',
  // NLP
  'spacy',
  'nltk',
  'gensim',
  'flair',
  // Vision
  'ultralytics',
  'opencv-python',
  'pillow',
  'torchvision',
  // Audio
  'whisper',
  'torchaudio',
  'librosa',
  // MLOps
  'ray',
  'mlflow',
  'wandb',
  'dvc',
  'bentoml',
  // LLM tooling
  'cohere',
  'replicate',
  'together',
  'groq',
  'instructor',
  'outlines',
  'guidance',
  'dspy-ai',
  'vllm',
  'modal',
  // Web & serving
  'gradio',
  'streamlit',
  'fastapi',
  'litellm',
  'ollama',
]

export async function getPyPIPackageInfo(packageName: string): Promise<PyPICandidate | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${packageName}/json`)
    if (!res.ok) return null

    const data = await res.json()
    const info = data.info

    // Resolve publisher, skipping known CI bots
    const candidates = [info.author, info.maintainer].filter(Boolean)
    let publisher = 'unknown'
    for (const name of candidates) {
      if (!CI_BOT_NAMES.has(name.toLowerCase())) {
        publisher = name
        break
      }
    }
    if (publisher === 'unknown' && candidates.length > 0) {
      publisher = candidates[0]
    }

    // Extract GitHub repo from project_urls dict
    let githubRepo: string | null = null
    const projectUrls: Record<string, string> = info.project_urls ?? {}
    const githubKeys = ['source', 'source code', 'repository', 'github', 'code', 'homepage', 'home']
    for (const [key, url] of Object.entries(projectUrls)) {
      if (
        githubKeys.includes(key.toLowerCase()) &&
        typeof url === 'string' &&
        url.includes('github.com')
      ) {
        githubRepo = extractGitHubRepo(url)
        if (githubRepo) break
      }
    }
    // Fallback: any project_url value that's a GitHub URL
    if (!githubRepo) {
      for (const url of Object.values(projectUrls)) {
        if (typeof url === 'string' && url.includes('github.com')) {
          githubRepo = extractGitHubRepo(url)
          if (githubRepo) break
        }
      }
    }
    // Fallback: info.home_page
    if (!githubRepo && info.home_page && info.home_page.includes('github.com')) {
      githubRepo = extractGitHubRepo(info.home_page)
    }

    return {
      name: info.name,
      description: info.summary ?? '',
      publisher,
      version: info.version,
      keywords: info.keywords?.split(',').map((k: string) => k.trim()).filter(Boolean) ?? [],
      projectUrl: info.project_url ?? `https://pypi.org/project/${packageName}`,
      githubRepo,
    }
  } catch {
    return null
  }
}

export async function discoverPyPIPackages(): Promise<PyPICandidate[]> {
  const candidates: PyPICandidate[] = []

  for (const prefix of KNOWN_PREFIXES) {
    const pkg = await getPyPIPackageInfo(prefix)
    if (pkg) candidates.push(pkg)
  }

  return candidates
}
