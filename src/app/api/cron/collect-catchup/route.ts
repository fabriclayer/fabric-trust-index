import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'
import { runClawHubScoring } from '@/lib/collectors/clawhub/runner'

export const maxDuration = 60

/** Wrap a promise with a timeout (ms). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/**
 * Catch-up cron — runs every minute, scores 5 unscored services per invocation.
 * No self-chaining needed — Vercel Cron triggers it reliably.
 * At 5/min, processes ~7,200/day — enough to score the full index.
 *
 * Disables itself when no unscored services remain.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: services, count } = await supabase
    .from('services')
    .select('*', { count: 'exact' })
    .neq('status', 'pending')
    .is('signal_scores', null)
    .order('id', { ascending: true })
    .limit(5)

  if (!services || services.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No unscored services remaining',
      timestamp: new Date().toISOString(),
    })
  }

  let processed = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const service of services) {
    try {
      const scoring = service.discovered_from === 'clawhub'
        ? runClawHubScoring(service)
        : runAllCollectors(service)
      await withTimeout(scoring, 10_000, service.slug)
      processed++
    } catch (err) {
      errors++
      if (errorDetails.length < 5) {
        errorDetails.push(`${service.slug}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    remaining: (count ?? 0) - processed,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    timestamp: new Date().toISOString(),
  })
}
