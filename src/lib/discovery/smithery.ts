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
  queriesRun: number
  totalApiCalls: number
  candidatesFound: number
  fetchTimeMs: number
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
const DELAY_MS = 50

// Smithery API only returns page 1 without a search query.
// Use letter queries to cover the catalog, dedup by qualifiedName.
const SEARCH_QUERIES = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')

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
  }

  const seen = new Set<string>()
  const allCandidates: SmitheryCandidate[] = []
  let totalApiCalls = 0
  const start = Date.now()

  for (const query of SEARCH_QUERIES) {
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      try {
        const res = await fetch(
          `https://registry.smithery.ai/servers?pageSize=${PAGE_SIZE}&page=${page}&q=${query}`,
          { headers },
        )
        if (!res.ok) break

        const data: SmitheryResponse = await res.json()
        totalApiCalls++
        totalPages = data.pagination.totalPages

        if (data.servers.length === 0) break

        for (const server of data.servers) {
          const qn = server.qualifiedName
          if (!qn || seen.has(qn)) continue
          seen.add(qn)

          const parts = qn.split('/')
          if (parts.length < 2) continue

          allCandidates.push({
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
      } catch {
        break
      }
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  const fetchTimeMs = Date.now() - start
  console.log(`Smithery: ${allCandidates.length} unique candidates from ${totalApiCalls} API calls in ${fetchTimeMs}ms`)

  return {
    candidates: allCandidates,
    debug: {
      apiKeySet: !!apiKey,
      queriesRun: SEARCH_QUERIES.length,
      totalApiCalls,
      candidatesFound: allCandidates.length,
      fetchTimeMs,
    },
  }
}
