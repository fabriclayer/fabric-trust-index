import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { enrichService } from '@/lib/enrichment'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)

  try {
    const supabase = createServerClient()

    // Fetch services that need enrichment (no readme_excerpt, has a score)
    const { data: services, error } = await supabase
      .from('services')
      .select('id, slug, name, discovered_from, npm_package, pypi_package, github_repo, readme_excerpt')
      .is('readme_excerpt', null)
      .not('composite_score', 'is', null)
      .order('composite_score', { ascending: false })
      .limit(limit)

    if (error) throw error
    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, message: 'No services need enrichment', processed: 0 })
    }

    let succeeded = 0
    let failed = 0

    for (const service of services) {
      try {
        await enrichService(service)
        succeeded++
      } catch (err) {
        failed++
        console.error(`Enrichment failed for ${service.slug}:`, err)
      }
    }

    // Count remaining
    const { count } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .is('readme_excerpt', null)
      .not('composite_score', 'is', null)

    return NextResponse.json({
      ok: true,
      processed: services.length,
      succeeded,
      failed,
      remaining: count ?? 0,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Enrich services failed:', err)
    return NextResponse.json(
      { error: 'Enrichment failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
