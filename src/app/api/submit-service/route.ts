import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { service_name, url, email } = body

    if (!service_name || typeof service_name !== 'string' || !service_name.trim()) {
      return NextResponse.json(
        { error: 'service_name is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { error } = await supabase.from('service_requests').insert({
      service_name: service_name.trim(),
      url: url?.trim() || null,
      email: email?.trim() || null,
    })

    if (error) {
      console.error('Failed to insert service request:', error)
      return NextResponse.json(
        { error: 'Failed to submit request' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Submit service error:', err)
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}
