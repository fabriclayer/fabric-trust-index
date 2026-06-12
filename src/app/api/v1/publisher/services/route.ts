import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse, logRequest } from '@/lib/api/auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, x-api-key',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  if (auth.plan !== 'publisher') {
    logRequest(auth.key_id, auth.account_id, 'publisher/services', 403)
    return errorResponse('forbidden_tier', 'The publisher/services endpoint requires a publisher plan.', 403)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: subscriptions, error } = await supabase
    .from('publisher_subscriptions')
    .select('id, service_id, verified, verified_at, created_at, service:services(name, slug, composite_score, status, homepage_url)')
    .eq('account_id', auth.account_id)
    .order('created_at', { ascending: false })

  if (error) {
    logRequest(auth.key_id, auth.account_id, 'publisher/services', 500)
    return errorResponse('internal_error', 'Failed to fetch services.', 500)
  }

  const services = (subscriptions ?? []).map((sub: any) => ({
    slug: sub.service?.slug,
    name: sub.service?.name,
    score: sub.service?.composite_score,
    status: sub.service?.status,
    homepage_url: sub.service?.homepage_url,
    verified: sub.verified,
    verified_at: sub.verified_at ?? null,
    claimed_at: sub.created_at,
  }))

  logRequest(auth.key_id, auth.account_id, 'publisher/services', 200)
  return Response.json({ ok: true, services }, { headers: CORS })
}
