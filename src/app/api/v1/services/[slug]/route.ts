import { NextRequest } from 'next/server'
import { authenticateApiKey, checkQuota, checkBurstLimit, logRequest, errorResponse, getQuotaHeaders } from '@/lib/api/auth'
import { createAnonClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  const burst = await checkBurstLimit(auth.key_hash)
  if (burst) return burst

  const quota = await checkQuota(auth.account_id, auth.plan)
  if (quota) return quota

  const { slug } = await params

  const supabase = createAnonClient()
  const { data: service } = await supabase
    .from('services')
    .select('*, publisher:publishers(name, website_url)')
    .eq('slug', slug)
    .single()

  if (!service) {
    logRequest(auth.key_id, auth.account_id, 'services', 404)
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  // Reuse the dbToService-style mapping without importing it (to avoid Next.js client/server boundary issues)
  const body = {
    id: service.id,
    name: service.name,
    slug: service.slug,
    publisher: (service.publisher as any)?.name ?? 'Unknown',
    publisher_url: (service.publisher as any)?.website_url ?? null,
    category: service.category,
    description: service.description,
    signals: {
      vulnerability: service.signal_vulnerability,
      operational: service.signal_operational,
      maintenance: service.signal_maintenance,
      adoption: service.signal_adoption,
      transparency: service.signal_transparency,
      publisher_trust: service.signal_publisher_trust,
    },
    score: service.composite_score,
    status: service.status,
    score_confidence: service.score_confidence,
    signals_with_data: service.signals_with_data,
    active_modifiers: service.active_modifiers,
    github_repo: service.github_repo,
    npm_package: service.npm_package,
    pypi_package: service.pypi_package,
    endpoint_url: service.endpoint_url,
    homepage_url: service.homepage_url,
    docs_url: service.docs_url,
    uptime_30d: service.uptime_30d,
    avg_latency_ms: service.avg_latency_ms,
    created_at: service.created_at,
    updated_at: service.updated_at,
  }

  const quotaHeaders = await getQuotaHeaders(auth.account_id, auth.plan)
  logRequest(auth.key_id, auth.account_id, 'services', 200)
  return Response.json(body, { headers: { ...CORS, ...quotaHeaders } })
}
