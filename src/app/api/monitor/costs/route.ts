import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aggregate(rows: any[]) {
  const bucket = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, by_caller: {} as Record<string, { calls: number; cost_usd: number }> }
  for (const r of rows) {
    bucket.calls++
    bucket.input_tokens += r.input_tokens ?? 0
    bucket.output_tokens += r.output_tokens ?? 0
    bucket.cost_usd += parseFloat(r.cost_usd ?? '0')
    const caller = r.caller as string
    if (!bucket.by_caller[caller]) bucket.by_caller[caller] = { calls: 0, cost_usd: 0 }
    bucket.by_caller[caller].calls++
    bucket.by_caller[caller].cost_usd += parseFloat(r.cost_usd ?? '0')
  }
  return bucket
}

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = new Date()
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00Z'
  const monthStart = now.toISOString().slice(0, 7) + '-01T00:00:00Z'
  const day14Start = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z'

  const [itemsRes, todayRes, monthRes, daily14Res] = await Promise.all([
    supabase.from('cost_tracking').select('*').order('category').order('sort_order').order('created_at'),
    supabase.from('api_usage_log').select('*').gte('created_at', todayStart),
    supabase.from('api_usage_log').select('*').gte('created_at', monthStart),
    supabase.from('api_usage_log').select('created_at, cost_usd, caller').gte('created_at', day14Start),
  ])

  const daily14 = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayRows = (daily14Res.data ?? []).filter((r: any) => (r.created_at as string).slice(0, 10) === dateStr)
    daily14.push({
      date: dateStr,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cost_usd: dayRows.reduce((s: number, r: any) => s + parseFloat(r.cost_usd ?? '0'), 0),
      calls: dayRows.length,
    })
  }

  return NextResponse.json({
    items: itemsRes.data ?? [],
    apiUsage: {
      today: aggregate(todayRes.data ?? []),
      month: aggregate(monthRes.data ?? []),
      daily14,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createServerClient()
  const now = new Date().toISOString()

  switch (body.action) {
    case 'create': {
      const { category, provider, item, cost_type, amount_usd, billing_cycle, renewal_date, notes } = body
      const { data, error } = await supabase
        .from('cost_tracking')
        .insert({
          category: category || 'infrastructure',
          provider,
          item,
          cost_type: cost_type || 'fixed',
          amount_usd: amount_usd || 0,
          billing_cycle: billing_cycle || 'monthly',
          renewal_date: renewal_date || null,
          notes: notes || null,
        })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    case 'update': {
      const { id, ...fields } = body
      delete fields.action
      const { error } = await supabase
        .from('cost_tracking')
        .update({ ...fields, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete': {
      const { id } = body
      const { error } = await supabase.from('cost_tracking').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
