import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import type { ClawHubSkillData } from './api'

export function collectFreshness(
  data: ClawHubSkillData | null,
): CollectorResult {
  if (!data) {
    return {
      signal_name: 'freshness',
      score: 2.5,
      metadata: { reason: 'api_unavailable' },
      sources: [],
    }
  }

  const { stats, updatedAt } = data.skill
  const { version, changelog } = data.latestVersion
  let rawScore = 0
  const details: Record<string, unknown> = {
    versions: stats.versions,
    latestVersion: version,
    updatedAt: new Date(updatedAt).toISOString(),
  }

  // Last updated recency
  const ageMs = Date.now() - updatedAt
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  details.daysSinceUpdate = Math.round(ageDays)

  if (ageDays <= 7) rawScore += 2.0
  else if (ageDays <= 30) rawScore += 1.5
  else if (ageDays <= 90) rawScore += 1.0
  else if (ageDays <= 365) rawScore += 0.5
  else rawScore += 0.2

  // Version count
  if (stats.versions >= 10) rawScore += 1.5
  else if (stats.versions >= 5) rawScore += 1.0
  else if (stats.versions >= 2) rawScore += 0.5
  else rawScore += 0.2

  // Has changelog
  if (changelog && changelog.length > 10) {
    rawScore += 0.5
    details.hasChangelog = true
  }

  // Scale raw (max 4.0) to 0-5
  const scaled = (rawScore / 4.0) * 5

  return {
    signal_name: 'freshness',
    score: clampScore(scaled),
    metadata: details,
    sources: ['clawhub:api'],
  }
}
