import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/monitor/backfill-status
 * Returns the latest backfill-cleanup progress from cron_runs.
 */
export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data } = await supabase
    .from('cron_runs')
    .select('status, result, completed_at')
    .eq('cron_id', 'backfill-cleanup')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) {
    return NextResponse.json({ active: false })
  }

  const result = data.result as Record<string, unknown> | null
  const cumulative = (result?.cumulative as Record<string, number>) ?? {}
  const total = (result?.total as number) ?? 0
  const remaining = (result?.remaining as number) ?? 0
  const isRunning = data.status === 'running'
  // Consider stale if last update was > 10 minutes ago
  const lastUpdate = new Date(data.completed_at).getTime()
  const stale = isRunning && (Date.now() - lastUpdate > 10 * 60 * 1000)

  return NextResponse.json({
    active: isRunning && !stale,
    status: stale ? 'stale' : data.status,
    total,
    remaining,
    processed: cumulative.total_processed ?? 0,
    reCollected: cumulative.re_collected ?? 0,
    purged: cumulative.purged ?? 0,
    errors: cumulative.errors ?? 0,
    lastUpdate: data.completed_at,
  })
}
