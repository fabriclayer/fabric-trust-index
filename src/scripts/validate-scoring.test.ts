/**
 * Engine Test Suite
 *
 * Pure tests of the scoring engine, no database required.
 * Run: npx tsx src/scripts/validate-scoring.test.ts
 */

import { score, buildInputs, type SignalInput, type BlockFlag } from '../lib/scoring/engine'
import { SIGNAL_ORDER, WEIGHTS } from '../lib/scoring/thresholds'

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(name: string) {
  console.log(`\n${name}`)
}

// ─── Test 1: Hosted service with only operational + publisher (coverage 0.30) → unverified ───

section('Test 1: Low coverage (operational + publisher only) → unverified')
{
  const inputs: SignalInput[] = [
    { evaluated: false, signal: 'vulnerability' },
    { evaluated: true, score: 4.0, signal: 'operational' },
    { evaluated: false, signal: 'maintenance' },
    { evaluated: false, signal: 'adoption' },
    { evaluated: false, signal: 'transparency' },
    { evaluated: true, score: 3.5, signal: 'publisher_trust' },
  ]
  const result = score(inputs)
  assert(result.status === 'unverified', 'status is unverified')
  assert(result.score === null, 'score is null')
  // operational weight 0.15 + publisher_trust weight 0.15 = 0.30
  assert(result.coverage === 0.30, `coverage is 0.30 (got ${result.coverage})`)
  assert(result.reasons.includes('insufficient_coverage'), 'reason: insufficient_coverage')
}

// ─── Test 2: Hosted service with operational + publisher + vulnerability (coverage 0.55, composite 4.2) → caution ───

section('Test 2: Medium coverage (0.55) high composite → caution with trusted_blocked_low_coverage')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 4.5, signal: 'vulnerability' },
    { evaluated: true, score: 4.0, signal: 'operational' },
    { evaluated: false, signal: 'maintenance' },
    { evaluated: false, signal: 'adoption' },
    { evaluated: false, signal: 'transparency' },
    { evaluated: true, score: 4.0, signal: 'publisher_trust' },
  ]
  const result = score(inputs)
  // coverage = 0.25 + 0.15 + 0.15 = 0.55
  assert(result.coverage === 0.55, `coverage is 0.55 (got ${result.coverage})`)
  assert(result.status === 'caution', `status is caution (got ${result.status})`)
  assert(result.reasons.includes('trusted_blocked_low_coverage'), 'reason: trusted_blocked_low_coverage')
  assert(result.score !== null, 'score is not null')
}

// ─── Test 3: Open source package with evaluated transparency 0 → zero drags composite ───

section('Test 3: Transparency 0 drags composite down')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 4.0, signal: 'vulnerability' },
    { evaluated: true, score: 3.5, signal: 'operational' },
    { evaluated: true, score: 4.0, signal: 'maintenance' },
    { evaluated: true, score: 3.5, signal: 'adoption' },
    { evaluated: true, score: 0, signal: 'transparency' },  // genuinely scored 0
    { evaluated: true, score: 4.0, signal: 'publisher_trust' },
  ]
  const result = score(inputs)
  assert(result.coverage === 1.0, `full coverage (got ${result.coverage})`)
  // Composite = (4.0*0.25 + 3.5*0.15 + 4.0*0.15 + 3.5*0.15 + 0*0.15 + 4.0*0.15) = 1.0 + 0.525 + 0.6 + 0.525 + 0 + 0.6 = 3.25
  assert(result.score !== null && result.score < 4.0, `score dragged down by zero (got ${result.score})`)
  assert(result.status === 'trusted', `still trusted because composite >= 3.0 (got ${result.status})`)
}

// ─── Test 4: Unpatched critical CVE → blocked at any composite ───

section('Test 4: Unpatched critical CVE → blocked')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 4.5, signal: 'vulnerability' },
    { evaluated: true, score: 4.0, signal: 'operational' },
    { evaluated: true, score: 4.5, signal: 'maintenance' },
    { evaluated: true, score: 4.0, signal: 'adoption' },
    { evaluated: true, score: 4.5, signal: 'transparency' },
    { evaluated: true, score: 4.0, signal: 'publisher_trust' },
  ]
  const flags: BlockFlag[] = [{ type: 'cve_unpatched_critical' }]
  const result = score(inputs, flags)
  assert(result.status === 'blocked', `status is blocked (got ${result.status})`)
  assert(result.reasons.includes('cve_unpatched_critical'), 'reason: cve_unpatched_critical')
  assert(result.score !== null && result.score <= 0.99, `score capped at 0.99 (got ${result.score})`)
}

// ─── Test 5: Full coverage, composite 4.5 → trusted ───

section('Test 5: Full coverage high composite → trusted')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 4.5, signal: 'vulnerability' },
    { evaluated: true, score: 4.5, signal: 'operational' },
    { evaluated: true, score: 4.5, signal: 'maintenance' },
    { evaluated: true, score: 4.5, signal: 'adoption' },
    { evaluated: true, score: 4.5, signal: 'transparency' },
    { evaluated: true, score: 4.5, signal: 'publisher_trust' },
  ]
  const result = score(inputs)
  assert(result.status === 'trusted', `status is trusted (got ${result.status})`)
  assert(result.score === 4.5, `score is 4.50 (got ${result.score})`)
  assert(result.coverage === 1.0, `full coverage (got ${result.coverage})`)
  assert(result.reasons.length === 0, `no reasons (got ${result.reasons})`)
}

// ─── Test 6: Patch available blocks trusted status ───

section('Test 6: Patch available → caution even with high composite')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 4.0, signal: 'vulnerability' },
    { evaluated: true, score: 4.0, signal: 'operational' },
    { evaluated: true, score: 4.0, signal: 'maintenance' },
    { evaluated: true, score: 4.0, signal: 'adoption' },
    { evaluated: true, score: 4.0, signal: 'transparency' },
    { evaluated: true, score: 4.0, signal: 'publisher_trust' },
  ]
  const flags: BlockFlag[] = [{ type: 'cve_patch_available' }]
  const result = score(inputs, flags)
  assert(result.status === 'caution', `status is caution (got ${result.status})`)
  assert(result.score !== null && result.score <= 2.99, `score capped at 2.99 (got ${result.score})`)
}

// ─── Test 7: All evaluated false → unverified ───

section('Test 7: No evaluated signals → unverified')
{
  const inputs: SignalInput[] = SIGNAL_ORDER.map(signal => ({ evaluated: false as const, signal }))
  const result = score(inputs)
  assert(result.status === 'unverified', `status is unverified (got ${result.status})`)
  assert(result.score === null, `score is null (got ${result.score})`)
  assert(result.coverage === 0, `coverage is 0 (got ${result.coverage})`)
}

// ─── Test 8: buildInputs helper ───

section('Test 8: buildInputs helper')
{
  const scores = [4.0, 3.5, 4.0, 3.5, 0, 4.0]
  const hasData = [true, true, true, true, true, true]
  const inputs = buildInputs(scores, hasData)
  assert(inputs.length === 6, 'produces 6 inputs')
  assert(inputs[0].evaluated === true, 'first is evaluated')
  assert(inputs[0].evaluated && inputs[0].score === 4.0, 'first score is 4.0')

  const inputs2 = buildInputs(scores, [true, false, true, false, false, true])
  assert(inputs2[1].evaluated === false, 'second is not evaluated')
  assert(inputs2[2].evaluated === true, 'third is evaluated')
}

// ─── Test 9: Low composite → caution ───

section('Test 9: Low composite → caution')
{
  const inputs: SignalInput[] = [
    { evaluated: true, score: 1.0, signal: 'vulnerability' },
    { evaluated: true, score: 1.5, signal: 'operational' },
    { evaluated: true, score: 2.0, signal: 'maintenance' },
    { evaluated: true, score: 1.0, signal: 'adoption' },
    { evaluated: true, score: 1.5, signal: 'transparency' },
    { evaluated: true, score: 2.0, signal: 'publisher_trust' },
  ]
  const result = score(inputs)
  assert(result.status === 'caution', `status is caution (got ${result.status})`)
  assert(result.score !== null && result.score < 3.0, `score below 3.0 (got ${result.score})`)
}

// ─── Summary ───

console.log(`\n${'='.repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'='.repeat(60)}`)

process.exit(failed > 0 ? 1 : 0)
