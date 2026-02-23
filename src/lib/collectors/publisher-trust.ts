import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Publisher Trust Collector (weight: 0.10)
 *
 * Assesses account age, organizational membership, maintained package count,
 * and identity consistency across registries.
 *
 * Components: account_age (1.5), org_type (0.75), maintained_packages (0.75), identity (0.75)
 * Max raw: 3.75, scaled to 0-5
 *
 * Data sources: GitHub API, npm registry
 */

const MAX_RAW = 3.75

const GITHUB_API = 'https://api.github.com'

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

async function githubGet(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function getNpmPackageInfo(pkg: string): Promise<{ maintainers?: Array<{ name: string }> } | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}`)
    if (!res.ok) return null
    return res.json() as Promise<{ maintainers?: Array<{ name: string }> }>
  } catch {
    return null
  }
}

export const publisherTrustCollector: Collector = {
  name: 'publisher_trust',

  async collect(service: DbService): Promise<CollectorResult> {
    const supabase = createServerClient()
    const sources: string[] = []
    let score = 0
    const metadata: Record<string, unknown> = {}

    // Get publisher info
    const { data: publisher } = await supabase
      .from('publishers')
      .select('*')
      .eq('id', service.publisher_id)
      .single()

    if (!publisher) {
      return {
        signal_name: 'publisher_trust',
        score: 1.0,
        metadata: { reason: 'publisher_not_found' },
        sources: [],
      }
    }

    // 1. Account age (via GitHub org/user) — up to 1.5
    const ghOrg = publisher.github_org
    if (ghOrg) {
      const orgData = await githubGet(`/users/${ghOrg}`) as {
        created_at?: string
        type?: string
        public_repos?: number
      } | null

      if (orgData?.created_at) {
        const ageYears = (Date.now() - new Date(orgData.created_at).getTime()) / (365.25 * 86400000)
        metadata.account_age_years = Math.round(ageYears * 10) / 10

        if (ageYears >= 5) score += 1.5
        else if (ageYears >= 2) score += 1.2
        else if (ageYears >= 1) score += 0.8
        else score += 0.4

        // 2. Organization type — up to 0.75
        if (orgData.type === 'Organization') {
          score += 0.75
          metadata.is_organization = true
        } else {
          metadata.is_organization = false
        }

        // 3. Maintained package count — up to 0.75
        const repoCount = orgData.public_repos ?? 0
        metadata.public_repos = repoCount
        if (repoCount > 20) score += 0.75
        else if (repoCount > 10) score += 0.5
        else if (repoCount > 5) score += 0.35
        else if (repoCount > 0) score += 0.15

        sources.push(`github:${ghOrg}`)
      }
    }

    // 4. Identity consistency across registries — up to 0.75
    let identityPoints = 0
    const identityChecks: string[] = []

    if (publisher.github_org) identityChecks.push('github')
    if (publisher.npm_org) identityChecks.push('npm')
    if (publisher.pypi_org) identityChecks.push('pypi')

    // Cross-check npm maintainer matches GitHub org
    if (service.npm_package && publisher.github_org) {
      const npmInfo = await getNpmPackageInfo(service.npm_package)
      if (npmInfo?.maintainers?.some(m =>
        m.name.toLowerCase() === publisher.github_org!.toLowerCase() ||
        m.name.toLowerCase() === publisher.npm_org?.toLowerCase()
      )) {
        identityPoints += 0.375
        sources.push(`npm:${service.npm_package}`)
      }
    }

    if (identityChecks.length >= 2) identityPoints += 0.375
    score += Math.min(identityPoints, 0.75)
    metadata.identity_registries = identityChecks
    metadata.identity_score = identityPoints

    // Update publisher identity_consistency_score
    await supabase
      .from('publishers')
      .update({
        identity_consistency_score: Math.min(identityPoints / 0.75, 1) * 5,
        maintained_package_count: metadata.public_repos as number ?? publisher.maintained_package_count,
      })
      .eq('id', publisher.id)

    // Scale: raw score is 0-3.75, map to 0-5
    const scaledScore = (score / MAX_RAW) * 5

    return {
      signal_name: 'publisher_trust',
      score: clampScore(scaledScore),
      metadata,
      sources,
    }
  },
}
