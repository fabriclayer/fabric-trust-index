import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // 1. Query all services with ≤2 signals scored (non-pending)
  const { data: services, error } = await supabase
    .from('services')
    .select('*')
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
    .order('slug')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!services || services.length === 0) {
    return NextResponse.json({ ok: true, summary: { total: 0, rescored: 0, gained_signals: 0, still_low: 0, purged: 0 }, rescored: [], purged: [], errors: [], timestamp: new Date().toISOString() })
  }

  // 2. Split into rescore vs purge groups
  const toRescore: typeof services = []
  const toPurge: typeof services = []

  for (const svc of services) {
    const hasMetadata = svc.github_repo || svc.npm_package || svc.pypi_package || svc.homepage_url
    if (hasMetadata) {
      toRescore.push(svc)
    } else if (
      svc.discovered_from &&                                   // auto-discovered only
      (svc.signals_with_data === null || svc.signals_with_data === 0)  // zero signals
    ) {
      toPurge.push(svc)
    }
    // Services with no metadata but manually added (discovered_from = null) — skip, don't purge
  }

  // 3. Re-score group in batches of 20
  const rescored: { slug: string; signals_before: number; signals_after: number }[] = []
  const errors: string[] = []
  const BATCH_SIZE = 20

  for (let i = 0; i < toRescore.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(5000)
    const batch = toRescore.slice(i, i + BATCH_SIZE)

    for (const svc of batch) {
      const signalsBefore = svc.signals_with_data ?? 0
      try {
        await runAllCollectors(svc, { skipSupplyChain: true })

        // Re-read to get updated signals_with_data
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
  }

  // 4. Purge group — delete child rows then service
  const purged: string[] = []
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

  // 5. Summary
  const gainedSignals = rescored.filter(r => r.signals_after > r.signals_before).length
  const stillLow = rescored.filter(r => r.signals_after <= r.signals_before).length

  return NextResponse.json({
    ok: true,
    summary: {
      total: services.length,
      rescored: rescored.length,
      gained_signals: gainedSignals,
      still_low: stillLow,
      purged: purged.length,
    },
    rescored,
    purged,
    errors,
    timestamp: new Date().toISOString(),
  })
}
