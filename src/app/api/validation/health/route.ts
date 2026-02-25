import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runHealthChecks } from '@/lib/validation/health-checks'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const result = await runHealthChecks(supabase)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Health checks failed:', err)
    return NextResponse.json(
      { error: 'Health checks failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
