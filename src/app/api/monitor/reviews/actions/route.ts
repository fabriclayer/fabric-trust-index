import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reviewId = request.nextUrl.searchParams.get('review_id')
  if (!reviewId) {
    return NextResponse.json({ error: 'review_id required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: actions } = await supabase
    .from('review_actions')
    .select('action_hash, action_text, completed, completed_at')
    .eq('review_id', reviewId)

  return NextResponse.json({ actions: actions ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { review_id, action_hash, action_text, completed } = await request.json() as {
    review_id: string
    action_hash: string
    action_text: string
    completed: boolean
  }

  if (!review_id || !action_hash || !action_text) {
    return NextResponse.json({ error: 'review_id, action_hash, and action_text required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('review_actions')
    .upsert({
      review_id,
      action_hash,
      action_text,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    }, { onConflict: 'review_id,action_hash' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
