import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runAllCollectors } from '@/lib/collectors/runner'

export const maxDuration = 300 // 5 minutes (Vercel Pro)

/**
 * Bootstrap route: runs all collectors (6 signals + supply-chain + incidents)
 * for a batch of services. Use ?batch=25&offset=0 to paginate.
 *
 * Example:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://trust.fabriclayer.ai/api/cron/collect-bootstrap?batch=25&offset=0"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const batch = Math.min(parseInt(searchParams.get('batch') ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const skipSupplyChain = searchParams.get('skipSupplyChain') === '1'
  const statusFilter = searchParams.get('status') // e.g. ?status=pending

  const supabase = createServerClient()

  // Fetch the batch of services
  let query = supabase
    .from('services')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + batch - 1)
  if (statusFilter) query = query.eq('status', statusFilter)
  const { data: services, count } = await query

  if (!services || services.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No services in this range',
      offset,
      batch,
      total: count ?? 0,
      processed: 0,
    })
  }

  const results: Array<{
    name: string
    success: string[]
    failed: string[]
    error?: string
  }> = []

  for (const service of services) {
    try {
      const result = await runAllCollectors(service, { skipSupplyChain })
      results.push({
        name: service.name,
        success: result.success,
        failed: result.failed,
      })
      console.log(
        `[bootstrap] ${service.name}: success=${result.success.join(',')} failed=${result.failed.join(',') || 'none'}`
      )
    } catch (err) {
      results.push({
        name: service.name,
        success: [],
        failed: ['all'],
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      console.error(`[bootstrap] ${service.name} error:`, err)
    }
  }

  const succeeded = results.filter(r => r.failed.length === 0).length
  const failed = results.filter(r => r.failed.length > 0).length

  return NextResponse.json({
    ok: true,
    offset,
    batch,
    total: count ?? 0,
    processed: services.length,
    succeeded,
    failed,
    next_offset: offset + batch < (count ?? 0) ? offset + batch : null,
    results,
    timestamp: new Date().toISOString(),
  })
}
