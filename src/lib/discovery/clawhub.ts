export interface ClawHubCandidate {
  name: string
  description: string
  category: string
  homepage: string
}

const README_URL =
  'https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md'

// Map ClawHub section headers to Trust Index categories
function mapClawHubCategory(section: string): string {
  const mapping: [string, string[]][] = [
    ['agent', ['developer', 'dev tools', 'automation', 'workflow', 'general', 'utilities', 'productivity']],
    ['code', ['coding', 'code', 'git', 'github', 'ide', 'programming']],
    ['data-api', ['data', 'database', 'api', 'analytics', 'research', 'finance', 'cloud']],
    ['speech', ['audio', 'music', 'voice', 'speech', 'sound']],
    ['image-generation', ['image', 'design', 'media', 'creative', 'art', 'video']],
    ['web-search', ['browser', 'web', 'search', 'scraping']],
    ['infra', ['infrastructure', 'system', 'server', 'docker', 'deployment', 'networking', 'security', 'sysadmin', 'devops', 'smart home', 'iot']],
    ['llm', ['ai', 'model', 'llm', 'machine learning', 'ml']],
  ]

  const lower = section.toLowerCase()
  for (const [category, keywords] of mapping) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category
    }
  }
  return 'agent' // default — most ClawHub skills are agent tools
}

export async function discoverClawHubSkills(): Promise<ClawHubCandidate[]> {
  let text: string
  try {
    const res = await fetch(README_URL, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) {
      console.warn(`awesome-openclaw-skills fetch failed: ${res.status}`)
      return []
    }
    text = await res.text()
  } catch (err) {
    console.warn('awesome-openclaw-skills fetch error:', err)
    return []
  }

  const candidates: ClawHubCandidate[] = []
  const seen = new Set<string>()
  let currentSection = 'general'

  for (const line of text.split('\n')) {
    // Track section headers for category mapping
    const headerMatch = line.match(/^#{2,3}\s+(.+)/)
    if (headerMatch) {
      currentSection = headerMatch[1].replace(/[^\w\s-]/g, '').trim().toLowerCase()
      continue
    }

    // Try linked pattern: "- [skill-name](url) - Description"
    let match = line.match(/^[-*]?\s*\[([^\]]+)\]\([^)]*\)\s*[-–—]\s*(.+)/)
    if (!match) {
      // Try plain pattern: "- slug-name - Description"
      match = line.match(/^[-*]\s+([a-z0-9][\w.-]*(?:-[\w.-]+)*)\s+[-–—]\s+(.+)/)
    }

    if (!match) continue

    const name = match[1].trim()
    const description = match[2].trim()

    if (name.length < 2 || seen.has(name)) continue
    seen.add(name)

    candidates.push({
      name,
      description: description.slice(0, 300),
      category: mapClawHubCategory(currentSection),
      homepage: `https://clawhub.ai/skills/${name}`,
    })
  }

  return candidates
}
