import {
  SIGNAL_WEIGHTS,
  SIGNAL_ORDER,
  THRESHOLDS,
  MODIFIERS,
  type SignalName,
} from './weights'

export interface SignalDetail {
  score: number
  weight: number
  weighted: number
}

export interface Modifier {
  name: string
  multiplier: number
  reason: string
}

export type Status = 'trusted' | 'caution' | 'blocked'

export interface ScoreBreakdown {
  composite_score: number
  status: Status
  signals: Record<SignalName, SignalDetail>
  modifiers: Modifier[]
  raw_score: number
}

export function getStatus(score: number): Status {
  if (score >= 2.50) return 'trusted'
  if (score >= 1.00) return 'caution'
  return 'blocked'
}

export function computeScore(
  signalScores: number[],
  transactionCount: number,
  lastActivityAt: Date,
): ScoreBreakdown {
  if (signalScores.length !== SIGNAL_ORDER.length) {
    throw new Error(
      `Expected ${SIGNAL_ORDER.length} signal scores, received ${signalScores.length}`,
    )
  }

  // Build per-signal breakdown and compute raw weighted average
  const signals = {} as Record<SignalName, SignalDetail>
  let rawScore = 0

  for (let i = 0; i < SIGNAL_ORDER.length; i++) {
    const name = SIGNAL_ORDER[i]
    const score = signalScores[i]
    const weight = SIGNAL_WEIGHTS[name]
    const weighted = score * weight

    signals[name] = { score, weight, weighted }
    rawScore += weighted
  }

  // Round raw score to 2 decimal places
  rawScore = Math.round(rawScore * 100) / 100

  // Collect applicable modifiers
  const modifiers: Modifier[] = []

  if (transactionCount < MODIFIERS.new_provider.threshold) {
    modifiers.push({
      name: 'new_provider',
      multiplier: MODIFIERS.new_provider.multiplier,
      reason: `Transaction count (${transactionCount}) is below ${MODIFIERS.new_provider.threshold}`,
    })
  }

  const now = new Date()
  const daysSinceActivity = Math.floor(
    (now.getTime() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
  )

  if (daysSinceActivity > MODIFIERS.inactive.threshold_days) {
    modifiers.push({
      name: 'inactive',
      multiplier: MODIFIERS.inactive.multiplier,
      reason: `Last activity was ${daysSinceActivity} days ago (threshold: ${MODIFIERS.inactive.threshold_days} days)`,
    })
  }

  // Apply modifiers sequentially
  let compositeScore = rawScore
  for (const modifier of modifiers) {
    compositeScore *= modifier.multiplier
  }

  // Round composite score to 2 decimal places
  compositeScore = Math.round(compositeScore * 100) / 100

  return {
    composite_score: compositeScore,
    status: getStatus(compositeScore),
    signals,
    modifiers,
    raw_score: rawScore,
  }
}
