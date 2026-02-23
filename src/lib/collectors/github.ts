const GITHUB_API = 'https://api.github.com'

export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

export async function githubGet(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function githubExists(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: 'HEAD',
      headers: githubHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}
