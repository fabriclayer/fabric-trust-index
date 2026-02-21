import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { service_slug, service_name, contact_name, contact_email, role, message } = body

    if (!service_slug || typeof service_slug !== 'string' || !service_slug.trim()) {
      return NextResponse.json(
        { error: 'service_slug is required' },
        { status: 400 }
      )
    }

    if (!service_name || typeof service_name !== 'string' || !service_name.trim()) {
      return NextResponse.json(
        { error: 'service_name is required' },
        { status: 400 }
      )
    }

    if (!contact_name || typeof contact_name !== 'string' || !contact_name.trim()) {
      return NextResponse.json(
        { error: 'contact_name is required' },
        { status: 400 }
      )
    }

    if (!contact_email || typeof contact_email !== 'string' || !contact_email.trim()) {
      return NextResponse.json(
        { error: 'contact_email is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { error } = await supabase.from('provider_claims').insert({
      service_slug: service_slug.trim(),
      service_name: service_name.trim(),
      contact_name: contact_name.trim(),
      contact_email: contact_email.trim(),
      role: role?.trim() || null,
      message: message?.trim() || null,
    })

    if (error) {
      console.error('Failed to insert provider claim:', error)
      return NextResponse.json(
        { error: 'Failed to submit claim' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Claim provider error:', err)
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}
