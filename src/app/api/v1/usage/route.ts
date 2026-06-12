import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse, PLAN_LIMITS } from '@/lib/api/auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  // Usage endpoint is not metered
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.rpc('monthly_request_count', { p_account: auth.account_id })
  const used = typeof data === 'number' ? data : 0
  const limit = PLAN_LIMITS[auth.plan] ?? PLAN_LIMITS.free
  const remaining = Math.max(0, limit - used)

  const now = new Date()
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  return Response.json({
    plan: auth.plan,
    limit,
    used,
    remaining,
    reset: reset.toISOString(),
  }, { headers: CORS })
}
