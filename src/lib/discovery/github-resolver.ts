/**
 * GitHub URL Resolver
 *
 * Shared utilities for resolving GitHub repository URLs from npm/PyPI
 * registry metadata. Normalises all URLs to "owner/repo" format.
 */

import { githubHeaders } from '@/lib/collectors/github'

/**
 * Extract "owner/repo" from any GitHub URL variant.
 * Handles: https://github.com/owner/repo, git+https://..., git://...,
 *          git+ssh://git@github.com/..., github:owner/repo
 */
export function extractGitHubRepo(url: string): string | null {
  const match = url.match(/(?:github\.com[/:])([^/]+\/[^/.#?\s]+)/i)
  return match ? match[1] : null
}

/**
 * Resolve GitHub repo from npm registry data.
 * Checks: repository field (string or object), homepage, bugs.url
 */
export async function resolveGitHubFromNpm(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()

    // Check repository field
    if (data.repository) {
      const repoUrl =
        typeof data.repository === 'string'
          ? data.repository
          : data.repository.url || ''
      const repo = extractGitHubRepo(repoUrl)
      if (repo) return repo
    }

    // Fallback: check homepage
    if (data.homepage && data.homepage.includes('github.com')) {
      const repo = extractGitHubRepo(data.homepage)
      if (repo) return repo
    }

    // Fallback: check bugs.url
    if (data.bugs?.url && data.bugs.url.includes('github.com')) {
      const repo = extractGitHubRepo(data.bugs.url)
      if (repo) return repo
    }

    return null
  } catch {
    return null
  }
}

/**
 * Resolve GitHub repo from PyPI package data.
 * Checks: project_urls dict (Source, Repository, GitHub, Code, Homepage),
 * info.home_page, and long description.
 */
export async function resolveGitHubFromPyPI(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const info = data.info ?? {}

    // Check structured project_urls dict
    const projectUrls: Record<string, string> = info.project_urls ?? {}
    const githubKeys = ['source', 'source code', 'repository', 'github', 'code', 'homepage', 'home']
    for (const [key, url] of Object.entries(projectUrls)) {
      if (
        githubKeys.includes(key.toLowerCase()) &&
        typeof url === 'string' &&
        url.includes('github.com')
      ) {
        const repo = extractGitHubRepo(url)
        if (repo) return repo
      }
    }

    // Also check any project_url value that happens to be a GitHub URL
    for (const url of Object.values(projectUrls)) {
      if (typeof url === 'string' && url.includes('github.com')) {
        const repo = extractGitHubRepo(url)
        if (repo) return repo
      }
    }

    // Fallback: info.home_page (deprecated field but still widely populated)
    if (info.home_page && info.home_page.includes('github.com')) {
      const repo = extractGitHubRepo(info.home_page)
      if (repo) return repo
    }

    return null
  } catch {
    return null
  }
}

/**
 * Attempt resolution from all available sources for a service.
 * Tries npm first (more reliable), then PyPI.
 */
export async function resolveGitHubRepo(service: {
  npm_package: string | null
  pypi_package: string | null
}): Promise<string | null> {
  if (service.npm_package) {
    const repo = await resolveGitHubFromNpm(service.npm_package)
    if (repo) return repo
  }
  if (service.pypi_package) {
    const repo = await resolveGitHubFromPyPI(service.pypi_package)
    if (repo) return repo
  }
  return null
}

/**
 * Validate that a resolved repo actually exists on GitHub.
 * Uses HEAD request to minimise API cost.
 */
export async function validateGitHubRepo(repo: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      method: 'HEAD',
      headers: githubHeaders(),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}
