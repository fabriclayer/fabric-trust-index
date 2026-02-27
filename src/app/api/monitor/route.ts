import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { githubHeaders } from '@/lib/collectors/github'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'

  // ── ESSENTIAL QUERIES (counts only — fast) ────────────────────
  const [
    trustedCount, cautionCount, blockedCount, pendingCount, totalCount,
    signalHistoryCount, incidentsCount, cveRecordsCount, discoveryQueueCount,
    todayDiscovered, todaySignals,
    highConfidence, medConfidence, lowConfidence, minimalConfidence,
    staleCount,
    assessmentsTotal, assessmentsPending,
    cveCritical, cveHigh, cveMedium, cveLow, cveUnpatched,
    unresolvedCritical, unresolvedWarning, unresolvedInfo,
    vulnFallback, opFallback, maintFallback, adoptFallback, transFallback, pubFallback,
    nonPendingCount,
    todayUpdated,
    discoveryQueuePendingCount,
  ] = await Promise.all([
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'trusted'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'caution'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }),
    supabase.from('signal_history').select('id', { count: 'exact', head: true }),
    supabase.from('incidents').select('id', { count: 'exact', head: true }),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }),
    supabase.from('discovery_queue').select('id', { count: 'exact', head: true }),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('signal_history').select('id', { count: 'exact', head: true }).gte('recorded_at', today).eq('signal_name', 'composite'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signals_with_data', 6).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('signals_with_data', 4).lt('signals_with_data', 6).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('signals_with_data', 1).lt('signals_with_data', 4).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).or('signals_with_data.is.null,signals_with_data.eq.0').neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).lt('updated_at', new Date(Date.now() - 7 * 86400000).toISOString()).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).not('ai_assessment', 'is', null),
    supabase.from('services').select('id', { count: 'exact', head: true }).is('ai_assessment', null).neq('status', 'pending'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'high'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'medium'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'low'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('is_patched', false),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'critical'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'warning'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'info'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_vulnerability', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_operational', 2.5).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_maintenance', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_adoption', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_transparency', 2.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_publisher_trust', 2.5).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('updated_at', today).neq('status', 'pending'),
    supabase.from('discovery_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ])

  // ── SECONDARY QUERIES (data fetches — may be slower) ──────────
  let overrideCounts: Record<string, number> = {}
  let discoveryQueue: Record<string, unknown>[] = []
  let timeline: { type: string; name: string; slug: string; detail: string; severity?: string; timestamp: string }[] = []
  let events: { type: string; name: string; slug: string; detail: string; severity?: string; timestamp: string }[] = []
  let githubRate: { rate?: { remaining: number; limit: number; reset: number } } | null = null
  let vercelData: { functionsInvoked: number; errors: number; avgLatency: number; p99Latency: number } | null = null
  let lastScoredAt: string | null = null
  let lastDiscoveredAt: string | null = null
  let lastIncidentAt: string | null = null

  try {
    const [
      servicesWithModifiers,
      discoveryPending,
      ghRate,
      vercelRaw,
      recentDiscovered,
      recentIncidents,
      lastComposite,
      lastCreated,
      lastIncidentRow,
      recentScored,
      recentCves,
    ] = await Promise.all([
      supabase.from('services').select('active_modifiers').not('active_modifiers', 'eq', '{}'),
      supabase.from('discovery_queue').select('id, source, created_at, result, status').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(100),
      fetch('https://api.github.com/rate_limit', { headers: githubHeaders(), signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).catch(() => null),
      // Vercel analytics (only if token configured)
      (process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID
        ? fetch(`https://api.vercel.com/v1/web/insights/stats?projectId=${process.env.VERCEL_PROJECT_ID}&from=${today}&to=${new Date().toISOString()}`, {
            headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null)
      ),
      // Lightweight event queries (no JOINs on signal_history)
      supabase.from('services').select('name, slug, status, composite_score, discovered_from, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('incidents').select('type, severity, title, score_at_time, created_at, service_id').order('created_at', { ascending: false }).limit(50),
      supabase.from('signal_history').select('recorded_at').eq('signal_name', 'composite').order('recorded_at', { ascending: false }).limit(1),
      supabase.from('services').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('incidents').select('created_at').order('created_at', { ascending: false }).limit(1),
      // Additional event sources
      supabase.from('services').select('name, slug, composite_score, status, updated_at').neq('status', 'pending').order('updated_at', { ascending: false }).limit(50),
      supabase.from('cve_records').select('cve_id, severity, is_patched, package_name, created_at').order('created_at', { ascending: false }).limit(30),
    ])

    // Override counts
    for (const svc of servicesWithModifiers.data ?? []) {
      for (const mod of (svc.active_modifiers as string[]) ?? []) {
        overrideCounts[mod] = (overrideCounts[mod] ?? 0) + 1
      }
    }

    // Discovery queue
    if (discoveryPending.error) {
      console.error('Discovery queue query error:', discoveryPending.error)
    }
    discoveryQueue = (discoveryPending.data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id,
      source: typeof d.source === 'string' ? d.source.replace('ai-news:', '') : d.source,
      created_at: d.created_at,
      ...(d.result as Record<string, unknown> ?? {}),
    }))

    githubRate = ghRate

    // Vercel analytics
    if (vercelRaw) {
      try {
        const d = vercelRaw.data ?? vercelRaw
        vercelData = {
          functionsInvoked: d.totalInvocations ?? d.functions?.invocations ?? 0,
          errors: d.totalErrors ?? d.functions?.errors ?? 0,
          avgLatency: d.avgDuration ?? d.functions?.avgDuration ?? 0,
          p99Latency: d.p99Duration ?? d.functions?.p99Duration ?? 0,
        }
      } catch { /* ignore parse errors */ }
    }

    // Timeline (no expensive JOINs)
    const discoveredEvents = (recentDiscovered.data ?? []).map((r: Record<string, unknown>) => ({
      type: 'discovered' as const,
      name: r.name as string,
      slug: r.slug as string,
      detail: `${r.discovered_from ?? 'manual'} · ${r.status}${r.composite_score ? ` · ${(r.composite_score as number).toFixed(2)}` : ''}`,
      timestamp: r.created_at as string,
    }))
    const incidentEvents = (recentIncidents.data ?? []).map((r: Record<string, unknown>) => ({
      type: 'incident' as const,
      name: '',
      slug: '',
      detail: r.title as string,
      severity: r.severity as string,
      timestamp: r.created_at as string,
    }))
    timeline = [...discoveredEvents, ...incidentEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30)

    // Full events feed (all event types)
    const scoredEvents = (recentScored.data ?? []).map((r: Record<string, unknown>) => ({
      type: 'scored' as const,
      name: r.name as string,
      slug: r.slug as string,
      detail: `${r.status}${r.composite_score ? ` · ${(r.composite_score as number).toFixed(2)}` : ''}`,
      timestamp: r.updated_at as string,
    }))
    const cveEvents = (recentCves.data ?? []).map((r: Record<string, unknown>) => ({
      type: 'cve' as const,
      name: r.cve_id as string,
      slug: '',
      detail: `${r.severity} · ${r.package_name || 'unknown'}${r.is_patched ? ' · patched' : ' · unpatched'}`,
      severity: r.severity as string,
      timestamp: r.created_at as string,
    }))
    events = [...discoveredEvents, ...incidentEvents, ...scoredEvents, ...cveEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 200)

    // Schedule timestamps
    lastScoredAt = (lastComposite.data as Record<string, unknown>[])?.[0]?.recorded_at as string | null ?? null
    lastDiscoveredAt = (lastCreated.data as Record<string, unknown>[])?.[0]?.created_at as string | null ?? null
    lastIncidentAt = (lastIncidentRow.data as Record<string, unknown>[])?.[0]?.created_at as string | null ?? null
  } catch (err) {
    console.error('Secondary monitor queries failed:', err)
  }

  const np = nonPendingCount.count ?? 1

  return NextResponse.json({
    overview: {
      total: totalCount.count ?? 0,
      trusted: trustedCount.count ?? 0,
      caution: cautionCount.count ?? 0,
      blocked: blockedCount.count ?? 0,
      pending: pendingCount.count ?? 0,
      todayDiscovered: todayDiscovered.count ?? 0,
      todayScored: todaySignals.count ?? 0,
    },
    health: {
      supabase: {
        rowsServices: totalCount.count ?? 0,
        rowsSignalHistory: signalHistoryCount.count ?? 0,
        rowsIncidents: incidentsCount.count ?? 0,
        rowsCveRecords: cveRecordsCount.count ?? 0,
        rowsDiscoveryQueue: discoveryQueueCount.count ?? 0,
        rowsDiscoveryPending: discoveryQueuePendingCount.count ?? 0,
      },
      github: githubRate ? {
        rateRemaining: githubRate.rate?.remaining ?? 0,
        rateLimit: githubRate.rate?.limit ?? 5000,
        resetsAt: githubRate.rate?.reset ? new Date(githubRate.rate.reset * 1000).toISOString() : null,
      } : { rateRemaining: 0, rateLimit: 5000, resetsAt: null },
      vercel: vercelData,
      scoring: {
        confidenceHigh: highConfidence.count ?? 0,
        confidenceMed: medConfidence.count ?? 0,
        confidenceLow: lowConfidence.count ?? 0,
        confidenceMinimal: minimalConfidence.count ?? 0,
        fallbackRates: {
          vulnerability: Math.round(((vulnFallback.count ?? 0) / np) * 100),
          operational: Math.round(((opFallback.count ?? 0) / np) * 100),
          maintenance: Math.round(((maintFallback.count ?? 0) / np) * 100),
          adoption: Math.round(((adoptFallback.count ?? 0) / np) * 100),
          transparency: Math.round(((transFallback.count ?? 0) / np) * 100),
          publisher_trust: Math.round(((pubFallback.count ?? 0) / np) * 100),
        },
        staleCount: staleCount.count ?? 0,
        overrideCounts,
      },
      assessments: {
        total: assessmentsTotal.count ?? 0,
        pending: assessmentsPending.count ?? 0,
      },
    },
    cves: {
      total: cveRecordsCount.count ?? 0,
      critical: cveCritical.count ?? 0,
      high: cveHigh.count ?? 0,
      medium: cveMedium.count ?? 0,
      low: cveLow.count ?? 0,
      unpatched: cveUnpatched.count ?? 0,
    },
    incidents: {
      total: incidentsCount.count ?? 0,
      unresolved: (unresolvedCritical.count ?? 0) + (unresolvedWarning.count ?? 0) + (unresolvedInfo.count ?? 0),
      critical: unresolvedCritical.count ?? 0,
      warning: unresolvedWarning.count ?? 0,
      info: unresolvedInfo.count ?? 0,
    },
    discoveryQueue,
    timeline,
    events,
    schedule: {
      lastScoredAt,
      lastDiscoveredAt,
      lastIncidentAt,
      todayUpdated: todayUpdated.count ?? 0,
      totalNonPending: nonPendingCount.count ?? 0,
    },
    timestamp: new Date().toISOString(),
  })
}
