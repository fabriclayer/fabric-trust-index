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
import { WEIGHTS, SIGNAL_ORDER, computeComposite, getStatus } from '@/lib/scoring/thresholds'

/** Metadata reasons that indicate a fallback/default score (no real data evaluated) */
const FALLBACK_REASONS = new Set([
  'no_github_repo',
  'no_packages_to_scan',
  'no_endpoint_configured',
  'no_download_data',
  'publisher_not_found',
  'no_publisher_github',
  'osv_api_unavailable',
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
  serviceId: string,
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
    await createIncident(service.id, {
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
    await createIncident(service.id, {
      service_id: service.id,
      type: 'score_change',
      severity,
      title: `Trust score ${direction} by ${Math.abs(scoreDelta).toFixed(2)}`,
      description: `Score changed from ${oldComposite.toFixed(2)} to ${newComposite.toFixed(2)}`,
      score_at_time: newComposite,
    })
  }

  // Critical unpatched CVE detected
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
  if (vulnResult?.result.metadata.has_critical_unpatched) {
    await createIncident(service.id, {
      service_id: service.id,
      type: 'cve_found',
      severity: 'critical',
      title: 'Critical unpatched CVE detected',
      description: `${vulnResult.result.metadata.total_cves} CVE(s) found, including critical unpatched vulnerabilities`,
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
      await createIncident(service.id, {
        service_id: service.id,
        type: 'uptime_drop',
        severity: 'warning',
        title: `Uptime dropped by ${Math.abs(uptimeDelta).toFixed(1)}%`,
        description: `30-day uptime decreased from ${oldUptime.toFixed(1)}% to ${newUptime.toFixed(1)}%`,
        score_at_time: newComposite,
      })
    } else if (oldUptime > 0 && uptimeDelta >= 5) {
      await createIncident(service.id, {
        service_id: service.id,
        type: 'uptime_restored',
        severity: 'info',
        title: `Uptime restored by ${uptimeDelta.toFixed(1)}%`,
        description: `30-day uptime increased from ${oldUptime.toFixed(1)}% to ${newUptime.toFixed(1)}%`,
        score_at_time: newComposite,
      })
    }
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

  // 2. Vulnerability overrides — critical findings force blocked
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')

  if (vulnResult?.result.metadata.has_critical_unpatched) {
    status = 'blocked'
    modifiers.push('critical_cve_override')
  }

  if (isGenuineZero(vulnResult ?? null)) {
    status = 'blocked'
    modifiers.push('vulnerability_zero_override')
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('critical_cve_override') || modifiers.includes('vulnerability_zero_override')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 3.24)
  }

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
  const oldComposite = service.composite_score
  const modifiers: string[] = []

  // Override rules
  let status = getStatus(compositeScore)

  // 1. Zero signal override — only for genuinely evaluated zeros
  const hasGenuineZeroPartial = collectorResults.some(cr => isGenuineZero(cr))
  if (status === 'trusted' && hasGenuineZeroPartial) {
    status = 'caution'
    modifiers.push('zero_signal_override')
  }

  // 2. Vulnerability overrides
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
  if (vulnResult?.result.metadata.has_critical_unpatched) {
    status = 'blocked'
    modifiers.push('critical_cve_override')
  }
  if (isGenuineZero(vulnResult ?? null)) {
    status = 'blocked'
    modifiers.push('vulnerability_zero_override')
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('critical_cve_override') || modifiers.includes('vulnerability_zero_override')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 3.24)
  }

  // Update composite, status, and modifiers
  await supabase
    .from('services')
    .update({
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

  // Detect incidents if score changed significantly
  if (Math.abs(finalScore - oldComposite) >= 0.3) {
    await detectIncidents(service, oldComposite, finalScore, collectorResults)
  }
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
