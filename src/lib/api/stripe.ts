/**
 * Lazy Stripe Client
 */

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  }
  return _stripe
}

export const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_PRO ?? '']: 'pro',
  [process.env.STRIPE_PRICE_PUBLISHER ?? '']: 'publisher',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
}

export function planFromPriceId(priceId: string): string {
  return PRICE_TO_PLAN[priceId] ?? 'free'
}

export function priceIdFromPlan(plan: string): string | null {
  switch (plan) {
    case 'pro': return process.env.STRIPE_PRICE_PRO ?? null
    case 'publisher': return process.env.STRIPE_PRICE_PUBLISHER ?? null
    case 'enterprise': return process.env.STRIPE_PRICE_ENTERPRISE ?? null
    default: return null
  }
}
