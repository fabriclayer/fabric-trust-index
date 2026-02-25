import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runGoldenSetValidation } from '@/lib/validation/golden-set'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const result = await runGoldenSetValidation(supabase)

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Golden set validation failed:', err)
    return NextResponse.json(
      { error: 'Validation failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
