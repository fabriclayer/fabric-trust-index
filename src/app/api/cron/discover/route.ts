import { NextRequest, NextResponse } from 'next/server'
import { runDiscoveryPipeline } from '@/lib/discovery/pipeline'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDiscoveryPipeline()
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Discovery pipeline failed:', err)
    return NextResponse.json(
      { error: 'Discovery failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
