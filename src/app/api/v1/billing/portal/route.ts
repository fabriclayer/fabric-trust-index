import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse } from '@/lib/api/auth'
import { getStripe } from '@/lib/api/stripe'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, x-api-key' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  if (!auth.stripe_customer_id) {
    return errorResponse('invalid_request', 'No billing account found. Subscribe to a plan first.', 400)
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: auth.stripe_customer_id,
    return_url: 'https://trust.fabriclayer.ai/api-access',
  })

  return Response.json({ url: session.url }, { headers: CORS })
}
