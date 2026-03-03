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
  /** Fallback detection if cron_runs table has no entry for this cron */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallbackDetect?: (supabase: any) => Promise<string | null>
}

const CRON_DEFS: CronDef[] = [
  {
    id: 'collect-daily',
    name: 'Daily Scoring',
    schedule: '0 2 * * *',
    expectedIntervalMs: 26 * 3600000, // 26h grace
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('signal_history').select('recorded_at').eq('signal_name', 'composite').order('recorded_at', { ascending: false }).limit(1)
      return data?.[0]?.recorded_at ?? null
    },
  },
  {
    id: 'collect-cve',
    name: 'CVE Full Scan',
    schedule: '0 * * * *',
    expectedIntervalMs: 2 * 3600000, // 2h grace
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('signal_history').select('recorded_at').eq('signal_name', 'vulnerability').order('recorded_at', { ascending: false }).limit(1)
      return data?.[0]?.recorded_at ?? null
    },
  },
  {
    id: 'collect-cve-fast',
    name: 'CVE Fast-Path',
    schedule: '*/5 * * * *',
    expectedIntervalMs: 15 * 60000, // 15m grace
    // No fallback — checkpoint writes to signal_history fail due to FK constraint on service_id.
    // Detection relies entirely on cron_runs table.
  },
  {
    id: 'health-check',
    name: 'Health Check',
    schedule: '*/15 * * * *',
    expectedIntervalMs: 30 * 60000, // 30m grace
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('infra_health_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1)
      return data?.[0]?.checked_at ?? null
    },
  },
  {
    id: 'discover',
    name: 'Registry Discovery',
    schedule: '0 4 * * *',
    expectedIntervalMs: 26 * 3600000,
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('services').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'discover-ai-news',
    name: 'AI News Scanner',
    schedule: '30 4 * * *',
    expectedIntervalMs: 26 * 3600000,
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('discovery_queue').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'watchdog',
    name: 'Watchdog QA',
    schedule: '0 3 * * *',
    expectedIntervalMs: 26 * 3600000,
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('incidents').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
  {
    id: 'review-dashboard',
    name: 'AI Review',
    schedule: '0 10,22 * * *',
    expectedIntervalMs: 14 * 3600000, // 14h grace
    fallbackDetect: async (sb) => {
      const { data } = await sb.from('monitor_reviews').select('created_at').order('created_at', { ascending: false }).limit(1)
      return data?.[0]?.created_at ?? null
    },
  },
]

export async function checkCronHealth(supabase: ReturnType<typeof createServerClient>): Promise<CronHealthItem[]> {
  const now = Date.now()

  // Primary detection: cron_runs table (most reliable — each cron logs its own runs)
  let cronRunsMap = new Map<string, string>()
  try {
    const { data: recentRuns } = await supabase
      .from('cron_runs')
      .select('cron_id, completed_at')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(50)

    if (recentRuns) {
      for (const run of recentRuns) {
        // Keep only the most recent per cron_id
        if (!cronRunsMap.has(run.cron_id)) {
          cronRunsMap.set(run.cron_id, run.completed_at)
        }
      }
    }
  } catch {
    // Table may not exist yet — fall through to fallback detection
    cronRunsMap = new Map()
  }

  // Resolve last run for each cron: prefer cron_runs, then fallback detection
  const lastRuns = await Promise.all(
    CRON_DEFS.map(async (cron) => {
      // Check cron_runs first
      const fromCronRuns = cronRunsMap.get(cron.id)
      if (fromCronRuns) return fromCronRuns

      // Fallback to side-effect detection
      if (cron.fallbackDetect) {
        try {
          return await cron.fallbackDetect(supabase)
        } catch {
          return null
        }
      }

      return null
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
  endpoints: Array<{ status: string; endpoint?: string; uptime_24h?: number }>,
  cronHealth: CronHealthItem[],
  githubRateRemaining: number,
): 'nominal' | 'degraded' | 'outage' {
  const CRITICAL_CRONS = new Set(['collect-daily', 'collect-cve', 'collect-cve-fast', 'health-check'])
  const missedCrons = cronHealth.filter(c => c.status === 'missed')
  const missedCritical = missedCrons.filter(c => CRITICAL_CRONS.has(c.cronId))
  const missedNonCritical = missedCrons.filter(c => !CRITICAL_CRONS.has(c.cronId))
  const overdueCrons = cronHealth.filter(c => c.status === 'overdue')
  const downEndpoints = endpoints.filter(e => e.status === 'down')

  // Critical cron missed = outage
  if (missedCritical.length > 0) return 'outage'

  // Any endpoint <80% uptime AND currently down = outage
  const criticallyLow = endpoints.some(e =>
    e.uptime_24h !== undefined && e.uptime_24h < 80 && e.status === 'down'
  )
  if (criticallyLow) return 'outage'

  // 2+ endpoints simultaneously down = outage
  if (downEndpoints.length >= 2) return 'outage'

  // Any endpoint 80–95% uptime = degraded
  const hasDegraded = endpoints.some(e =>
    e.uptime_24h !== undefined && e.uptime_24h >= 80 && e.uptime_24h < 95
  )
  if (hasDegraded) return 'degraded'

  // Single endpoint currently down (transient) = degraded
  if (downEndpoints.length > 0) return 'degraded'

  // Non-critical cron missed, any cron overdue, or low GitHub rate = degraded
  if (missedNonCritical.length > 0) return 'degraded'
  if (overdueCrons.length > 0) return 'degraded'
  if (githubRateRemaining < 100) return 'degraded'

  return 'nominal'
}
