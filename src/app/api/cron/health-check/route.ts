import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runCollectors } from '@/lib/collectors/runner'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()

    // Only check services that have an endpoint URL
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .not('endpoint_url', 'is', null)
      .order('composite_score', { ascending: false })

    if (!services) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    let processed = 0
    for (const service of services) {
      try {
        await runCollectors(service, ['operational'])
        processed++
      } catch (err) {
        console.error(`Health check failed for ${service.name}:`, err)
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      total: services.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Health check cron failed:', err)
    return NextResponse.json(
      { error: 'Health check failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
