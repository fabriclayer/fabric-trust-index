import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse } from '@/lib/api/auth'
import { getStripe, priceIdFromPlan } from '@/lib/api/stripe'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key, Content-Type' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  let body: { plan?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Invalid JSON body.', 400)
  }

  const plan = body.plan
  if (!plan || !['pro', 'publisher', 'enterprise'].includes(plan)) {
    return errorResponse('invalid_request', 'Plan must be pro, publisher, or enterprise.', 400)
  }

  const priceId = priceIdFromPlan(plan)
  if (!priceId) {
    return errorResponse('invalid_request', 'Pricing not configured for this plan.', 500)
  }

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: auth.account_id,
    customer_email: auth.stripe_customer_id ? undefined : auth.email,
    customer: auth.stripe_customer_id ?? undefined,
    success_url: 'https://trust.fabriclayer.ai/api-access?upgraded=1',
    cancel_url: 'https://trust.fabriclayer.ai/api-access',
  })

  return Response.json({ url: session.url }, { headers: CORS })
}
