import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

const VALID_ISSUE_TYPES = ['incorrect_score', 'incorrect_info', 'security_concern', 'other']

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, 'report-issue', 5, 60_000)
  if (limited) return limited

  try {
    const body = await request.json()
    const { service_slug, service_name, issue_type, description, contact_email } = body

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

    if (!issue_type || !VALID_ISSUE_TYPES.includes(issue_type)) {
      return NextResponse.json(
        { error: 'Valid issue_type is required' },
        { status: 400 }
      )
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'description is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { error } = await supabase.from('issue_reports').insert({
      service_slug: service_slug.trim(),
      service_name: service_name.trim(),
      issue_type,
      description: description.trim(),
      contact_email: contact_email?.trim() || null,
    })

    if (error) {
      console.error('Failed to insert issue report:', error)
      return NextResponse.json(
        { error: 'Failed to submit report' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Report issue error:', err)
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}
