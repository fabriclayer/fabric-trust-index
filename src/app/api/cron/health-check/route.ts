import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runCollectors } from '@/lib/collectors/runner'
import { pingAllEndpoints, storeResults } from '@/lib/infra-health'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()

    // 1. Ping infrastructure endpoints and store results
    let infraResults
    try {
      infraResults = await pingAllEndpoints()
      await storeResults(infraResults)
    } catch (err) {
      console.error('Infra health ping failed:', err)
      infraResults = []
    }

    // 2. Run operational health checks on services with endpoints
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .not('endpoint_url', 'is', null)
      .order('composite_score', { ascending: false })

    if (!services) {
      return NextResponse.json({ ok: true, processed: 0, infra: infraResults.length })
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
      infra: infraResults.length,
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
