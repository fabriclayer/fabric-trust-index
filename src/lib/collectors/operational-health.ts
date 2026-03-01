import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult, SubSignalScore } from './types'
import { clampScore, computeSubSignalScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Operational Health Collector (weight: 0.15)
 *
 * Sub-signals:
 *   - uptime (0.35)           — 30-day rolling uptime %
 *   - response_latency (0.25) — p99 response time
 *   - error_rate (0.20)       — % of checks returning non-2xx
 *   - incident_history (0.20) — count of incidents in last 90 days
 */

function headersForUrl(url: string): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'FabricTrustMonitor/1.0' }
  if (url.includes('api.github.com') && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    headers.Accept = 'application/vnd.github.v3+json'
  }
  return headers
}

async function pingEndpoint(url: string): Promise<{
  statusCode: number | null
  latencyMs: number
  isUp: boolean
  isDegraded: boolean
  error: string | null
}> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: headersForUrl(url),
    })
    clearTimeout(timeout)

    await res.text()
    const latencyMs = Date.now() - start

    const isUp = res.status >= 200 && res.status < 400
    const isDegraded = res.status >= 400 && res.status < 500

    return {
      statusCode: res.status,
      latencyMs,
      isUp: isUp || isDegraded,
      isDegraded,
      error: null,
    }
  } catch (err) {
    return {
      statusCode: null,
      latencyMs: Date.now() - start,
      isUp: false,
      isDegraded: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

function deriveMonitorUrl(service: DbService): string | null {
  if (service.npm_package) return `https://registry.npmjs.org/${service.npm_package}`
  if (service.pypi_package) return `https://pypi.org/pypi/${service.pypi_package}/json`
  if (service.github_repo) return `https://api.github.com/repos/${service.github_repo}`
  return null
}

function scoreUptime(uptimePercent: number): number {
  if (uptimePercent >= 99.9) return 5.0
  if (uptimePercent >= 99.5) return 4.5
  if (uptimePercent >= 99.0) return 4.0
  if (uptimePercent >= 95.0) return 3.0
  if (uptimePercent >= 90.0) return 2.0
  return 1.0
}

function scoreLatency(p99Ms: number): number {
  if (p99Ms < 200) return 5.0
  if (p99Ms <= 500) return 4.0
  if (p99Ms <= 1000) return 3.0
  if (p99Ms <= 3000) return 2.0
  return 1.0
}

function scoreErrorRate(errorRate: number): number {
  if (errorRate === 0) return 5.0
  if (errorRate < 0.01) return 4.0
  if (errorRate < 0.05) return 3.0
  if (errorRate < 0.10) return 2.0
  return 1.0
}

function scoreIncidentCount(count: number): number {
  if (count === 0) return 5.0
  if (count === 1) return 4.0
  if (count <= 3) return 3.0
  if (count <= 5) return 2.0
  return 1.0
}

export const operationalHealthCollector: Collector = {
  name: 'operational',

  async collect(service: DbService): Promise<CollectorResult> {
    const isRealEndpoint = !!service.endpoint_url
    const monitorUrl = service.endpoint_url || deriveMonitorUrl(service)
    const sourceType: 'endpoint' | 'registry' = isRealEndpoint ? 'endpoint' : 'registry'

    if (!monitorUrl) {
      return {
        signal_name: 'operational',
        score: 0,
        sub_signals: [
          { name: 'uptime', score: 0, weight: 0.35, has_data: false },
          { name: 'response_latency', score: 0, weight: 0.25, has_data: false },
          { name: 'error_rate', score: 0, weight: 0.20, has_data: false },
          { name: 'incident_history', score: 0, weight: 0.20, has_data: false },
        ],
        metadata: { reason: 'no_endpoint_configured' },
        sources: [],
      }
    }

    const result = await pingEndpoint(monitorUrl)

    const supabase = createServerClient()
    await supabase.from('health_checks').insert({
      service_id: service.id,
      status_code: result.statusCode,
      latency_ms: result.latencyMs,
      is_up: result.isUp,
      error_message: result.error,
    })

    // Fetch last 30 days of health checks
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString()
    const { data: checks } = await supabase
      .from('health_checks')
      .select('is_up, latency_ms, status_code')
      .eq('service_id', service.id)
      .gte('checked_at', thirtyDaysAgo)
      .order('checked_at', { ascending: false })

    // Query incident count in last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600000).toISOString()
    const { count: incidentCount } = await supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', service.id)
      .gte('created_at', ninetyDaysAgo)

    const resolvedIncidentCount = incidentCount ?? 0

    if (!checks || checks.length === 0) {
      const uptimeSubScore = result.isUp ? 5.0 : 1.0
      const latencySubScore = result.isUp ? scoreLatency(result.latencyMs) : 0
      const errorSubScore = result.isUp ? 5.0 : 1.0
      const incidentSubScore = scoreIncidentCount(resolvedIncidentCount)

      const sub_signals: SubSignalScore[] = [
        { name: 'uptime', score: uptimeSubScore, weight: 0.35, has_data: true, detail: `First check: ${result.isUp ? 'up' : 'down'}` },
        { name: 'response_latency', score: latencySubScore, weight: 0.25, has_data: result.isUp, detail: result.isUp ? `${result.latencyMs}ms` : 'Endpoint unreachable' },
        { name: 'error_rate', score: errorSubScore, weight: 0.20, has_data: true, detail: result.isUp ? '0% errors' : '100% errors' },
        { name: 'incident_history', score: incidentSubScore, weight: 0.20, has_data: true, detail: `${resolvedIncidentCount} incidents in 90d` },
      ]

      return {
        signal_name: 'operational',
        score: computeSubSignalScore(sub_signals),
        sub_signals,
        metadata: { first_check: true, is_up: result.isUp, latency_ms: result.latencyMs, source_type: sourceType },
        sources: [monitorUrl],
      }
    }

    // Calculate metrics
    const upCount = checks.filter(c => c.is_up).length
    const uptimePercent = (upCount / checks.length) * 100

    const degradedCount = checks.filter(c => c.status_code && c.status_code >= 400 && c.status_code < 500).length

    const nonSuccessCount = checks.filter(c => !c.is_up || (c.status_code && (c.status_code < 200 || c.status_code >= 300))).length
    const errorRate = checks.length > 0 ? nonSuccessCount / checks.length : 0

    const latencies = checks
      .filter(c => c.latency_ms != null)
      .map(c => c.latency_ms!)
      .sort((a, b) => a - b)
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0

    const sub_signals: SubSignalScore[] = [
      {
        name: 'uptime',
        score: scoreUptime(uptimePercent),
        weight: 0.35,
        has_data: true,
        detail: `${uptimePercent.toFixed(2)}% over ${checks.length} checks`,
      },
      {
        name: 'response_latency',
        score: latencies.length > 0 ? scoreLatency(p99) : 0,
        weight: 0.25,
        has_data: latencies.length > 0,
        detail: latencies.length > 0 ? `p99: ${p99}ms, p50: ${p50}ms` : 'No latency data',
      },
      {
        name: 'error_rate',
        score: scoreErrorRate(errorRate),
        weight: 0.20,
        has_data: true,
        detail: `${(errorRate * 100).toFixed(2)}% error rate (${nonSuccessCount}/${checks.length})`,
      },
      {
        name: 'incident_history',
        score: scoreIncidentCount(resolvedIncidentCount),
        weight: 0.20,
        has_data: true,
        detail: `${resolvedIncidentCount} incidents in last 90 days`,
      },
    ]

    const score = computeSubSignalScore(sub_signals)

    // Update service operational metrics
    await supabase
      .from('services')
      .update({
        uptime_30d: Math.round(uptimePercent * 100) / 100,
        avg_latency_ms: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
        p50_latency_ms: p50,
        p99_latency_ms: p99,
      })
      .eq('id', service.id)

    return {
      signal_name: 'operational',
      score,
      sub_signals,
      metadata: {
        source_type: sourceType,
        uptime_percent: uptimePercent,
        p50_latency_ms: p50,
        p99_latency_ms: p99,
        total_checks: checks.length,
        degraded_checks: degradedCount,
      },
      sources: [monitorUrl],
    }
  },
}
