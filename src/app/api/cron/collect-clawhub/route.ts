import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runClawHubScoring } from '@/lib/collectors/clawhub/runner'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)

  try {
    const supabase = createServerClient()

    // Fetch ClawHub services that need scoring
    const { data: services, error } = await supabase
      .from('services')
      .select('*')
      .eq('discovered_from', 'clawhub')
      .order('composite_score', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) throw error
    if (!services || services.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No ClawHub services in this range',
        offset,
        limit,
        processed: 0,
      })
    }

    let succeeded = 0
    let failedCount = 0
    const results: Array<{ name: string; success: string[]; failed: string[] }> = []

    for (const service of services) {
      try {
        const result = await runClawHubScoring(service)
        results.push({ name: service.name, success: result.success, failed: result.failed })
        if (result.failed.length === 0) succeeded++
        else failedCount++
      } catch (err) {
        failedCount++
        results.push({ name: service.name, success: [], failed: ['runner_error'] })
        console.error(`ClawHub scoring failed for ${service.name}:`, err)
      }
    }

    // Check if more services exist
    const { count } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('discovered_from', 'clawhub')

    const total = count ?? 0
    const hasMore = offset + limit < total

    return NextResponse.json({
      ok: true,
      offset,
      limit,
      total,
      processed: services.length,
      succeeded,
      failed: failedCount,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('ClawHub scoring pipeline failed:', err)
    return NextResponse.json(
      {
        error: 'ClawHub scoring failed',
        message: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 500 },
    )
  }
}
