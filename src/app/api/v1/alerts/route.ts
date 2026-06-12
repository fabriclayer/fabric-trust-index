import { NextRequest } from 'next/server'
import { authenticateApiKey, checkTierAccess, checkQuota, checkBurstLimit, logRequest, errorResponse, getQuotaHeaders } from '@/lib/api/auth'
import { createAnonClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  const tierCheck = checkTierAccess(auth.plan, 'alerts')
  if (tierCheck) return tierCheck

  const burst = await checkBurstLimit(auth.key_hash)
  if (burst) return burst

  const quota = await checkQuota(auth.account_id, auth.plan)
  if (quota) return quota

  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return errorResponse('invalid_request', 'Missing slug parameter.', 400)

  const days = parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const supabase = createAnonClient()
  const { data: service } = await supabase
    .from('services')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!service) {
    logRequest(auth.key_id, auth.account_id, 'alerts', 404)
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  const [incidents, cves] = await Promise.all([
    supabase
      .from('incidents')
      .select('*')
      .eq('service_id', service.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('cve_records')
      .select('*')
      .eq('service_id', service.id)
      .gte('discovered_at', since)
      .order('discovered_at', { ascending: false })
      .limit(100),
  ])

  const quotaHeaders = await getQuotaHeaders(auth.account_id, auth.plan)
  logRequest(auth.key_id, auth.account_id, 'alerts', 200)
  return Response.json({
    slug,
    days,
    incidents: incidents.data ?? [],
    cves: cves.data ?? [],
  }, { headers: { ...CORS, ...quotaHeaders } })
}
