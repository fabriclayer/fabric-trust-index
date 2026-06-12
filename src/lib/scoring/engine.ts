/**
 * Scoring Engine v2
 *
 * Single pure function, no I/O. Takes 6 signal inputs and produces a scored result
 * with coverage, status gates, and named reasons.
 *
 * Public methodology unchanged: six signals, weights [0.25, 0.15, 0.15, 0.15, 0.15, 0.15],
 * trusted threshold 3.00.
 */

import { WEIGHTS, SIGNAL_ORDER, THRESHOLDS } from './thresholds'
import type { SignalName } from './thresholds'

// ─── Input Contract ───

export type SignalInput =
  | { evaluated: true; score: number; signal: SignalName }
  | { evaluated: false; signal: SignalName }

export interface BlockFlag {
  type: 'cve_unpatched_critical' | 'cve_patch_available'
}

export interface ScoreResult {
  score: number | null
  coverage: number
  status: 'trusted' | 'caution' | 'blocked' | 'unverified'
  reasons: string[]
}

// ─── Engine ───

/**
 * Compute a trust score from 6 signal inputs.
 *
 * @param inputs - Exactly 6 SignalInput values in SIGNAL_ORDER
 * @param flags - Optional hard-fail flags (CVE status, etc.)
 * @returns ScoreResult with score, coverage, status, and reasons
 */
export function score(
  inputs: readonly SignalInput[],
  flags: readonly BlockFlag[] = [],
): ScoreResult {
  if (inputs.length !== WEIGHTS.length) {
    throw new Error(`score() expects ${WEIGHTS.length} inputs, got ${inputs.length}`)
  }

  const reasons: string[] = []

  // ── Gate 1: Blocked (hard fails) ──
  const hasUnpatchedCritical = flags.some(f => f.type === 'cve_unpatched_critical')
  const hasPatchAvailable = flags.some(f => f.type === 'cve_patch_available')

  if (hasUnpatchedCritical) {
    reasons.push('cve_unpatched_critical')
  }
  if (hasPatchAvailable) {
    reasons.push('cve_patch_available')
  }

  // ── Compute coverage and composite ──
  let weightedSum = 0
  let evaluatedWeightSum = 0

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    if (input.evaluated) {
      let signalScore = input.score
      // Cap vulnerability signal at 1.5 if patch available (pre-composite)
      if (i === 0 && hasPatchAvailable && !hasUnpatchedCritical) {
        signalScore = Math.min(signalScore, 1.5)
      }
      // Force vulnerability to 0 if unpatched critical
      if (i === 0 && hasUnpatchedCritical) {
        signalScore = 0
      }
      evaluatedWeightSum += WEIGHTS[i]
      weightedSum += signalScore * WEIGHTS[i]
    }
  }

  const coverage = evaluatedWeightSum // sum of weights of evaluated signals (0..1)

  // ── Gate 1 (continued): Blocked regardless of composite ──
  if (hasUnpatchedCritical) {
    // Compute composite for informational purposes but cap it
    const composite = evaluatedWeightSum > 0
      ? Math.round((weightedSum / evaluatedWeightSum) * 100) / 100
      : null
    return {
      score: composite !== null ? Math.min(composite, 0.99) : null,
      coverage,
      status: 'blocked',
      reasons,
    }
  }

  // ── Gate 2: Unverified (insufficient coverage) ──
  if (coverage < 0.40) {
    reasons.push('insufficient_coverage')
    return {
      score: null,
      coverage,
      status: 'unverified',
      reasons,
    }
  }

  // Composite = weighted mean over evaluated signals, weights renormalized
  const composite = Math.round((weightedSum / evaluatedWeightSum) * 100) / 100

  // ── Gate 3: Trusted ──
  if (composite >= THRESHOLDS.trusted && coverage >= 0.60) {
    // Patch-available caps at caution even if composite qualifies for trusted
    if (hasPatchAvailable) {
      reasons.push('cve_patch_available_blocks_trusted')
      return {
        score: Math.min(composite, 2.99),
        coverage,
        status: 'caution',
        reasons,
      }
    }
    return {
      score: composite,
      coverage,
      status: 'trusted',
      reasons,
    }
  }

  // ── Gate 4: Caution (everything else) ──
  if (composite >= THRESHOLDS.trusted && coverage < 0.60) {
    reasons.push('trusted_blocked_low_coverage')
  }

  let finalScore = composite
  if (hasPatchAvailable) {
    finalScore = Math.min(finalScore, 2.99)
  }

  return {
    score: finalScore,
    coverage,
    status: 'caution',
    reasons,
  }
}

// ─── Helpers for integration ───

/** Map coverage (0..1) to confidence levels matching existing DB schema */
export function coverageToConfidence(coverage: number): 'high' | 'medium' | 'low' | 'unverified' {
  if (coverage >= 0.75) return 'high'
  if (coverage >= 0.45) return 'medium'
  if (coverage >= 0.15) return 'low'
  return 'unverified'
}

/** Count of evaluated signals */
export function countEvaluated(inputs: readonly SignalInput[]): number {
  return inputs.filter(i => i.evaluated).length
}

/** Build SignalInput array from scores and has_data booleans (migration helper) */
export function buildInputs(
  scores: number[],
  hasData: boolean[],
): SignalInput[] {
  return SIGNAL_ORDER.map((signal, i) => {
    if (hasData[i]) {
      return { evaluated: true, score: scores[i], signal }
    }
    return { evaluated: false, signal }
  })
}

/** Extract block flags from collector metadata (migration helper) */
export function extractBlockFlags(metadata: {
  has_critical_or_high_unpatched?: boolean
  has_critical_or_high_patch_available?: boolean
}): BlockFlag[] {
  const flags: BlockFlag[] = []
  if (metadata.has_critical_or_high_unpatched) {
    flags.push({ type: 'cve_unpatched_critical' })
  }
  if (metadata.has_critical_or_high_patch_available) {
    flags.push({ type: 'cve_patch_available' })
  }
  return flags
}
