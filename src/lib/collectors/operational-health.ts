import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Operational Health Collector (weight: 0.15)
 *
 * Monitors active endpoints via HTTP health checks.
 * Real endpoint_url monitoring can score up to 5.0.
 * Registry-derived pings (npm/PyPI/GitHub) are capped at 4.5.
 *
 * Frequency: Every 15 minutes for services with endpoint_url
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

    // Consume body to complete the response
    await res.text()
    const latencyMs = Date.now() - start

    // 200-399 = up, 400-499 = degraded, 500+ = down
    const isUp = res.status >= 200 && res.status < 400
    const isDegraded = res.status >= 400 && res.status < 500

    return {
      statusCode: res.status,
      latencyMs,
      isUp: isUp || isDegraded, // reachable for uptime counting
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

/**
 * Derive a monitoring URL from the service's package registry.
 */
function deriveMonitorUrl(service: DbService): string | null {
  if (service.npm_package) return `https://registry.npmjs.org/${service.npm_package}`
  if (service.pypi_package) return `https://pypi.org/pypi/${service.pypi_package}/json`
  if (service.github_repo) return `https://api.github.com/repos/${service.github_repo}`
  return null
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
        score: 2.5,
        metadata: { reason: 'no_endpoint_configured', source_type: sourceType },
        sources: [],
      }
    }

    const result = await pingEndpoint(monitorUrl)

    // Store the health check
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

    if (!checks || checks.length === 0) {
      let firstScore = result.isUp ? 4.0 : 1.0
      if (sourceType === 'registry') firstScore = Math.min(firstScore, 4.5)
      return {
        signal_name: 'operational',
        score: firstScore,
        metadata: { first_check: true, is_up: result.isUp, latency_ms: result.latencyMs, source_type: sourceType },
        sources: [monitorUrl],
      }
    }

    // Calculate uptime percentage
    const upCount = checks.filter(c => c.is_up).length
    const uptimePercent = (upCount / checks.length) * 100

    // Count degraded checks (4xx responses)
    const degradedCount = checks.filter(c => c.status_code && c.status_code >= 400 && c.status_code < 500).length

    // Calculate latency percentiles
    const latencies = checks
      .filter(c => c.latency_ms != null)
      .map(c => c.latency_ms!)
      .sort((a, b) => a - b)
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0

    // Score calculation
    let score = 5.0

    // Uptime deductions: each 0.1% below 99.9% = -0.1
    if (uptimePercent < 99.9) {
      const deficit = (99.9 - uptimePercent) / 0.1
      score -= deficit * 0.1
    }

    // Latency deductions: each 200ms above 500ms = -0.2
    if (p50 > 500) {
      const excess = Math.floor((p50 - 500) / 200)
      score -= excess * 0.2
    }

    // Degraded check penalty: -0.1 per 4xx check
    if (degradedCount > 0) {
      score -= degradedCount * 0.1
    }

    // Cap registry-derived pings at 4.5
    if (sourceType === 'registry') {
      score = Math.min(score, 4.5)
    }

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
      score: clampScore(score),
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
