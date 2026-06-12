import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { rateLimit } from '@/lib/rate-limit'
import { generateApiKey, errorResponse } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  // Rate limit: 3 per minute per IP
  const limited = rateLimit(request, 'api-signup', 3, 60_000)
  if (limited) return limited

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('invalid_request', 'Invalid JSON body.', 400)
  }

  const email = body.email?.trim()?.toLowerCase()
  if (!email || !email.includes('@') || email.length > 320) {
    return errorResponse('invalid_request', 'A valid email address is required.', 400)
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Upsert account
  const { data: existingAccount } = await supabase
    .from('api_accounts')
    .select('id')
    .eq('email', email)
    .single()

  let accountId: string
  if (existingAccount) {
    accountId = existingAccount.id
  } else {
    const { data: newAccount, error } = await supabase
      .from('api_accounts')
      .insert({ email, plan: 'free' })
      .select('id')
      .single()
    if (error || !newAccount) {
      console.error('Account creation failed:', error)
      return Response.json({ ok: true }, { headers: CORS }) // No enumeration
    }
    accountId = newAccount.id
  }

  // Check for existing active key
  const { data: existingKey } = await supabase
    .from('api_keys')
    .select('key_prefix')
    .eq('account_id', accountId)
    .eq('active', true)
    .is('revoked_at', null)
    .single()

  if (existingKey) {
    // Email the prefix and a note, never send a second key
    await sendExistingKeyEmail(email, existingKey.key_prefix)
    return Response.json({ ok: true }, { headers: CORS })
  }

  // Mint new key
  const rawKey = generateApiKey()
  const prefix = rawKey.slice(0, 12)
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey))
  const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

  await supabase.from('api_keys').insert({
    key_hash: keyHash,
    key_prefix: prefix,
    name: `API key for ${email}`,
    rate_limit: 10,
    active: true,
    account_id: accountId,
  })

  // Email full key once
  await sendNewKeyEmail(email, rawKey)

  return Response.json({ ok: true }, { headers: CORS })
}

async function sendNewKeyEmail(email: string, fullKey: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'Fabric Trust Index <api@fabriclayer.ai>',
    to: email,
    subject: 'Your Fabric Trust Index API Key',
    text: `Welcome to the Fabric Trust Index API.

Your API key (shown once, save it now):

${fullKey}

Free tier: 1,000 requests per month.

Quick start:

  curl https://api.fabriclayer.ai/lookup?slug=openai \\
    -H "Authorization: Bearer ${fullKey}"

Documentation: https://api.fabriclayer.ai/openapi.json
Upgrade to Pro: https://trust.fabriclayer.ai/api-access

Questions? Reply to this email.
`,
  }).catch(err => console.error('Signup email failed:', err))
}

async function sendExistingKeyEmail(email: string, prefix: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'Fabric Trust Index <api@fabriclayer.ai>',
    to: email,
    subject: 'Fabric Trust Index API Key Reminder',
    text: `You already have an active API key for this email.

Your key prefix: ${prefix}...

If you have lost your key, contact api@fabriclayer.ai for assistance.

Documentation: https://api.fabriclayer.ai/openapi.json
`,
  }).catch(err => console.error('Existing key email failed:', err))
}
