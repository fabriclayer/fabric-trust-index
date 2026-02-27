import { createServerClient } from '@/lib/supabase/server'

export interface CronHealthItem {
  cronId: string
  name: string
  schedule: string
  expectedIntervalMs: number
  lastRunAt: string | null
  status: 'on_schedule' | 'overdue' | 'missed'
  nextExpectedAt: string
}

interface CronDef {
  id: string
  name: string
  schedule: string
  expectedIntervalMs: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectLastRun: (supabase: any) => Promise<string | null>
}

const CRON_DEFS: CronDef[] = [
  {
    id: 'collect-daily',
    name: 'Daily Scoring',
    schedule: '0 2 * * *',
    expectedIntervalMs: 26 * 3600000, // 26h grace
    detectLastRun: async (sb) => {
      const { data } = await sb.from('signal_history').select('recorded_at').eq('signal_name', 'composite').order('recorded_at', { ascending: false }).limit(1)
      return data?.[0]?.recorded_at ?? null
    },
  },
  {
    id: 'collect-cve',
    name: 'CVE Full Scan',
    schedule: '0 * * * *',
    expectedIntervalMs: 2 * 3600000, // 2h grace
    detectLastRun: async (sb) => {
      const { data } = await sb.from('cve_records').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'collect-cve-fast',
    name: 'CVE Fast-Path',
    schedule: '*/5 * * * *',
    expectedIntervalMs: 15 * 60000, // 15m grace
    detectLastRun: async (sb) => {
      // Uses same cve_records table — detect by most recent
      const { data } = await sb.from('cve_records').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'health-check',
    name: 'Health Check',
    schedule: '*/15 * * * *',
    expectedIntervalMs: 30 * 60000, // 30m grace
    detectLastRun: async (sb) => {
      const { data } = await sb.from('infra_health_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1)
      return data?.[0]?.checked_at ?? null
    },
  },
  {
    id: 'discover',
    name: 'Registry Discovery',
    schedule: '0 4 * * *',
    expectedIntervalMs: 26 * 3600000,
    detectLastRun: async (sb) => {
      const { data } = await sb.from('services').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'discover-ai-news',
    name: 'AI News Scanner',
    schedule: '30 4 * * *',
    expectedIntervalMs: 26 * 3600000,
    detectLastRun: async (sb) => {
      const { data } = await sb.from('discovery_queue').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'watchdog',
    name: 'Watchdog QA',
    schedule: '0 3 * * *',
    expectedIntervalMs: 26 * 3600000,
    detectLastRun: async (sb) => {
      const { data } = await sb.from('incidents').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'review-dashboard',
    name: 'AI Review',
    schedule: '0 10,22 * * *',
    expectedIntervalMs: 14 * 3600000, // 14h grace
    detectLastRun: async (sb) => {
      const { data } = await sb.from('monitor_reviews').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
]

export async function checkCronHealth(supabase: ReturnType<typeof createServerClient>): Promise<CronHealthItem[]> {
  const now = Date.now()

  const lastRuns = await Promise.all(
    CRON_DEFS.map(async (cron) => {
      try {
        return await cron.detectLastRun(supabase)
      } catch {
        return null
      }
    })
  )

  return CRON_DEFS.map((cron, i) => {
    const lastRunAt = lastRuns[i]
    let status: CronHealthItem['status'] = 'on_schedule'

    if (lastRunAt) {
      const elapsed = now - new Date(lastRunAt).getTime()
      if (elapsed > cron.expectedIntervalMs * 2) status = 'missed'
      else if (elapsed > cron.expectedIntervalMs) status = 'overdue'
    } else {
      status = 'missed' // never ran
    }

    // Calculate next expected run (simple: lastRun + interval)
    const nextExpectedAt = lastRunAt
      ? new Date(new Date(lastRunAt).getTime() + cron.expectedIntervalMs).toISOString()
      : new Date().toISOString()

    return {
      cronId: cron.id,
      name: cron.name,
      schedule: cron.schedule,
      expectedIntervalMs: cron.expectedIntervalMs,
      lastRunAt,
      status,
      nextExpectedAt,
    }
  })
}

export function deriveSystemStatus(
  endpoints: Array<{ status: string; endpoint?: string }>,
  cronHealth: CronHealthItem[],
  githubRateRemaining: number,
): 'nominal' | 'degraded' | 'outage' {
  const downEndpoints = endpoints.filter(e => e.status === 'down')
  const degradedEndpoints = endpoints.filter(e => e.status === 'degraded')
  const missedCrons = cronHealth.filter(c => c.status === 'missed')
  const overdueCrons = cronHealth.filter(c => c.status === 'overdue')

  // Critical endpoint down = outage
  const criticalDown = downEndpoints.some(e => e.endpoint?.includes('trust.fabriclayer'))
  if (criticalDown) return 'outage'

  // 2+ endpoints down or any missed cron = outage
  if (downEndpoints.length >= 2 || missedCrons.length > 0) return 'outage'

  // Any degraded/down endpoint, overdue cron, or low GitHub rate = degraded
  if (degradedEndpoints.length > 0 || overdueCrons.length > 0 || downEndpoints.length > 0) return 'degraded'
  if (githubRateRemaining < 100) return 'degraded'

  return 'nominal'
}
