/**
 * Post-Discovery Enrichment
 *
 * Resolves missing github_repo, npm_package, and pypi_package for services
 * that were added with only a github_org (e.g., watchlist entries, manual adds).
 *
 * Resolution paths:
 *   github_org → GitHub org repos API → github_repo
 *   github_org/slug → npm registry search → npm_package
 *   slug/github_org → PyPI JSON API → pypi_package
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
}

interface EnrichResult {
  github_repo?: string
  npm_package?: string
  pypi_package?: string
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

  const org = service.github_org ?? null

  // b) Discover npm package
  if (!service.npm_package && org) {
    const pkg = await discoverNpmPackage(org, service.slug)
    if (pkg) result.npm_package = pkg
  }

  // c) Discover PyPI package
  if (!service.pypi_package) {
    const pkg = await discoverPypiPackage(service.slug, org, service.name)
    if (pkg) result.pypi_package = pkg
  }

  return result
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
