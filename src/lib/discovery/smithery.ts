export interface SmitheryCandidate {
  name: string
  description: string
  publisher: string
  githubRepo: string
  useCount: number
  homepage: string
  createdAt: string
}

export interface SmitheryDebug {
  apiKeySet: boolean
  apiKeyPrefix: string | null
  queriesRun: number
  totalApiCalls: number
  candidatesFound: number
}

interface SmitheryServer {
  qualifiedName: string
  displayName: string
  description: string
  iconUrl: string | null
  useCount: number
  isDeployed: boolean
  remote: boolean
  createdAt: string
  homepage: string
}

interface SmitheryResponse {
  servers: SmitheryServer[]
  pagination: {
    currentPage: number
    pageSize: number
    totalPages: number
    totalCount: number
  }
}

const PAGE_SIZE = 100
const DELAY_MS = 200

// Smithery API caps results per search query at ~100-200.
// Use many queries to cover the full catalog, dedup by qualifiedName.
const SEARCH_QUERIES = [
  // Single letters
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // Digits
  ...'0123456789'.split(''),
  // Common keywords for broader coverage
  'mcp', 'server', 'api', 'tool', 'database', 'file', 'search',
  'agent', 'ai', 'cloud', 'docker', 'git', 'slack', 'google',
  'aws', 'azure', 'notion', 'postgres', 'redis', 'mongo',
  'browser', 'web', 'http', 'email', 'auth', 'code',
]

async function fetchAllPages(
  query: string,
  headers: Record<string, string>,
  seen: Set<string>,
): Promise<SmitheryCandidate[]> {
  const candidates: SmitheryCandidate[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const res = await fetch(
      `https://registry.smithery.ai/servers?pageSize=${PAGE_SIZE}&page=${page}&q=${encodeURIComponent(query)}`,
      { headers },
    )
    if (!res.ok) break

    const data: SmitheryResponse = await res.json()
    totalPages = data.pagination.totalPages

    if (data.servers.length === 0) break

    for (const server of data.servers) {
      const qn = server.qualifiedName
      if (!qn || seen.has(qn)) continue
      seen.add(qn)

      const parts = qn.split('/')
      if (parts.length < 2) continue

      candidates.push({
        name: server.displayName || parts[parts.length - 1],
        description: server.description || '',
        publisher: parts[0],
        githubRepo: qn,
        useCount: server.useCount ?? 0,
        homepage: server.homepage || `https://smithery.ai/server/${qn}`,
        createdAt: server.createdAt,
      })
    }

    page++
    if (page <= totalPages) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  return candidates
}

export async function discoverSmitheryServers(): Promise<{
  candidates: SmitheryCandidate[]
  debug: SmitheryDebug
}> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }

  const apiKey = process.env.SMITHERY_API_KEY
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  } else {
    console.warn('SMITHERY_API_KEY not set — proceeding without auth')
  }

  const seen = new Set<string>()
  const allCandidates: SmitheryCandidate[] = []
  let totalApiCalls = 0

  for (const query of SEARCH_QUERIES) {
    try {
      const batch = await fetchAllPages(query, headers, seen)
      allCandidates.push(...batch)
      totalApiCalls++
    } catch (err) {
      console.error(`Smithery query "${query}" failed:`, err)
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`Smithery discovery complete: ${allCandidates.length} unique candidates from ${SEARCH_QUERIES.length} queries`)

  return {
    candidates: allCandidates,
    debug: {
      apiKeySet: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + '...' : null,
      queriesRun: SEARCH_QUERIES.length,
      totalApiCalls,
      candidatesFound: allCandidates.length,
    },
  }
}
