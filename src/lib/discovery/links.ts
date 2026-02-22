/**
 * Link Discovery Utility
 *
 * Extracts documentation, social, and status page URLs from
 * npm, PyPI, and GitHub sources using structured fields + README parsing.
 */

export interface ExtractedLinks {
  homepage_url?: string
  docs_url?: string
  x_url?: string
  discord_url?: string
  status_page_url?: string
}

// ─── Regex Patterns ───

const X_RE = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+/g
const DISCORD_RE = /https?:\/\/(www\.)?discord\.(gg|com\/invite)\/[a-zA-Z0-9]+/g
const STATUS_RE = /https?:\/\/(status\.[a-zA-Z0-9.-]+|[a-zA-Z0-9.-]+\.statuspage\.io|[a-zA-Z0-9.-]+\.instatus\.com|[a-zA-Z0-9.-]+\.betteruptime\.com)[^\s)"]*/g
const DOCS_RE = /https?:\/\/(docs\.[a-zA-Z0-9.-]+[^\s)"]*|[a-zA-Z0-9.-]+\/docs\/?[^\s)"]*|[a-zA-Z0-9.-]+\/documentation\/?[^\s)"]*)/g

/**
 * Extract links from raw text (README, description, etc.)
 */
export function extractLinksFromText(text: string): ExtractedLinks {
  const links: ExtractedLinks = {}

  const xMatch = text.match(X_RE)
  if (xMatch) links.x_url = xMatch[0]

  const discordMatch = text.match(DISCORD_RE)
  if (discordMatch) links.discord_url = discordMatch[0]

  const statusMatch = text.match(STATUS_RE)
  if (statusMatch) links.status_page_url = statusMatch[0]

  const docsMatch = text.match(DOCS_RE)
  if (docsMatch) links.docs_url = docsMatch[0]

  return links
}

// ─── GitHub Helpers ───

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

// ─── Source-Specific Extractors ───

/**
 * Extract links from npm registry package data.
 * Fetches package JSON and README.
 */
export async function extractLinksFromNpm(packageName: string): Promise<ExtractedLinks> {
  const links: ExtractedLinks = {}

  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return links

    const data = await res.json()

    // Structured fields
    if (data.homepage && typeof data.homepage === 'string') {
      links.homepage_url = data.homepage
    }

    // Parse README for social/docs links
    const readme = data.readme ?? data['readme'] ?? ''
    if (typeof readme === 'string' && readme.length > 0) {
      const textLinks = extractLinksFromText(readme)
      if (textLinks.x_url) links.x_url = textLinks.x_url
      if (textLinks.discord_url) links.discord_url = textLinks.discord_url
      if (textLinks.status_page_url) links.status_page_url = textLinks.status_page_url
      if (textLinks.docs_url) links.docs_url = textLinks.docs_url
    }

    // Check latest version's package.json for homepage
    const latestVersion = data['dist-tags']?.latest
    if (latestVersion && data.versions?.[latestVersion]) {
      const pkg = data.versions[latestVersion]
      if (pkg.homepage && !links.homepage_url) {
        links.homepage_url = pkg.homepage
      }
    }
  } catch {
    // Silently fail
  }

  return links
}

/**
 * Extract links from PyPI package data.
 * Uses structured project_urls dict + README fallback.
 */
export async function extractLinksFromPyPI(packageName: string): Promise<ExtractedLinks> {
  const links: ExtractedLinks = {}

  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return links

    const data = await res.json()
    const info = data.info ?? {}
    const projectUrls: Record<string, string> = info.project_urls ?? {}

    // Structured project_urls (most reliable)
    for (const [key, url] of Object.entries(projectUrls)) {
      const lower = key.toLowerCase()

      if (!links.homepage_url && (lower === 'homepage' || lower === 'home')) {
        links.homepage_url = url
      }
      if (!links.docs_url && (lower === 'documentation' || lower === 'docs' || lower === 'doc')) {
        links.docs_url = url
      }
      if (!links.x_url && (lower === 'twitter' || lower === 'x')) {
        links.x_url = url
      }
      if (!links.discord_url && lower === 'discord') {
        links.discord_url = url
      }

      // Check URLs for patterns too
      if (!links.discord_url && DISCORD_RE.test(url)) {
        DISCORD_RE.lastIndex = 0
        links.discord_url = url
      }
      if (!links.x_url && X_RE.test(url)) {
        X_RE.lastIndex = 0
        links.x_url = url
      }
    }

    // homepage from info.home_page
    if (!links.homepage_url && info.home_page) {
      links.homepage_url = info.home_page
    }

    // README fallback for anything still missing
    const description = info.description ?? ''
    if (typeof description === 'string' && description.length > 0) {
      const textLinks = extractLinksFromText(description)
      if (!links.x_url && textLinks.x_url) links.x_url = textLinks.x_url
      if (!links.discord_url && textLinks.discord_url) links.discord_url = textLinks.discord_url
      if (!links.status_page_url && textLinks.status_page_url) links.status_page_url = textLinks.status_page_url
      if (!links.docs_url && textLinks.docs_url) links.docs_url = textLinks.docs_url
    }
  } catch {
    // Silently fail
  }

  return links
}

/**
 * Extract links from GitHub repo metadata + README.
 */
export async function extractLinksFromGitHub(repo: string): Promise<ExtractedLinks> {
  const links: ExtractedLinks = {}

  try {
    // Fetch repo metadata
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: githubHeaders(),
    })
    if (!repoRes.ok) return links

    const repoData = await repoRes.json()

    if (repoData.homepage && typeof repoData.homepage === 'string' && repoData.homepage.length > 0) {
      links.homepage_url = repoData.homepage
    }

    // Check if repo has docs folder (indicates docs site)
    try {
      const docsRes = await fetch(`https://api.github.com/repos/${repo}/contents/docs`, {
        headers: githubHeaders(),
      })
      if (docsRes.ok) {
        // Has a docs folder — check if there's a GitHub Pages site
        if (repoData.has_pages) {
          const owner = repo.split('/')[0]
          const repoName = repo.split('/')[1]
          links.docs_url = `https://${owner}.github.io/${repoName}/`
        }
      }
    } catch {
      // No docs folder, that's fine
    }

    // Fetch README for link extraction
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${repo}/readme`, {
        headers: githubHeaders(),
      })
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json()
        if (readmeData.content) {
          const readme = Buffer.from(readmeData.content, 'base64').toString('utf-8')
          const textLinks = extractLinksFromText(readme)
          if (!links.x_url && textLinks.x_url) links.x_url = textLinks.x_url
          if (!links.discord_url && textLinks.discord_url) links.discord_url = textLinks.discord_url
          if (!links.status_page_url && textLinks.status_page_url) links.status_page_url = textLinks.status_page_url
          if (!links.docs_url && textLinks.docs_url) links.docs_url = textLinks.docs_url
        }
      }
    } catch {
      // No README, that's fine
    }
  } catch {
    // Silently fail
  }

  return links
}

/**
 * Merge multiple ExtractedLinks with priority (first non-null wins).
 * Call with highest-priority source first.
 */
export function mergeLinks(...sources: ExtractedLinks[]): ExtractedLinks {
  const merged: ExtractedLinks = {}

  for (const source of sources) {
    if (!merged.homepage_url && source.homepage_url) merged.homepage_url = source.homepage_url
    if (!merged.docs_url && source.docs_url) merged.docs_url = source.docs_url
    if (!merged.x_url && source.x_url) merged.x_url = source.x_url
    if (!merged.discord_url && source.discord_url) merged.discord_url = source.discord_url
    if (!merged.status_page_url && source.status_page_url) merged.status_page_url = source.status_page_url
  }

  return merged
}
