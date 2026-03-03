import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { logApiUsage } from '@/lib/api-usage'
import { logCronRun } from '@/lib/cron-log'

export const maxDuration = 120

const SYSTEM_PROMPT = `You are the Fabric Trust Index senior ops analyst. You review the live system health dashboard data twice daily and produce an actionable ops report.

Your report structure:
## Critical — Fix Now
Issues that are actively breaking scoring, blocking legitimate services, or causing data quality problems.

## Warnings — Fix Soon
Issues that will become problems if not addressed. Include priority order.

## Trends
Compare against what you'd expect for a healthy index of this size. Flag anomalies — unusual distributions, rates that seem off, counts that don't add up.

## Healthy
What's working well. Keep this brief — 2-3 bullet points max.

## Fix Prompts
For every issue in Critical and Warnings above, provide a ready-to-paste Claude Code prompt that the operator can copy directly into their terminal. Format each as:

**[Short title]**
\`\`\`
[The exact prompt to paste into Claude Code. Be specific — reference file paths, function names, the exact bug, and what the fix should do. The prompt should give Claude Code enough context to find and fix the issue without further clarification.]
\`\`\`

The codebase is at ~/Desktop/fabric-trust-index (Next.js 15, TypeScript, Supabase). The operator pastes these prompts directly into Claude Code which has full access to the repo. Write prompts that are self-contained — include the "why" and "what" so Claude Code can implement the fix autonomously.

Be specific with numbers from the data. Reference service slugs, override names, signal values.`

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
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
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
    await logCronRun('review-dashboard', {}, 'failed', `Dashboard fetch: ${err instanceof Error ? err.message : 'Unknown'}`)
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
    await logCronRun('review-dashboard', {}, 'failed', `Insert review row: ${insertError?.message ?? 'Unknown'}`)
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

    // Track API costs
    logApiUsage({ caller: 'review-dashboard', model: 'claude-opus-4-6', input_tokens: tokenUsage.input_tokens, output_tokens: tokenUsage.output_tokens, duration_ms: durationMs }).catch(() => {})

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

    await logCronRun('review-dashboard', {
      review_id: reviewId,
      duration_ms: durationMs,
      token_usage: tokenUsage,
      analysis_length: analysis.length,
    })
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

    await logCronRun('review-dashboard', { review_id: reviewId, duration_ms: durationMs }, 'failed', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json(
      { error: 'Review failed', message: err instanceof Error ? err.message : 'Unknown', review_id: reviewId },
      { status: 500 },
    )
  }
}
