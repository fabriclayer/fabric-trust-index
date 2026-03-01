import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult, SubSignalScore } from './types'
import { clampScore, computeSubSignalScore } from './types'
import { createServerClient } from '@/lib/supabase/server'
import { githubGet } from './github'

/**
 * Publisher Trust Collector (weight: 0.15)
 *
 * Sub-signals:
 *   track_record           (0.30) — max(internal sibling avg, external GitHub credibility)
 *   org_maturity            (0.30) — GitHub account age
 *   community_standing      (0.20) — public repos count (proxy)
 *   cross_platform_presence (0.20) — registry presence count
 *
 * track_record uses external credibility (GitHub followers + total org stars) to
 * avoid penalizing legitimate publishers with incomplete Fabric index coverage.
 * verified_publisher flag floors track_record at 4.0.
 *
 * Also detects npm_deprecated, npm_maintainers (for owner change detection),
 * and computes first_published_at / project age metadata.
 */

interface NpmPackageInfo {
  maintainers?: Array<{ name: string }>
  deprecated?: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, { deprecated?: string }>
  time?: Record<string, string>
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

function scoreProjectAge(ageDays: number): number {
  if (ageDays <= 0) return 0
  if (ageDays < 30) return (ageDays / 30) * 0.5
  const maxDays = 365 * 3
  if (ageDays >= maxDays) return 1.0
  const t = Math.log(ageDays / 30) / Math.log(maxDays / 30)
  return 0.5 + t * 0.5
}

function scoreAccountAge(ageYears: number): number {
  if (ageYears >= 5) return 5.0
  if (ageYears >= 2) return 4.0
  if (ageYears >= 1) return 3.0
  if (ageYears >= 0.5) return 2.0
  return 1.0
}

function scoreCommunityStanding(publicRepos: number): number {
  if (publicRepos > 100) return 5.0
  if (publicRepos >= 50) return 4.0
  if (publicRepos >= 10) return 3.0
  if (publicRepos >= 3) return 2.0
  return 1.0
}

function scoreCrossPlatformPresence(platforms: number): number {
  if (platforms >= 3) return 5.0
  if (platforms >= 2) return 3.0
  return 1.0
}

function scoreTrackRecord(serviceCount: number, avgComposite: number): number {
  if (serviceCount >= 10 && avgComposite > 4.0) return 5.0
  if (serviceCount >= 5 && avgComposite > 3.5) return 4.0
  if (serviceCount >= 3) return 3.0
  if (serviceCount >= 1) return 2.0
  return 1.0
}

function scoreExternalCredibility(followers: number, totalStars: number): number {
  let followerScore: number
  if (followers >= 10000) followerScore = 5.0
  else if (followers >= 1000) followerScore = 4.0
  else if (followers >= 100) followerScore = 3.0
  else if (followers >= 10) followerScore = 2.0
  else followerScore = 1.0

  let starsScore: number
  if (totalStars >= 50000) starsScore = 5.0
  else if (totalStars >= 10000) starsScore = 4.0
  else if (totalStars >= 1000) starsScore = 3.0
  else if (totalStars >= 100) starsScore = 2.0
  else starsScore = 1.0

  return followerScore * 0.5 + starsScore * 0.5
}

export const publisherTrustCollector: Collector = {
  name: 'publisher_trust',

  async collect(service: DbService): Promise<CollectorResult> {
    const supabase = createServerClient()
    const sources: string[] = []
    const metadata: Record<string, unknown> = {}

    const noDataResult: CollectorResult = {
      signal_name: 'publisher_trust',
      score: 0,
      sub_signals: [
        { name: 'track_record', score: 0, weight: 0.30, has_data: false },
        { name: 'org_maturity', score: 0, weight: 0.30, has_data: false },
        { name: 'community_standing', score: 0, weight: 0.20, has_data: false },
        { name: 'cross_platform_presence', score: 0, weight: 0.20, has_data: false },
      ],
      metadata: {},
      sources: [],
    }

    // Get publisher info
    const { data: publisher } = await supabase
      .from('publishers')
      .select('*')
      .eq('id', service.publisher_id)
      .single()

    if (!publisher) {
      return { ...noDataResult, metadata: { reason: 'publisher_not_found' } }
    }

    const ghOrg = publisher.github_org
    if (!ghOrg) {
      return { ...noDataResult, metadata: { reason: 'no_publisher_github' } }
    }

    const orgData = await githubGet(`/users/${ghOrg}`) as {
      created_at?: string
      type?: string
      public_repos?: number
      followers?: number
    } | null

    if (!orgData) {
      return { ...noDataResult, metadata: { reason: 'github_api_failed', github_org: ghOrg } }
    }

    // Track candidate dates for first_published_at
    const ageDates: string[] = []

    // ── Sub-signal 1: track_record (0.30) ──
    let trackRecordScore = 1.0
    let trackRecordDetail = 'First service for publisher'

    // Internal score: sibling services in Fabric's index
    const { data: siblingServices } = await supabase
      .from('services')
      .select('composite_score, status')
      .eq('publisher_id', service.publisher_id)
      .neq('id', service.id)
      .gt('composite_score', 0)

    const siblingCount = siblingServices?.length ?? 0
    let internalScore = 1.0
    if (siblingServices && siblingCount > 0) {
      const avgComposite = siblingServices.reduce((sum, s) => sum + s.composite_score, 0) / siblingCount
      metadata.sibling_count = siblingCount
      metadata.sibling_avg_composite = Math.round(avgComposite * 100) / 100
      internalScore = scoreTrackRecord(siblingCount, avgComposite)
    } else {
      metadata.sibling_count = 0
    }

    // External score: GitHub followers + total org stars
    const followers = orgData.followers ?? 0
    metadata.github_followers = followers

    const orgRepos = await githubGet(
      `/users/${ghOrg}/repos?per_page=100&sort=stars&direction=desc`
    ) as Array<{ stargazers_count?: number }> | null

    const totalOrgStars = orgRepos
      ? orgRepos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0)
      : 0
    metadata.total_org_stars = totalOrgStars

    const externalScore = scoreExternalCredibility(followers, totalOrgStars)
    metadata.track_record_internal = internalScore
    metadata.track_record_external = externalScore

    // Use the higher of internal vs external
    trackRecordScore = Math.max(internalScore, externalScore)

    // Verified publisher floor
    if (publisher.verified_publisher) {
      trackRecordScore = Math.max(trackRecordScore, 4.0)
      metadata.verified_publisher = true
    }

    trackRecordDetail = `Internal: ${internalScore.toFixed(1)} (${siblingCount} services), External: ${externalScore.toFixed(1)} (${followers} followers, ${totalOrgStars} stars)${publisher.verified_publisher ? ', verified' : ''}`

    // ── Sub-signal 2: org_maturity (0.30) ──
    let orgMaturityScore = 0
    let orgMaturityHasData = false
    let orgMaturityDetail = 'No account creation date'

    if (orgData.created_at) {
      const ageYears = (Date.now() - new Date(orgData.created_at).getTime()) / (365.25 * 86400000)
      metadata.account_age_years = Math.round(ageYears * 10) / 10
      metadata.is_organization = orgData.type === 'Organization'
      orgMaturityScore = scoreAccountAge(ageYears)
      orgMaturityHasData = true

      // Bonus for being an org (add 0.5, capped at 5.0)
      if (orgData.type === 'Organization') {
        orgMaturityScore = Math.min(5.0, orgMaturityScore + 0.5)
        orgMaturityDetail = `Organization, ${ageYears.toFixed(1)} years old`
      } else {
        orgMaturityDetail = `User account, ${ageYears.toFixed(1)} years old`
      }

      sources.push(`github:${ghOrg}`)
    }

    // ── Sub-signal 3: community_standing (0.20) ──
    const publicRepos = orgData.public_repos ?? 0
    metadata.public_repos = publicRepos

    // ── Sub-signal 4: cross_platform_presence (0.20) ──
    const identityChecks: string[] = []
    if (publisher.github_org) identityChecks.push('github')
    if (publisher.npm_org || service.npm_package) identityChecks.push('npm')
    if (publisher.pypi_org || service.pypi_package) identityChecks.push('pypi')

    metadata.identity_registries = identityChecks

    // Cross-check npm identity matches GitHub org + detect deprecated/maintainers
    let npmInfo: NpmPackageInfo | null = null
    if (service.npm_package) {
      npmInfo = await getNpmPackageInfo(service.npm_package)

      if (npmInfo && publisher.github_org) {
        const ghOrgLower = publisher.github_org.toLowerCase()
        const npmOrgLower = publisher.npm_org?.toLowerCase()
        const npmScope = service.npm_package.startsWith('@')
          ? service.npm_package.split('/')[0].slice(1).toLowerCase()
          : null

        const maintainerMatch = npmInfo.maintainers?.some(m => {
          const name = m.name.toLowerCase()
          return name === ghOrgLower || (npmOrgLower && name === npmOrgLower)
        })
        const scopeMatch = npmScope && (npmScope === ghOrgLower || npmScope === npmOrgLower)

        if (maintainerMatch || scopeMatch) {
          sources.push(`npm:${service.npm_package}`)
        }
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
    }

    // ── Project age computation (metadata, not a sub-signal) ──
    if (service.github_repo) {
      const repoData = await githubGet(`/repos/${service.github_repo}`) as {
        created_at?: string
      } | null
      if (repoData?.created_at) {
        ageDates.push(repoData.created_at)
        metadata.repo_created_at = repoData.created_at
      }
    }

    if (service.pypi_package) {
      const pypiDate = await getPypiFirstRelease(service.pypi_package)
      if (pypiDate) {
        ageDates.push(pypiDate)
        metadata.pypi_first_release = pypiDate
        sources.push(`pypi:${service.pypi_package}`)
      }
    }

    let firstPublishedAt: string | null = null
    if (ageDates.length > 0) {
      ageDates.sort()
      firstPublishedAt = ageDates[0]
      const ageDays = (Date.now() - new Date(firstPublishedAt).getTime()) / 86400000
      metadata.project_age_days = Math.round(ageDays)
      metadata.first_published_at = firstPublishedAt
      metadata.project_age_score = scoreProjectAge(ageDays)
      if (ageDays < 30) {
        metadata.project_age_warning = 'new_package'
      }
    }

    // Update publisher identity_consistency_score
    const identityScore = identityChecks.length >= 3 ? 5.0 : identityChecks.length >= 2 ? 3.0 : 1.0
    await supabase
      .from('publishers')
      .update({
        identity_consistency_score: identityScore,
        maintained_package_count: publicRepos ?? publisher.maintained_package_count,
      })
      .eq('id', publisher.id)

    // Store first_published_at on the service record
    if (firstPublishedAt) {
      await supabase
        .from('services')
        .update({ first_published_at: firstPublishedAt })
        .eq('id', service.id)
    }

    // ── Compute final score ──
    const sub_signals: SubSignalScore[] = [
      {
        name: 'track_record',
        score: trackRecordScore,
        weight: 0.30,
        has_data: true,
        detail: trackRecordDetail,
      },
      {
        name: 'org_maturity',
        score: orgMaturityScore,
        weight: 0.30,
        has_data: orgMaturityHasData,
        detail: orgMaturityDetail,
      },
      {
        name: 'community_standing',
        score: scoreCommunityStanding(publicRepos),
        weight: 0.20,
        has_data: true,
        detail: `${publicRepos} public repositories`,
      },
      {
        name: 'cross_platform_presence',
        score: scoreCrossPlatformPresence(identityChecks.length),
        weight: 0.20,
        has_data: identityChecks.length > 0,
        detail: `Present on ${identityChecks.length} platform(s): ${identityChecks.join(', ')}`,
      },
    ]

    const score = computeSubSignalScore(sub_signals)

    return {
      signal_name: 'publisher_trust',
      score: clampScore(score),
      sub_signals,
      metadata,
      sources,
    }
  },
}
