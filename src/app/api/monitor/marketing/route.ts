import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const [tasks, content, kols, kpis, networking] = await Promise.all([
    supabase.from('marketing_tasks').select('*').order('sort_order'),
    supabase.from('marketing_content').select('*').order('sort_order').order('created_at', { ascending: false }),
    supabase.from('marketing_kol_tracker').select('*').order('tier').order('sort_order'),
    supabase.from('marketing_kpis').select('*').order('month').order('metric'),
    supabase.from('marketing_networking').select('*').order('sort_order').order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    tasks: tasks.data ?? [],
    content: content.data ?? [],
    kols: kols.data ?? [],
    kpis: kpis.data ?? [],
    networking: networking.data ?? [],
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
    case 'toggle_task': {
      const { id, status } = body
      const { error } = await supabase
        .from('marketing_tasks')
        .update({ status, completed_at: status === 'done' ? now : null, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'update_content': {
      const { id, updates } = body
      const { error } = await supabase
        .from('marketing_content')
        .update({ ...updates, published_at: updates.status === 'published' ? now : undefined, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'create_content': {
      const { title, type, platform, target_date, status, notes, content_body } = body
      const { data, error } = await supabase
        .from('marketing_content')
        .insert({ title, type, platform: platform || 'x', target_date: target_date || null, status: status || 'idea', notes: notes || null, content_body: content_body || null })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    case 'delete_content': {
      const { id } = body
      const { error } = await supabase.from('marketing_content').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'update_kol': {
      const { id, updates, increment_engagement } = body
      if (increment_engagement) {
        const { data: current } = await supabase.from('marketing_kol_tracker').select('engagement_count').eq('id', id).single()
        updates.engagement_count = (current?.engagement_count ?? 0) + 1
        updates.last_engaged_at = now
      }
      const { error } = await supabase
        .from('marketing_kol_tracker')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'create_kol': {
      const { name, handle, platform, tier, followers, notes } = body
      const { data, error } = await supabase
        .from('marketing_kol_tracker')
        .insert({ name, handle, platform: platform || 'x', tier: tier || 2, followers: followers || null, stage: 'follow', engagement_count: 0, notes: notes || null })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    case 'update_kpi': {
      const { id, actual } = body
      const { error } = await supabase
        .from('marketing_kpis')
        .update({ actual, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'create_networking': {
      const { project_name, handle, platform, trust_page_slug, notes } = body
      const { data, error } = await supabase
        .from('marketing_networking')
        .insert({ project_name, handle: handle || null, platform: platform || 'x', trust_page_slug: trust_page_slug || null, stage: 'identified', engagement_count: 0, notes: notes || null })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }

    case 'update_networking': {
      const { id, updates, increment_engagement } = body
      if (increment_engagement) {
        const { data: current } = await supabase.from('marketing_networking').select('engagement_count').eq('id', id).single()
        updates.engagement_count = (current?.engagement_count ?? 0) + 1
        updates.last_contacted_at = now
      }
      const { error } = await supabase
        .from('marketing_networking')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete_networking': {
      const { id } = body
      const { error } = await supabase.from('marketing_networking').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
