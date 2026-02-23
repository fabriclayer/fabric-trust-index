import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { SIGNAL_ORDER, computeComposite, getStatus } from '@/lib/scoring/thresholds'

export const maxDuration = 300

/**
 * Recompute composite scores from existing signal values in the database.
 * Does NOT re-run collectors — just recalculates composite + status.
 *
 * Applies new defaults for signals that were stored as fallbacks:
 * - publisher_trust: 0.0 → 2.5 (when signal_history shows fallback reason)
 * - transparency: keeps existing value (already 2.0 for no_github_repo)
 *
 * POST body: { ids?: string[] }  (omit ids to recompute all)
 */

const FALLBACK_REASONS = new Set([
  'no_github_repo',
  'no_packages_to_scan',
  'no_endpoint_configured',
  'no_download_data',
  'publisher_not_found',
  'no_publisher_github',
  'osv_api_unavailable',
])

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const ids: string[] | undefined = body.ids

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

  for (const service of services) {
    const adjustments: string[] = []

    // Read latest signal_history for each signal to check for fallback reasons
    const fallbackSignals = new Set<string>()

    for (const signalName of SIGNAL_ORDER) {
      const { data: history } = await supabase
        .from('signal_history')
        .select('metadata')
        .eq('service_id', service.id)
        .eq('signal_name', signalName)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()

      const reason = (history?.metadata as Record<string, unknown>)?.reason as string | undefined
      if (reason && FALLBACK_REASONS.has(reason)) {
        fallbackSignals.add(signalName)
      }
    }

    // Build signal array, applying default adjustments for fallback zeros
    const signalUpdates: Record<string, number> = {}
    const signals: number[] = []

    for (const key of SIGNAL_ORDER) {
      let value = (service[`signal_${key}` as keyof typeof service] as number) ?? 0

      // Apply new defaults for fallback signals that stored inappropriately low values
      if (key === 'publisher_trust' && value < 2.5 && fallbackSignals.has(key)) {
        adjustments.push(`publisher_trust: ${value}→2.5 (fallback)`)
        value = 2.5
        signalUpdates[`signal_${key}`] = value
      }

      signals.push(value)
    }

    // Recompute composite
    const compositeScore = computeComposite(signals)
    const modifiers: string[] = []
    let status = getStatus(compositeScore)

    // Zero signal override — only for genuinely evaluated zeros (not fallbacks)
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

    // Update the service
    await supabase
      .from('services')
      .update({
        ...signalUpdates,
        composite_score: compositeScore,
        status,
        active_modifiers: modifiers,
      })
      .eq('id', service.id)

    results.push({
      name: service.name,
      old_composite: service.composite_score,
      old_status: service.status,
      composite_score: compositeScore,
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
    results,
    timestamp: new Date().toISOString(),
  })
}
