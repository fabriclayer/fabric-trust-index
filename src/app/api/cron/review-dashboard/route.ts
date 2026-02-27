import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 120

const SYSTEM_PROMPT = `You are the Fabric Trust Index senior ops analyst. You review the live system health dashboard data twice daily and produce an actionable ops report.

Your report structure:
## Critical — Fix Now
Issues that are actively breaking scoring, blocking legitimate services, or causing data quality problems. Include specific SQL queries or curl commands to fix.

## Warnings — Fix Soon
Issues that will become problems if not addressed. Include priority order.

## Trends
Compare against what you'd expect for a healthy index of ~5,800 AI services. Flag anomalies in the numbers — unusual distributions, rates that seem off, counts that don't add up.

## Healthy
What's working well. Keep this brief.

## Recommendations
Prioritized list of improvements, with estimated effort (quick fix / half day / multi-day).

Be specific with numbers from the data. Reference service slugs, override names, signal values. Give runnable SQL queries and curl commands where relevant. This report is read by the system operator who has direct database and API access.`

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const startTime = Date.now()

  // Fetch dashboard data by calling the monitor API internally
  let dashboardData: Record<string, unknown>
  try {
    const origin = request.nextUrl.origin
    const res = await fetch(`${origin}/api/monitor`, {
      headers: { Cookie: `fabric_monitor_auth=${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Monitor API returned ${res.status}`)
    const fullData = await res.json()

    // Trim bulky arrays to reduce token count (~36k → ~3-4k)
    const events = Array.isArray(fullData.events) ? fullData.events : []
    const timeline = Array.isArray(fullData.timeline) ? fullData.timeline : []
    const discoveryQueue = Array.isArray(fullData.discoveryQueue) ? fullData.discoveryQueue : []

    dashboardData = {
      ...fullData,
      discoveryQueue: undefined,
      discoveryPending: discoveryQueue.length,
      events: events.slice(0, 5),
      eventsTotal: events.length,
      timeline: timeline.slice(0, 5),
      timelineTotal: timeline.length,
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }

  // Create pending review row
  const { data: review, error: insertError } = await supabase
    .from('monitor_reviews')
    .insert({ status: 'pending', dashboard_data: dashboardData })
    .select('id')
    .single()

  if (insertError || !review) {
    return NextResponse.json(
      { error: 'Failed to create review row', detail: insertError?.message },
      { status: 500 },
    )
  }

  const reviewId = review.id

  // Call Anthropic API
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const currentTime = new Date().toISOString()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: `${SYSTEM_PROMPT}\n\nCurrent date/time: ${currentTime}`,
        messages: [{
          role: 'user',
          content: `Analyze this Fabric Monitor dashboard data:\n\n${JSON.stringify(dashboardData, null, 2)}`,
        }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Anthropic API returned ${res.status}: ${errBody}`)
    }

    const data = await res.json()
    const analysis = data.content?.[0]?.text ?? ''
    const tokenUsage = {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      cost_estimate: ((data.usage?.input_tokens ?? 0) * 15 / 1_000_000) + ((data.usage?.output_tokens ?? 0) * 75 / 1_000_000),
    }
    const durationMs = Date.now() - startTime

    // Update review with results
    await supabase
      .from('monitor_reviews')
      .update({
        status: 'completed',
        analysis,
        token_usage: tokenUsage,
        duration_ms: durationMs,
      })
      .eq('id', reviewId)

    return NextResponse.json({
      ok: true,
      review_id: reviewId,
      duration_ms: durationMs,
      token_usage: tokenUsage,
      analysis_length: analysis.length,
    })
  } catch (err) {
    const durationMs = Date.now() - startTime

    // Update review as failed
    await supabase
      .from('monitor_reviews')
      .update({
        status: 'failed',
        analysis: err instanceof Error ? err.message : 'Unknown error',
        duration_ms: durationMs,
      })
      .eq('id', reviewId)

    return NextResponse.json(
      { error: 'Review failed', message: err instanceof Error ? err.message : 'Unknown', review_id: reviewId },
      { status: 500 },
    )
  }
}
