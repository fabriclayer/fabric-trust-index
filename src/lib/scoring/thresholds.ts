/**
 * Single source of truth for scoring thresholds, weights, and status computation.
 * All other files should import from here — no duplicating these constants.
 */

export const THRESHOLDS = {
  trusted: 3.25,
  caution: 1.00,
} as const

// Weights sum to 1.0 — order matches SIGNAL_ORDER
// vulnerability 0.25, operational 0.15, maintenance 0.15, adoption 0.15, transparency 0.15, publisher_trust 0.15
export const WEIGHTS = [0.25, 0.15, 0.15, 0.15, 0.15, 0.15] as const

export const SIGNAL_ORDER = [
  'vulnerability',
  'operational',
  'maintenance',
  'adoption',
  'transparency',
  'publisher_trust',
] as const

export type SignalName = (typeof SIGNAL_ORDER)[number]

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified'

export function getStatus(score: number): 'trusted' | 'caution' | 'blocked' {
  if (score >= THRESHOLDS.trusted) return 'trusted'
  if (score >= THRESHOLDS.caution) return 'caution'
  return 'blocked'
}

/** Legacy composite computation — fixed weights, no redistribution */
export function computeComposite(signals: number[]): number {
  if (signals.length !== WEIGHTS.length) {
    throw new Error(`computeComposite expects ${WEIGHTS.length} signals, got ${signals.length}`)
  }
  const raw = signals.reduce((sum, s, i) => {
    const val = Number(s)
    return sum + (isNaN(val) ? 0 : val) * WEIGHTS[i]
  }, 0)
  return Math.round(raw * 100) / 100
}

/**
 * Compute composite score with weight redistribution for missing signals.
 * Signals without data have their weight proportionally redistributed
 * to signals that do have data.
 */
export function computeCompositeWithRedistribution(
  signals: Array<{ score: number; has_data: boolean }>
): { score: number; effective_weights: number[] } {
  if (signals.length !== WEIGHTS.length) {
    throw new Error(`computeCompositeWithRedistribution expects ${WEIGHTS.length} signals, got ${signals.length}`)
  }
  const withData = signals
    .map((s, i) => ({ ...s, origWeight: WEIGHTS[i], index: i }))
    .filter(s => s.has_data)

  const effective_weights = new Array<number>(WEIGHTS.length).fill(0)

  if (withData.length === 0) {
    return { score: 0, effective_weights }
  }

  const totalWeight = withData.reduce((sum, s) => sum + s.origWeight, 0)
  let raw = 0
  for (const s of withData) {
    const w = s.origWeight / totalWeight
    effective_weights[s.index] = w
    raw += s.score * w
  }

  return { score: Math.round(raw * 100) / 100, effective_weights }
}

export function getConfidenceLevel(signalsWithData: number): ConfidenceLevel {
  if (signalsWithData >= 5) return 'high'
  if (signalsWithData >= 3) return 'medium'
  if (signalsWithData >= 1) return 'low'
  return 'unverified'
}

/**
 * Trusted status gate: a service must have real vulnerability data
 * AND at least 4 signals with data to qualify as "trusted".
 */
export function applyTrustedGate(
  score: number,
  status: string,
  hasVulnData: boolean,
  signalsWithData: number,
): { score: number; status: string; gated: boolean } {
  if (status === 'trusted' && score >= THRESHOLDS.trusted) {
    if (!hasVulnData || signalsWithData < 4) {
      return { score: Math.min(score, 3.24), status: 'caution', gated: true }
    }
  }
  return { score, status, gated: false }
}

export function getScoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score >= THRESHOLDS.trusted) return 'green'
  if (score >= THRESHOLDS.caution) return 'orange'
  return 'red'
}
