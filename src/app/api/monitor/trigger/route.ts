import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

const ALLOWED_ENDPOINTS: Record<string, { method: 'GET' | 'POST'; defaultParams?: Record<string, string> }> = {
  'collect-daily':        { method: 'GET', defaultParams: { offset: '0', batch: '50' } },
  'collect-cve':          { method: 'GET' },
  'collect-cve-fast':     { method: 'GET' },
  'collect-clawhub':      { method: 'GET' },
  'discover':             { method: 'GET' },
  'discover-ai-news':     { method: 'GET' },
  'discover-clawhub':     { method: 'GET' },
  'discover-mcp':         { method: 'GET' },
  'watchdog':             { method: 'GET' },
  'generate-assessments': { method: 'GET' },
  'enrich-metadata':      { method: 'GET' },
  'enrich-publishers':    { method: 'GET' },
  'recompute':            { method: 'GET' },
  'health-check':         { method: 'GET' },
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint, params } = await request.json() as {
    endpoint: string
    params?: Record<string, string>
  }

  const config = ALLOWED_ENDPOINTS[endpoint]
  if (!config) {
    return NextResponse.json(
      { error: `Unknown endpoint: ${endpoint}`, allowed: Object.keys(ALLOWED_ENDPOINTS) },
      { status: 400 },
    )
  }

  // Build the URL with query params
  const origin = request.nextUrl.origin
  const mergedParams = { ...config.defaultParams, ...params }
  const qs = Object.keys(mergedParams).length > 0
    ? '?' + new URLSearchParams(mergedParams).toString()
    : ''
  const url = `${origin}/api/cron/${endpoint}${qs}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url, {
      method: config.method,
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const body = await res.json().catch(() => null)
    return NextResponse.json({
      status: 'completed',
      httpStatus: res.status,
      endpoint,
      result: body,
    })
  } catch (err) {
    // AbortError means the 10s timeout hit — cron is still running server-side
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json({
        status: 'triggered',
        endpoint,
        message: `${endpoint} triggered successfully — still running (>10s)`,
      })
    }
    return NextResponse.json(
      { status: 'error', endpoint, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    )
  }
}
