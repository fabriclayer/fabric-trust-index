import { NextRequest } from 'next/server'
import { authenticateApiKey, errorResponse, logRequest } from '@/lib/api/auth'
import { createClient } from '@supabase/supabase-js'

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
    logRequest(auth.key_id, auth.account_id, 'publisher/claim', 403)
    return errorResponse('forbidden_tier', 'The publisher/claim endpoint requires a publisher plan.', 403)
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

  const { data: service } = await supabase
    .from('services')
    .select('id, homepage_url, github_repo')
    .eq('slug', slug)
    .single()

  if (!service) {
    logRequest(auth.key_id, auth.account_id, 'publisher/claim', 404)
    return errorResponse('not_found', `Service "${slug}" not found.`, 404)
  }

  // Check if already claimed by this account
  const { data: existing } = await supabase
    .from('publisher_subscriptions')
    .select('id')
    .eq('account_id', auth.account_id)
    .eq('service_id', service.id)
    .single()

  if (existing) {
    logRequest(auth.key_id, auth.account_id, 'publisher/claim', 409)
    return errorResponse('already_claimed', 'You have already claimed this service.', 409)
  }

  const { error: insertError } = await supabase
    .from('publisher_subscriptions')
    .insert({ account_id: auth.account_id, service_id: service.id, verified: false })

  if (insertError) {
    logRequest(auth.key_id, auth.account_id, 'publisher/claim', 500)
    return errorResponse('internal_error', 'Failed to create claim.', 500)
  }

  // Build verification methods based on available service metadata
  const domain = extractDomain(service.homepage_url)
  const githubRepo = service.github_repo

  const verificationMethods = []

  if (domain) {
    verificationMethods.push({
      method: 'dns',
      instructions: `Add a DNS TXT record for _fabric-verify.${domain} with value fabric-trust-verify=${auth.account_id}`,
      record_name: `_fabric-verify.${domain}`,
      record_value: `fabric-trust-verify=${auth.account_id}`,
    })
    verificationMethods.push({
      method: 'well-known',
      instructions: `Serve a JSON file at https://${domain}/.well-known/fabric-trust.json containing { "account_id": "${auth.account_id}" }`,
      url: `https://${domain}/.well-known/fabric-trust.json`,
      expected_content: { account_id: auth.account_id },
    })
  }

  if (githubRepo) {
    verificationMethods.push({
      method: 'github',
      instructions: `Add a .fabric-trust.json file to the root of ${githubRepo} containing { "account_id": "${auth.account_id}" }`,
      repo: githubRepo,
      file_path: '.fabric-trust.json',
      expected_content: { account_id: auth.account_id },
    })
  }

  logRequest(auth.key_id, auth.account_id, 'publisher/claim', 200)
  return Response.json({ ok: true, verification_methods: verificationMethods }, { headers: CORS })
}

function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
