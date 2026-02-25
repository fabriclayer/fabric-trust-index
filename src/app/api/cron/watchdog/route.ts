/**
 * GET /api/cron/watchdog
 *
 * Continuous scoring quality monitor.
 * Runs after every scoring cycle (or on its own schedule).
 *
 * Detects anomalies, auto-fixes what it can, rescores affected services,
 * and returns a full report of what it found and did.
 *
 * Query params:
 *   dry_run=1           — Detect only, don't fix anything
 *   max_remediations=20 — Cap on auto-fixes per run
 *   max_rescores=10     — Cap on rescores per run
 *
 * Schedule: Run after collect-daily (e.g. 3am UTC) and after any bulk rescore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWatchdog } from '@/lib/watchdog'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1'
  const maxRemediations = parseInt(request.nextUrl.searchParams.get('max_remediations') ?? '20', 10)
  const maxRescores = parseInt(request.nextUrl.searchParams.get('max_rescores') ?? '10', 10)

  try {
    const report = await runWatchdog({ dryRun, maxRemediations, maxRescores })

    return NextResponse.json({
      ok: report.issues_unfixable === 0 && report.issues_found - report.issues_fixed <= report.issues_unfixable,
      ...report,
    })
  } catch (err) {
    console.error('Watchdog failed:', err)
    return NextResponse.json(
      { error: 'Watchdog failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
