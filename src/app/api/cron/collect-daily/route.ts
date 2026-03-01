import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'
import { runClawHubScoring } from '@/lib/collectors/clawhub/runner'
import { logCronRun } from '@/lib/cron-log'

export const maxDuration = 300

/**
 * Daily scoring cron — processes services in batches with self-chaining.
 *
 * Each invocation scores `batch` services starting at `offset`, then
 * fires a fetch() to itself with the next offset. Vercel Cron triggers
 * offset=0 at 02:00 UTC; self-chaining handles the rest.
 *
 * GET /api/cron/collect-daily?offset=0&batch=50
 * GET /api/cron/collect-daily?offset=0&batch=50&unscored=1  (skip already-scored)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)
  const batchSize = parseInt(request.nextUrl.searchParams.get('batch') ?? '50', 10)
  const unscoredOnly = request.nextUrl.searchParams.get('unscored') === '1'

  try {
    const supabase = createServerClient()

    let query = supabase
      .from('services')
      .select('*', { count: 'exact' })
      .neq('status', 'pending')
    if (unscoredOnly) {
      query = query.is('signal_scores', null)
    }
    const { data: services, count } = await query
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (!services || services.length === 0) {
      const result = {
        message: 'Daily scoring complete',
        totalProcessed: offset,
      }
      await logCronRun('collect-daily', result)
      return NextResponse.json({
        ok: true,
        ...result,
        timestamp: new Date().toISOString(),
      })
    }

    let processed = 0
    let errors = 0
    const errorDetails: string[] = []

    for (const service of services) {
      try {
        if (service.discovered_from === 'clawhub') {
          await runClawHubScoring(service)
        } else {
          await runAllCollectors(service)
        }
        processed++
      } catch (err) {
        errors++
        if (errorDetails.length < 10) {
          errorDetails.push(`${service.slug}: ${err instanceof Error ? err.message : 'Unknown'}`)
        }
      }
    }

    const totalCount = count ?? 0
    const nextOffset = offset + services.length
    const hasMore = nextOffset < totalCount

    // Self-chain: trigger next batch (fire and forget)
    // When unscored=1, always restart at offset 0 since scored services
    // drop from the result set, making offset progression unreliable.
    if (hasMore) {
      const nextUrl = new URL(request.url)
      nextUrl.searchParams.set('offset', unscoredOnly ? '0' : nextOffset.toString())
      nextUrl.searchParams.set('batch', batchSize.toString())

      fetch(nextUrl.toString(), {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {})
    }

    const result = {
      batch: { offset, size: services.length, processed, errors },
      progress: { completed: nextOffset, total: totalCount, remaining: totalCount - nextOffset },
      chaining: hasMore,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    }
    if (!hasMore) {
      await logCronRun('collect-daily', result)
    }
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Daily collection failed:', err)
    await logCronRun('collect-daily', {}, 'failed', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json(
      { error: 'Collection failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
