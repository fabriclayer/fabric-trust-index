import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { githubHeaders } from '@/lib/collectors/github'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'

  // Run all queries in parallel
  const [
    // Service counts by status
    trustedCount, cautionCount, blockedCount, pendingCount, totalCount,
    // Table row counts
    signalHistoryCount, incidentsCount, cveRecordsCount, discoveryQueueCount,
    // Today's activity
    todayDiscovered, todaySignals,
    // Confidence distribution
    highConfidence, medConfidence, lowConfidence, minimalConfidence,
    // Stale scores
    staleCount,
    // AI assessments
    assessmentsTotal, assessmentsPending,
    // CVE summary
    cveCritical, cveHigh, cveMedium, cveLow, cveUnpatched,
    // Unresolved incidents
    unresolvedCritical, unresolvedWarning, unresolvedInfo,
    // Active overrides (can't easily do unnest in PostgREST, so fetch services with modifiers)
    servicesWithModifiers,
    // Fallback rates - count services at default values
    vulnFallback, opFallback, maintFallback, adoptFallback, transFallback, pubFallback,
    // Non-pending total for fallback % calculation
    nonPendingCount,
    // Discovery queue pending review
    discoveryPending,
    // GitHub rate limit
    githubRate,
    // Timeline: recent scoring activity (last 15 composites)
    recentScored,
    // Timeline: recent discoveries (last 15 services created)
    recentDiscovered,
    // Timeline: recent incidents (last 15)
    recentIncidents,
  ] = await Promise.all([
    // Status counts
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'trusted'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'caution'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }),
    // Table row counts
    supabase.from('signal_history').select('id', { count: 'exact', head: true }),
    supabase.from('incidents').select('id', { count: 'exact', head: true }),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }),
    supabase.from('discovery_queue').select('id', { count: 'exact', head: true }),
    // Today's activity
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('signal_history').select('id', { count: 'exact', head: true }).gte('recorded_at', today).eq('signal_name', 'composite'),
    // Confidence distribution
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signals_with_data', 6).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('signals_with_data', 4).lt('signals_with_data', 6).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).gte('signals_with_data', 1).lt('signals_with_data', 4).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).or('signals_with_data.is.null,signals_with_data.eq.0').neq('status', 'pending'),
    // Stale scores (>7 days)
    supabase.from('services').select('id', { count: 'exact', head: true }).lt('updated_at', new Date(Date.now() - 7 * 86400000).toISOString()).neq('status', 'pending'),
    // AI assessments
    supabase.from('services').select('id', { count: 'exact', head: true }).not('ai_assessment', 'is', null),
    supabase.from('services').select('id', { count: 'exact', head: true }).is('ai_assessment', null).neq('status', 'pending'),
    // CVE severity counts
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'high'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'medium'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('severity', 'low'),
    supabase.from('cve_records').select('id', { count: 'exact', head: true }).eq('is_patched', false),
    // Unresolved incidents by severity
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'critical'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'warning'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null).eq('severity', 'info'),
    // Services with active_modifiers for override counting
    supabase.from('services').select('active_modifiers').not('active_modifiers', 'eq', '{}'),
    // Fallback rate counts (services at default signal values, excluding pending)
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_vulnerability', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_operational', 2.5).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_maintenance', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_adoption', 3.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_transparency', 2.0).neq('status', 'pending'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('signal_publisher_trust', 2.5).neq('status', 'pending'),
    // Non-pending total for percentage calculation
    supabase.from('services').select('id', { count: 'exact', head: true }).neq('status', 'pending'),
    // Discovery queue - pending review items (limit 100)
    supabase.from('discovery_queue').select('*').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(100),
    // GitHub rate limit
    fetch('https://api.github.com/rate_limit', { headers: githubHeaders(), signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).catch(() => null),
    // Timeline: recent composites scored
    supabase.from('signal_history').select('service_id, score, recorded_at, services!inner(name, slug)').eq('signal_name', 'composite').order('recorded_at', { ascending: false }).limit(15),
    // Timeline: recent services discovered
    supabase.from('services').select('name, slug, status, composite_score, discovered_from, created_at').order('created_at', { ascending: false }).limit(15),
    // Timeline: recent incidents
    supabase.from('incidents').select('type, severity, title, score_at_time, created_at, services!inner(name, slug)').order('created_at', { ascending: false }).limit(15),
  ])

  // Count overrides from services with modifiers
  const overrideCounts: Record<string, number> = {}
  for (const svc of servicesWithModifiers.data ?? []) {
    for (const mod of (svc.active_modifiers as string[]) ?? []) {
      overrideCounts[mod] = (overrideCounts[mod] ?? 0) + 1
    }
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
      },
      github: githubRate ? {
        rateRemaining: githubRate.rate?.remaining ?? 0,
        rateLimit: githubRate.rate?.limit ?? 5000,
        resetsAt: githubRate.rate?.reset ? new Date(githubRate.rate.reset * 1000).toISOString() : null,
      } : { rateRemaining: 0, rateLimit: 5000, resetsAt: null },
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
    discoveryQueue: (discoveryPending.data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id,
      source: typeof d.source === 'string' ? d.source.replace('ai-news:', '') : d.source,
      created_at: d.created_at,
      ...(d.result as Record<string, unknown> ?? {}),
    })),
    timeline: [
      ...(recentScored.data ?? []).map((r: Record<string, unknown>) => {
        const svc = r.services as Record<string, unknown> | null
        return {
          type: 'scored' as const,
          name: svc?.name ?? 'Unknown',
          slug: svc?.slug ?? '',
          detail: `Composite: ${(r.score as number)?.toFixed(2)}`,
          timestamp: r.recorded_at as string,
        }
      }),
      ...(recentDiscovered.data ?? []).map((r: Record<string, unknown>) => ({
        type: 'discovered' as const,
        name: r.name as string,
        slug: r.slug as string,
        detail: `${r.discovered_from ?? 'manual'} · ${r.status}${r.composite_score ? ` · ${(r.composite_score as number).toFixed(2)}` : ''}`,
        timestamp: r.created_at as string,
      })),
      ...(recentIncidents.data ?? []).map((r: Record<string, unknown>) => {
        const svc = r.services as Record<string, unknown> | null
        return {
          type: 'incident' as const,
          name: svc?.name ?? 'Unknown',
          slug: svc?.slug ?? '',
          detail: r.title as string,
          severity: r.severity as string,
          timestamp: r.created_at as string,
        }
      }),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 30),
    timestamp: new Date().toISOString(),
  })
}
