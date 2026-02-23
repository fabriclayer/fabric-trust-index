/**
 * Single source of truth for scoring thresholds, weights, and status computation.
 * All other files should import from here — no duplicating these constants.
 */

export const THRESHOLDS = {
  trusted: 3.25,
  caution: 1.00,
} as const

// Order: vulnerability, operational, maintenance, adoption, transparency, publisher_trust
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
  const raw = signals.reduce((sum, s, i) => sum + s * WEIGHTS[i], 0)
  return Math.round(raw * 100) / 100
}
