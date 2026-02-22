import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * Operational Health Collector (weight: 0.20)
 *
 * Monitors active endpoints via HTTP health checks.
 * 99.9%+ uptime and sub-500ms p50 latency scores 5.0.
 * Behavioral inconsistency (different responses to identical inputs)
 * receives the heaviest penalty.
 *
 * Frequency: Every 15 minutes for high-traffic services
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
  bodyHash: string
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

    const body = await res.text()
    const latencyMs = Date.now() - start
    const bodyHash = crypto.createHash('sha256').update(body.slice(0, 2048)).digest('hex').slice(0, 16)

    return {
      statusCode: res.status,
      latencyMs,
      isUp: res.status >= 200 && res.status < 500,
      bodyHash,
      error: null,
    }
  } catch (err) {
    return {
      statusCode: null,
      latencyMs: Date.now() - start,
      isUp: false,
      bodyHash: '',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Derive a monitoring URL from the service's package registry.
 * Falls back to null if no registry info is available.
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
    // Use explicit endpoint, or derive from package registry
    const monitorUrl = service.endpoint_url || deriveMonitorUrl(service)

    if (!monitorUrl) {
      return {
        signal_name: 'operational',
        score: 4.0,
        metadata: { reason: 'no_endpoint_configured' },
        sources: [],
      }
    }

    // Ping the endpoint
    const result = await pingEndpoint(monitorUrl)

    // Store the health check
    const supabase = createServerClient()
    await supabase.from('health_checks').insert({
      service_id: service.id,
      status_code: result.statusCode,
      latency_ms: result.latencyMs,
      is_up: result.isUp,
      behavioral_hash: result.bodyHash,
      error_message: result.error,
    })

    // Fetch last 30 days of health checks for uptime calculation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString()
    const { data: checks } = await supabase
      .from('health_checks')
      .select('is_up, latency_ms, behavioral_hash')
      .eq('service_id', service.id)
      .gte('checked_at', thirtyDaysAgo)
      .order('checked_at', { ascending: false })

    if (!checks || checks.length === 0) {
      return {
        signal_name: 'operational',
        score: result.isUp ? 4.0 : 1.0,
        metadata: { first_check: true, is_up: result.isUp, latency_ms: result.latencyMs },
        sources: [monitorUrl],
      }
    }

    // Calculate uptime percentage
    const upCount = checks.filter(c => c.is_up).length
    const uptimePercent = (upCount / checks.length) * 100

    // Calculate p50 latency
    const latencies = checks
      .filter(c => c.latency_ms != null)
      .map(c => c.latency_ms!)
      .sort((a, b) => a - b)
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0

    // Check behavioral consistency (hash variance)
    const hashes = new Set(checks.filter(c => c.behavioral_hash).map(c => c.behavioral_hash))
    const behavioralConsistency = hashes.size <= 3 // Allow some variance for dynamic content

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

    // Behavioral inconsistency penalty
    if (!behavioralConsistency) {
      score -= 0.5
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
        uptime_percent: uptimePercent,
        p50_latency_ms: p50,
        p99_latency_ms: p99,
        total_checks: checks.length,
        behavioral_consistent: behavioralConsistency,
        unique_hashes: hashes.size,
      },
      sources: [monitorUrl],
    }
  },
}
