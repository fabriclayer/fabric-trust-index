const CLAWHUB_API = 'https://clawhub.ai/api/v1'

export interface ClawHubSkillData {
  skill: {
    slug: string
    displayName: string
    summary: string
    tags: Record<string, string>
    stats: {
      comments: number
      downloads: number
      installsAllTime: number
      installsCurrent: number
      stars: number
      versions: number
    }
    createdAt: number
    updatedAt: number
  }
  latestVersion: {
    version: string
    createdAt: number
    changelog: string
  }
  owner: {
    handle: string
    userId: string
    displayName: string
    image: string
  }
  moderation: unknown | null
}

export async function getClawHubSkill(slug: string): Promise<ClawHubSkillData | null> {
  try {
    const res = await fetch(`${CLAWHUB_API}/skills/${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return null
    return (await res.json()) as ClawHubSkillData
  } catch {
    return null
  }
}

export async function fetchSkillMd(ownerHandle: string, skillSlug: string): Promise<string | null> {
  // SKILL.md lives at: openclaw/skills/main/skills/{owner}/{slug}/SKILL.md
  const url = `https://raw.githubusercontent.com/openclaw/skills/main/skills/${ownerHandle}/${skillSlug}/SKILL.md`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'FabricTrustIndex/1.0' }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}
