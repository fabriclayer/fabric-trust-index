import { createServerClient } from '@/lib/supabase/server'

export const INFRA_ENDPOINTS = [
  { url: 'https://trust.fabriclayer.ai', label: 'Trust Index' },
  { url: 'https://trust.fabriclayer.ai/api/v1/score?slug=openai', label: 'Score API' },
  { url: 'https://fabriclayer.ai', label: 'Fabric Site' },
  { url: 'https://motherbird.au', label: 'Motherbird' },
  { url: 'https://api.github.com/rate_limit', label: 'GitHub API' },
  { url: 'https://osv.dev/v1/query', label: 'OSV.dev' },
  { url: 'https://registry.npmjs.org/express', label: 'npm Registry' },
] as const

export type EndpointStatus = 'up' | 'degraded' | 'down'

export interface EndpointResult {
  endpoint: string
  label: string
  status: EndpointStatus
  response_ms: number
  status_code: number | null
  error: string | null
}

async function pingEndpoint(url: string): Promise<{ status: EndpointStatus; response_ms: number; status_code: number | null; error: string | null }> {
  const start = Date.now()
  try {
    // OSV.dev requires POST
    const isOsv = url.includes('osv.dev')
    const res = await fetch(url, {
      method: isOsv ? 'POST' : 'HEAD',
      headers: isOsv ? { 'Content-Type': 'application/json' } : {},
      body: isOsv ? '{}' : undefined,
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
    const ms = Date.now() - start
    const code = res.status

    if (code >= 500) return { status: 'down', response_ms: ms, status_code: code, error: null }
    if (ms > 2000 || (code >= 300 && code < 400)) return { status: 'degraded', response_ms: ms, status_code: code, error: null }
    if (code >= 200 && code < 300) return { status: 'up', response_ms: ms, status_code: code, error: null }
    return { status: 'down', response_ms: ms, status_code: code, error: `Unexpected status ${code}` }
  } catch (err) {
    return { status: 'down', response_ms: Date.now() - start, status_code: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function pingAllEndpoints(): Promise<EndpointResult[]> {
  const results = await Promise.all(
    INFRA_ENDPOINTS.map(async (ep) => {
      const result = await pingEndpoint(ep.url)
      return { endpoint: ep.url, label: ep.label, ...result }
    })
  )
  return results
}

export async function storeResults(results: EndpointResult[]): Promise<void> {
  const supabase = createServerClient()

  // Insert new checks
  await supabase.from('infra_health_checks').insert(
    results.map(r => ({
      endpoint: r.endpoint,
      status: r.status,
      response_ms: r.response_ms,
      status_code: r.status_code,
      error: r.error,
    }))
  )

  // Prune rows older than 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('infra_health_checks').delete().lt('checked_at', cutoff)
}

export interface EndpointHealth {
  endpoint: string
  label: string
  status: EndpointStatus
  response_ms: number | null
  status_code: number | null
  last_checked: string
  uptime_24h: number
}

export async function getLatestResults(supabase: ReturnType<typeof createServerClient>): Promise<EndpointHealth[]> {
  // Get all checks from last 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await supabase
    .from('infra_health_checks')
    .select('endpoint, status, response_ms, status_code, checked_at')
    .gte('checked_at', cutoff)
    .order('checked_at', { ascending: false })

  if (!rows || rows.length === 0) return []

  // Group by endpoint
  const byEndpoint = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byEndpoint.get(r.endpoint) ?? []
    list.push(r)
    byEndpoint.set(r.endpoint, list)
  }

  // Build results with uptime calculation
  const results: EndpointHealth[] = []
  for (const ep of INFRA_ENDPOINTS) {
    const checks = byEndpoint.get(ep.url)
    if (!checks || checks.length === 0) continue

    const latest = checks[0]
    const upCount = checks.filter(c => c.status === 'up').length
    const uptime = Math.round((upCount / checks.length) * 1000) / 10

    results.push({
      endpoint: ep.url,
      label: ep.label,
      status: latest.status as EndpointStatus,
      response_ms: latest.response_ms,
      status_code: latest.status_code,
      last_checked: latest.checked_at,
      uptime_24h: uptime,
    })
  }

  return results
}
