import { NextRequest, NextResponse } from 'next/server'
import { runDiscoveryPipeline, runBatchDiscovery } from '@/lib/discovery/pipeline'
import { logCronRun } from '@/lib/cron-log'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const source = request.nextUrl.searchParams.get('source')

  try {
    if (source) {
      // Batched discovery for a specific source (e.g. huggingface)
      const result = await runBatchDiscovery(source, 500)
      await logCronRun('discover', { source, ...result } as Record<string, unknown>)
      return NextResponse.json({
        ok: true,
        source,
        ...result,
        timestamp: new Date().toISOString(),
      })
    }

    // Default: run all sources (npm, pypi, github)
    const result = await runDiscoveryPipeline()
    await logCronRun('discover', result as unknown as Record<string, unknown>)
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Discovery pipeline failed:', err)
    await logCronRun('discover', {}, 'failed', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json(
      { error: 'Discovery failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
