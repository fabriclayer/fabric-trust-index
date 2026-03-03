import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateAssessment } from '@/lib/assessment-generator'
import { logCronRun } from '@/lib/cron-log'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batchSize = parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10)
  // runStartedAt = ISO timestamp marking when this regeneration run began.
  // Services with ai_assessment_updated_at before this timestamp (or null) still need processing.
  const runStartedAt = request.nextUrl.searchParams.get('run_started_at') ?? new Date().toISOString()

  try {
    const supabase = createServerClient()

    // Fetch services that need (re)generation: no assessment, or assessment older than run start
    const { data: services, error } = await supabase
      .from('services')
      .select('id, slug')
      .not('composite_score', 'is', null)
      .or(`ai_assessment_updated_at.is.null,ai_assessment_updated_at.lt.${runStartedAt}`)
      .order('ai_assessment_updated_at', { ascending: true, nullsFirst: true })
      .limit(batchSize)

    if (error) throw error
    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, message: 'All assessments are up to date', processed: 0, remaining: 0 })
    }

    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    for (const service of services) {
      try {
        await generateAssessment(service.id)
        succeeded++
      } catch (err) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${service.slug}: ${msg}`)
        console.error(`Assessment failed for ${service.slug}:`, err)
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .not('composite_score', 'is', null)
      .or(`ai_assessment_updated_at.is.null,ai_assessment_updated_at.lt.${runStartedAt}`)

    const actualRemaining = Math.max(0, (remaining ?? 0) - succeeded)

    await logCronRun('generate-assessments', { processed: services.length, succeeded, failed, remaining: actualRemaining })

    return NextResponse.json({
      ok: true,
      processed: services.length,
      succeeded,
      failed,
      remaining: actualRemaining,
      run_started_at: runStartedAt,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Generate assessments failed:', err)
    return NextResponse.json(
      { error: 'Assessment generation failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
