import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Publisher Trust Collector (weight: 0.10)
 *
 * Assesses account age, organizational membership, maintained package count,
 * identity consistency across registries, and project/package age.
 *
 * Components: account_age (1.5), org_type (0.75), maintained_packages (0.75),
 *             identity (0.75), project_age (1.0)
 * Max raw: 4.75, scaled to 0-5
 *
 * Data sources: GitHub API, npm registry, PyPI API
 */

const MAX_RAW = 4.75

import { githubGet } from './github'

interface NpmPackageInfo {
  maintainers?: Array<{ name: string }>
  deprecated?: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, { deprecated?: string }>
  time?: Record<string, string> // { created: "...", modified: "...", "1.0.0": "..." }
}

async function getNpmPackageInfo(pkg: string): Promise<NpmPackageInfo | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}`)
    if (!res.ok) return null
    return res.json() as Promise<NpmPackageInfo>
  } catch {
    return null
  }
}

async function getPypiFirstRelease(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${pkg}/json`)
    if (!res.ok) return null
    const data = await res.json() as { releases?: Record<string, Array<{ upload_time_iso_8601?: string }>> }
    if (!data.releases) return null
    // Find the earliest upload_time across all releases
    let earliest: string | null = null
    for (const version of Object.values(data.releases)) {
      for (const file of version) {
        const ts = file.upload_time_iso_8601
        if (ts && (!earliest || ts < earliest)) earliest = ts
      }
    }
    return earliest
  } catch {
    return null
  }
}

/**
 * Score project/package age based on how long the project has existed.
 * Addresses typosquatting and supply chain attacks from new packages.
 *
 * < 30 days:     -0.25 (significant penalty — new/unestablished)
 * 30-90 days:    0.15  (moderate penalty)
 * 90d - 1 year:  0.4   (slight penalty)
 * 1-3 years:     0.7   (neutral)
 * 3+ years:      1.0   (small bonus — established project)
 */
function scoreProjectAge(ageDays: number): number {
  if (ageDays < 30) return -0.25
  if (ageDays < 90) return 0.15
  if (ageDays < 365) return 0.4
  if (ageDays < 365 * 3) return 0.7
  return 1.0
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
        score: 2.5,
        metadata: { reason: 'publisher_not_found' },
        sources: [],
      }
    }

    // 1. Account age (via GitHub org/user) — up to 1.5
    const ghOrg = publisher.github_org
    if (!ghOrg) {
      return {
        signal_name: 'publisher_trust',
        score: 2.5,
        metadata: { reason: 'no_publisher_github' },
        sources: [],
      }
    }
    const orgData = await githubGet(`/users/${ghOrg}`) as {
      created_at?: string
      type?: string
      public_repos?: number
    } | null

    if (!orgData) {
      return {
        signal_name: 'publisher_trust',
        score: 2.5,
        metadata: { reason: 'github_api_failed', github_org: ghOrg },
        sources: [],
      }
    }

    // Track candidate dates for first_published_at
    const ageDates: string[] = []

    if (orgData.created_at) {
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

    // 4. Identity consistency across registries — up to 0.75
    let identityPoints = 0
    const identityChecks: string[] = []

    if (publisher.github_org) identityChecks.push('github')
    if (publisher.npm_org) identityChecks.push('npm')
    if (publisher.pypi_org) identityChecks.push('pypi')

    // Cross-check npm maintainer matches GitHub org
    let npmInfo: NpmPackageInfo | null = null
    if (service.npm_package && publisher.github_org) {
      npmInfo = await getNpmPackageInfo(service.npm_package)
      if (npmInfo?.maintainers?.some(m =>
        m.name.toLowerCase() === publisher.github_org!.toLowerCase() ||
        m.name.toLowerCase() === publisher.npm_org?.toLowerCase()
      )) {
        identityPoints += 0.375
        sources.push(`npm:${service.npm_package}`)
      }

      // Store npm maintainers list for owner change detection
      if (npmInfo?.maintainers) {
        metadata.npm_maintainers = npmInfo.maintainers.map(m => m.name)
      }

      // Detect npm deprecated
      if (npmInfo?.deprecated) {
        metadata.npm_deprecated = true
        metadata.npm_deprecated_reason = npmInfo.deprecated
      } else if (npmInfo?.['dist-tags']?.latest && npmInfo.versions) {
        const latestVersion = npmInfo['dist-tags'].latest
        const latestData = npmInfo.versions[latestVersion]
        if (latestData?.deprecated) {
          metadata.npm_deprecated = true
          metadata.npm_deprecated_reason = latestData.deprecated
        }
      }

      // npm package creation date
      if (npmInfo?.time?.created) {
        ageDates.push(npmInfo.time.created)
        metadata.npm_created_at = npmInfo.time.created
      }
    } else if (service.npm_package) {
      // Fetch npm info even without publisher github_org for age data
      npmInfo = await getNpmPackageInfo(service.npm_package)
      if (npmInfo?.time?.created) {
        ageDates.push(npmInfo.time.created)
        metadata.npm_created_at = npmInfo.time.created
      }
    }

    if (identityChecks.length >= 2) identityPoints += 0.375
    score += Math.min(identityPoints, 0.75)
    metadata.identity_registries = identityChecks
    metadata.identity_score = identityPoints

    // 5. Project/package age — up to 1.0 (can be negative for very new packages)
    //    Addresses typosquatting & supply chain attacks from new packages.

    // GitHub repo created_at
    if (service.github_repo) {
      const repoData = await githubGet(`/repos/${service.github_repo}`) as {
        created_at?: string
      } | null
      if (repoData?.created_at) {
        ageDates.push(repoData.created_at)
        metadata.repo_created_at = repoData.created_at
      }
    }

    // PyPI first release date
    if (service.pypi_package) {
      const pypiDate = await getPypiFirstRelease(service.pypi_package)
      if (pypiDate) {
        ageDates.push(pypiDate)
        metadata.pypi_first_release = pypiDate
        sources.push(`pypi:${service.pypi_package}`)
      }
    }

    // Determine first_published_at as the earliest date found
    let firstPublishedAt: string | null = null
    if (ageDates.length > 0) {
      ageDates.sort()
      firstPublishedAt = ageDates[0]
      const ageDays = (Date.now() - new Date(firstPublishedAt).getTime()) / 86400000
      metadata.project_age_days = Math.round(ageDays)
      metadata.first_published_at = firstPublishedAt

      const ageScore = scoreProjectAge(ageDays)
      score += ageScore
      metadata.project_age_score = ageScore

      if (ageDays < 30) {
        metadata.project_age_warning = 'new_package'
      }
    }

    // Update publisher identity_consistency_score
    await supabase
      .from('publishers')
      .update({
        identity_consistency_score: Math.min(identityPoints / 0.75, 1) * 5,
        maintained_package_count: metadata.public_repos as number ?? publisher.maintained_package_count,
      })
      .eq('id', publisher.id)

    // Store first_published_at on the service record
    if (firstPublishedAt) {
      await supabase
        .from('services')
        .update({ first_published_at: firstPublishedAt })
        .eq('id', service.id)
    }

    // Scale: raw score is 0-4.75 (can go slightly negative with age penalty), map to 0-5
    const scaledScore = (Math.max(0, score) / MAX_RAW) * 5

    return {
      signal_name: 'publisher_trust',
      score: clampScore(scaledScore),
      metadata,
      sources,
    }
  },
}
