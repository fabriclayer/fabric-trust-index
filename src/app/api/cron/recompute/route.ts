import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { SIGNAL_ORDER, computeComposite, getStatus } from '@/lib/scoring/thresholds'

export const maxDuration = 300

/**
 * Recompute composite scores from existing signal values in the database.
 * Does NOT re-run collectors — just recalculates composite + status.
 *
 * Rules applied:
 * 1. Staleness: if a signal is 0.0 but the data source exists (github_repo for
 *    transparency/maintenance, publisher.github_org for publisher_trust), treat
 *    as failed collection and substitute the fallback default.
 * 2. No-data fallback: if a service has no data source for a signal, substitute
 *    the fallback default (2.5 for publisher_trust, 2.0 for transparency, etc.).
 * 3. Pending: services with no npm_package, no pypi_package, and no github_repo
 *    are set to status='pending', composite_score=0.
 * 4. Zero signal override only triggers for genuinely evaluated zeros.
 *
 * POST body: { ids?: string[] }  (omit ids to recompute all)
 */

/** Default fallback values for each signal when data is unavailable */
const SIGNAL_DEFAULTS: Record<string, number> = {
  vulnerability: 3.0,
  operational: 2.5,
  maintenance: 3.0,
  adoption: 3.0,
  transparency: 2.0,
  publisher_trust: 2.5,
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let ids: string[] | undefined
  try {
    const body = await request.json()
    ids = body.ids
  } catch {
    // No body sent — recompute all
  }

  const supabase = createServerClient()

  // Fetch services
  let query = supabase.from('services').select('*')
  if (ids && ids.length > 0) {
    query = query.in('id', ids)
  }
  const { data: services } = await query

  if (!services || services.length === 0) {
    return NextResponse.json({ error: 'No services found' }, { status: 404 })
  }

  // Pre-fetch publisher github_org for all services in one batch
  const publisherIds = [...new Set(services.map(s => s.publisher_id).filter(Boolean))]
  const publisherOrgMap = new Map<string, string | null>()
  if (publisherIds.length > 0) {
    // Supabase .in() has a limit, batch if needed
    for (let i = 0; i < publisherIds.length; i += 200) {
      const batch = publisherIds.slice(i, i + 200)
      const { data: pubs } = await supabase
        .from('publishers')
        .select('id, github_org')
        .in('id', batch)
      if (pubs) {
        for (const p of pubs) {
          publisherOrgMap.set(p.id, p.github_org)
        }
      }
    }
  }

  // Pre-fetch critical CVE status from latest vulnerability signal_history
  // Only check services with low vulnerability scores (optimization)
  const criticalCveSet = new Set<string>()
  const lowVulnServices = services.filter(s => (s.signal_vulnerability ?? 0) <= 1.0)
  for (let i = 0; i < lowVulnServices.length; i += 50) {
    const batch = lowVulnServices.slice(i, i + 50)
    for (const svc of batch) {
      const { data: latest } = await supabase
        .from('signal_history')
        .select('metadata')
        .eq('service_id', svc.id)
        .eq('signal_name', 'vulnerability')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()
      if (latest?.metadata?.has_critical_unpatched) {
        criticalCveSet.add(svc.id)
      }
    }
  }

  const results: Array<{
    name: string
    old_composite: number
    old_status: string
    composite_score: number
    status: string
    signal_vulnerability: number
    signal_operational: number
    signal_maintenance: number
    signal_adoption: number
    signal_transparency: number
    signal_publisher_trust: number
    active_modifiers: string[]
    adjustments: string[]
  }> = []

  let pendingCount = 0

  for (const service of services) {
    const adjustments: string[] = []
    const modifiers: string[] = []

    // Rule 2a: Preserve pending — services awaiting first collector run
    const isPendingEvaluation = service.status === 'pending' &&
      (service.active_modifiers ?? []).includes('pending_evaluation')
    // Rule 2b: Never-evaluated — all 6 signals at DB default of 3.0 (collectors never ran)
    const allSignalsAtDefault = SIGNAL_ORDER.every(
      key => ((service[`signal_${key}` as keyof typeof service] as number) ?? 0) === 3.0
    )
    // Rule 2c: No-data pending — services with zero scoreable data sources
    const hasNoData = !service.npm_package && !service.pypi_package && !service.github_repo && !service.endpoint_url
    if (hasNoData || isPendingEvaluation || allSignalsAtDefault) {
      pendingCount++
      await supabase
        .from('services')
        .update({
          composite_score: 0,
          status: 'pending',
          active_modifiers: ['pending_evaluation'],
        })
        .eq('id', service.id)

      results.push({
        name: service.name,
        old_composite: service.composite_score,
        old_status: service.status,
        composite_score: 0,
        status: 'pending',
        signal_vulnerability: service.signal_vulnerability ?? 0,
        signal_operational: service.signal_operational ?? 0,
        signal_maintenance: service.signal_maintenance ?? 0,
        signal_adoption: service.signal_adoption ?? 0,
        signal_transparency: service.signal_transparency ?? 0,
        signal_publisher_trust: service.signal_publisher_trust ?? 0,
        active_modifiers: ['pending_evaluation'],
        adjustments: ['no_data→pending'],
      })
      continue
    }

    const publisherGithubOrg = publisherOrgMap.get(service.publisher_id) ?? null

    // Build signal array with staleness + fallback checks
    const signalUpdates: Record<string, number> = {}
    const signals: number[] = []
    const fallbackSignals = new Set<string>()

    for (const key of SIGNAL_ORDER) {
      let value = (service[`signal_${key}` as keyof typeof service] as number) ?? 0
      const fallbackDefault = SIGNAL_DEFAULTS[key] ?? 3.0

      // Determine if this signal is a fallback or stale
      let isFallback = false

      if (key === 'publisher_trust') {
        // Fallback: no publisher github_org at all
        if (!publisherGithubOrg) {
          isFallback = true
        }
        // Stale: publisher HAS github_org but score is 0 (rate limit failure)
        else if (value === 0) {
          isFallback = true
          modifiers.push('stale_publisher_trust')
        }
      } else if (key === 'transparency') {
        // Fallback: no github_repo
        if (!service.github_repo) {
          isFallback = true
        }
        // Stale: HAS github_repo but score is 0 (rate limit failure)
        else if (value === 0) {
          isFallback = true
          modifiers.push('stale_transparency')
        }
      } else if (key === 'maintenance') {
        if (!service.github_repo) {
          isFallback = true
        }
      } else if (key === 'vulnerability') {
        if (!service.npm_package && !service.pypi_package) {
          isFallback = true
        }
      } else if (key === 'adoption') {
        if (!service.npm_package && !service.pypi_package) {
          isFallback = true
        }
      }

      if (isFallback) {
        fallbackSignals.add(key)
        if (value < fallbackDefault) {
          adjustments.push(`${key}: ${value}→${fallbackDefault}`)
          value = fallbackDefault
          signalUpdates[`signal_${key}`] = value
        }
      }

      signals.push(value)
    }

    // Recompute composite
    const compositeScore = computeComposite(signals)
    let status = getStatus(compositeScore)

    // Zero signal override — only for genuinely evaluated zeros (not fallbacks/stale)
    const genuineZeros: string[] = []
    for (let i = 0; i < SIGNAL_ORDER.length; i++) {
      if (signals[i] === 0 && !fallbackSignals.has(SIGNAL_ORDER[i])) {
        genuineZeros.push(SIGNAL_ORDER[i])
      }
    }

    if (status === 'trusted' && genuineZeros.length > 0) {
      status = 'caution'
      modifiers.push('zero_signal_override')
    }

    // Vulnerability overrides
    const vulnIdx = SIGNAL_ORDER.indexOf('vulnerability')
    if (signals[vulnIdx] === 0 && !fallbackSignals.has('vulnerability')) {
      status = 'blocked'
      modifiers.push('vulnerability_zero_override')
    }

    // Critical CVE override — from signal_history metadata or preserved from DB
    const hasCriticalCve = criticalCveSet.has(service.id) ||
      (service.active_modifiers ?? []).includes('critical_cve_override')
    if (hasCriticalCve && !fallbackSignals.has('vulnerability')) {
      status = 'blocked'
      if (!modifiers.includes('critical_cve_override')) modifiers.push('critical_cve_override')
    }

    // Cap composite_score to match forced status range
    let finalScore = compositeScore
    if (modifiers.includes('critical_cve_override') || modifiers.includes('vulnerability_zero_override')) {
      finalScore = Math.min(finalScore, 0.99)
    } else if (modifiers.includes('zero_signal_override')) {
      finalScore = Math.min(finalScore, 3.24)
    }

    // Update the service
    await supabase
      .from('services')
      .update({
        ...signalUpdates,
        raw_composite_score: compositeScore,
        composite_score: finalScore,
        status,
        active_modifiers: modifiers,
      })
      .eq('id', service.id)

    results.push({
      name: service.name,
      old_composite: service.composite_score,
      old_status: service.status,
      composite_score: finalScore,
      status,
      signal_vulnerability: signals[0],
      signal_operational: signals[1],
      signal_maintenance: signals[2],
      signal_adoption: signals[3],
      signal_transparency: signals[4],
      signal_publisher_trust: signals[5],
      active_modifiers: modifiers,
      adjustments,
    })
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    pending_count: pendingCount,
    results,
    timestamp: new Date().toISOString(),
  })
}
