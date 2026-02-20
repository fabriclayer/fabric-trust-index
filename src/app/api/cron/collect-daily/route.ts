import { NextRequest, NextResponse } from 'next/server'
import { runAllCollectorsForAllServices } from '@/lib/collectors/runner'

export const maxDuration = 300 // 5 minutes (Vercel Pro)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAllCollectorsForAllServices()
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Daily collection failed:', err)
    return NextResponse.json(
      { error: 'Collection failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
