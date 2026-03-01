import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult, SubSignalScore } from './types'
import { clampScore, computeSubSignalScore } from './types'
import { githubGet } from './github'

/**
 * Adoption Collector (weight: 0.15)
 *
 * Sub-signal architecture with 4 sub-signals:
 *   1. download_volume    (0.30) — npm + PyPI weekly downloads, log-scale tiers
 *   2. github_stars       (0.25) — stargazers count from GitHub API
 *   3. dependent_packages (0.30) — phase 1: not available, weight redistributed
 *   4. growth_trend       (0.15) — week-over-week download velocity
 *
 * Data sources: npm registry API, PyPI stats API, GitHub API
 */

interface NpmDownloads {
  downloads: number
  package: string
}

interface PyPIStats {
  data: { last_week: number }
}

async function getNpmWeeklyDownloads(pkg: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`)
    if (!res.ok) return null
    const data: NpmDownloads = await res.json()
    return data.downloads
  } catch {
    return null
  }
}

async function getNpmPriorWeekDownloads(pkg: string): Promise<number | null> {
  try {
    const end = new Date(Date.now() - 7 * 86400000)
    const start = new Date(Date.now() - 14 * 86400000)
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]
    const res = await fetch(`https://api.npmjs.org/downloads/point/${startStr}:${endStr}/${pkg}`)
    if (!res.ok) return null
    const data: NpmDownloads = await res.json()
    return data.downloads
  } catch {
    return null
  }
}

async function getPyPIWeeklyDownloads(pkg: string): Promise<number | null> {
  try {
    const res = await fetch(`https://pypistats.org/api/packages/${pkg}/recent`)
    if (!res.ok) return null
    const data: PyPIStats = await res.json()
    return data.data.last_week
  } catch {
    return null
  }
}

function scoreDownloadVolume(weeklyDownloads: number): number {
  if (weeklyDownloads >= 10_000_000) return 5.0
  if (weeklyDownloads >= 1_000_000) return 4.5
  if (weeklyDownloads >= 100_000) return 4.0
  if (weeklyDownloads >= 10_000) return 3.5
  if (weeklyDownloads >= 1_000) return 3.0
  if (weeklyDownloads >= 100) return 2.0
  return 1.0
}

function scoreGitHubStars(stars: number): number {
  if (stars > 10_000) return 5.0
  if (stars >= 5_000) return 4.0
  if (stars >= 1_000) return 3.0
  if (stars >= 100) return 2.0
  if (stars >= 10) return 1.0
  return 0.0
}

function scoreGrowthTrend(growthRate: number): number {
  if (growthRate > 0.20) return 5.0
  if (growthRate > 0.05) return 4.0
  if (growthRate >= -0.05) return 3.0
  if (growthRate >= -0.20) return 2.0
  return 1.0
}

export const adoptionCollector: Collector = {
  name: 'adoption',

  async collect(service: DbService): Promise<CollectorResult> {
    const sources: string[] = []
    let weeklyDownloads = 0
    let priorWeekDownloads = 0
    let hasDownloadData = false

    if (service.npm_package) {
      const [current, prior] = await Promise.all([
        getNpmWeeklyDownloads(service.npm_package),
        getNpmPriorWeekDownloads(service.npm_package),
      ])
      if (current !== null) {
        weeklyDownloads += current
        hasDownloadData = true
        sources.push(`npm:${service.npm_package}`)
      }
      if (prior !== null) {
        priorWeekDownloads += prior
      }
    }

    if (service.pypi_package) {
      const pypi = await getPyPIWeeklyDownloads(service.pypi_package)
      if (pypi !== null) {
        weeklyDownloads += pypi
        hasDownloadData = true
        sources.push(`pypi:${service.pypi_package}`)
      }
    }

    // Fetch GitHub stars
    let githubStars: number | null = null
    let hasGitHubData = false

    if (service.github_repo) {
      const repoData = (await githubGet(`/repos/${service.github_repo}`)) as { stargazers_count?: number } | null
      if (repoData && typeof repoData.stargazers_count === 'number') {
        githubStars = repoData.stargazers_count
        hasGitHubData = true
        sources.push(`github:${service.github_repo}`)
      }
    }

    if (!hasDownloadData && !hasGitHubData) {
      return {
        signal_name: 'adoption',
        score: 0,
        sub_signals: [
          { name: 'download_volume', score: 0, weight: 0.30, has_data: false },
          { name: 'github_stars', score: 0, weight: 0.25, has_data: false },
          { name: 'dependent_packages', score: 0, weight: 0.30, has_data: false },
          { name: 'growth_trend', score: 0, weight: 0.15, has_data: false },
        ],
        metadata: { reason: 'no_download_data' },
        sources: [],
      }
    }

    // 1. Download volume (weight: 0.30)
    const downloadVolumeScore = hasDownloadData ? scoreDownloadVolume(weeklyDownloads) : 0
    const downloadVolume: SubSignalScore = {
      name: 'download_volume',
      score: downloadVolumeScore,
      weight: 0.30,
      has_data: weeklyDownloads > 0,
      detail: hasDownloadData
        ? `${weeklyDownloads.toLocaleString()} weekly downloads`
        : 'No download data available',
    }

    // 2. GitHub stars (weight: 0.25)
    const gitHubStarsSubSignal: SubSignalScore = {
      name: 'github_stars',
      score: hasGitHubData ? scoreGitHubStars(githubStars!) : 0,
      weight: 0.25,
      has_data: hasGitHubData,
      detail: hasGitHubData
        ? `${githubStars!.toLocaleString()} stars`
        : 'No GitHub repo configured',
    }

    // 3. Dependent packages (weight: 0.30) — Phase 1: not available
    const dependentPackages: SubSignalScore = {
      name: 'dependent_packages',
      score: 0,
      weight: 0.30,
      has_data: false,
      detail: 'Not available in phase 1 — weight redistributed',
    }

    // 4. Growth trend (weight: 0.15)
    const hasGrowthData = priorWeekDownloads > 0 && weeklyDownloads > 0
    let growthRate: number | null = null
    let growthTrendScore = 0

    if (hasGrowthData) {
      growthRate = (weeklyDownloads - priorWeekDownloads) / priorWeekDownloads
      growthTrendScore = scoreGrowthTrend(growthRate)
    }

    const growthTrend: SubSignalScore = {
      name: 'growth_trend',
      score: growthTrendScore,
      weight: 0.15,
      has_data: hasGrowthData,
      detail: hasGrowthData
        ? `${growthRate! >= 0 ? '+' : ''}${(growthRate! * 100).toFixed(1)}% week-over-week`
        : 'Insufficient data for growth calculation',
    }

    const sub_signals: SubSignalScore[] = [
      downloadVolume,
      gitHubStarsSubSignal,
      dependentPackages,
      growthTrend,
    ]

    const finalScore = computeSubSignalScore(sub_signals)

    // Backward-compatible velocity adjustment (metadata only)
    let velocityAdj = 0
    if (hasGrowthData && growthRate !== null) {
      if (growthRate > 0.20) velocityAdj = 0.5
      else if (growthRate > 0.05) velocityAdj = 0.25
      else if (growthRate < -0.20) velocityAdj = -0.5
      else if (growthRate < -0.05) velocityAdj = -0.25
    }

    return {
      signal_name: 'adoption',
      score: clampScore(finalScore),
      sub_signals,
      metadata: {
        weekly_downloads: weeklyDownloads,
        prior_week_downloads: priorWeekDownloads,
        growth_rate: hasGrowthData && growthRate !== null
          ? Math.min(999, Math.max(-999, Math.round(growthRate * 10000) / 100))
          : null,
        tier_score: downloadVolumeScore,
        velocity_adjustment: velocityAdj,
        github_stars: githubStars,
        dependent_packages_status: 'not_available_phase1',
      },
      sources,
    }
  },
}
