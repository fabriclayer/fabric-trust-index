import { NextRequest, NextResponse } from 'next/server'

/**
 * Simple in-memory IP-based rate limiter for serverless API routes.
 * Uses a Map with TTL-based cleanup. Each instance is per-route.
 *
 * Note: On Vercel serverless, each cold start gets a fresh Map.
 * This provides basic protection against burst abuse, not a hard guarantee.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

function getStore(namespace: string): Map<string, RateLimitEntry> {
  let store = stores.get(namespace)
  if (!store) {
    store = new Map()
    stores.set(namespace, store)
  }
  return store
}

/**
 * Check rate limit for a request. Returns null if allowed, or a 429 Response if blocked.
 *
 * @param request - The incoming Next.js request
 * @param namespace - Unique name for this rate limit bucket (e.g. 'submit-service')
 * @param limit - Max requests per window (default: 5)
 * @param windowMs - Window duration in milliseconds (default: 60000 = 1 minute)
 */
export function rateLimit(
  request: NextRequest,
  namespace: string,
  limit = 5,
  windowMs = 60_000,
): NextResponse | null {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const now = Date.now()
  const store = getStore(namespace)

  // Lazy cleanup: remove expired entries (cap at 100 to avoid blocking)
  let cleaned = 0
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key)
      if (++cleaned >= 100) break
    }
  }

  const entry = store.get(ip)

  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return null
  }

  entry.count++

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    )
  }

  return null
}
