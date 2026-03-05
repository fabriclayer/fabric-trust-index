/**
 * Post-Discovery Enrichment
 *
 * Resolves missing metadata for services added via monitor or discovery.
 *
 * Resolution paths:
 *   github_org → GitHub org repos API → github_repo
 *   github_repo → GitHub repo API → description, logo, license, language, topics, homepage
 *   github_repo → GitHub README → docs_url, x_url, discord_url
 *   github_org/slug → npm registry search → npm_package, description
 *   slug/github_org → PyPI JSON API → pypi_package, description
 */

import { githubHeaders } from '@/lib/collectors/github'
import { validateGitHubRepo } from './github-resolver'

interface EnrichInput {
  slug: string
  name: string
  github_org?: string | null
  github_repo?: string | null
  npm_package?: string | null
  pypi_package?: string | null
  homepage_url?: string | null
}

interface EnrichResult {
  github_repo?: string
  npm_package?: string
  pypi_package?: string
  description?: string
  logo_url?: string
  docs_url?: string
  x_url?: string
  discord_url?: string
  license?: string
  language?: string
  homepage_url?: string
  endpoint_url?: string
  category_keywords?: string[]
}

/**
 * Resolve missing metadata for a service.
 * Returns only the fields that were newly discovered (empty object = nothing found).
 * Never throws — all errors are caught and logged.
 */
export async function resolveServiceMetadata(service: EnrichInput): Promise<EnrichResult> {
  const result: EnrichResult = {}

  // a) Resolve GitHub repo from org
  if (service.github_org && !service.github_repo) {
    const repo = await resolveRepoFromOrg(service.github_org, service.slug, service.name)
    if (repo) result.github_repo = repo
  }

  const effectiveRepo = service.github_repo || result.github_repo
  const org = service.github_org ?? null

  // b) Fetch rich metadata from GitHub repo
  if (effectiveRepo) {
    const ghMeta = await fetchGitHubRepoMetadata(effectiveRepo)
    if (ghMeta) {
      if (ghMeta.description) result.description = ghMeta.description
      if (ghMeta.logo_url) result.logo_url = ghMeta.logo_url
      if (ghMeta.license) result.license = ghMeta.license
      if (ghMeta.language) result.language = ghMeta.language
      if (ghMeta.homepage && !service.homepage_url) result.homepage_url = ghMeta.homepage
      if (ghMeta.topics?.length) result.category_keywords = ghMeta.topics
    }

    // c) Parse README for docs, social links
    const readmeLinks = await extractLinksFromReadme(effectiveRepo)
    if (readmeLinks.docs_url) result.docs_url = readmeLinks.docs_url
    if (readmeLinks.x_url) result.x_url = readmeLinks.x_url
    if (readmeLinks.discord_url) result.discord_url = readmeLinks.discord_url
  }

  // d) Discover npm package
  if (!service.npm_package && org) {
    const pkg = await discoverNpmPackage(org, service.slug)
    if (pkg) result.npm_package = pkg
  }

  // e) Enrich from npm if we have a package (get description if not already set)
  const effectiveNpm = service.npm_package || result.npm_package
  if (effectiveNpm && !result.description) {
    const npmMeta = await fetchNpmMetadata(effectiveNpm)
    if (npmMeta?.description) result.description = npmMeta.description
  }

  // f) Discover PyPI package
  if (!service.pypi_package) {
    const pkg = await discoverPypiPackage(service.slug, org, service.name)
    if (pkg) result.pypi_package = pkg
  }

  // g) Enrich from PyPI if we have a package (get description if not already set)
  const effectivePypi = service.pypi_package || result.pypi_package
  if (effectivePypi && !result.description) {
    const pypiMeta = await fetchPypiMetadata(effectivePypi)
    if (pypiMeta?.description) result.description = pypiMeta.description
  }

  // h) Derive endpoint_url from homepage if it looks like an API
  if (!result.endpoint_url) {
    const homepage = service.homepage_url || result.homepage_url
    if (homepage) {
      try {
        const u = new URL(homepage)
        if (u.hostname.startsWith('api.')) {
          result.endpoint_url = homepage
        }
      } catch { /* ignore */ }
    }
  }

  return result
}

// ─── GitHub Repo Metadata ───────────────────────────────────────────

interface GitHubRepoMeta {
  description: string | null
  logo_url: string | null
  license: string | null
  language: string | null
  homepage: string | null
  topics: string[]
}

async function fetchGitHubRepoMetadata(repo: string): Promise<GitHubRepoMeta | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null

    const data = await res.json()
    return {
      description: data.description || null,
      logo_url: data.owner?.avatar_url || null,
      license: data.license?.spdx_id || null,
      language: data.language || null,
      homepage: data.homepage || null,
      topics: data.topics || [],
    }
  } catch {
    return null
  }
}

// ─── README Link Extraction ─────────────────────────────────────────

interface ReadmeLinks {
  docs_url?: string
  x_url?: string
  discord_url?: string
}

async function extractLinksFromReadme(repo: string): Promise<ReadmeLinks> {
  const result: ReadmeLinks = {}
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/readme`,
      { headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return result

    const readme = await res.text()

    // Extract docs URL — look for common documentation patterns
    const docsPatterns = [
      /https?:\/\/docs\.[^\s)>\]"']+/i,
      /https?:\/\/[^\s)>\]"']*\.(?:readthedocs|gitbook)\.[^\s)>\]"']+/i,
      /\[(?:[^\]]*(?:documentation|docs|api reference)[^\]]*)\]\((https?:\/\/[^\s)]+)\)/i,
    ]
    for (const pattern of docsPatterns) {
      const match = readme.match(pattern)
      if (match) {
        result.docs_url = match[1] || match[0]
        break
      }
    }

    // Extract Twitter/X URL
    const xPatterns = [
      /https?:\/\/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/,
    ]
    for (const pattern of xPatterns) {
      const match = readme.match(pattern)
      if (match) {
        const handle = match[1]
        if (!['intent', 'share', 'search'].includes(handle)) {
          result.x_url = `https://x.com/${handle}`
        }
        break
      }
    }

    // Extract Discord URL
    const discordMatch = readme.match(/https?:\/\/(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9_-]+/)
    if (discordMatch) {
      result.discord_url = discordMatch[0]
    }
    // Also check for custom redirect links that are common (e.g. supermemory.link/discord)
    const discordRedirect = readme.match(/https?:\/\/[^\s)>\]"']*\/discord\b[^\s)>\]"']*/i)
    if (!result.discord_url && discordRedirect) {
      result.discord_url = discordRedirect[0]
    }
  } catch { /* ignore */ }

  return result
}

// ─── npm Metadata ───────────────────────────────────────────────────

interface NpmMeta {
  description: string | null
}

async function fetchNpmMetadata(pkg: string): Promise<NpmMeta | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      description: data.description || null,
    }
  } catch {
    return null
  }
}

// ─── PyPI Metadata ──────────────────────────────────────────────────

interface PypiMeta {
  description: string | null
}

async function fetchPypiMetadata(pkg: string): Promise<PypiMeta | null> {
  try {
    const res = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      description: data.info?.summary || null,
    }
  } catch {
    return null
  }
}

// ─── GitHub Repo Resolution ─────────────────────────────────────────

async function resolveRepoFromOrg(
  org: string,
  slug: string,
  name: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?sort=stars&per_page=10`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null

    const repos: Array<{
      name: string
      full_name: string
      fork: boolean
      stargazers_count: number
    }> = await res.json()

    if (!repos.length) return null

    // Priority 1: repo name matches slug or service name
    const slugLower = slug.toLowerCase()
    const nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const nameMatch = repos.find(r => {
      const rLower = r.name.toLowerCase()
      return rLower === slugLower || rLower === nameLower || rLower === `${org.toLowerCase()}-${slugLower}`
    })
    if (nameMatch) {
      const valid = await validateGitHubRepo(nameMatch.full_name)
      if (valid) return nameMatch.full_name
    }

    // Priority 2: most-starred non-fork repo
    const best = repos
      .filter(r => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)[0]
    if (best) {
      const valid = await validateGitHubRepo(best.full_name)
      if (valid) return best.full_name
    }

    return null
  } catch {
    return null
  }
}

// ─── npm Package Discovery ──────────────────────────────────────────

async function discoverNpmPackage(org: string, slug: string): Promise<string | null> {
  // Try exact scoped names first (most likely)
  const exactNames = [
    `@${org}/sdk`,
    `@${org}/client`,
    `@${org}/${slug}`,
    slug,
  ]

  for (const name of exactNames) {
    if (await npmPackageExists(name)) return name
  }

  // Fall back to search
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`@${org}`)}&size=5`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null

    const data = await res.json()
    for (const obj of data.objects ?? []) {
      const pkg = obj.package?.name
      if (pkg && pkg.startsWith(`@${org}/`)) return pkg
    }
  } catch { /* ignore */ }

  return null
}

async function npmPackageExists(name: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      { method: 'HEAD', signal: AbortSignal.timeout(5000) },
    )
    return res.ok
  } catch {
    return false
  }
}

// ─── PyPI Package Discovery ─────────────────────────────────────────

async function discoverPypiPackage(
  slug: string,
  org: string | null,
  name: string,
): Promise<string | null> {
  const candidates = [
    slug,
    ...(org ? [org] : []),
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  ]

  // Deduplicate
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c || seen.has(c)) continue
    seen.add(c)
    if (await pypiPackageExists(c)) return c
  }

  return null
}

async function pypiPackageExists(name: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      { method: 'HEAD', signal: AbortSignal.timeout(5000) },
    )
    return res.ok
  } catch {
    return false
  }
}
