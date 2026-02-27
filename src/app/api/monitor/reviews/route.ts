import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data: reviews } = await supabase
    .from('monitor_reviews')
    .select('id, created_at, status, analysis, token_usage, duration_ms')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ reviews: reviews ?? [] })
}
