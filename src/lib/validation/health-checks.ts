/**
 * Scoring Health Checks
 *
 * Automated checks scanning the entire index for anomalies.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SIGNAL_DEFAULTS } from '@/lib/validation/constants'

export interface HealthCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  count: number
  warn_threshold: number
  fail_threshold: number
  sample: string[]
}

export interface HealthSummary {
  total_services: number
  trusted_count: number
  caution_count: number
  blocked_count: number
  pending_count: number
  github_repo_coverage: string
}

export interface HealthResult {
  ok: boolean
  timestamp: string
  checks: HealthCheck[]
  summary: HealthSummary
}

function checkStatus(count: number, warn: number, fail: number): 'pass' | 'warn' | 'fail' {
  if (count >= fail) return 'fail'
  if (count >= warn) return 'warn'
  return 'pass'
}

export async function runHealthChecks(supabase: SupabaseClient): Promise<HealthResult> {
  const checks: HealthCheck[] = []

  // ═══ Summary stats ═══
  const { count: totalCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'pending')

  const { count: trustedCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'trusted')

  const { count: cautionCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'caution')

  const { count: blockedCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'blocked')

  const { count: pendingCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const total = totalCount ?? 0

  // ═══ CHECK 1: High Adoption, Low Score ═══
  {
    const { data, count } = await supabase
      .from('services')
      .select('slug, name, signal_adoption, composite_score', { count: 'exact' })
      .gte('signal_adoption', 3.5)
      .lt('composite_score', 3.00)
      .neq('status', 'pending')
      .order('signal_adoption', { ascending: false })
      .limit(10)

    const c = count ?? 0
    checks.push({
      name: 'High Adoption Low Score',
      status: checkStatus(c, 5, 20),
      count: c,
      warn_threshold: 5,
      fail_threshold: 20,
      sample: (data ?? []).map(s => `${s.name} (adoption=${s.signal_adoption}, composite=${s.composite_score})`),
    })
  }

  // ═══ CHECK 2: Missing GitHub Data ═══
  {
    const { data, count } = await supabase
      .from('services')
      .select('slug, name, npm_package, pypi_package', { count: 'exact' })
      .is('github_repo', null)
      .or('npm_package.not.is.null,pypi_package.not.is.null')
      .neq('status', 'pending')
      .limit(10)

    const c = count ?? 0
    checks.push({
      name: 'Missing GitHub Data',
      status: checkStatus(c, 100, 500),
      count: c,
      warn_threshold: 100,
      fail_threshold: 500,
      sample: (data ?? []).map(s => `${s.name} (npm=${s.npm_package ?? '-'}, pypi=${s.pypi_package ?? '-'})`),
    })
  }

  // ═══ CHECK 3: Signal Fallback Rate ═══
  // Approximate: count services at default score values per signal
  {
    let worstPct = 0
    let worstSignal = ''
    const details: string[] = []

    for (const [signal, defaultScore] of Object.entries(SIGNAL_DEFAULTS)) {
      const { count: atDefault } = await supabase
        .from('services')
        .select('*', { count: 'exact', head: true })
        .eq(`signal_${signal}`, defaultScore)
        .neq('status', 'pending')
        .neq('category', 'skill')

      const c = atDefault ?? 0
      const pct = total > 0 ? (c / total) * 100 : 0
      details.push(`${signal}: ${c} (${pct.toFixed(0)}%)`)
      if (pct > worstPct) {
        worstPct = pct
        worstSignal = signal
      }
    }

    checks.push({
      name: 'Signal Fallback Rate',
      status: worstPct >= 40 ? 'fail' : worstPct >= 20 ? 'warn' : 'pass',
      count: Math.round(worstPct),
      warn_threshold: 20,
      fail_threshold: 40,
      sample: details,
    })
  }

  // ═══ CHECK 4: Score Volatility ═══
  // Find services with composite delta > 1.5 in last 24h
  {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Get recent composite records grouped by service
    const { data: recentComposites } = await supabase
      .from('signal_history')
      .select('service_id, score, recorded_at')
      .eq('signal_name', 'composite')
      .gte('recorded_at', oneDayAgo)
      .order('recorded_at', { ascending: false })
      .limit(1000)

    // Group by service_id, find min/max
    const serviceScores = new Map<string, number[]>()
    for (const record of recentComposites ?? []) {
      const scores = serviceScores.get(record.service_id) ?? []
      scores.push(record.score)
      serviceScores.set(record.service_id, scores)
    }

    const volatile: string[] = []
    for (const [serviceId, scores] of serviceScores) {
      if (scores.length < 2) continue
      const min = Math.min(...scores)
      const max = Math.max(...scores)
      if (max - min > 1.5) {
        volatile.push(serviceId)
      }
    }

    // Get names for sample
    const sampleIds = volatile.slice(0, 10)
    let sample: string[] = []
    if (sampleIds.length > 0) {
      const { data: names } = await supabase
        .from('services')
        .select('name')
        .in('id', sampleIds)
      sample = (names ?? []).map(s => s.name)
    }

    checks.push({
      name: 'Score Volatility (24h)',
      status: checkStatus(volatile.length, 10, 50),
      count: volatile.length,
      warn_threshold: 10,
      fail_threshold: 50,
      sample,
    })
  }

  // ═══ CHECK 5: Top 100 Misscores ═══
  {
    const { data } = await supabase
      .from('services')
      .select('slug, name, signal_adoption, composite_score, status')
      .neq('status', 'pending')
      .order('signal_adoption', { ascending: false })
      .limit(100)

    const misscored = (data ?? []).filter(s => s.status === 'caution' || s.status === 'blocked')

    checks.push({
      name: 'Top 100 Misscores',
      status: checkStatus(misscored.length, 3, 10),
      count: misscored.length,
      warn_threshold: 3,
      fail_threshold: 10,
      sample: misscored.slice(0, 10).map(s => `${s.name} (${s.status}, adoption=${s.signal_adoption}, composite=${s.composite_score})`),
    })
  }

  // ═══ CHECK 6: Orphan Signals ═══
  // Services with mixed real/fallback signals (some scored, some not)
  {
    // Find services where at least one signal is NOT at default AND at least one IS at default
    // Approximate by checking a few key signal pairs
    const { data, count } = await supabase
      .from('services')
      .select('slug, name, signal_adoption, signal_transparency, signal_maintenance, signal_publisher_trust', { count: 'exact' })
      .neq('status', 'pending')
      .neq('category', 'skill')
      .gte('signal_adoption', 3.5) // real adoption data
      .or(`signal_transparency.eq.${SIGNAL_DEFAULTS.transparency},signal_maintenance.eq.${SIGNAL_DEFAULTS.maintenance},signal_publisher_trust.eq.${SIGNAL_DEFAULTS.publisher_trust}`)
      .limit(10)

    const c = count ?? 0
    checks.push({
      name: 'Orphan Signals',
      status: checkStatus(c, 50, 200),
      count: c,
      warn_threshold: 50,
      fail_threshold: 200,
      sample: (data ?? []).map(s => `${s.name} (adoption=${s.signal_adoption}, transparency=${s.signal_transparency}, maintenance=${s.signal_maintenance})`),
    })
  }

  // ═══ CHECK 7: Publisher Data Gaps ═══
  {
    const { data, count } = await supabase
      .from('publishers')
      .select('slug, name', { count: 'exact' })
      .is('github_org', null)
      .limit(10)

    const c = count ?? 0
    checks.push({
      name: 'Publisher Data Gaps',
      status: checkStatus(c, 50, 200),
      count: c,
      warn_threshold: 50,
      fail_threshold: 200,
      sample: (data ?? []).map(s => s.name),
    })
  }

  // ═══ CHECK 8: Stale Scores ═══
  {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, count } = await supabase
      .from('services')
      .select('slug, name, updated_at', { count: 'exact' })
      .neq('status', 'pending')
      .lt('updated_at', sevenDaysAgo)
      .order('updated_at', { ascending: true })
      .limit(10)

    const c = count ?? 0
    checks.push({
      name: 'Stale Scores (>7d)',
      status: checkStatus(c, 100, 500),
      count: c,
      warn_threshold: 100,
      fail_threshold: 500,
      sample: (data ?? []).map(s => `${s.name} (updated ${s.updated_at})`),
    })
  }

  // ═══ GitHub coverage ═══
  const { count: npmPypiCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .or('npm_package.not.is.null,pypi_package.not.is.null')
    .neq('status', 'pending')

  const { count: withGithubCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .not('github_repo', 'is', null)
    .or('npm_package.not.is.null,pypi_package.not.is.null')
    .neq('status', 'pending')

  const npmPypi = npmPypiCount ?? 0
  const withGithub = withGithubCount ?? 0
  const coverage = npmPypi > 0 ? `${Math.round((withGithub / npmPypi) * 100)}% of npm/pypi services` : 'N/A'

  const hasFail = checks.some(c => c.status === 'fail')

  return {
    ok: !hasFail,
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total_services: total,
      trusted_count: trustedCount ?? 0,
      caution_count: cautionCount ?? 0,
      blocked_count: blockedCount ?? 0,
      pending_count: pendingCount ?? 0,
      github_repo_coverage: coverage,
    },
  }
}
