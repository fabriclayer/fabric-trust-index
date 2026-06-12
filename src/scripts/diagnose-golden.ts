/**
 * Golden Set Diagnostic
 *
 * For every slug in the golden set, prints:
 * - Composite score and status
 * - Per-signal score and per-sub-signal has_data
 * - Whether github_repo / npm_package / pypi_package are populated
 *
 * Usage: npx tsx src/scripts/diagnose-golden.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { GOLDEN_SET } from '../lib/validation/golden-set'
import { SIGNAL_ORDER } from '../lib/scoring/thresholds'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface SubSignal {
  name: string
  score: number
  weight: number
  has_data: boolean
  detail?: string
}

interface SignalEntry {
  score: number
  sub_signals?: SubSignal[]
}

async function main() {
  console.log('Golden Set Diagnostic')
  console.log('='.repeat(100))
  console.log()

  for (const golden of GOLDEN_SET) {
    const { data: service } = await supabase
      .from('services')
      .select('id, slug, name, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, signal_scores, github_repo, npm_package, pypi_package, active_modifiers, score_confidence, signals_with_data')
      .eq('slug', golden.slug)
      .single()

    if (!service) {
      console.log(`[MISSING] ${golden.slug} (${golden.name}) — not found in database`)
      console.log()
      continue
    }

    const passesExpectation =
      service.composite_score >= golden.min_composite &&
      service.composite_score <= golden.max_composite &&
      service.status === golden.expected_status

    const marker = passesExpectation ? 'PASS' : 'FAIL'

    console.log(`[${marker}] ${service.name} (${service.slug})`)
    console.log(`  Composite: ${service.composite_score.toFixed(2)}  Status: ${service.status}  Expected: ${golden.expected_status} [${golden.min_composite}..${golden.max_composite}]`)
    console.log(`  Confidence: ${service.score_confidence ?? 'null'}  Signals with data: ${service.signals_with_data ?? 'null'}`)
    console.log(`  Modifiers: ${(service.active_modifiers ?? []).join(', ') || 'none'}`)
    console.log(`  Registry: github=${service.github_repo ?? 'null'}  npm=${service.npm_package ?? 'null'}  pypi=${service.pypi_package ?? 'null'}`)

    // Per-signal breakdown
    const signalScores = service.signal_scores as Record<string, SignalEntry> | null

    for (const signal of SIGNAL_ORDER) {
      const dbScore = service[`signal_${signal}` as keyof typeof service] as number
      const entry = signalScores?.[signal]
      const subSignals = entry?.sub_signals ?? []

      const subSignalSummary = subSignals
        .map((s: SubSignal) => `${s.name}=${s.score.toFixed(1)}(${s.has_data ? 'data' : 'no_data'})`)
        .join(', ')

      const anyHasData = subSignals.some((s: SubSignal) => s.has_data)
      const signalDataStatus = signalScores ? (anyHasData ? 'evaluated' : 'no_data') : 'no_sub_signals'

      console.log(`  ${signal.padEnd(18)} score=${dbScore.toFixed(2)}  [${signalDataStatus}]  ${subSignalSummary || '(no sub-signals)'}`)
    }

    console.log()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
