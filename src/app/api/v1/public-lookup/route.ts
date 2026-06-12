import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createAnonClient } from '@/lib/supabase/server'
import { WEIGHTS, SIGNAL_ORDER } from '@/lib/scoring/thresholds'
import { coverageToConfidence } from '@/lib/scoring/engine'
import { errorResponse } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' }

let ipLimiter: Ratelimit | null = null

function getIpLimiter(): Ratelimit | null {
  if (ipLimiter) return ipLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  ipLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(50, '1 d'),
    prefix: 'fabric:public',
  })
  return ipLimiter
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const limiter = getIpLimiter()
  if (limiter) {
    try {
      const result = await limiter.limit(ip)
      if (!result.success) {
        return errorResponse(
          'rate_limited',
          'Daily keyless limit reached (50 per day). Get a free API key at https://trust.fabriclayer.ai/api-access for 1,000 requests per month.',
          429,
        )
      }
    } catch {
      // Fail open
    }
  }

  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return errorResponse('invalid_request', 'Missing slug parameter.', 400)

  const supabase = createAnonClient()
  const { data: service } = await supabase
    .from('services')
    .select('name, slug, composite_score, status, score_confidence, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, category, updated_at, publisher:publishers(name)')
    .eq('slug', slug)
    .single()

  if (!service) {
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  const coverage = service.score_confidence ?? 1.0
  const isUnverified = coverage < 0.40

  const body = {
    slug: service.slug,
    name: service.name,
    score: isUnverified ? null : service.composite_score,
    status: isUnverified ? 'unverified' : service.status,
    confidence: coverageToConfidence(coverage),
    coverage,
    signals: {
      vulnerability: service.signal_vulnerability,
      operational: service.signal_operational,
      maintenance: service.signal_maintenance,
      adoption: service.signal_adoption,
      transparency: service.signal_transparency,
      publisher_trust: service.signal_publisher_trust,
    },
    weights: Object.fromEntries(SIGNAL_ORDER.map((s, i) => [s, WEIGHTS[i]])),
    publisher: (service.publisher as any)?.name ?? 'Unknown',
    category: service.category,
    updated_at: service.updated_at,
    get_a_free_key: 'https://trust.fabriclayer.ai/api-access',
  }

  return Response.json(body, { headers: CORS })
}
