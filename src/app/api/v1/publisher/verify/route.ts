import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse, logRequest } from '@/lib/api/auth'
import { createClient } from '@supabase/supabase-js'
import dns from 'node:dns/promises'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, x-api-key, Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (auth instanceof Response) return auth

  if (auth.plan !== 'publisher') {
    logRequest(auth.key_id, auth.account_id, 'publisher/verify', 403)
    return errorResponse('forbidden_tier', 'The publisher/verify endpoint requires a publisher plan.', 403)
  }

  let body: { slug?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Invalid JSON body.', 400)
  }

  const slug = body.slug?.trim()
  if (!slug) {
    return errorResponse('invalid_request', 'Missing slug in request body.', 400)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Look up service and existing claim
  const { data: service } = await supabase
    .from('services')
    .select('id, homepage_url, github_repo')
    .eq('slug', slug)
    .single()

  if (!service) {
    logRequest(auth.key_id, auth.account_id, 'publisher/verify', 404)
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  const { data: subscription } = await supabase
    .from('publisher_subscriptions')
    .select('id, verified')
    .eq('account_id', auth.account_id)
    .eq('service_id', service.id)
    .single()

  if (!subscription) {
    logRequest(auth.key_id, auth.account_id, 'publisher/verify', 404)
    return errorResponse('no_claim', 'No claim found for this service. Call /publisher/claim first.', 404)
  }

  if (subscription.verified) {
    logRequest(auth.key_id, auth.account_id, 'publisher/verify', 200)
    return Response.json({ ok: true, verified: true, method: 'already_verified' }, { headers: CORS })
  }

  const domain = extractDomain(service.homepage_url)
  const githubRepo = service.github_repo
  const checked: { method: string; result: string }[] = []

  // 1. DNS TXT check
  if (domain) {
    const dnsResult = await checkDns(domain, auth.account_id)
    checked.push({ method: 'dns', result: dnsResult ? 'pass' : 'fail' })
    if (dnsResult) {
      await markVerified(supabase, subscription.id)
      logRequest(auth.key_id, auth.account_id, 'publisher/verify', 200)
      return Response.json({ ok: true, verified: true, method: 'dns' }, { headers: CORS })
    }
  }

  // 2. Well-known file check
  if (domain) {
    const wkResult = await checkWellKnown(domain, auth.account_id)
    checked.push({ method: 'well-known', result: wkResult ? 'pass' : 'fail' })
    if (wkResult) {
      await markVerified(supabase, subscription.id)
      logRequest(auth.key_id, auth.account_id, 'publisher/verify', 200)
      return Response.json({ ok: true, verified: true, method: 'well-known' }, { headers: CORS })
    }
  }

  // 3. GitHub repo file check
  if (githubRepo) {
    const ghResult = await checkGitHub(githubRepo, auth.account_id)
    checked.push({ method: 'github', result: ghResult ? 'pass' : 'fail' })
    if (ghResult) {
      await markVerified(supabase, subscription.id)
      logRequest(auth.key_id, auth.account_id, 'publisher/verify', 200)
      return Response.json({ ok: true, verified: true, method: 'github' }, { headers: CORS })
    }
  }

  logRequest(auth.key_id, auth.account_id, 'publisher/verify', 200)
  return Response.json({ ok: false, verified: false, checked }, { headers: CORS })
}

function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

async function markVerified(supabase: any, subscriptionId: string) {
  await supabase
    .from('publisher_subscriptions')
    .update({ verified: true, verified_at: new Date().toISOString() } as any)
    .eq('id', subscriptionId)
}

async function checkDns(domain: string, accountId: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`_fabric-verify.${domain}`)
    const flat = records.map(r => r.join(''))
    return flat.some(r => r === `fabric-trust-verify=${accountId}`)
  } catch {
    return false
  }
}

async function checkWellKnown(domain: string, accountId: string): Promise<boolean> {
  try {
    const url = `https://${domain}/.well-known/fabric-trust.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const json = await res.json()
    return json?.account_id === accountId
  } catch {
    return false
  }
}

async function checkGitHub(repo: string, accountId: string): Promise<boolean> {
  try {
    // repo format: "owner/repo"
    const url = `https://raw.githubusercontent.com/${repo}/HEAD/.fabric-trust.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const json = await res.json()
    return json?.account_id === accountId
  } catch {
    return false
  }
}
