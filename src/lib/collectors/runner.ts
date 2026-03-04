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
import { SIGNAL_ORDER, computeCompositeWithRedistribution, getStatus, getConfidenceLevel, applyTrustedGate } from '@/lib/scoring/thresholds'

import { resolveGitHubRepo } from '@/lib/discovery/github-resolver'
import { sendTelegramAlert } from '@/lib/alerts/telegram'

/** Check if a collector result represents a genuine zero (not a default/fallback) */
function isGenuineZero(cr: { key: string; result: CollectorResult } | null): boolean {
  if (!cr) return false
  if (cr.result.score !== 0) return false
  // A zero is genuine if at least one sub-signal has real data
  return cr.result.sub_signals?.some(s => s.has_data) ?? false
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
  collectorResults: Array<{ key: string; result: CollectorResult } | null>,
  prevPubTrustMeta?: Record<string, unknown> | null,
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

  // Critical CVE detected — patch-aware alert (deduplicated)
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
  if (vulnResult?.result.metadata.critical_patch_status) {
    const patchStatus = vulnResult.result.metadata.critical_patch_status as string
    const fixedVersion = vulnResult.result.metadata.critical_fixed_version as string | null
    const totalCves = vulnResult.result.metadata.total_cves as number

    // Check for existing unresolved CVE incident
    const { data: existingCve } = await supabase
      .from('incidents')
      .select('id, description')
      .eq('service_id', service.id)
      .eq('type', 'cve_found')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Determine existing patch status from description text
    const existingPatchStatus = existingCve?.description?.includes('no known fix')
      ? 'unpatched'
      : existingCve?.description?.includes('fix exists but')
      ? 'patch_available'
      : existingCve?.description?.includes('patched in the latest')
      ? 'patched'
      : null

    const shouldCreate = !existingCve || existingPatchStatus !== patchStatus

    if (shouldCreate) {
      // If patch status changed, resolve the old incident first
      if (existingCve && existingPatchStatus !== patchStatus) {
        await supabase
          .from('incidents')
          .update({ resolved_at: new Date().toISOString() })
          .eq('id', existingCve.id)
      }

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

  // npm_deprecated (deduplicated)
  if (pubResult?.result.metadata.npm_deprecated) {
    const { data: existingDep } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'npm_deprecated')
      .is('resolved_at', null)
      .limit(1)
      .single()

    if (!existingDep) {
      await createIncident({
        service_id: service.id,
        type: 'npm_deprecated',
        severity: 'critical',
        title: 'npm package marked as deprecated',
        description: pubResult.result.metadata.npm_deprecated_reason as string || 'Package deprecated by maintainer',
        score_at_time: newComposite,
      })
    }
  }

  // npm_owner_changed — compare current maintainers with previous
  if (pubResult?.result.metadata.npm_maintainers) {
    const currentMaintainers = pubResult.result.metadata.npm_maintainers as string[]
    // Use pre-fetched metadata (captured before signal_history inserts) to avoid race condition
    const prevMaintainers = (prevPubTrustMeta?.npm_maintainers ?? []) as string[]
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
        // Fire Telegram alert for maintainer changes
        if (removed.length > 0) {
          await sendTelegramAlert(
            `\u26a0\ufe0f <b>NPM MAINTAINER CHANGE:</b> ${service.name}\n` +
            `Removed: ${removed.join(', ') || 'none'}\nAdded: ${added.join(', ') || 'none'}\n` +
            `Score held at caution, manual review required.`
          )
        }
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

  // repo_archived (deduplicated)
  if (maintResult?.result.metadata.repo_archived) {
    const { data: existingArchived } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'repo_archived')
      .is('resolved_at', null)
      .limit(1)
      .single()

    if (!existingArchived) {
      await createIncident({
        service_id: service.id,
        type: 'repo_archived',
        severity: 'warning',
        title: 'GitHub repository archived',
        description: `The repository ${service.github_repo} has been archived by its owner`,
        score_at_time: newComposite,
      })
    }
  }

  // repo_renamed (same owner — benign rename)
  if (maintResult?.result.metadata.repo_renamed) {
    const newName = maintResult.result.metadata.new_repo_name as string
    await createIncident({
      service_id: service.id,
      type: 'repo_renamed',
      severity: 'info',
      title: 'GitHub repository renamed',
      description: `Repository renamed from ${service.github_repo} to ${newName} (same owner)`,
      score_at_time: newComposite,
    })
    // Auto-update github_repo so collectors keep working
    await supabase
      .from('services')
      .update({ github_repo: newName })
      .eq('id', service.id)
  }

  // repo_transferred (different owner — supply chain risk)
  if (maintResult?.result.metadata.repo_transferred) {
    const oldOwner = maintResult.result.metadata.old_owner as string
    const newOwner = maintResult.result.metadata.new_owner as string
    const newName = maintResult.result.metadata.new_repo_name as string
    await createIncident({
      service_id: service.id,
      type: 'repo_transferred',
      severity: 'critical',
      title: 'GitHub repository ownership changed',
      description: `Repository transferred from ${service.github_repo} (${oldOwner}) to ${newName} (${newOwner}) — score frozen, manual review required`,
      score_at_time: newComposite,
    })
    // Update github_repo to new name so we track the new location
    await supabase
      .from('services')
      .update({ github_repo: newName })
      .eq('id', service.id)
    // Fire Telegram alert
    await sendTelegramAlert(
      `\u26a0\ufe0f <b>OWNERSHIP CHANGE:</b> ${service.name} repo transferred from <code>${oldOwner}</code> to <code>${newOwner}</code>\n` +
      `Old: ${service.github_repo}\nNew: ${newName}\n` +
      `Score frozen, manual review required.`
    )
  }

  // smithery_scan_failed (deduplicated)
  if (maintResult?.result.metadata.smithery_scan_failed) {
    const { data: existingScan } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'smithery_scan_failed')
      .is('resolved_at', null)
      .limit(1)
      .single()

    if (!existingScan) {
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

  // Pre-scoring: resolve github_repo if missing but npm/pypi package exists
  if (!service.github_repo && (service.npm_package || service.pypi_package)) {
    try {
      const resolved = await resolveGitHubRepo({
        npm_package: service.npm_package,
        pypi_package: service.pypi_package,
      })
      if (resolved) {
        await supabase.from('services').update({ github_repo: resolved }).eq('id', service.id)
        service = { ...service, github_repo: resolved } as DbService

        // Also update publisher github_org if null
        const owner = resolved.split('/')[0]
        const { data: pub } = await supabase
          .from('publishers')
          .select('id, github_org')
          .eq('id', service.publisher_id)
          .single()
        if (pub && !pub.github_org) {
          await supabase.from('publishers').update({ github_org: owner }).eq('id', pub.id)
        }
      }
    } catch (err) {
      console.error(`GitHub repo resolution failed for ${service.name}:`, err)
    }
  }

  // Capture previous publisher_trust metadata BEFORE collection inserts new signal_history rows.
  // This prevents the race where detectIncidents reads the just-inserted record as "previous".
  const { data: prevPubTrustHistory } = await supabase
    .from('signal_history')
    .select('metadata')
    .eq('service_id', service.id)
    .eq('signal_name', 'publisher_trust')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()
  const prevPubTrustMeta = prevPubTrustHistory?.metadata ?? null

  const results = await Promise.allSettled(
    COLLECTORS.map(c => c.collect(service))
  )

  const updates: Record<string, unknown> = {}
  const signals: number[] = []
  const success: string[] = []
  const failed: string[] = []
  const collectorResults: Array<{ key: string; result: CollectorResult } | null> = []
  const signalHasData: boolean[] = []
  const signalScores: Record<string, unknown> = {}

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const signalKey = SIGNAL_ORDER[i]

    if (result.status === 'fulfilled') {
      const cr: CollectorResult = result.value
      updates[`signal_${signalKey}`] = cr.score
      signals.push(cr.score)
      signalHasData.push(cr.sub_signals?.some(s => s.has_data) ?? false)
      signalScores[signalKey] = { score: cr.score, sub_signals: cr.sub_signals ?? [] }
      success.push(signalKey)
      collectorResults.push({ key: signalKey, result: cr })

      // Record signal history with sub-signal breakdown
      await supabase.from('signal_history').insert({
        service_id: service.id,
        signal_name: signalKey,
        score: cr.score,
        metadata: { ...cr.metadata, sub_signals: cr.sub_signals },
      })
    } else {
      // Keep existing score on failure
      const existing = service[`signal_${signalKey}` as keyof DbService] as number
      signals.push(existing)
      // Determine has_data from existing signal_scores if available
      const existingSS = service.signal_scores as Record<string, { sub_signals?: Array<{ has_data: boolean }> }> | null
      signalHasData.push(existingSS?.[signalKey]?.sub_signals?.some(s => s.has_data) ?? false)
      failed.push(signalKey)
      collectorResults.push(null)
      console.error(`Collector ${signalKey} failed for ${service.name}:`, result.reason)
    }
  }

  // ── Vulnerability signal overrides (apply BEFORE composite) ──
  // Three tiers based on CVE patch status for payment safety:
  //   Tier 1 (no_patch): critical/high unpatched → signal=0, blocked
  //   Tier 2 (patch_available): critical/high with fix available → signal=1.5, caution cap
  //   Tier 3 (all patched): no override, normal scoring
  const modifiers: string[] = []
  const oldComposite = service.composite_score
  const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')

  if (vulnResult?.result.metadata.has_critical_or_high_unpatched) {
    // Tier 1: No patch exists for critical/high CVE → force signal to 0
    signals[0] = 0
    updates.signal_vulnerability = 0
    modifiers.push('vulnerability_zero_override')
  } else if (vulnResult?.result.metadata.has_critical_or_high_patch_available) {
    // Tier 2: Patch available but not applied → cap signal at 1.5
    if (signals[0] > 1.5) {
      signals[0] = 1.5
      updates.signal_vulnerability = 1.5
    }
    modifiers.push('vulnerability_patch_available')
  }

  // Recompute composite score with weight redistribution.
  // Safety: a score of 0 is always treated as "has data" — it's a genuine penalty,
  // not missing data. Without this, signals returning 0 with has_data=false get their
  // weight redistributed, inflating the composite score.
  const signalInputs = signals.map((score, i) => ({
    score,
    has_data: signalHasData[i] || score === 0,
  }))
  const { score: compositeScore } = computeCompositeWithRedistribution(signalInputs)

  // Override rules
  let status = getStatus(compositeScore)

  // 1. Zero signal override — only triggers for genuinely evaluated zeros, not defaults
  const hasGenuineZero = collectorResults.some(cr => isGenuineZero(cr))
  if (status === 'trusted' && hasGenuineZero) {
    status = 'caution'
    modifiers.push('zero_signal_override')
  }

  // 2. Vulnerability status overrides (from tiered system above)
  if (modifiers.includes('vulnerability_zero_override')) {
    status = 'blocked'
  } else if (modifiers.includes('vulnerability_patch_available') && status === 'trusted') {
    status = 'caution'
  }

  // 3. Repo archived override — archived repos should never score trusted
  const maintResult2 = collectorResults.find(r => r?.key === 'maintenance')
  if (maintResult2?.result.metadata.repo_archived) {
    status = 'blocked'
    modifiers.push('repo_archived')
  }

  // 4. Repo ownership transfer override — different owner is a supply chain risk
  if (maintResult2?.result.metadata.repo_transferred) {
    if (status === 'trusted') status = 'caution'
    modifiers.push('repo_transferred')
  }

  // 5. npm deprecated override — deprecated packages should never score trusted
  const pubResult2 = collectorResults.find(r => r?.key === 'publisher_trust')
  if (pubResult2?.result.metadata.npm_deprecated) {
    status = 'blocked'
    modifiers.push('npm_deprecated')
  }

  // 6. npm owner changed override — use pre-fetched metadata to avoid race
  if (pubResult2?.result.metadata.npm_maintainers) {
    const currMaintainers = pubResult2.result.metadata.npm_maintainers as string[]
    const prevMaintainers = (prevPubTrustMeta?.npm_maintainers ?? []) as string[]
    if (currMaintainers.length > 0 && prevMaintainers.length > 0) {
      const removed = prevMaintainers.filter((m: string) => !new Set(currMaintainers.map(c => c.toLowerCase())).has(m.toLowerCase()))
      if (removed.length > 0) {
        if (status === 'trusted') status = 'caution'
        modifiers.push('npm_owner_changed')
      }
    }
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('vulnerability_zero_override') || modifiers.includes('repo_archived') || modifiers.includes('npm_deprecated')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('vulnerability_patch_available')) {
    finalScore = Math.min(finalScore, 2.99)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 2.99)
  }

  // Repo transfer penalty: freeze + apply -1.0
  if (modifiers.includes('repo_transferred')) {
    finalScore = Math.min(finalScore, oldComposite) // Freeze: can't go up
    finalScore = Math.max(finalScore - 1.0, 0.5)    // Apply -1.0 penalty
    finalScore = Math.min(finalScore, 2.99)          // Cap at caution range
  }

  // npm owner changed penalty
  if (modifiers.includes('npm_owner_changed')) {
    finalScore = Math.min(finalScore, oldComposite) // Freeze: can't go up
    finalScore = Math.max(finalScore - 0.5, 0.5)    // Apply -0.5 penalty
    finalScore = Math.min(finalScore, 2.99)          // Cap at caution range
  }

  // Trusted gate: must have vuln data + 4 signals with data to be trusted
  const signalsWithRealData = signalHasData.filter(Boolean).length
  const gateResult = applyTrustedGate(finalScore, status, signalHasData[0], signalsWithRealData)
  if (gateResult.gated) {
    finalScore = gateResult.score
    status = gateResult.status as 'trusted' | 'caution' | 'blocked'
    modifiers.push('trusted_gate')
  }

  updates.raw_composite_score = compositeScore
  updates.composite_score = finalScore
  updates.status = status
  updates.active_modifiers = modifiers
  updates.score_confidence = signalsWithRealData / SIGNAL_ORDER.length
  updates.signals_with_data = signalsWithRealData
  updates.signal_scores = signalScores

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
    metadata: { modifiers, signals_with_data: signalsWithRealData },
  })

  // Detect and create incidents (pass pre-fetched publisher_trust metadata to avoid race)
  await detectIncidents(service, oldComposite, finalScore, collectorResults, prevPubTrustMeta)

  // AI assessments are regenerated weekly via manual trigger on the monitor dashboard.
  // No longer auto-generated during scoring runs.

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

  // Pre-scoring: resolve github_repo if missing but npm/pypi package exists
  if (!service.github_repo && (service.npm_package || service.pypi_package)) {
    try {
      const resolved = await resolveGitHubRepo({
        npm_package: service.npm_package,
        pypi_package: service.pypi_package,
      })
      if (resolved) {
        await supabase.from('services').update({ github_repo: resolved }).eq('id', service.id)
        service = { ...service, github_repo: resolved } as DbService

        const owner = resolved.split('/')[0]
        const { data: pub } = await supabase
          .from('publishers')
          .select('id, github_org')
          .eq('id', service.publisher_id)
          .single()
        if (pub && !pub.github_org) {
          await supabase.from('publishers').update({ github_org: owner }).eq('id', pub.id)
        }
      }
    } catch (err) {
      console.error(`GitHub repo resolution failed for ${service.name}:`, err)
    }
  }

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
        metadata: { ...result.metadata, sub_signals: result.sub_signals },
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

  // Merge signal_scores: start with existing, update for re-run collectors
  const existingSignalScores = (freshService.signal_scores as Record<string, unknown>) ?? {}
  const signalScoresPartial: Record<string, unknown> = { ...existingSignalScores }
  for (const cr of collectorResults) {
    if (cr) {
      signalScoresPartial[cr.key] = { score: cr.result.score, sub_signals: cr.result.sub_signals }
    }
  }

  // Build has_data from merged signal_scores
  const signalHasDataPartial = SIGNAL_ORDER.map(key => {
    const entry = signalScoresPartial[key] as { sub_signals?: Array<{ has_data: boolean }> } | undefined
    return entry?.sub_signals?.some(s => s.has_data) ?? false
  })

  // Build signals array from fresh DB values
  const signals = SIGNAL_ORDER.map(
    key => (freshService[`signal_${key}` as keyof typeof freshService] as number) ?? 0
  )

  const existingModifiers: string[] = freshService.active_modifiers ?? []
  const modifiers: string[] = []
  const ranVulnerability = updatedKeys.includes('vulnerability')
  const ranAll = updatedKeys.length === SIGNAL_ORDER.length

  // Carry forward modifiers for signals NOT re-run in this partial run
  const ranMaintenance = updatedKeys.includes('maintenance')
  const ranPublisherTrust = updatedKeys.includes('publisher_trust')
  if (!ranVulnerability) {
    if (existingModifiers.includes('vulnerability_zero_override')) modifiers.push('vulnerability_zero_override')
    if (existingModifiers.includes('vulnerability_patch_available')) modifiers.push('vulnerability_patch_available')
  }
  if (!ranAll && existingModifiers.includes('zero_signal_override')) {
    modifiers.push('zero_signal_override')
  }
  // Carry forward transfer/ownership/archived/deprecated modifiers
  if (!ranMaintenance) {
    if (existingModifiers.includes('repo_transferred')) modifiers.push('repo_transferred')
    if (existingModifiers.includes('repo_archived')) modifiers.push('repo_archived')
  }
  if (!ranPublisherTrust) {
    if (existingModifiers.includes('npm_owner_changed')) modifiers.push('npm_owner_changed')
    if (existingModifiers.includes('npm_deprecated')) modifiers.push('npm_deprecated')
  }

  // ── Vulnerability signal overrides (apply BEFORE composite) ──
  // Three tiers: no_patch → signal=0, patch_available → signal≤1.5, all patched → normal
  if (ranVulnerability) {
    const vulnResult = collectorResults.find(r => r?.key === 'vulnerability')
    if (vulnResult?.result.metadata.has_critical_or_high_unpatched) {
      signals[0] = 0
      if (!modifiers.includes('vulnerability_zero_override')) modifiers.push('vulnerability_zero_override')
    } else if (vulnResult?.result.metadata.has_critical_or_high_patch_available) {
      if (signals[0] > 1.5) signals[0] = 1.5
      if (!modifiers.includes('vulnerability_patch_available')) modifiers.push('vulnerability_patch_available')
    }
  } else if (modifiers.includes('vulnerability_zero_override')) {
    // Carry forward: force signal to 0 for composite calculation
    signals[0] = 0
  } else if (modifiers.includes('vulnerability_patch_available')) {
    // Carry forward: cap signal at 1.5 for composite calculation
    if (signals[0] > 1.5) signals[0] = 1.5
  }

  // Recompute composite with weight redistribution
  const signalInputsPartial = signals.map((score, i) => ({ score, has_data: signalHasDataPartial[i] }))
  const { score: compositeScore } = computeCompositeWithRedistribution(signalInputsPartial)
  const oldComposite = freshService.composite_score

  // Override rules
  let status = getStatus(compositeScore)

  // 1. Zero signal override — only re-evaluate if all 6 collectors ran
  if (ranAll) {
    const hasGenuineZeroPartial = collectorResults.some(cr => isGenuineZero(cr))
    if (status === 'trusted' && hasGenuineZeroPartial && !modifiers.includes('zero_signal_override')) {
      modifiers.push('zero_signal_override')
    }
  }

  // 2. Vulnerability status overrides (from tiered system)
  if (modifiers.includes('vulnerability_zero_override')) {
    status = 'blocked'
  } else if (modifiers.includes('vulnerability_patch_available') && status === 'trusted') {
    status = 'caution'
  }

  // 3. Repo archived/transferred overrides — re-evaluate if maintenance was re-run
  if (ranMaintenance) {
    const maintResultPartial = collectorResults.find(r => r?.key === 'maintenance')
    if (maintResultPartial?.result.metadata.repo_archived && !modifiers.includes('repo_archived')) {
      modifiers.push('repo_archived')
    }
    if (maintResultPartial?.result.metadata.repo_transferred && !modifiers.includes('repo_transferred')) {
      modifiers.push('repo_transferred')
    }
  }

  // 4. npm deprecated override — re-evaluate if publisher_trust was re-run
  if (ranPublisherTrust) {
    const pubResultDeprecated = collectorResults.find(r => r?.key === 'publisher_trust')
    if (pubResultDeprecated?.result.metadata.npm_deprecated && !modifiers.includes('npm_deprecated')) {
      modifiers.push('npm_deprecated')
    }
  }

  // 5. npm owner changed override — re-evaluate if publisher_trust was re-run
  if (ranPublisherTrust) {
    const pubResultPartial = collectorResults.find(r => r?.key === 'publisher_trust')
    if (pubResultPartial?.result.metadata.npm_maintainers) {
      const currMaintainers = pubResultPartial.result.metadata.npm_maintainers as string[]
      if (currMaintainers.length > 0) {
        const { data: prevHistoryPartial } = await supabase
          .from('signal_history')
          .select('metadata')
          .eq('service_id', service.id)
          .eq('signal_name', 'publisher_trust')
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single()
        const prevMaintainersPartial = (prevHistoryPartial?.metadata?.npm_maintainers ?? []) as string[]
        if (prevMaintainersPartial.length > 0) {
          const removed = prevMaintainersPartial.filter((m: string) =>
            !new Set(currMaintainers.map(c => c.toLowerCase())).has(m.toLowerCase())
          )
          if (removed.length > 0 && !modifiers.includes('npm_owner_changed')) {
            modifiers.push('npm_owner_changed')
          }
        }
      }
    }
  }

  // Apply remaining status overrides
  if (modifiers.includes('repo_archived') || modifiers.includes('npm_deprecated')) {
    status = 'blocked'
  }
  if (modifiers.includes('zero_signal_override') && status === 'trusted') {
    status = 'caution'
  }
  if (modifiers.includes('repo_transferred') && status === 'trusted') {
    status = 'caution'
  }
  if (modifiers.includes('npm_owner_changed') && status === 'trusted') {
    status = 'caution'
  }

  // Cap composite_score to match forced status range
  let finalScore = compositeScore
  if (modifiers.includes('vulnerability_zero_override') || modifiers.includes('repo_archived') || modifiers.includes('npm_deprecated')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('vulnerability_patch_available')) {
    finalScore = Math.min(finalScore, 2.99)
  } else if (modifiers.includes('zero_signal_override')) {
    finalScore = Math.min(finalScore, 2.99)
  }

  // Repo transfer penalty: freeze + apply -1.0
  if (modifiers.includes('repo_transferred')) {
    finalScore = Math.min(finalScore, oldComposite) // Freeze: can't go up
    finalScore = Math.max(finalScore - 1.0, 0.5)    // Apply -1.0 penalty
    finalScore = Math.min(finalScore, 2.99)          // Cap at caution range
  }

  // npm owner changed penalty
  if (modifiers.includes('npm_owner_changed')) {
    finalScore = Math.min(finalScore, oldComposite) // Freeze: can't go up
    finalScore = Math.max(finalScore - 0.5, 0.5)    // Apply -0.5 penalty
    finalScore = Math.min(finalScore, 2.99)          // Cap at caution range
  }

  // Trusted gate: must have vuln data + 4 signals with data to be trusted
  const signalsWithDataPartial = signalHasDataPartial.filter(Boolean).length
  const gateResultPartial = applyTrustedGate(finalScore, status, signalHasDataPartial[0], signalsWithDataPartial)
  if (gateResultPartial.gated) {
    finalScore = gateResultPartial.score
    status = gateResultPartial.status as 'trusted' | 'caution' | 'blocked'
    if (!modifiers.includes('trusted_gate')) modifiers.push('trusted_gate')
  }

  // Update composite, status, modifiers, and overridden signal values
  const partialUpdate: Record<string, unknown> = {
    raw_composite_score: compositeScore,
    composite_score: finalScore,
    status,
    active_modifiers: modifiers,
    signal_scores: signalScoresPartial,
  }
  // Persist overridden vulnerability signal value
  if (modifiers.includes('vulnerability_zero_override')) {
    partialUpdate.signal_vulnerability = 0
  } else if (modifiers.includes('vulnerability_patch_available') && signals[0] <= 1.5) {
    partialUpdate.signal_vulnerability = signals[0]
  }

  await supabase
    .from('services')
    .update(partialUpdate)
    .eq('id', service.id)

  // Record composite history
  await supabase.from('signal_history').insert({
    service_id: service.id,
    signal_name: 'composite',
    score: finalScore,
    metadata: { modifiers, partial_run: updatedKeys, signals_with_data: signalsWithDataPartial },
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
