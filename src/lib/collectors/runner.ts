import { createServerClient } from '@/lib/supabase/server'
import type { DbService, DbIncident } from '@/lib/supabase/types'
import type { CollectorResult } from './types'
import { vulnerabilityCollector } from './vulnerability'
import { operationalHealthCollector } from './operational-health'
import { maintenanceCollector } from './maintenance'
import { adoptionCollector } from './adoption'
import { transparencyCollector } from './transparency'
import { publisherTrustCollector } from './publisher-trust'
import { collectSupplyChain } from './supply-chain'
import { SIGNAL_ORDER, computeComposite, getStatus } from '@/lib/scoring/thresholds'
import { generateAssessment } from '@/lib/assessment-generator'

/** Metadata reasons that indicate a fallback/default score (no real data evaluated) */
const FALLBACK_REASONS = new Set([
  'no_github_repo',
  'no_packages_to_scan',
  'no_endpoint_configured',
  'no_download_data',
  'publisher_not_found',
  'no_publisher_github',
  'osv_api_unavailable',
  'repo_not_accessible',
])

/** Check if a collector result represents a genuine zero (not a default/fallback) */
function isGenuineZero(cr: { key: string; result: CollectorResult } | null): boolean {
  if (!cr) return false
  if (cr.result.score !== 0) return false
  const reason = cr.result.metadata?.reason as string | undefined
  if (reason && FALLBACK_REASONS.has(reason)) return false
  return true
}

const COLLECTORS = [
  vulnerabilityCollector,
  operationalHealthCollector,
  maintenanceCollector,
  adoptionCollector,
  transparencyCollector,
  publisherTrustCollector,
]

/**
 * Create an incident record for a service.
 */
async function createIncident(
  incident: Omit<DbIncident, 'id' | 'created_at' | 'resolved_at'>
): Promise<void> {
  const supabase = createServerClient()
  await supabase.from('incidents').insert({
    service_id: incident.service_id,
    type: incident.type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    score_at_time: incident.score_at_time,
  })
}

/**
 * Detect and create incidents based on score changes and signal results.
 */
async function detectIncidents(
  service: DbService,
  oldComposite: number,
  newComposite: number,
  collectorResults: Array<{ key: string; result: CollectorResult } | null>
): Promise<void> {
  const supabase = createServerClient()

  // Check if this is the first time the service has been scored
  const { count } = await supabase
    .from('signal_history')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', service.id)
    .eq('signal_name', 'composite')

  const isFirstRun = (count ?? 0) <= 1

  if (isFirstRun) {
    await createIncident({
      service_id: service.id,
      type: 'initial_index',
      severity: 'info',
      title: `${service.name} added to Trust Index`,
      description: `Initial composite score: ${newComposite.toFixed(2)}/5.00`,
      score_at_time: newComposite,
    })
    return // Skip other incident checks on first run
  }

  // Score change >= 0.5 points
  const scoreDelta = newComposite - oldComposite
  if (Math.abs(scoreDelta) >= 0.5) {
    const direction = scoreDelta > 0 ? 'increased' : 'decreased'
    const severity = scoreDelta < -0.5 ? 'warning' : 'info'
    await createIncident({
      service_id: service.id,
      type: 'score_change',
      severity,
      title: `Trust score ${direction} by ${Math.abs(scoreDelta).toFixed(2)}`,
      description: `Score changed from ${oldComposite.toFixed(2)} to ${newComposite.toFixed(2)}`,
      score_at_time: newComposite,
    })
  }

  // Critical CVE detected — patch-aware alert
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
  if (vulnResult?.result.metadata.critical_patch_status) {
    const patchStatus = vulnResult.result.metadata.critical_patch_status as string
    const fixedVersion = vulnResult.result.metadata.critical_fixed_version as string | null
    const totalCves = vulnResult.result.metadata.total_cves as number

    let title: string
    let description: string
    if (patchStatus === 'unpatched') {
      title = 'Critical unpatched CVE — no fix available'
      description = `${totalCves} CVE(s) found, including critical vulnerabilities with no known fix`
    } else if (patchStatus === 'patch_available') {
      title = `Critical CVE — patch available${fixedVersion ? ` in v${fixedVersion}` : ''}`
      description = `${totalCves} CVE(s) found. A fix exists but the latest published version has not applied it`
    } else {
      title = `Critical CVE detected — patched${fixedVersion ? ` in v${fixedVersion}` : ''}`
      description = `${totalCves} CVE(s) found. Critical vulnerability has been patched in the latest version`
    }

    await createIncident({
      service_id: service.id,
      type: 'cve_found',
      severity: patchStatus === 'patched' ? 'warning' : 'critical',
      title,
      description,
      score_at_time: newComposite,
    })
  }

  // Uptime change >= 5%
  const opResult = collectorResults.find(r => r?.key === 'operational')
  if (opResult?.result.metadata.uptime_percent != null) {
    const newUptime = opResult.result.metadata.uptime_percent as number
    const oldUptime = service.uptime_30d
    const uptimeDelta = newUptime - oldUptime

    if (oldUptime > 0 && uptimeDelta <= -5) {
      await createIncident({
        service_id: service.id,
        type: 'uptime_drop',
        severity: 'warning',
        title: `Uptime dropped by ${Math.abs(uptimeDelta).toFixed(1)}%`,
        description: `30-day uptime decreased from ${oldUptime.toFixed(1)}% to ${newUptime.toFixed(1)}%`,
        score_at_time: newComposite,
      })
    } else if (oldUptime > 0 && uptimeDelta >= 5) {
      await createIncident({
        service_id: service.id,
        type: 'uptime_restored',
        severity: 'info',
        title: `Uptime restored by ${uptimeDelta.toFixed(1)}%`,
        description: `30-day uptime increased from ${oldUptime.toFixed(1)}% to ${newUptime.toFixed(1)}%`,
        score_at_time: newComposite,
      })
    }
  }

  // --- Tier 1 External Source Alerts ---

  const maintResult = collectorResults.find(r => r?.key === 'maintenance')
  const pubResult = collectorResults.find(r => r?.key === 'publisher_trust')

  // npm_deprecated
  if (pubResult?.result.metadata.npm_deprecated) {
    await createIncident({
      service_id: service.id,
      type: 'npm_deprecated',
      severity: 'critical',
      title: 'npm package marked as deprecated',
      description: pubResult.result.metadata.npm_deprecated_reason as string || 'Package deprecated by maintainer',
      score_at_time: newComposite,
    })
  }

  // npm_owner_changed — compare current maintainers with previous
  if (pubResult?.result.metadata.npm_maintainers) {
    const currentMaintainers = pubResult.result.metadata.npm_maintainers as string[]
    // Look up previous maintainers from last signal history
    const { data: prevHistory } = await supabase
      .from('signal_history')
      .select('metadata')
      .eq('service_id', service.id)
      .eq('signal_name', 'publisher_trust')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    const prevMaintainers = (prevHistory?.metadata?.npm_maintainers ?? []) as string[]
    if (prevMaintainers.length > 0 && currentMaintainers.length > 0) {
      const prevSet = new Set(prevMaintainers.map((m: string) => m.toLowerCase()))
      const currSet = new Set(currentMaintainers.map((m: string) => m.toLowerCase()))
      const removed = prevMaintainers.filter((m: string) => !currSet.has(m.toLowerCase()))
      const added = currentMaintainers.filter((m: string) => !prevSet.has(m.toLowerCase()))
      if (removed.length > 0 || added.length > 0) {
        await createIncident({
          service_id: service.id,
          type: 'npm_owner_changed',
          severity: 'warning',
          title: 'npm package maintainers changed',
          description: `Removed: ${removed.join(', ') || 'none'} | Added: ${added.join(', ') || 'none'}`,
          score_at_time: newComposite,
        })
      }
    }
  }

  // pypi_yanked
  if (maintResult?.result.metadata.pypi_yanked) {
    await createIncident({
      service_id: service.id,
      type: 'pypi_yanked',
      severity: 'critical',
      title: 'PyPI release yanked',
      description: maintResult.result.metadata.pypi_yanked_reason as string || 'Latest release was yanked',
      score_at_time: newComposite,
    })
  }

  // repo_archived
  if (maintResult?.result.metadata.repo_archived) {
    await createIncident({
      service_id: service.id,
      type: 'repo_archived',
      severity: 'warning',
      title: 'GitHub repository archived',
      description: `The repository ${service.github_repo} has been archived by its owner`,
      score_at_time: newComposite,
    })
  }

  // repo_transferred
  if (maintResult?.result.metadata.repo_transferred) {
    await createIncident({
      service_id: service.id,
      type: 'repo_transferred',
      severity: 'warning',
      title: 'GitHub repository transferred',
      description: `Repository transferred from ${service.github_repo} to ${maintResult.result.metadata.new_repo_name}`,
      score_at_time: newComposite,
    })
  }

  // smithery_scan_failed
  if (maintResult?.result.metadata.smithery_scan_failed) {
    const issues = maintResult.result.metadata.smithery_scan_issues as string[]
    await createIncident({
      service_id: service.id,
      type: 'smithery_scan_failed',
      severity: 'critical',
      title: 'Smithery security scan failed',
      description: issues?.length > 0 ? `Issues: ${issues.join(', ')}` : 'Security scan did not pass',
      score_at_time: newComposite,
    })
  }
}

/**
 * Run all 6 collectors for a single service.
 * Updates the service's signal scores, composite score, and status.
 * Records a signal_history entry for each successful signal.
 * Creates incidents for significant changes.
 * Runs supply-chain collector.
 */
export async function runAllCollectors(service: DbService, options?: { skipSupplyChain?: boolean }): Promise<{
  success: string[]
  failed: string[]
}> {
  const supabase = createServerClient()

  const results = await Promise.allSettled(
    COLLECTORS.map(c => c.collect(service))
  )

  const updates: Record<string, unknown> = {}
  const signals: number[] = []
  const success: string[] = []
  const failed: string[] = []
  const collectorResults: Array<{ key: string; result: CollectorResult } | null> = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const signalKey = SIGNAL_ORDER[i]

    if (result.status === 'fulfilled') {
      const cr: CollectorResult = result.value
      updates[`signal_${signalKey}`] = cr.score
      signals.push(cr.score)
      success.push(signalKey)
      collectorResults.push({ key: signalKey, result: cr })

      // Record signal history
      await supabase.from('signal_history').insert({
        service_id: service.id,
        signal_name: signalKey,
        score: cr.score,
        metadata: cr.metadata,
      })
    } else {
      // Keep existing score on failure
      const existing = service[`signal_${signalKey}` as keyof DbService] as number
      signals.push(existing)
      failed.push(signalKey)
      collectorResults.push(null)
      console.error(`Collector ${signalKey} failed for ${service.name}:`, result.reason)
    }
  }

  // Recompute composite score
  const compositeScore = computeComposite(signals)
  const modifiers: string[] = []
  const oldComposite = service.composite_score

  // Override rules
  let status = getStatus(compositeScore)

  // 1. Zero signal override — only triggers for genuinely evaluated zeros, not defaults
  const hasGenuineZero = collectorResults.some(cr => isGenuineZero(cr))
  if (status === 'trusted' && hasGenuineZero) {
    status = 'caution'
    modifiers.push('zero_signal_override')
  }

  // 2. Vulnerability overrides
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')

  if (vulnResult?.result.metadata.has_critical_unpatched) {
    // Critical unpatched CVE caps at caution — the vuln signal deduction handles severity
    if (status === 'trusted') status = 'caution'
    modifiers.push('critical_cve_override')
  }

  if (isGenuineZero(vulnResult ?? null)) {
    status = 'blocked'
    modifiers.push('vulnerability_zero_override')
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('vulnerability_zero_override')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('critical_cve_override')) {
    finalScore = Math.min(finalScore, 3.24)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 3.24)
  }

  updates.raw_composite_score = compositeScore
  updates.composite_score = finalScore
  updates.status = status
  updates.active_modifiers = modifiers

  // Update service
  await supabase
    .from('services')
    .update(updates)
    .eq('id', service.id)

  // Record composite history
  await supabase.from('signal_history').insert({
    service_id: service.id,
    signal_name: 'composite',
    score: finalScore,
    metadata: { modifiers },
  })

  // Detect and create incidents
  await detectIncidents(service, oldComposite, finalScore, collectorResults)

  // Generate AI assessment if needed (non-blocking)
  const needsAssessment =
    !service.ai_assessment ||
    Math.abs(finalScore - oldComposite) > 0.25 ||
    service.status !== status
  if (needsAssessment) {
    try {
      await generateAssessment(service.id)
    } catch (err) {
      console.error(`Assessment generation failed for ${service.name}:`, err)
    }
  }

  // Run supply-chain collector (informational, non-scoring)
  if (!options?.skipSupplyChain) {
    try {
      await collectSupplyChain(service)
    } catch (err) {
      console.error(`Supply-chain collector failed for ${service.name}:`, err)
    }
  }

  return { success, failed }
}

/**
 * Run a specific set of collectors for a service.
 * After updating individual signals, recomputes composite score,
 * applies overrides, updates status, records history, and detects incidents.
 */
export async function runCollectors(
  service: DbService,
  collectorNames: string[]
): Promise<void> {
  const supabase = createServerClient()
  const collectorResults: Array<{ key: string; result: CollectorResult } | null> = []
  const updatedKeys: string[] = []

  for (const name of collectorNames) {
    const collector = COLLECTORS.find(c => c.name === name)
    if (!collector) continue

    const signalKey = SIGNAL_ORDER[COLLECTORS.indexOf(collector)]

    try {
      const result = await collector.collect(service)

      await supabase
        .from('services')
        .update({ [`signal_${signalKey}`]: result.score })
        .eq('id', service.id)

      await supabase.from('signal_history').insert({
        service_id: service.id,
        signal_name: signalKey,
        score: result.score,
        metadata: result.metadata,
      })

      collectorResults.push({ key: signalKey, result })
      updatedKeys.push(signalKey)
    } catch (err) {
      console.error(`Collector ${name} failed for ${service.name}:`, err)
      collectorResults.push(null)
    }
  }

  // Re-read the service row to get all 6 current signal values
  const { data: freshService } = await supabase
    .from('services')
    .select('*')
    .eq('id', service.id)
    .single()

  if (!freshService) return

  // Build signals array from fresh DB values
  const signals = SIGNAL_ORDER.map(
    key => (freshService[`signal_${key}` as keyof typeof freshService] as number) ?? 0
  )

  // Recompute composite
  const compositeScore = computeComposite(signals)
  const oldComposite = freshService.composite_score // M3: use fresh DB value
  const existingModifiers: string[] = freshService.active_modifiers ?? []
  const modifiers: string[] = []
  const ranVulnerability = updatedKeys.includes('vulnerability')
  const ranAll = updatedKeys.length === SIGNAL_ORDER.length

  // Carry forward modifiers for signals NOT re-run in this partial run
  if (!ranVulnerability) {
    if (existingModifiers.includes('critical_cve_override')) modifiers.push('critical_cve_override')
    if (existingModifiers.includes('vulnerability_zero_override')) modifiers.push('vulnerability_zero_override')
  }
  if (!ranAll && existingModifiers.includes('zero_signal_override')) {
    modifiers.push('zero_signal_override')
  }

  // Override rules
  let status = getStatus(compositeScore)

  // 1. Zero signal override — only re-evaluate if all 6 collectors ran
  if (ranAll) {
    const hasGenuineZeroPartial = collectorResults.some(cr => isGenuineZero(cr))
    if (status === 'trusted' && hasGenuineZeroPartial && !modifiers.includes('zero_signal_override')) {
      modifiers.push('zero_signal_override')
    }
  }

  // 2. Vulnerability overrides — only re-evaluate if vulnerability was re-run
  if (ranVulnerability) {
    const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
    if (vulnResult?.result.metadata.has_critical_unpatched && !modifiers.includes('critical_cve_override')) {
      modifiers.push('critical_cve_override')
    }
    if (isGenuineZero(vulnResult ?? null) && !modifiers.includes('vulnerability_zero_override')) {
      modifiers.push('vulnerability_zero_override')
    }
  }

  // Apply carried-forward + fresh overrides to status
  if (modifiers.includes('vulnerability_zero_override')) {
    status = 'blocked'
  } else if (modifiers.includes('critical_cve_override') && status === 'trusted') {
    status = 'caution'
  } else if (modifiers.includes('zero_signal_override') && status === 'trusted') {
    status = 'caution'
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('vulnerability_zero_override')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('critical_cve_override')) {
    finalScore = Math.min(finalScore, 3.24)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 3.24)
  }

  // Update composite, status, and modifiers
  await supabase
    .from('services')
    .update({
      raw_composite_score: compositeScore,
      composite_score: finalScore,
      status,
      active_modifiers: modifiers,
    })
    .eq('id', service.id)

  // Record composite history
  await supabase.from('signal_history').insert({
    service_id: service.id,
    signal_name: 'composite',
    score: finalScore,
    metadata: { modifiers, partial_run: updatedKeys },
  })

  // Detect incidents (M1: always call, internal thresholds handle filtering)
  await detectIncidents(service, oldComposite, finalScore, collectorResults)
}

/**
 * Run all collectors for all services in the database.
 */
export async function runAllCollectorsForAllServices(): Promise<{
  total: number
  succeeded: number
  failed: number
}> {
  const supabase = createServerClient()
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .neq('discovered_from', 'clawhub')
    .order('composite_score', { ascending: false })

  if (!services) return { total: 0, succeeded: 0, failed: 0 }

  let succeeded = 0
  let failedCount = 0

  for (const service of services) {
    try {
      const result = await runAllCollectors(service)
      if (result.failed.length === 0) succeeded++
      else failedCount++
      console.log(`[${service.name}] success: ${result.success.join(', ')} | failed: ${result.failed.join(', ') || 'none'}`)
    } catch (err) {
      failedCount++
      console.error(`[${service.name}] error:`, err)
    }
  }

  return { total: services.length, succeeded, failed: failedCount }
}
