import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/score?slug=openai
 *
 * Public JSON API returning the trust score for a service.
 * Cache: public, 5 minutes. CORS: open.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')

  if (!slug) {
    return NextResponse.json(
      { error: 'Missing required query parameter: slug' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  try {
    const supabase = createAnonClient()
    const { data: service, error } = await supabase
      .from('services')
      .select('name, slug, publisher, category, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, updated_at')
      .eq('slug', slug)
      .single()

    if (error || !service) {
      return NextResponse.json(
        { error: 'Service not found', slug },
        { status: 404, headers: CORS_HEADERS },
      )
    }

    return NextResponse.json({
      name: service.name,
      slug: service.slug,
      publisher: service.publisher,
      category: service.category,
      score: service.composite_score,
      status: service.status,
      signals: {
        vulnerability: service.signal_vulnerability,
        operational: service.signal_operational,
        maintenance: service.signal_maintenance,
        adoption: service.signal_adoption,
        transparency: service.signal_transparency,
        publisher_trust: service.signal_publisher_trust,
      },
      updated_at: service.updated_at,
    }, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
