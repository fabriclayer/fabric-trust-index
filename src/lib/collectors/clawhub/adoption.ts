import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import type { ClawHubSkillData } from './api'

export function collectAdoption(
  data: ClawHubSkillData | null,
): CollectorResult {
  if (!data) {
    return {
      signal_name: 'adoption',
      score: 2.5,
      metadata: { reason: 'api_unavailable' },
      sources: [],
    }
  }

  const { stats } = data.skill
  let rawScore = 0
  const details: Record<string, unknown> = {
    installsAllTime: stats.installsAllTime,
    stars: stats.stars,
    downloads: stats.downloads,
    comments: stats.comments,
  }

  // Installs
  if (stats.installsAllTime >= 10000) rawScore += 2.0
  else if (stats.installsAllTime >= 1000) rawScore += 1.5
  else if (stats.installsAllTime >= 100) rawScore += 1.0
  else if (stats.installsAllTime >= 10) rawScore += 0.5
  else rawScore += 0.2

  // Stars
  if (stats.stars >= 100) rawScore += 1.5
  else if (stats.stars >= 50) rawScore += 1.0
  else if (stats.stars >= 10) rawScore += 0.75
  else if (stats.stars >= 5) rawScore += 0.5
  else rawScore += 0.2

  // Scale raw (max 3.5) to 0-5
  const scaled = (rawScore / 3.5) * 5

  return {
    signal_name: 'adoption',
    score: clampScore(scaled),
    metadata: details,
    sources: ['clawhub:api'],
  }
}
