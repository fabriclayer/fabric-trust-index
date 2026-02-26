import { createClient } from '@supabase/supabase-js'

/** Service-role client — use for writes and admin operations only */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Anon-key client — use for public read-only queries (respects RLS) */
export function createAnonClient() {
  // Strip any whitespace/newlines that may be in the env var (Vercel multi-line values)
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s+/g, '')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey
  )
}
