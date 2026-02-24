export interface McpSoCandidate {
  name: string
  description: string
  publisher: string
  githubRepo: string
  homepage: string
}

const README_URL =
  'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md'

// Match: - [Name](https://github.com/owner/repo...) ...optional icons/text... - Description
const ENTRY_RE =
  /^\s*-\s*\[([^\]]+)\]\((https:\/\/github\.com\/([^/]+)\/([^/?#)]+)[^)]*)\)\s*(.*)$/

// Strip common emoji icons used in the list
const ICON_RE = /[📇🐍🏎️🦀#️⃣☕☁️🏠📟🍎🪟🐧🎖️]/gu

export async function discoverMcpSoServers(): Promise<McpSoCandidate[]> {
  let text: string
  try {
    const res = await fetch(README_URL, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) {
      console.warn(`awesome-mcp-servers fetch failed: ${res.status}`)
      return []
    }
    text = await res.text()
  } catch (err) {
    console.warn('awesome-mcp-servers fetch error:', err)
    return []
  }

  const candidates: McpSoCandidate[] = []
  const seen = new Set<string>()

  for (const line of text.split('\n')) {
    const m = line.match(ENTRY_RE)
    if (!m) continue

    const [, name, url, owner, repo, rest] = m
    const githubRepo = `${owner}/${repo}`

    if (seen.has(githubRepo)) continue
    seen.add(githubRepo)

    // Extract description: strip icons, then look for " - description" pattern
    let description = ''
    const cleaned = rest.replace(ICON_RE, '').trim()
    const dashIdx = cleaned.indexOf(' - ')
    if (dashIdx >= 0) {
      description = cleaned.slice(dashIdx + 3).trim()
    } else if (cleaned.startsWith('- ')) {
      description = cleaned.slice(2).trim()
    } else if (cleaned.length > 0) {
      description = cleaned
    }

    candidates.push({
      name: name.includes('/') ? name.split('/').pop()! : name,
      description,
      publisher: owner,
      githubRepo,
      homepage: url,
    })
  }

  return candidates
}
