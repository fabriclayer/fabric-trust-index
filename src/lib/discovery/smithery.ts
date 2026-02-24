export interface SmitheryCandidate {
  name: string
  description: string
  publisher: string
  githubRepo: string
  useCount: number
  homepage: string
  createdAt: string
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

export async function discoverSmitheryServers(): Promise<SmitheryCandidate[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }

  if (process.env.SMITHERY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.SMITHERY_API_KEY}`
  } else {
    console.warn('SMITHERY_API_KEY not set — proceeding without auth')
  }

  const candidates: SmitheryCandidate[] = []
  const seen = new Set<string>()
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    try {
      const res = await fetch(
        `https://registry.smithery.ai/servers?pageSize=${PAGE_SIZE}&page=${page}`,
        { headers },
      )
      if (!res.ok) {
        console.error(`Smithery API error on page ${page}: ${res.status}`)
        break
      }

      const data: SmitheryResponse = await res.json()
      totalPages = data.pagination.totalPages
      console.log(`Smithery page ${page}/${totalPages}: ${data.servers.length} servers`)

      if (data.servers.length === 0) break

      for (const server of data.servers) {
        const qn = server.qualifiedName
        if (!qn || seen.has(qn)) continue
        seen.add(qn)

        const parts = qn.split('/')
        if (parts.length < 2) continue

        const publisher = parts[0]
        const githubRepo = qn // already owner/repo format

        candidates.push({
          name: server.displayName || parts[parts.length - 1],
          description: server.description || '',
          publisher,
          githubRepo,
          useCount: server.useCount ?? 0,
          homepage: server.homepage || `https://smithery.ai/server/${qn}`,
          createdAt: server.createdAt,
        })
      }
    } catch (err) {
      console.error(`Smithery fetch failed on page ${page}:`, err)
      break
    }

    page++
    if (page <= totalPages) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`Smithery discovery complete: ${candidates.length} total candidates`)
  return candidates
}
