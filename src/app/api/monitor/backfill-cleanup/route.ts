import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TIME_BUDGET_MS = 45_000
const FETCH_LIMIT = 100
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
  const afterSlug = (body.after as string) ?? ''
  const batchNumber = (body.batchNumber as number) ?? 1

  const supabase = createServerClient()
  const startTime = Date.now()

  // Count total remaining low-signal services
  const { count: totalCount } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
  const totalRemaining = totalCount ?? 0

  if (!afterSlug) {
    console.log(`[backfill-cleanup] Starting: ${totalRemaining} services with ≤2 signals`)
  }

  // Fetch batch using cursor
  let query = supabase
    .from('services')
    .select('*')
    .neq('status', 'pending')
    .or('signals_with_data.is.null,signals_with_data.lte.2')
    .order('slug')
    .limit(FETCH_LIMIT)

  if (afterSlug) {
    query = query.gt('slug', afterSlug)
  }

  const { data: services, error } = await query

  if (error) {
    console.error(`[backfill-cleanup] Query error:`, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!services || services.length === 0) {
    console.log(`[backfill-cleanup] Done! No more services to process.`)
    await logBackfillProgress(supabase, 'success', {
      done: true, batchNumber, total: totalRemaining,
      processed: 0, reCollected: 0, purged: 0, skipped: 0, errors: 0,
    })
    return NextResponse.json({
      ok: true, done: true, total: totalRemaining,
      processed: 0, purged: 0, reCollected: 0, skipped: 0, errors: 0,
      nextCursor: null, batchNumber, elapsedMs: Date.now() - startTime,
    })
  }

  // Process services within time budget
  let lastSlug = afterSlug
  let processed = 0
  let reCollected = 0
  let purged = 0
  let skipped = 0
  let errors = 0

  for (const svc of services) {
    // Check time budget before each service
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      console.log(`[backfill-cleanup] Time budget reached after ${processed} services`)
      break
    }

    lastSlug = svc.slug
    processed++

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

        if (signalsAfter > signalsBefore) {
          reCollected++
          console.log(`[backfill-cleanup] ✓ ${svc.slug}: ${signalsBefore} → ${signalsAfter} signals`)
        } else {
          skipped++
          console.log(`[backfill-cleanup] – ${svc.slug}: ${signalsBefore} → ${signalsAfter} (no change)`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors++
        console.error(`[backfill-cleanup] ✗ ${svc.slug}: ${msg}`)
      }
    } else if (
      svc.discovered_from &&
      (svc.signals_with_data === null || svc.signals_with_data === 0)
    ) {
      // Purge candidate — check for protected references first
      try {
        // Check if service has more signals than the filter caught (race condition guard)
        const { data: freshSvc } = await supabase
          .from('services')
          .select('signals_with_data')
          .eq('id', svc.id)
          .single()
        if (freshSvc && (freshSvc.signals_with_data ?? 0) > 2) {
          skipped++
          console.log(`[backfill-cleanup] · skipped ${svc.slug} (signals updated since query)`)
          continue
        }

        // Check provider_claims
        const { count: claimCount } = await supabase
          .from('provider_claims')
          .select('id', { count: 'exact', head: true })
          .eq('service_slug', svc.slug)
        if ((claimCount ?? 0) > 0) {
          skipped++
          console.log(`[backfill-cleanup] · skipped ${svc.slug} (has provider claims)`)
          continue
        }

        // Check issue_reports
        const { count: reportCount } = await supabase
          .from('issue_reports')
          .select('id', { count: 'exact', head: true })
          .eq('service_slug', svc.slug)
        if ((reportCount ?? 0) > 0) {
          skipped++
          console.log(`[backfill-cleanup] · skipped ${svc.slug} (has issue reports)`)
          continue
        }

        // Safe to purge
        for (const table of CHILD_TABLES) {
          await supabase.from(table).delete().eq('service_id', svc.id)
        }
        await supabase.from('services').delete().eq('id', svc.id)
        purged++
        console.log(`[backfill-cleanup] 🗑 purged ${svc.slug} — no collectible metadata`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors++
        console.error(`[backfill-cleanup] ✗ purge ${svc.slug}: ${msg}`)
      }
    } else {
      // No metadata but manually added or has some signals — skip
      skipped++
      console.log(`[backfill-cleanup] · skipped ${svc.slug} (manual or has partial signals)`)
    }
  }

  const elapsed = Date.now() - startTime
  const done = processed < services.length ? false : services.length < FETCH_LIMIT
  const nextCursor = done ? null : lastSlug

  // Log progress
  await logBackfillProgress(supabase, done ? 'success' : 'running', {
    done, batchNumber, total: totalRemaining, nextCursor,
    processed, reCollected, purged, skipped, errors, elapsedMs: elapsed,
  })

  console.log(`[backfill-cleanup] Batch ${batchNumber}: ${processed} processed in ${elapsed}ms (${reCollected} re-collected, ${purged} purged, ${skipped} skipped, ${errors} errors)`)

  return NextResponse.json({
    ok: true, done, total: totalRemaining, nextCursor, batchNumber,
    processed, reCollected, purged, skipped, errors, elapsedMs: elapsed,
  })
}
