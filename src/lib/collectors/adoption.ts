import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Adoption Collector (weight: 0.15)
 *
 * Uses logarithmic scaling with category normalization.
 * Download velocity (growth trend) matters more than absolute count.
 * For categories with 10+ services, blends tier score (80%) with
 * within-category percentile (20%) to prevent niche tool penalization.
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

/**
 * Map a percentile rank to a score.
 * top 10% = 5.0, top 25% = 4.0, top 50% = 3.0, bottom 25% = 2.0, bottom 10% = 1.0
 */
function percentileToScore(percentile: number): number {
  if (percentile >= 90) return 5.0
  if (percentile >= 75) return 4.0
  if (percentile >= 50) return 3.0
  if (percentile >= 25) return 2.0
  return 1.0
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

    // Logarithmic tier scoring based on weekly downloads
    let tierScore: number
    if (weeklyDownloads >= 10_000_000) tierScore = 5.0
    else if (weeklyDownloads >= 1_000_000) tierScore = 4.5
    else if (weeklyDownloads >= 100_000) tierScore = 4.0
    else if (weeklyDownloads >= 10_000) tierScore = 3.5
    else if (weeklyDownloads >= 1_000) tierScore = 3.0
    else if (weeklyDownloads >= 100) tierScore = 2.0
    else tierScore = 1.0

    // Velocity bonus/penalty
    let velocityAdj = 0
    if (priorWeekDownloads > 0 && weeklyDownloads > 0) {
      const growthRate = (weeklyDownloads - priorWeekDownloads) / priorWeekDownloads
      if (growthRate > 0.20) velocityAdj = 0.5
      else if (growthRate > 0.05) velocityAdj = 0.25
      else if (growthRate < -0.20) velocityAdj = -0.5
      else if (growthRate < -0.05) velocityAdj = -0.25
    }

    tierScore += velocityAdj

    // Category normalization: blend tier score with within-category percentile
    let finalScore = tierScore
    let percentile: number | null = null
    let categoryCount = 0

    if (service.category) {
      try {
        const supabase = createServerClient()
        const { data: peers } = await supabase
          .from('services')
          .select('signal_adoption')
          .eq('category', service.category)
          .not('signal_adoption', 'is', null)

        if (peers && peers.length >= 10) {
          categoryCount = peers.length
          const peerScores = peers.map(p => p.signal_adoption as number).sort((a, b) => a - b)
          // Calculate percentile rank of this service's tier score
          const belowCount = peerScores.filter(s => s < tierScore).length
          percentile = (belowCount / peerScores.length) * 100
          const percentileScore = percentileToScore(percentile)

          // Blend: 80% tier, 20% percentile
          finalScore = (tierScore * 0.8) + (percentileScore * 0.2)
        }
      } catch (err) {
        console.error(`Category normalization failed for ${service.name}:`, err)
      }
    }

    return {
      signal_name: 'adoption',
      score: clampScore(finalScore),
      metadata: {
        weekly_downloads: weeklyDownloads,
        prior_week_downloads: priorWeekDownloads,
        growth_rate: priorWeekDownloads > 0
          ? Math.min(999, Math.max(-999, Math.round(((weeklyDownloads - priorWeekDownloads) / priorWeekDownloads) * 10000) / 100))
          : null,
        tier_score: tierScore,
        velocity_adjustment: velocityAdj,
        category_percentile: percentile,
        category_peer_count: categoryCount,
      },
      sources,
    }
  },
}
