import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { SIGNAL_ORDER, computeComposite, computeCompositeWithRedistribution, getStatus, applyTrustedGate } from '@/lib/scoring/thresholds'

export const maxDuration = 300

/**
 * Recompute composite scores from existing signal values in the database.
 * Does NOT re-run collectors — just recalculates composite + status.
 *
 * Two paths:
 * - New path (signal_scores JSONB present): uses weight redistribution from sub-signals
 * - Legacy path (signal_scores null): uses SIGNAL_DEFAULTS fallback logic
 *
 * POST body: { ids?: string[] }  (omit ids to recompute all)
 */

/** Default fallback values for legacy services without signal_scores */
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

  // Fetch services (exclude ClawHub skills — scored by separate pipeline)
  let query = supabase.from('services').select('*').neq('discovered_from', 'clawhub')
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

  // Pre-fetch vulnerability CVE status from latest signal_history for tiered overrides
  const vulnUnpatchedSet = new Set<string>()
  const vulnPatchAvailSet = new Set<string>()
  const lowVulnServices = services.filter(s => (s.signal_vulnerability ?? 0) <= 2.0)
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
      if (latest?.metadata?.has_critical_or_high_unpatched) {
        vulnUnpatchedSet.add(svc.id)
      } else if (latest?.metadata?.has_critical_or_high_patch_available) {
        vulnPatchAvailSet.add(svc.id)
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
    const serviceSignalScores = service.signal_scores as Record<string, { sub_signals?: Array<{ has_data: boolean }> }> | null

    // Build signal array
    const signalUpdates: Record<string, number> = {}
    const signals: number[] = []
    const signalHasData: boolean[] = []
    const fallbackSignals = new Set<string>()

    if (serviceSignalScores) {
      // ── New path: use signal_scores sub-signal data for weight redistribution ──
      for (const key of SIGNAL_ORDER) {
        const value = (service[`signal_${key}` as keyof typeof service] as number) ?? 0
        const entry = serviceSignalScores[key]
        const hasData = entry?.sub_signals?.some(s => s.has_data) ?? false

        signals.push(value)
        signalHasData.push(hasData)
        if (!hasData) fallbackSignals.add(key)
      }
    } else {
      // ── Legacy path: use SIGNAL_DEFAULTS fallback logic ──
      for (const key of SIGNAL_ORDER) {
        let value = (service[`signal_${key}` as keyof typeof service] as number) ?? 0
        const fallbackDefault = SIGNAL_DEFAULTS[key] ?? 3.0

        let isFallback = false

        if (key === 'publisher_trust') {
          if (!publisherGithubOrg) {
            isFallback = true
          } else if (value === 0) {
            isFallback = true
            modifiers.push('stale_publisher_trust')
          }
        } else if (key === 'transparency') {
          if (!service.github_repo) {
            isFallback = true
          } else if (value === 0) {
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
          signalHasData.push(false)
          if (value < fallbackDefault) {
            adjustments.push(`${key}: ${value}→${fallbackDefault}`)
            value = fallbackDefault
            signalUpdates[`signal_${key}`] = value
          }
        } else {
          signalHasData.push(true)
        }

        signals.push(value)
      }
    }

    // Store pre-override composite for raw_composite_score
    let rawComposite: number
    if (serviceSignalScores) {
      rawComposite = computeCompositeWithRedistribution(
        signals.map((score, i) => ({ score, has_data: signalHasData[i] }))
      ).score
    } else {
      rawComposite = computeComposite(signals)
    }

    // Vulnerability tiered overrides — modify signals BEFORE final composite
    if (!fallbackSignals.has('vulnerability')) {
      const hasUnpatched = vulnUnpatchedSet.has(service.id) ||
        (service.active_modifiers ?? []).includes('vulnerability_zero_override')
      const hasPatchAvail = vulnPatchAvailSet.has(service.id) ||
        (service.active_modifiers ?? []).includes('vulnerability_patch_available')

      if (hasUnpatched) {
        signals[0] = 0
        signalUpdates.signal_vulnerability = 0
        modifiers.push('vulnerability_zero_override')
      } else if (hasPatchAvail) {
        if (signals[0] > 1.5) {
          signals[0] = 1.5
          signalUpdates.signal_vulnerability = 1.5
        }
        modifiers.push('vulnerability_patch_available')
      }
    }

    // Recompute composite with any signal overrides applied
    let compositeScore: number
    if (serviceSignalScores) {
      compositeScore = computeCompositeWithRedistribution(
        signals.map((score, i) => ({ score, has_data: signalHasData[i] }))
      ).score
    } else {
      compositeScore = computeComposite(signals)
    }
    let status = getStatus(compositeScore)

    // Zero signal override — only for genuinely evaluated zeros (not fallbacks/stale)
    const genuineZeros: string[] = []
    for (let i = 0; i < SIGNAL_ORDER.length; i++) {
      if (signals[i] === 0 && !fallbackSignals.has(SIGNAL_ORDER[i])) {
        genuineZeros.push(SIGNAL_ORDER[i])
      }
    }
    if (!service.skip_zero_cap && status === 'trusted' && genuineZeros.length > 0) {
      status = 'caution'
      modifiers.push('zero_signal_override')
    }

    // Apply vulnerability status overrides
    if (modifiers.includes('vulnerability_zero_override')) {
      status = 'blocked'
    } else if (modifiers.includes('vulnerability_patch_available') && status === 'trusted') {
      status = 'caution'
    }

    // Cap composite_score to match forced status range
    let finalScore = compositeScore
    if (modifiers.includes('vulnerability_zero_override')) {
      finalScore = Math.min(finalScore, 0.99)
    } else if (modifiers.includes('vulnerability_patch_available')) {
      finalScore = Math.min(finalScore, 2.99)
    } else if (!service.skip_zero_cap && modifiers.includes('zero_signal_override')) {
      finalScore = Math.min(finalScore, 2.99)
    }

    // Trusted gate: must have vuln data + 4 signals with data to be trusted
    const signalsWithData = signalHasData.filter(Boolean).length
    if (!service.skip_zero_cap) {
      const gateResult = applyTrustedGate(finalScore, status, signalHasData[0], signalsWithData)
      if (gateResult.gated) {
        finalScore = gateResult.score
        status = gateResult.status as 'trusted' | 'caution' | 'blocked'
        modifiers.push('trusted_gate')
      }
    }

    // Update the service
    await supabase
      .from('services')
      .update({
        ...signalUpdates,
        raw_composite_score: rawComposite,
        composite_score: finalScore,
        status,
        active_modifiers: modifiers,
        score_confidence: signalsWithData / SIGNAL_ORDER.length,
        signals_with_data: signalsWithData,
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
