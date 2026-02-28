import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 20
const CHILD_TABLES = [
  'signal_history', 'incidents', 'versions', 'health_checks',
  'supply_chain', 'cve_records', 'feedback',
] as const

/** Write backfill progress to cron_runs so the dashboard can poll it */
async function logBackfillProgress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  status: 'running' | 'success' | 'failed',
  result: Record<string, unknown>,
) {
  try {
    await supabase.from('cron_runs').insert({
      cron_id: 'backfill-cleanup',
      status,
      result,
      completed_at: new Date().toISOString(),
    })
  } catch {
    console.error('[backfill-cleanup] Failed to log progress')
  }
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  const bearerAuth = request.headers.get('authorization')
  if (auth !== process.env.CRON_SECRET && bearerAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  // Cursor-based pagination: pass last processed slug to avoid offset drift from purges
  const afterSlug = (body.after as string) ?? ''
  // When true, skip server-side self-chaining (client drives the loop)
  const noChain = !!body.noChain
  // Initial total passed through from first invocation
  const initialTotal = (body.initialTotal as number) ?? 0
  // Accumulate totals across chained invocations
  const cumulative = {
    total_processed: (body.cumulative?.total_processed as number) ?? 0,
    re_collected: (body.cumulative?.re_collected as number) ?? 0,
    still_low: (body.cumulative?.still_low as number) ?? 0,
    purged: (body.cumulative?.purged as number) ?? 0,
    errors: (body.cumulative?.errors as number) ?? 0,
  }

  const supabase = createServerClient()

  // Count total remaining
  const { count: totalCount } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
  const totalRemaining = totalCount ?? 0
  // On first invocation, set initialTotal; on subsequent, pass through
  const runTotal = initialTotal || totalRemaining

  if (!afterSlug) {
    console.log(`[backfill-cleanup] Starting: ${totalRemaining} services with ≤2 signals`)
  }

  // Fetch next batch using cursor (slug > afterSlug)
  let query = supabase
    .from('services')
    .select('*')
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
    .order('slug')
    .limit(BATCH_SIZE)

  if (afterSlug) {
    query = query.gt('slug', afterSlug)
  }

  const { data: services, error } = await query

  if (error) {
    console.error(`[backfill-cleanup] Query error:`, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!services || services.length === 0) {
    console.log(`[backfill-cleanup] Done! Totals:`, cumulative)
    await logBackfillProgress(supabase, 'success', { cumulative, total: runTotal, remaining: 0 })
    return NextResponse.json({
      ok: true,
      done: true,
      total: runTotal,
      lastSlug: afterSlug,
      cumulative,
      timestamp: new Date().toISOString(),
    })
  }

  // Track the last slug for cursor
  let lastSlug = afterSlug

  // Split into rescore vs purge
  const batchErrors: string[] = []
  const batchRescored: { slug: string; before: number; after: number }[] = []
  const batchPurged: string[] = []

  for (const svc of services) {
    lastSlug = svc.slug
    const hasMetadata = svc.github_repo || svc.npm_package || svc.pypi_package || svc.homepage_url

    if (hasMetadata) {
      // Re-score
      const signalsBefore = svc.signals_with_data ?? 0
      try {
        await runAllCollectors(svc, { skipSupplyChain: true })
        const { data: updated } = await supabase
          .from('services')
          .select('signals_with_data')
          .eq('id', svc.id)
          .single()
        const signalsAfter = updated?.signals_with_data ?? 0
        batchRescored.push({ slug: svc.slug, before: signalsBefore, after: signalsAfter })

        if (signalsAfter > signalsBefore) {
          cumulative.re_collected++
          console.log(`[backfill-cleanup] ✓ ${svc.slug}: ${signalsBefore} → ${signalsAfter} signals`)
        } else {
          cumulative.still_low++
          console.log(`[backfill-cleanup] – ${svc.slug}: ${signalsBefore} → ${signalsAfter} (no change)`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        batchErrors.push(`${svc.slug}: ${msg}`)
        cumulative.errors++
        console.error(`[backfill-cleanup] ✗ ${svc.slug}: ${msg}`)
      }
    } else if (
      svc.discovered_from &&
      (svc.signals_with_data === null || svc.signals_with_data === 0)
    ) {
      // Purge: auto-discovered, no metadata, zero signals
      try {
        for (const table of CHILD_TABLES) {
          await supabase.from(table).delete().eq('service_id', svc.id)
        }
        await supabase.from('services').delete().eq('id', svc.id)
        batchPurged.push(svc.slug)
        cumulative.purged++
        console.log(`[backfill-cleanup] 🗑 purged ${svc.slug} — no collectible metadata`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        batchErrors.push(`purge ${svc.slug}: ${msg}`)
        cumulative.errors++
        console.error(`[backfill-cleanup] ✗ purge ${svc.slug}: ${msg}`)
      }
    } else {
      // No metadata but manually added or has some signals — skip
      console.log(`[backfill-cleanup] · skipped ${svc.slug} (manual or has partial signals)`)
    }

    cumulative.total_processed++
  }

  // Self-chain to next batch (only when client isn't driving)
  const hasMore = services.length === BATCH_SIZE

  // Log progress to cron_runs for dashboard polling
  const progressData = { cumulative, total: runTotal, remaining: totalRemaining }
  await logBackfillProgress(supabase, hasMore ? 'running' : 'success', progressData)

  if (hasMore && !noChain) {
    const baseUrl = request.nextUrl.origin || `https://${request.headers.get('host')}`
    console.log(`[backfill-cleanup] Chaining next batch after "${lastSlug}" (processed ${cumulative.total_processed} so far)`)
    fetch(`${baseUrl}/api/monitor/backfill-cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ after: lastSlug, cumulative, initialTotal: runTotal }),
    }).catch(err => console.error(`[backfill-cleanup] Chain failed:`, err))
  } else if (!hasMore) {
    console.log(`[backfill-cleanup] Final batch complete. Totals:`, cumulative)
  }

  return NextResponse.json({
    ok: true,
    done: !hasMore,
    total: runTotal,
    lastSlug,
    batch: {
      after: afterSlug || null,
      processed: services.length,
      rescored: batchRescored,
      purged: batchPurged,
      errors: batchErrors,
    },
    cumulative,
    chaining: hasMore && !noChain,
    timestamp: new Date().toISOString(),
  })
}
