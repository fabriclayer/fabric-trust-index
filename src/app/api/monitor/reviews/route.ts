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

  const reviewList = reviews ?? []

  // Fetch action counts for all reviews in a single query
  const reviewIds = reviewList.map(r => r.id)
  let actionCounts: Record<string, { total: number; completed: number }> = {}
  if (reviewIds.length > 0) {
    const { data: actions } = await supabase
      .from('review_actions')
      .select('review_id, completed')
      .in('review_id', reviewIds)

    if (actions) {
      for (const a of actions) {
        if (!actionCounts[a.review_id]) actionCounts[a.review_id] = { total: 0, completed: 0 }
        actionCounts[a.review_id].total++
        if (a.completed) actionCounts[a.review_id].completed++
      }
    }
  }

  const enriched = reviewList.map(r => ({
    ...r,
    action_total: actionCounts[r.id]?.total ?? 0,
    action_completed: actionCounts[r.id]?.completed ?? 0,
  }))

  return NextResponse.json({ reviews: enriched })
}
