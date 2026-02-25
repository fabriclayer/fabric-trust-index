import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateAssessment } from '@/lib/assessment-generator'

export const maxDuration = 300

const DAILY_CAP = 500

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10)

  try {
    const supabase = createServerClient()

    // Check daily cap: count assessments generated today
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count: todayCount } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .gte('ai_assessment_updated_at', todayStart.toISOString())

    const generatedToday = todayCount ?? 0
    if (generatedToday >= DAILY_CAP) {
      return NextResponse.json({
        ok: true,
        message: `Daily cap reached (${generatedToday}/${DAILY_CAP})`,
        processed: 0,
      })
    }

    const effectiveLimit = Math.min(limit, DAILY_CAP - generatedToday)

    // Fetch services that need assessments (no ai_assessment, has a score)
    const { data: services, error } = await supabase
      .from('services')
      .select('id, slug')
      .is('ai_assessment', null)
      .not('composite_score', 'is', null)
      .order('composite_score', { ascending: false })
      .limit(effectiveLimit)

    if (error) throw error
    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, message: 'No services need assessments', processed: 0 })
    }

    let succeeded = 0
    let failed = 0

    for (const service of services) {
      try {
        await generateAssessment(service.id)
        succeeded++
      } catch (err) {
        failed++
        console.error(`Assessment failed for ${service.slug}:`, err)
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .is('ai_assessment', null)
      .not('composite_score', 'is', null)

    return NextResponse.json({
      ok: true,
      processed: services.length,
      succeeded,
      failed,
      remaining: remaining ?? 0,
      generatedToday: generatedToday + succeeded,
      dailyCap: DAILY_CAP,
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
