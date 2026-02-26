/**
 * Single source of truth for scoring thresholds, weights, and status computation.
 * All other files should import from here — no duplicating these constants.
 */

export const THRESHOLDS = {
  trusted: 3.25,
  caution: 1.00,
} as const

// Weights sum to 1.0 — order matches SIGNAL_ORDER above
// vulnerability 0.25, operational 0.15, maintenance 0.20, adoption 0.15, transparency 0.15, publisher_trust 0.10
export const WEIGHTS = [0.25, 0.15, 0.20, 0.15, 0.15, 0.10] as const

export const SIGNAL_ORDER = [
  'vulnerability',
  'operational',
  'maintenance',
  'adoption',
  'transparency',
  'publisher_trust',
] as const

export type SignalName = (typeof SIGNAL_ORDER)[number]

export function getStatus(score: number): 'trusted' | 'caution' | 'blocked' {
  if (score >= THRESHOLDS.trusted) return 'trusted'
  if (score >= THRESHOLDS.caution) return 'caution'
  return 'blocked'
}

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

export function getScoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score >= THRESHOLDS.trusted) return 'green'
  if (score >= THRESHOLDS.caution) return 'orange'
  return 'red'
}
