/**
 * Scoring Watchdog
 *
 * Continuous quality monitor that runs after every scoring cycle.
 * Detects anomalies, auto-remediates known patterns, and logs everything.
 *
 * Unlike the validation suite (which tests against known expectations),
 * the watchdog scans for emergent issues across the entire index and
 * fixes what it can without human intervention.
 *
 * Flow: Detect → Diagnose → Remediate → Rescore → Log
 */

import { createServerClient } from '@/lib/supabase/server'
import { FALLBACK_REASONS, SIGNAL_DEFAULTS } from '@/lib/validation/constants'
import { resolveGitHubFromNpm, resolveGitHubFromPyPI, validateGitHubRepo } from '@/lib/discovery/github-resolver'

// ═══ Types ═══

interface WatchdogIssue {
  detector: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  service_slug: string
  service_name: string
  description: string
  auto_fixable: boolean
}

interface WatchdogRemediation {
  action: string
  service_slug: string
  service_name: string
  detail: string
  success: boolean
}

export interface WatchdogReport {
  timestamp: string
  duration_ms: number
  issues_found: number
  issues_fixed: number
  issues_unfixable: number
  rescored: number
  issues: WatchdogIssue[]
  remediations: WatchdogRemediation[]
}

// ═══ Detectors ═══
// Each detector scans the index for a specific class of anomaly
// and returns issues it found.

async function detectBlockedPopularServices(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  const { data } = await supabase
    .from('services')
    .select('slug, name, signal_adoption, composite_score, status, active_modifiers')
    .eq('status', 'blocked')
    .gte('signal_adoption', 3.0)
    .order('signal_adoption', { ascending: false })
    .limit(50)

  return (data ?? []).map(s => ({
    detector: 'blocked_popular',
    severity: 'critical' as const,
    service_slug: s.slug,
    service_name: s.name,
    description: `Popular service blocked (adoption=${s.signal_adoption}, composite=${s.composite_score}, modifiers=${(s.active_modifiers ?? []).join(',')})`,
    auto_fixable: false,
  }))
}

async function detectScoreDrops(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  // Find services where composite changed >1.5 in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const issues: WatchdogIssue[] = []

  const { data: recentHistory } = await supabase
    .from('signal_history')
    .select('service_id, score, recorded_at')
    .eq('signal_name', 'composite')
    .gte('recorded_at', oneDayAgo)
    .order('recorded_at', { ascending: false })
    .limit(2000)

  // Group by service
  const byService = new Map<string, number[]>()
  for (const row of recentHistory ?? []) {
    const scores = byService.get(row.service_id) ?? []
    scores.push(row.score)
    byService.set(row.service_id, scores)
  }

  const volatileIds: string[] = []
  for (const [serviceId, scores] of byService) {
    if (scores.length < 2) continue
    const delta = Math.max(...scores) - Math.min(...scores)
    if (delta > 1.5) volatileIds.push(serviceId)
  }

  if (volatileIds.length > 0) {
    const { data: services } = await supabase
      .from('services')
      .select('slug, name, composite_score')
      .in('id', volatileIds)

    for (const s of services ?? []) {
      issues.push({
        detector: 'score_drop',
        severity: 'high',
        service_slug: s.slug,
        service_name: s.name,
        description: `Score volatile — composite swung >1.5 in last 24h (current=${s.composite_score})`,
        auto_fixable: false,
      })
    }
  }

  return issues
}

async function detectMissingGithubRepos(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  const { data } = await supabase
    .from('services')
    .select('slug, name, npm_package, pypi_package')
    .is('github_repo', null)
    .or('npm_package.not.is.null,pypi_package.not.is.null')
    .neq('status', 'pending')
    .gte('signal_adoption', 3.0) // Focus on popular ones first
    .order('signal_adoption', { ascending: false })
    .limit(30)

  return (data ?? []).map(s => ({
    detector: 'missing_github_repo',
    severity: 'medium' as const,
    service_slug: s.slug,
    service_name: s.name,
    description: `No github_repo (npm=${s.npm_package ?? '-'}, pypi=${s.pypi_package ?? '-'}) — 3 signals returning fallback`,
    auto_fixable: true,
  }))
}

async function detectPublisherGaps(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  // Publishers missing github_org where we have a service.github_repo to derive it from
  const { data } = await supabase.rpc('publishers_missing_github_org_with_repo', { max_rows: 30 })
    .catch(() => ({ data: null }))

  // Fallback: manual query if RPC not available
  if (!data) {
    const { data: publishers } = await supabase
      .from('publishers')
      .select('id, name, slug')
      .is('github_org', null)
      .limit(30)

    const issues: WatchdogIssue[] = []
    for (const pub of publishers ?? []) {
      // Check if any service linked to this publisher has github_repo
      const { data: svc } = await supabase
        .from('services')
        .select('slug, name, github_repo')
        .eq('publisher_id', pub.id)
        .not('github_repo', 'is', null)
        .limit(1)
        .single()

      if (svc?.github_repo) {
        issues.push({
          detector: 'publisher_gap',
          severity: 'medium',
          service_slug: svc.slug,
          service_name: pub.name,
          description: `Publisher "${pub.name}" missing github_org but service has github_repo="${svc.github_repo}"`,
          auto_fixable: true,
        })
      }
    }
    return issues
  }

  return (data ?? []).map((row: any) => ({
    detector: 'publisher_gap',
    severity: 'medium' as const,
    service_slug: row.service_slug,
    service_name: row.publisher_name,
    description: `Publisher "${row.publisher_name}" missing github_org — derivable from ${row.github_repo}`,
    auto_fixable: true,
  }))
}

async function detectOrphanOverrides(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  // Services with vulnerability_zero_override where all CVEs are actually patched
  const { data } = await supabase
    .from('services')
    .select('id, slug, name, signal_vulnerability, active_modifiers, composite_score')
    .contains('active_modifiers', ['vulnerability_zero_override'])
    .limit(50)

  const issues: WatchdogIssue[] = []

  for (const s of data ?? []) {
    // Check if all CVEs for this service are patched
    const { data: cves } = await supabase
      .from('cve_records')
      .select('cve_id, is_patched')
      .eq('service_id', s.id)

    if (!cves || cves.length === 0) continue

    const allPatched = cves.every(c => c.is_patched)
    if (allPatched) {
      issues.push({
        detector: 'orphan_override',
        severity: 'high',
        service_slug: s.slug,
        service_name: s.name,
        description: `vulnerability_zero_override active but all ${cves.length} CVEs are patched — override should clear on rescore`,
        auto_fixable: true,
      })
    }
  }

  return issues
}

async function detectFallbackHeavyServices(supabase: ReturnType<typeof createServerClient>): Promise<WatchdogIssue[]> {
  // Services scoring trusted but with low confidence (many fallback signals)
  const { data } = await supabase
    .from('services')
    .select('slug, name, status, score_confidence, signals_with_data, composite_score')
    .eq('status', 'trusted')
    .lt('score_confidence', 0.5) // fewer than 3/6 real signals
    .not('score_confidence', 'is', null)
    .order('composite_score', { ascending: false })
    .limit(20)

  return (data ?? []).map(s => ({
    detector: 'low_confidence_trusted',
    severity: 'low' as const,
    service_slug: s.slug,
    service_name: s.name,
    description: `Trusted with only ${s.signals_with_data}/6 real signals (confidence=${(s.score_confidence * 100).toFixed(0)}%) — score may be unreliable`,
    auto_fixable: false,
  }))
}

// ═══ Remediators ═══
// Each remediator fixes a specific class of issue and returns what it did.

async function remediateGithubRepo(
  supabase: ReturnType<typeof createServerClient>,
  issue: WatchdogIssue
): Promise<WatchdogRemediation> {
  const { data: service } = await supabase
    .from('services')
    .select('id, slug, name, npm_package, pypi_package')
    .eq('slug', issue.service_slug)
    .single()

  if (!service) {
    return { action: 'resolve_github_repo', service_slug: issue.service_slug, service_name: issue.service_name, detail: 'Service not found', success: false }
  }

  let resolved: string | null = null

  // Try npm first, then PyPI
  if (service.npm_package) {
    resolved = await resolveGitHubFromNpm(service.npm_package)
  }
  if (!resolved && service.pypi_package) {
    resolved = await resolveGitHubFromPyPI(service.pypi_package)
  }

  if (!resolved) {
    return { action: 'resolve_github_repo', service_slug: service.slug, service_name: service.name, detail: 'No GitHub URL found in registry metadata', success: false }
  }

  // Validate repo exists
  const isValid = await validateGitHubRepo(resolved)
  if (!isValid) {
    return { action: 'resolve_github_repo', service_slug: service.slug, service_name: service.name, detail: `Resolved ${resolved} but repo not accessible`, success: false }
  }

  // Write back
  await supabase
    .from('services')
    .update({ github_repo: resolved })
    .eq('id', service.id)

  // Also update publisher github_org if possible
  const owner = resolved.split('/')[0]
  if (owner) {
    const { data: svcFull } = await supabase
      .from('services')
      .select('publisher_id')
      .eq('id', service.id)
      .single()

    if (svcFull?.publisher_id) {
      await supabase
        .from('publishers')
        .update({ github_org: owner })
        .eq('id', svcFull.publisher_id)
        .is('github_org', null)
    }
  }

  return { action: 'resolve_github_repo', service_slug: service.slug, service_name: service.name, detail: `Resolved to ${resolved}`, success: true }
}

async function remediatePublisherGap(
  supabase: ReturnType<typeof createServerClient>,
  issue: WatchdogIssue
): Promise<WatchdogRemediation> {
  // Extract github_repo from the description
  const repoMatch = issue.description.match(/github_repo="([^"]+)"/)
  if (!repoMatch) {
    return { action: 'derive_publisher_org', service_slug: issue.service_slug, service_name: issue.service_name, detail: 'Could not parse repo from issue', success: false }
  }

  const owner = repoMatch[1].split('/')[0]
  if (!owner) {
    return { action: 'derive_publisher_org', service_slug: issue.service_slug, service_name: issue.service_name, detail: 'Could not extract owner', success: false }
  }

  // Find the publisher via the service
  const { data: service } = await supabase
    .from('services')
    .select('publisher_id')
    .eq('slug', issue.service_slug)
    .single()

  if (!service?.publisher_id) {
    return { action: 'derive_publisher_org', service_slug: issue.service_slug, service_name: issue.service_name, detail: 'No publisher_id found', success: false }
  }

  const { error } = await supabase
    .from('publishers')
    .update({ github_org: owner })
    .eq('id', service.publisher_id)

  if (error) {
    return { action: 'derive_publisher_org', service_slug: issue.service_slug, service_name: issue.service_name, detail: `Update failed: ${error.message}`, success: false }
  }

  return { action: 'derive_publisher_org', service_slug: issue.service_slug, service_name: issue.service_name, detail: `Set github_org to "${owner}"`, success: true }
}

// ═══ Rescoring ═══

async function rescoreService(supabase: ReturnType<typeof createServerClient>, slug: string): Promise<boolean> {
  try {
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!service) return false

    // Dynamic import to avoid circular deps
    const { runAllCollectors } = await import('@/lib/collectors/runner')
    await runAllCollectors(service)
    return true
  } catch (err) {
    console.error(`Watchdog rescore failed for ${slug}:`, err)
    return false
  }
}

// ═══ Main Watchdog ═══

export async function runWatchdog(options?: {
  maxRemediations?: number
  maxRescores?: number
  dryRun?: boolean
}): Promise<WatchdogReport> {
  const start = Date.now()
  const maxRemediations = options?.maxRemediations ?? 20
  const maxRescores = options?.maxRescores ?? 10
  const dryRun = options?.dryRun ?? false

  const supabase = createServerClient()
  const allIssues: WatchdogIssue[] = []
  const remediations: WatchdogRemediation[] = []
  const toRescore = new Set<string>()

  // ═══ Phase 1: Detect ═══

  const detectors = [
    detectBlockedPopularServices,
    detectScoreDrops,
    detectMissingGithubRepos,
    detectPublisherGaps,
    detectOrphanOverrides,
    detectFallbackHeavyServices,
  ]

  for (const detector of detectors) {
    try {
      const issues = await detector(supabase)
      allIssues.push(...issues)
    } catch (err) {
      console.error(`Watchdog detector failed:`, err)
    }
  }

  // ═══ Phase 2: Remediate (auto-fixable issues only) ═══

  let remediationCount = 0
  const fixableIssues = allIssues.filter(i => i.auto_fixable)

  for (const issue of fixableIssues) {
    if (remediationCount >= maxRemediations) break
    if (dryRun) continue

    let result: WatchdogRemediation | null = null

    try {
      switch (issue.detector) {
        case 'missing_github_repo':
          result = await remediateGithubRepo(supabase, issue)
          break
        case 'publisher_gap':
          result = await remediatePublisherGap(supabase, issue)
          break
        case 'orphan_override':
          // Just mark for rescore — the fix is in the updated vulnerability floor
          toRescore.add(issue.service_slug)
          result = {
            action: 'queue_rescore',
            service_slug: issue.service_slug,
            service_name: issue.service_name,
            detail: 'Queued for rescore to clear stale override',
            success: true,
          }
          break
      }
    } catch (err) {
      result = {
        action: 'remediation_error',
        service_slug: issue.service_slug,
        service_name: issue.service_name,
        detail: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        success: false,
      }
    }

    if (result) {
      remediations.push(result)
      remediationCount++

      // Queue rescore for successful data fixes
      if (result.success && (result.action === 'resolve_github_repo' || result.action === 'derive_publisher_org')) {
        toRescore.add(issue.service_slug)
      }
    }
  }

  // ═══ Phase 3: Rescore affected services ═══

  let rescoreCount = 0
  for (const slug of toRescore) {
    if (rescoreCount >= maxRescores) break
    if (dryRun) { rescoreCount++; continue }

    const ok = await rescoreService(supabase, slug)
    if (ok) rescoreCount++

    remediations.push({
      action: 'rescore',
      service_slug: slug,
      service_name: slug,
      detail: ok ? 'Rescored successfully' : 'Rescore failed',
      success: ok,
    })
  }

  // ═══ Phase 4: Log ═══

  const report: WatchdogReport = {
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - start,
    issues_found: allIssues.length,
    issues_fixed: remediations.filter(r => r.success).length,
    issues_unfixable: allIssues.filter(i => !i.auto_fixable).length,
    rescored: rescoreCount,
    issues: allIssues,
    remediations,
  }

  // Store watchdog run in signal_history as a system event
  try {
    await supabase.from('signal_history').insert({
      service_id: '00000000-0000-0000-0000-000000000000', // System sentinel
      signal_name: 'watchdog',
      score: report.issues_found,
      metadata: {
        duration_ms: report.duration_ms,
        issues_found: report.issues_found,
        issues_fixed: report.issues_fixed,
        issues_unfixable: report.issues_unfixable,
        rescored: report.rescored,
        detectors: Object.entries(
          allIssues.reduce((acc, i) => {
            acc[i.detector] = (acc[i.detector] ?? 0) + 1
            return acc
          }, {} as Record<string, number>)
        ),
      },
    })
  } catch {
    // Don't fail the watchdog if logging fails
  }

  return report
}
