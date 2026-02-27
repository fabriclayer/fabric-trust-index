import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const maxDuration = 300

/**
 * Collect specific services by ID or slug for calibration testing.
 * POST body: { ids?: string[], slugs?: string[] }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const ids: string[] = body.ids ?? []
  const slugs: string[] = body.slugs ?? []

  if (ids.length === 0 && slugs.length === 0) {
    return NextResponse.json({ error: 'Provide ids or slugs' }, { status: 400 })
  }
  if (ids.length + slugs.length > 50) {
    return NextResponse.json({ error: 'Max 50 services per request' }, { status: 400 })
  }

  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let services: any[] = []

  if (ids.length > 0) {
    const { data } = await supabase.from('services').select('*').in('id', ids)
    if (data) services.push(...data)
  }
  if (slugs.length > 0) {
    const { data } = await supabase.from('services').select('*').in('slug', slugs)
    if (data) services.push(...data)
  }

  if (services.length === 0) {
    return NextResponse.json({ error: 'No services found' }, { status: 404 })
  }

  const results: Array<{
    name: string
    composite_score: number
    status: string
    signal_vulnerability: number
    signal_operational: number
    signal_maintenance: number
    signal_adoption: number
    signal_transparency: number
    signal_publisher_trust: number
    active_modifiers: string[]
    success: string[]
    failed: string[]
    error?: string
  }> = []

  for (const service of services) {
    try {
      const result = await runAllCollectors(service, { skipSupplyChain: true })

      // Re-read the service to get updated scores
      const { data: updated } = await supabase
        .from('services')
        .select('composite_score,status,signal_vulnerability,signal_operational,signal_maintenance,signal_adoption,signal_transparency,signal_publisher_trust,active_modifiers')
        .eq('id', service.id)
        .single()

      results.push({
        name: service.name,
        composite_score: updated?.composite_score ?? 0,
        status: updated?.status ?? 'unknown',
        signal_vulnerability: updated?.signal_vulnerability ?? 0,
        signal_operational: updated?.signal_operational ?? 0,
        signal_maintenance: updated?.signal_maintenance ?? 0,
        signal_adoption: updated?.signal_adoption ?? 0,
        signal_transparency: updated?.signal_transparency ?? 0,
        signal_publisher_trust: updated?.signal_publisher_trust ?? 0,
        active_modifiers: updated?.active_modifiers ?? [],
        success: result.success,
        failed: result.failed,
      })
    } catch (err) {
      results.push({
        name: service.name,
        composite_score: 0,
        status: 'error',
        signal_vulnerability: 0,
        signal_operational: 0,
        signal_maintenance: 0,
        signal_adoption: 0,
        signal_transparency: 0,
        signal_publisher_trust: 0,
        active_modifiers: [],
        success: [],
        failed: ['all'],
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
