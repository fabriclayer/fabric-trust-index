import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  const bearerAuth = request.headers.get('authorization')
  if (auth !== process.env.CRON_SECRET && bearerAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const offset = (body.offset as number) ?? 0
  const BATCH_SIZE = 20

  const supabase = createServerClient()

  // 1. Query all services with ≤2 signals scored (non-pending), paginated
  const { data: services, error, count } = await supabase
    .from('services')
    .select('*', { count: 'exact' })
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
    .order('slug')
    .range(offset, offset + BATCH_SIZE - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  if (!services || services.length === 0) {
    return NextResponse.json({
      ok: true,
      batch: { offset, size: 0, total },
      summary: { rescored: 0, gained_signals: 0, still_low: 0, purged: 0 },
      rescored: [],
      purged: [],
      errors: [],
      chaining: false,
      timestamp: new Date().toISOString(),
    })
  }

  // 2. Split into rescore vs purge groups
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRescore: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toPurge: any[] = []

  for (const svc of services) {
    const hasMetadata = svc.github_repo || svc.npm_package || svc.pypi_package || svc.homepage_url
    if (hasMetadata) {
      toRescore.push(svc)
    } else if (
      svc.discovered_from &&
      (svc.signals_with_data === null || svc.signals_with_data === 0)
    ) {
      toPurge.push(svc)
    }
  }

  // 3. Purge group first (fast)
  const purged: string[] = []
  const errors: string[] = []
  const CHILD_TABLES = [
    'signal_history', 'incidents', 'versions', 'health_checks',
    'supply_chain', 'cve_records', 'feedback',
  ] as const

  for (const svc of toPurge) {
    try {
      for (const table of CHILD_TABLES) {
        await supabase.from(table).delete().eq('service_id', svc.id)
      }
      await supabase.from('services').delete().eq('id', svc.id)
      purged.push(svc.slug)
    } catch (err) {
      errors.push(`purge ${svc.slug}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 4. Re-score group
  const rescored: { slug: string; signals_before: number; signals_after: number }[] = []

  for (const svc of toRescore) {
    const signalsBefore = svc.signals_with_data ?? 0
    try {
      await runAllCollectors(svc, { skipSupplyChain: true })

      const { data: updated } = await supabase
        .from('services')
        .select('signals_with_data')
        .eq('id', svc.id)
        .single()

      rescored.push({
        slug: svc.slug,
        signals_before: signalsBefore,
        signals_after: updated?.signals_with_data ?? 0,
      })
    } catch (err) {
      errors.push(`${svc.slug}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 5. Self-chain to next batch if more remain
  const nextOffset = offset + BATCH_SIZE
  const hasMore = nextOffset < total

  if (hasMore) {
    const baseUrl = request.nextUrl.origin || `https://${request.headers.get('host')}`
    fetch(`${baseUrl}/api/monitor/backfill-and-cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ offset: nextOffset }),
    }).catch(() => {})
  }

  const gainedSignals = rescored.filter(r => r.signals_after > r.signals_before).length
  const stillLow = rescored.filter(r => r.signals_after <= r.signals_before).length

  return NextResponse.json({
    ok: true,
    batch: { offset, size: services.length, total },
    summary: {
      rescored: rescored.length,
      gained_signals: gainedSignals,
      still_low: stillLow,
      purged: purged.length,
    },
    rescored,
    purged,
    errors,
    chaining: hasMore,
    timestamp: new Date().toISOString(),
  })
}
