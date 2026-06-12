import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import Stripe from 'stripe'
import { planFromPriceId } from '@/lib/api/stripe'

export const dynamic = 'force-dynamic'

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })
}

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function getRedis(): Promise<Redis | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency: skip duplicate events
  const redis = await getRedis()
  if (redis) {
    const processed = await redis.get(`stripe:event:${event.id}`)
    if (processed) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    await redis.set(`stripe:event:${event.id}`, '1', { ex: 86400 }) // 24h TTL
  }

  const supabase = getSupabase()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const accountId = session.client_reference_id
      if (!accountId) break

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.toString()
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.toString()

      // Get the subscription to find the price/plan
      let plan = 'free'
      if (subscriptionId) {
        const stripe = getStripe()
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = sub.items.data[0]?.price?.id
        if (priceId) plan = planFromPriceId(priceId)
      }

      await supabase
        .from('api_accounts')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
          plan,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.toString()
      const priceId = sub.items.data[0]?.price?.id
      const plan = priceId ? planFromPriceId(priceId) : 'free'

      await supabase
        .from('api_accounts')
        .update({
          plan,
          subscription_status: sub.status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.toString()

      await supabase
        .from('api_accounts')
        .update({
          plan: 'free',
          subscription_status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.toString()

      // Check if terminal (subscription past_due or canceled)
      const subRef = invoice.parent?.subscription_details?.subscription
      if (subRef) {
        const stripe = getStripe()
        const subId = typeof subRef === 'string' ? subRef : subRef.id
        const sub = await stripe.subscriptions.retrieve(subId)
        if (sub.status === 'canceled' || sub.status === 'past_due') {
          await supabase
            .from('api_accounts')
            .update({
              plan: 'free',
              subscription_status: sub.status,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId)
        }
      }
      break
    }
  }

  return NextResponse.json({ ok: true })
}
