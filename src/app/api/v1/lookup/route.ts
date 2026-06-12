import { NextRequest } from 'next/server'
import { authenticateApiKey, checkQuota, checkBurstLimit, logRequest, errorResponse, getQuotaHeaders } from '@/lib/api/auth'
import { createAnonClient } from '@/lib/supabase/server'
import { WEIGHTS, SIGNAL_ORDER } from '@/lib/scoring/thresholds'
import { coverageToConfidence } from '@/lib/scoring/engine'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  const burst = await checkBurstLimit(auth.key_hash)
  if (burst) return burst

  const quota = await checkQuota(auth.account_id, auth.plan)
  if (quota) return quota

  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return errorResponse('invalid_request', 'Missing slug parameter.', 400)

  const supabase = createAnonClient()
  const { data: service } = await supabase
    .from('services')
    .select('name, slug, composite_score, status, score_confidence, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, category, updated_at, publisher:publishers(name)')
    .eq('slug', slug)
    .single()

  if (!service) {
    logRequest(auth.key_id, auth.account_id, 'lookup', 404)
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  const coverage = service.score_confidence ?? 1.0
  const isUnverified = coverage < 0.40
  const quotaHeaders = await getQuotaHeaders(auth.account_id, auth.plan)

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
  }

  logRequest(auth.key_id, auth.account_id, 'lookup', 200)
  return Response.json(body, { headers: { ...CORS, ...quotaHeaders } })
}
