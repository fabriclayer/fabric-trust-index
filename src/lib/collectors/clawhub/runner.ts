import { createServerClient } from '@/lib/supabase/server'
import type { DbService } from '@/lib/supabase/types'
import { getStatus } from '@/lib/scoring/thresholds'
import { getClawHubSkill, fetchSkillMd } from './api'
import { collectVirusTotalScan } from './virustotal'
import { collectContentSafety } from './content-safety'
import { collectPublisherReputation } from './publisher'
import { collectAdoption } from './adoption'
import { collectFreshness } from './freshness'
import { collectTransparency } from './transparency'
import { generateAssessment } from '@/lib/assessment-generator'

const CLAWHUB_WEIGHTS = {
  virustotal_scan: 0.30,
  content_safety: 0.25,
  publisher_reputation: 0.15,
  adoption: 0.10,
  freshness: 0.10,
  transparency: 0.10,
} as const

const CLAWHUB_SIGNAL_ORDER = [
  'virustotal_scan',
  'content_safety',
  'publisher_reputation',
  'adoption',
  'freshness',
  'transparency',
] as const

// Map ClawHub signals to the 6 DB columns
const SIGNAL_TO_COLUMN: Record<string, string> = {
  virustotal_scan: 'signal_vulnerability',
  content_safety: 'signal_operational',
  publisher_reputation: 'signal_publisher_trust',
  adoption: 'signal_adoption',
  freshness: 'signal_maintenance',
  transparency: 'signal_transparency',
}

function computeClawHubComposite(signals: Record<string, number>): number {
  let sum = 0
  for (const [name, weight] of Object.entries(CLAWHUB_WEIGHTS)) {
    sum += (signals[name] ?? 0) * weight
  }
  return Math.round(sum * 100) / 100
}

export async function runClawHubScoring(service: DbService): Promise<{
  success: string[]
  failed: string[]
}> {
  const supabase = createServerClient()
  const success: string[] = []
  const failed: string[] = []

  // 1. Fetch ClawHub API data
  const apiData = await getClawHubSkill(service.slug)
  const ownerHandle = apiData?.owner?.handle ?? null

  // 2. Fetch SKILL.md content (for content-safety + transparency)
  let skillContent: string | null = null
  if (ownerHandle) {
    skillContent = await fetchSkillMd(ownerHandle, service.slug)
  }

  // 3. Run all collectors
  const signals: Record<string, number> = {}
  const updates: Record<string, unknown> = {}

  // VirusTotal Scan (PRIMARY — weight 0.30)
  try {
    const result = await collectVirusTotalScan(apiData)
    signals.virustotal_scan = result.score
    updates[SIGNAL_TO_COLUMN.virustotal_scan] = result.score
    success.push('virustotal_scan')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'virustotal_scan',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('virustotal_scan')
    signals.virustotal_scan = 2.5
    console.error(`virustotal_scan failed for ${service.name}:`, err)
  }

  // Content Safety (weight 0.25)
  try {
    const result = await collectContentSafety(service.slug, ownerHandle)
    signals.content_safety = result.score
    updates[SIGNAL_TO_COLUMN.content_safety] = result.score
    success.push('content_safety')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'content_safety',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('content_safety')
    signals.content_safety = 2.5
    console.error(`content_safety failed for ${service.name}:`, err)
  }

  // Publisher Reputation (weight 0.15)
  try {
    const result = await collectPublisherReputation(ownerHandle)
    signals.publisher_reputation = result.score
    updates[SIGNAL_TO_COLUMN.publisher_reputation] = result.score
    success.push('publisher_reputation')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'publisher_reputation',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('publisher_reputation')
    signals.publisher_reputation = 2.5
    console.error(`publisher_reputation failed for ${service.name}:`, err)
  }

  // Adoption (weight 0.10)
  try {
    const result = collectAdoption(apiData)
    signals.adoption = result.score
    updates[SIGNAL_TO_COLUMN.adoption] = result.score
    success.push('adoption')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'adoption',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('adoption')
    signals.adoption = 2.5
    console.error(`adoption failed for ${service.name}:`, err)
  }

  // Freshness (weight 0.10)
  try {
    const result = collectFreshness(apiData)
    signals.freshness = result.score
    updates[SIGNAL_TO_COLUMN.freshness] = result.score
    success.push('freshness')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'freshness',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('freshness')
    signals.freshness = 2.5
    console.error(`freshness failed for ${service.name}:`, err)
  }

  // Transparency (weight 0.10)
  try {
    const result = collectTransparency(apiData, skillContent)
    signals.transparency = result.score
    updates[SIGNAL_TO_COLUMN.transparency] = result.score
    success.push('transparency')

    await supabase.from('signal_history').insert({
      service_id: service.id,
      signal_name: 'transparency',
      score: result.score,
      metadata: result.metadata,
    })
  } catch (err) {
    failed.push('transparency')
    signals.transparency = 2.5
    console.error(`transparency failed for ${service.name}:`, err)
  }

  // 4. Compute composite
  const compositeScore = computeClawHubComposite(signals)
  const oldComposite = service.composite_score
  const modifiers: string[] = []

  let status = getStatus(compositeScore)

  // Hard override: virustotal_scan ≤ 1.0 → blocked (malware detected)
  if (signals.virustotal_scan <= 1.0) {
    status = 'blocked'
    modifiers.push('vt_scan_override')
  }
  // Soft override: virustotal_scan ≤ 2.0 → caution (suspicious flag)
  else if (signals.virustotal_scan <= 2.0) {
    if (status === 'trusted') status = 'caution'
    modifiers.push('vt_suspicious_override')
  }

  // Hard override: content_safety ≤ 1.0 → blocked
  if (signals.content_safety <= 1.0) {
    status = 'blocked'
    modifiers.push('content_safety_override')
  }
  // Soft override: content_safety ≤ 2.0 → caution
  else if (signals.content_safety <= 2.0) {
    if (status === 'trusted') status = 'caution'
    modifiers.push('content_safety_caution_override')
  }

  let finalScore = compositeScore
  if (modifiers.includes('vt_scan_override') || modifiers.includes('content_safety_override')) {
    finalScore = Math.min(finalScore, 0.99)
  } else if (modifiers.includes('vt_suspicious_override') || modifiers.includes('content_safety_caution_override')) {
    finalScore = Math.min(finalScore, 2.99)
  }

  // Store owner handle for publisher link on product page
  if (ownerHandle) {
    updates.publisher_id = await ensureClawHubPublisher(ownerHandle, apiData?.owner?.displayName ?? ownerHandle)
  }

  updates.raw_composite_score = compositeScore
  updates.composite_score = finalScore
  updates.status = status
  updates.active_modifiers = modifiers

  // 5. Update service
  await supabase.from('services').update(updates).eq('id', service.id)

  // 6. Record composite history
  await supabase.from('signal_history').insert({
    service_id: service.id,
    signal_name: 'composite',
    score: finalScore,
    metadata: { modifiers, pipeline: 'clawhub' },
  })

  // 7. Create incidents
  await detectClawHubIncidents(service, oldComposite, finalScore, signals)

  // 8. Generate AI assessment if needed (non-blocking)
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

  return { success, failed }
}

/** Ensure a ClawHub publisher record exists, return publisher_id */
async function ensureClawHubPublisher(handle: string, displayName: string): Promise<string> {
  const supabase = createServerClient()
  const slug = handle.toLowerCase()

  // Try to find existing publisher
  const { data: existing } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) return existing.id

  // Create new publisher
  const { data: created } = await supabase
    .from('publishers')
    .insert({
      name: displayName,
      slug,
      website_url: `https://clawhub.ai/${handle}`,
      github_org: handle,
    })
    .select('id')
    .single()

  return created?.id ?? ''
}

async function detectClawHubIncidents(
  service: DbService,
  oldComposite: number,
  newComposite: number,
  signals: Record<string, number>,
): Promise<void> {
  const supabase = createServerClient()

  // Check if first run
  const { count } = await supabase
    .from('signal_history')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', service.id)
    .eq('signal_name', 'composite')

  const isFirstRun = (count ?? 0) <= 1

  if (isFirstRun) {
    await supabase.from('incidents').insert({
      service_id: service.id,
      type: 'initial_index',
      severity: 'info',
      title: `${service.name} added to Trust Index`,
      description: `Initial composite score: ${newComposite.toFixed(2)}/5.00 (ClawHub skill)`,
      score_at_time: newComposite,
    })
    return
  }

  // Score change >= 0.5
  const delta = newComposite - oldComposite
  if (Math.abs(delta) >= 0.5) {
    const direction = delta > 0 ? 'increased' : 'decreased'
    await supabase.from('incidents').insert({
      service_id: service.id,
      type: 'score_change',
      severity: delta < -0.5 ? 'warning' : 'info',
      title: `Trust score ${direction} by ${Math.abs(delta).toFixed(2)}`,
      description: `Score changed from ${oldComposite.toFixed(2)} to ${newComposite.toFixed(2)}`,
      score_at_time: newComposite,
    })
  }

  // VT malware detection (deduplicated)
  if (signals.virustotal_scan <= 1.0) {
    const { data: existing } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'cve_found')
      .eq('severity', 'critical')
      .is('resolved_at', null)
      .ilike('title', '%VirusTotal malware%')
      .limit(1)
      .single()

    if (!existing) {
      await supabase.from('incidents').insert({
        service_id: service.id,
        type: 'cve_found',
        severity: 'critical',
        title: 'VirusTotal malware detection',
        description: 'Skill flagged by VirusTotal or ClawHub moderation — malware blocked or multiple malicious detections',
        score_at_time: newComposite,
      })
    }
  }
  // VT suspicious detection (deduplicated)
  else if (signals.virustotal_scan <= 2.0) {
    const { data: existing } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'cve_found')
      .is('resolved_at', null)
      .ilike('title', '%VirusTotal suspicious%')
      .limit(1)
      .single()

    if (!existing) {
      await supabase.from('incidents').insert({
        service_id: service.id,
        type: 'cve_found',
        severity: 'warning',
        title: 'VirusTotal suspicious detection',
        description: 'Skill flagged as suspicious by VirusTotal — manual review recommended',
        score_at_time: newComposite,
      })
    }
  }

  // Content safety issues (deduplicated)
  if (signals.content_safety <= 1.0) {
    const { data: existing } = await supabase
      .from('incidents')
      .select('id')
      .eq('service_id', service.id)
      .eq('type', 'cve_found')
      .is('resolved_at', null)
      .ilike('title', '%Content safety%')
      .limit(1)
      .single()

    if (!existing) {
      await supabase.from('incidents').insert({
        service_id: service.id,
        type: 'cve_found',
        severity: 'critical',
        title: 'Content safety issues detected',
        description: 'SKILL.md contains suspicious patterns (potential secrets, dangerous commands, credential leaks, or config tampering)',
        score_at_time: newComposite,
      })
    }
  }
}
