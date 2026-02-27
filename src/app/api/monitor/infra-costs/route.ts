import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data } = await supabase
    .from('monitor_infra_costs')
    .select('*')
    .order('sort_order')
    .order('created_at')

  return NextResponse.json({ costs: data ?? [] })
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
      const { label, monthly_cost } = body
      const { data, error } = await supabase
        .from('monitor_infra_costs')
        .insert({ label, monthly_cost: monthly_cost || 0 })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    case 'update': {
      const { id, label, monthly_cost } = body
      const updates: Record<string, unknown> = { updated_at: now }
      if (label !== undefined) updates.label = label
      if (monthly_cost !== undefined) updates.monthly_cost = monthly_cost
      const { error } = await supabase
        .from('monitor_infra_costs')
        .update(updates)
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete': {
      const { id } = body
      const { error } = await supabase.from('monitor_infra_costs').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
