import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runCollectors } from '@/lib/collectors/runner'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .order('composite_score', { ascending: false })

    if (!services) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    let processed = 0
    for (const service of services) {
      try {
        await runCollectors(service, ['vulnerability'])
        processed++
      } catch (err) {
        console.error(`CVE collection failed for ${service.name}:`, err)
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      total: services.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('CVE collection failed:', err)
    return NextResponse.json(
      { error: 'Collection failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
