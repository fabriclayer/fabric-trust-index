import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { getConfidenceLevel } from '@/lib/scoring/thresholds'

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
      .select('name, slug, category, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, signal_scores, signals_with_data, updated_at, publisher:publishers(name)')
      .eq('slug', slug)
      .single()

    if (error || !service) {
      return NextResponse.json(
        { error: 'Service not found', slug },
        { status: 404, headers: CORS_HEADERS },
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = service.publisher as any
    const signalScores = service.signal_scores as Record<string, unknown> | null
    const signalsWithData = (service.signals_with_data as number) ?? 0

    // Build signals response: use signal_scores if available, fall back to flat scores
    const signals = signalScores ?? {
      vulnerability: { score: service.signal_vulnerability },
      operational: { score: service.signal_operational },
      maintenance: { score: service.signal_maintenance },
      adoption: { score: service.signal_adoption },
      transparency: { score: service.signal_transparency },
      publisher_trust: { score: service.signal_publisher_trust },
    }

    return NextResponse.json({
      name: service.name,
      slug: service.slug,
      publisher: pub?.name ?? 'Unknown',
      category: service.category,
      score: service.composite_score,
      status: service.status,
      confidence: getConfidenceLevel(signalsWithData),
      signals,
      updated_at: service.updated_at,
    }, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
