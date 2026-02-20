/**
 * PyPI Discovery
 *
 * Searches PyPI for AI/ML packages.
 * PyPI doesn't have a search API, so we use the JSON API
 * with known package names and classifiers.
 */

export interface PyPICandidate {
  name: string
  description: string
  publisher: string
  version: string
  keywords: string[]
  projectUrl: string
}

// Well-known AI/ML package prefixes to scan
const KNOWN_PREFIXES = [
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
]

export async function getPyPIPackageInfo(packageName: string): Promise<PyPICandidate | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${packageName}/json`)
    if (!res.ok) return null

    const data = await res.json()
    const info = data.info

    return {
      name: info.name,
      description: info.summary ?? '',
      publisher: info.author ?? info.maintainer ?? 'unknown',
      version: info.version,
      keywords: info.keywords?.split(',').map((k: string) => k.trim()).filter(Boolean) ?? [],
      projectUrl: info.project_url ?? `https://pypi.org/project/${packageName}`,
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
