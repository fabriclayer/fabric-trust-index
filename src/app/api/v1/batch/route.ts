import { NextRequest } from 'next/server'
import { authenticateApiKey, checkTierAccess, checkQuota, checkBurstLimit, logRequest, errorResponse, getQuotaHeaders } from '@/lib/api/auth'
import { createAnonClient } from '@/lib/supabase/server'
import { WEIGHTS, SIGNAL_ORDER } from '@/lib/scoring/thresholds'
import { coverageToConfidence } from '@/lib/scoring/engine'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key, Content-Type' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  const tierCheck = checkTierAccess(auth.plan, 'batch')
  if (tierCheck) return tierCheck

  const burst = await checkBurstLimit(auth.key_hash)
  if (burst) return burst

  let body: { slugs?: string[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Invalid JSON body.', 400)
  }

  const slugs = body.slugs
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return errorResponse('invalid_request', 'slugs must be a non empty array.', 400)
  }
  if (slugs.length > 50) {
    return errorResponse('invalid_request', 'Maximum 50 slugs per batch request.', 400)
  }

  // Each slug counts against quota
  const quota = await checkQuota(auth.account_id, auth.plan)
  if (quota) return quota

  const supabase = createAnonClient()
  const { data: services } = await supabase
    .from('services')
    .select('name, slug, composite_score, status, score_confidence, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, category, updated_at, publisher:publishers(name)')
    .in('slug', slugs)

  const serviceMap = new Map((services ?? []).map(s => [s.slug, s]))
  const weightsObj = Object.fromEntries(SIGNAL_ORDER.map((s, i) => [s, WEIGHTS[i]]))

  const results = slugs.map(slug => {
    const service = serviceMap.get(slug)
    if (!service) return { slug, error: 'not_found' }

    const coverage = service.score_confidence ?? 1.0
    const isUnverified = coverage < 0.40

    return {
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
      weights: weightsObj,
      publisher: (service.publisher as any)?.name ?? 'Unknown',
      category: service.category,
      updated_at: service.updated_at,
    }
  })

  const quotaHeaders = await getQuotaHeaders(auth.account_id, auth.plan)
  logRequest(auth.key_id, auth.account_id, 'batch', 200)
  return Response.json({ results }, { headers: { ...CORS, ...quotaHeaders } })
}
