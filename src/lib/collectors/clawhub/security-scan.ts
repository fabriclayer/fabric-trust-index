import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import type { ClawHubSkillData } from './api'

export function collectSecurityScan(
  data: ClawHubSkillData | null,
  contentSafetyScore: number,
): CollectorResult {
  let score = 2.5 // neutral default
  const details: Record<string, unknown> = {}

  // If skill has been moderated/hidden, that's a strong negative signal
  if (data?.moderation != null) {
    score = 0.5
    details.moderated = true
  }

  // Leverage content-safety score — if it found issues, this reflects here too
  if (contentSafetyScore <= 1.0) {
    score = Math.min(score, 1.0)
    details.contentSafetyFlag = true
  } else if (contentSafetyScore >= 4.0) {
    // Clean content scan — boost
    score = Math.max(score, 3.5)
    details.cleanScan = true
  }

  // If skill has many installs with no reports, slight trust boost
  if (data && data.skill.stats.installsAllTime >= 50 && data.moderation == null) {
    score = Math.min(score + 0.5, 5.0)
    details.communityTrusted = true
  }

  return {
    signal_name: 'security_scan',
    score: clampScore(score),
    metadata: details,
    sources: data ? ['clawhub:api'] : [],
  }
}
