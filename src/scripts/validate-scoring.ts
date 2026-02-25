/**
 * Scoring Validation CLI
 *
 * Runs golden set + health checks via the API endpoints.
 * Usage: npx tsx src/scripts/validate-scoring.ts
 *
 * Env vars:
 *   CRON_SECRET — Bearer token for API auth
 *   TRUST_INDEX_URL — Base URL (default: https://trust.fabriclayer.ai)
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (scripts are excluded from Next.js)
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const val = trimmed.slice(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  // .env.local not found, rely on process env
}

const BASE_URL = process.env.TRUST_INDEX_URL ?? 'https://trust.fabriclayer.ai'
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  console.error('ERROR: CRON_SECRET env var required')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${CRON_SECRET}`,
  'Content-Type': 'application/json',
}

async function fetchJson(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

interface GoldenSetResult {
  ok: boolean
  total: number
  passed: number
  failed: number
  missing: number
  failures: Array<{
    slug: string
    name: string
    issues: string[]
    actual: { composite_score: number; status: string }
  }>
  missing_slugs: string[]
}

interface HealthResult {
  ok: boolean
  checks: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail'
    count: number
    sample: string[]
  }>
  summary: {
    total_services: number
    trusted_count: number
    caution_count: number
    blocked_count: number
    pending_count: number
    github_repo_coverage: string
  }
}

async function main() {
  console.log('=== FABRIC SCORING VALIDATION ===\n')

  let goldenFails = 0
  let healthFails = 0

  // ═══ Golden Set ═══
  try {
    console.log('Running golden set validation...')
    const golden = (await fetchJson('/api/validation/golden-set')) as GoldenSetResult

    console.log(`\nGOLDEN SET: ${golden.passed}/${golden.total} passed`)

    if (golden.missing > 0) {
      console.log(`  (${golden.missing} services not found: ${golden.missing_slugs.join(', ')})`)
    }

    for (const f of golden.failures) {
      console.log(`  ✗ ${f.name} — ${f.issues.join('; ')} (actual: ${f.actual.composite_score.toFixed(2)} ${f.actual.status})`)
    }

    if (golden.failures.length === 0 && golden.missing === 0) {
      console.log('  ✓ All golden set tests passed')
    }

    goldenFails = golden.failed + golden.missing
  } catch (err) {
    console.error(`\nGOLDEN SET: ERROR — ${err instanceof Error ? err.message : 'Unknown'}`)
    goldenFails = 1
  }

  // ═══ Health Checks ═══
  try {
    console.log('\nRunning health checks...')
    const health = (await fetchJson('/api/validation/health')) as HealthResult

    console.log('\nHEALTH CHECKS:')
    for (const check of health.checks) {
      const icon = check.status === 'fail' ? '✗' : '✓'
      const suffix = check.status !== 'pass' ? ` (${check.status})` : ''
      console.log(`  ${icon} ${check.name}: ${check.count}${check.name === 'Signal Fallback Rate' ? '% worst' : ' services'}${suffix}`)

      if (check.status === 'fail' && check.sample.length > 0) {
        for (const s of check.sample.slice(0, 3)) {
          console.log(`    - ${s}`)
        }
      }
    }

    console.log(`\nSUMMARY:`)
    console.log(`  Total: ${health.summary.total_services} services`)
    console.log(`  Trusted: ${health.summary.trusted_count} | Caution: ${health.summary.caution_count} | Blocked: ${health.summary.blocked_count} | Pending: ${health.summary.pending_count}`)
    console.log(`  GitHub coverage: ${health.summary.github_repo_coverage}`)

    healthFails = health.checks.filter(c => c.status === 'fail').length
  } catch (err) {
    console.error(`\nHEALTH CHECKS: ERROR — ${err instanceof Error ? err.message : 'Unknown'}`)
    healthFails = 1
  }

  // ═══ Result ═══
  console.log('')
  if (goldenFails === 0 && healthFails === 0) {
    console.log('RESULT: PASS')
    process.exit(0)
  } else {
    const parts: string[] = []
    if (goldenFails > 0) parts.push(`${goldenFails} golden set failure(s)`)
    if (healthFails > 0) parts.push(`${healthFails} health check failure(s)`)
    console.log(`RESULT: FAIL (${parts.join(', ')})`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
