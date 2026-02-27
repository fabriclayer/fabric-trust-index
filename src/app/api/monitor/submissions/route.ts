import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  const [claims, reports, requests, waitlist] = await Promise.all([
    supabase.from('provider_claims').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('issue_reports').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('service_requests').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('waitlist').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  return NextResponse.json({
    claims: claims.data ?? [],
    reports: reports.data ?? [],
    requests: requests.data ?? [],
    waitlist: waitlist.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createServerClient()

  switch (body.action) {
    case 'update_claim': {
      const { id, status } = body
      const { error } = await supabase.from('provider_claims').update({ status }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'update_report': {
      const { id, status } = body
      const { error } = await supabase.from('issue_reports').update({ status }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'update_request': {
      const { id, status } = body
      const { error } = await supabase.from('service_requests').update({ status }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete_claim': {
      const { id } = body
      const { error } = await supabase.from('provider_claims').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete_report': {
      const { id } = body
      const { error } = await supabase.from('issue_reports').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete_request': {
      const { id } = body
      const { error } = await supabase.from('service_requests').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'delete_waitlist': {
      const { id } = body
      const { error } = await supabase.from('waitlist').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  }
}
