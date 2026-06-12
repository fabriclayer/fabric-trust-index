/**
 * API Key Authentication, Quota Checking, and Request Metering
 */

import { createClient } from '@supabase/supabase-js'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Plan limits
const PLAN_LIMITS: Record<string, number> = {
  free: 1000,
  pro: 50000,
  publisher: 1000,
  enterprise: 500000,
}

// Tier access control
const TIER_ACCESS: Record<string, string[]> = {
  free: ['lookup', 'services', 'usage'],
  pro: ['lookup', 'services', 'usage', 'batch', 'alerts'],
  publisher: ['lookup', 'services', 'usage'],
  enterprise: ['lookup', 'services', 'usage', 'batch', 'alerts'],
}

export interface AuthResult {
  account_id: string
  key_id: string
  key_hash: string
  plan: string
  email: string
  stripe_customer_id: string | null
}

export interface ApiError {
  code: string
  message: string
}

function hashKey(key: string): string {
  const encoder = new TextEncoder()
  // Use Web Crypto API (available in Next.js edge and node runtimes)
  return crypto.subtle ? '' : '' // placeholder, actual impl below
}

async function sha256(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Access-Control-Allow-Origin': '*', ...headers } },
  )
}

/**
 * Authenticate an API key from the request.
 * Accepts Authorization: Bearer <key> or x-api-key: <key>
 */
export async function authenticateApiKey(request: Request): Promise<AuthResult | Response> {
  const authHeader = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')

  let rawKey: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim()
  } else if (xApiKey) {
    rawKey = xApiKey.trim()
  }

  if (!rawKey) {
    return errorResponse('unauthorized', 'Missing API key. Pass via Authorization: Bearer <key> or x-api-key header.', 401)
  }

  const keyHash = await sha256(rawKey)
  const supabase = getServiceClient()

  const { data: keyRow, error } = await supabase
    .from('api_keys')
    .select('id, account_id, active, revoked_at')
    .eq('key_hash', keyHash)
    .single()

  if (error || !keyRow) {
    return errorResponse('unauthorized', 'Invalid API key.', 401)
  }

  if (!keyRow.active || keyRow.revoked_at) {
    return errorResponse('unauthorized', 'API key has been revoked.', 401)
  }

  if (!keyRow.account_id) {
    return errorResponse('unauthorized', 'API key is not linked to an account.', 401)
  }

  const { data: account } = await supabase
    .from('api_accounts')
    .select('id, email, plan, stripe_customer_id')
    .eq('id', keyRow.account_id)
    .single()

  if (!account) {
    return errorResponse('unauthorized', 'Account not found.', 401)
  }

  return {
    account_id: account.id,
    key_id: keyRow.id,
    key_hash: keyHash,
    plan: account.plan,
    email: account.email,
    stripe_customer_id: account.stripe_customer_id,
  }
}

/**
 * Check if the account has access to the given endpoint type.
 */
export function checkTierAccess(plan: string, endpoint: string): Response | null {
  const allowed = TIER_ACCESS[plan] ?? TIER_ACCESS.free
  if (!allowed.includes(endpoint)) {
    return errorResponse(
      'forbidden_tier',
      `The ${endpoint} endpoint requires a Pro or Enterprise plan. Upgrade at https://trust.fabriclayer.ai/api-access`,
      403,
    )
  }
  return null
}

/**
 * Check monthly quota. Returns null if OK, or a 429 response if exhausted.
 */
export async function checkQuota(accountId: string, plan: string): Promise<Response | null> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
  const supabase = getServiceClient()

  const { data, error } = await supabase.rpc('monthly_request_count', { p_account: accountId })
  const used = typeof data === 'number' ? data : 0

  if (used >= limit) {
    return errorResponse(
      'quota_exceeded',
      `Monthly quota of ${limit.toLocaleString()} requests exhausted. Upgrade at https://trust.fabriclayer.ai/api-access`,
      429,
      { 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0' },
    )
  }

  return null
}

/**
 * Burst rate limit: 10 req/sec per key via Upstash Redis.
 * Fails OPEN if Redis is unreachable (logs, allows through).
 */
let burstLimiter: Ratelimit | null = null

function getBurstLimiter(): Ratelimit | null {
  if (burstLimiter) return burstLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  burstLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '1 s'),
    prefix: 'fabric:burst',
  })
  return burstLimiter
}

export async function checkBurstLimit(keyHash: string): Promise<Response | null> {
  const limiter = getBurstLimiter()
  if (!limiter) return null // Fail open

  try {
    const result = await limiter.limit(keyHash)
    if (!result.success) {
      return errorResponse(
        'rate_limited',
        'Burst rate limit exceeded (10 requests per second). Please slow down.',
        429,
        { 'Retry-After': String(Math.ceil(result.reset / 1000 - Date.now() / 1000)) },
      )
    }
    return null
  } catch (err) {
    console.error('Burst rate limit check failed (allowing through):', err)
    return null // Fail open
  }
}

/**
 * Log a request (fire and forget). Updates last_used_at at most once per minute.
 */
export function logRequest(keyId: string, accountId: string, endpoint: string, status: number) {
  const supabase = getServiceClient()

  // Fire and forget insert
  supabase.from('api_requests').insert({
    api_key_id: keyId,
    account_id: accountId,
    endpoint,
    status,
  }).then(() => {})

  // Update last_used_at (Redis-cached to limit to once per minute)
  updateLastUsed(keyId).catch(() => {})
}

async function updateLastUsed(keyId: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    // No Redis, update directly
    const supabase = getServiceClient()
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyId)
    return
  }

  const redis = new Redis({ url, token })
  const cacheKey = `fabric:last_used:${keyId}`
  const cached = await redis.get(cacheKey)
  if (cached) return // Already updated within the last minute

  await redis.set(cacheKey, '1', { ex: 60 })
  const supabase = getServiceClient()
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyId)
}

/**
 * Generate a new API key: fl_live_ + 32 base62 chars
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let result = 'fl_live_'
  for (const b of bytes) {
    result += chars[b % chars.length]
  }
  return result
}

/**
 * Get quota headers for a response.
 */
export async function getQuotaHeaders(accountId: string, plan: string): Promise<Record<string, string>> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
  const supabase = getServiceClient()
  const { data } = await supabase.rpc('monthly_request_count', { p_account: accountId })
  const used = typeof data === 'number' ? data : 0
  const remaining = Math.max(0, limit - used)

  // Reset date: first of next month UTC
  const now = new Date()
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': reset.toISOString(),
  }
}

export { PLAN_LIMITS }
