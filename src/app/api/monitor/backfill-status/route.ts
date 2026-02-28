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
  const isRunning = data.status === 'running'
  // Consider stale if last update was > 10 minutes ago
  const lastUpdate = new Date(data.completed_at).getTime()
  const stale = isRunning && (Date.now() - lastUpdate > 10 * 60 * 1000)

  return NextResponse.json({
    active: isRunning && !stale,
    status: stale ? 'stale' : data.status,
    total: (result?.total as number) ?? 0,
    processed: (result?.processed as number) ?? 0,
    reCollected: (result?.reCollected as number) ?? 0,
    purged: (result?.purged as number) ?? 0,
    skipped: (result?.skipped as number) ?? 0,
    errors: (result?.errors as number) ?? 0,
    nextCursor: (result?.nextCursor as string) ?? null,
    batchNumber: (result?.batchNumber as number) ?? 0,
    done: (result?.done as boolean) ?? false,
    lastUpdate: data.completed_at,
  })
}
