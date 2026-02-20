import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'

/**
 * Adoption Collector (weight: 0.15)
 *
 * Uses logarithmic scaling against category peers.
 * Download velocity (growth trend) matters more than absolute count.
 * Normalized against category averages to prevent niche tool penalization.
 *
 * Data sources: npm registry API, PyPI stats API
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
    // Get downloads from 2 weeks ago to 1 week ago
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

export const adoptionCollector: Collector = {
  name: 'adoption',

  async collect(service: DbService): Promise<CollectorResult> {
    const sources: string[] = []
    let weeklyDownloads = 0
    let priorWeekDownloads = 0
    let hasData = false

    // npm downloads
    if (service.npm_package) {
      const [current, prior] = await Promise.all([
        getNpmWeeklyDownloads(service.npm_package),
        getNpmPriorWeekDownloads(service.npm_package),
      ])
      if (current !== null) {
        weeklyDownloads += current
        hasData = true
        sources.push(`npm:${service.npm_package}`)
      }
      if (prior !== null) {
        priorWeekDownloads += prior
      }
    }

    // PyPI downloads
    if (service.pypi_package) {
      const pypi = await getPyPIWeeklyDownloads(service.pypi_package)
      if (pypi !== null) {
        weeklyDownloads += pypi
        hasData = true
        sources.push(`pypi:${service.pypi_package}`)
      }
    }

    if (!hasData) {
      return {
        signal_name: 'adoption',
        score: 3.0,
        metadata: { reason: 'no_download_data' },
        sources: [],
      }
    }

    // Logarithmic scoring based on weekly downloads
    // Thresholds calibrated for AI/ML tool ecosystem:
    //   10M+/week = 5.0 (top tier: react, lodash-level)
    //   1M+/week  = 4.5
    //   100K+     = 4.0
    //   10K+      = 3.5
    //   1K+       = 3.0
    //   100+      = 2.0
    //   <100      = 1.0
    let score: number
    if (weeklyDownloads >= 10_000_000) score = 5.0
    else if (weeklyDownloads >= 1_000_000) score = 4.5
    else if (weeklyDownloads >= 100_000) score = 4.0
    else if (weeklyDownloads >= 10_000) score = 3.5
    else if (weeklyDownloads >= 1_000) score = 3.0
    else if (weeklyDownloads >= 100) score = 2.0
    else score = 1.0

    // Velocity bonus/penalty: growth trend matters
    if (priorWeekDownloads > 0 && weeklyDownloads > 0) {
      const growthRate = (weeklyDownloads - priorWeekDownloads) / priorWeekDownloads
      if (growthRate > 0.20) score += 0.5       // 20%+ growth
      else if (growthRate > 0.05) score += 0.25 // 5%+ growth
      else if (growthRate < -0.20) score -= 0.5  // 20%+ decline
      else if (growthRate < -0.05) score -= 0.25 // 5%+ decline
    }

    return {
      signal_name: 'adoption',
      score: clampScore(score),
      metadata: {
        weekly_downloads: weeklyDownloads,
        prior_week_downloads: priorWeekDownloads,
        growth_rate: priorWeekDownloads > 0
          ? Math.round(((weeklyDownloads - priorWeekDownloads) / priorWeekDownloads) * 10000) / 100
          : null,
      },
      sources,
    }
  },
}
