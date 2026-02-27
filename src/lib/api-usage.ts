import { createServerClient } from '@/lib/supabase/server'

interface ApiUsageEntry {
  caller: string
  model: string
  input_tokens: number
  output_tokens: number
  service_slug?: string
  duration_ms?: number
}

const COST_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
}

export async function logApiUsage(entry: ApiUsageEntry): Promise<void> {
  const rates = COST_RATES[entry.model] ?? { input: 0, output: 0 }
  const costUsd = (entry.input_tokens * rates.input / 1_000_000) + (entry.output_tokens * rates.output / 1_000_000)

  const supabase = createServerClient()
  await supabase.from('api_usage_log').insert({
    caller: entry.caller,
    model: entry.model,
    input_tokens: entry.input_tokens,
    output_tokens: entry.output_tokens,
    cost_usd: costUsd,
    service_slug: entry.service_slug ?? null,
    duration_ms: entry.duration_ms ?? null,
  })
}

interface UsageBucket {
  calls: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  by_caller: Record<string, { calls: number; cost_usd: number }>
}

export interface UsageSummary {
  today: UsageBucket
  month: UsageBucket
}

function emptyBucket(): UsageBucket {
  return { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, by_caller: {} }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aggregate(rows: any[]): UsageBucket {
  const bucket = emptyBucket()
  for (const r of rows) {
    bucket.calls++
    bucket.input_tokens += r.input_tokens ?? 0
    bucket.output_tokens += r.output_tokens ?? 0
    bucket.cost_usd += parseFloat(r.cost_usd ?? '0')
    const caller = r.caller as string
    if (!bucket.by_caller[caller]) bucket.by_caller[caller] = { calls: 0, cost_usd: 0 }
    bucket.by_caller[caller].calls++
    bucket.by_caller[caller].cost_usd += parseFloat(r.cost_usd ?? '0')
  }
  return bucket
}

export async function getUsageSummary(supabase: ReturnType<typeof createServerClient>): Promise<UsageSummary> {
  const now = new Date()
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00Z'
  const monthStart = now.toISOString().slice(0, 7) + '-01T00:00:00Z'

  const [todayRes, monthRes] = await Promise.all([
    supabase.from('api_usage_log').select('*').gte('created_at', todayStart),
    supabase.from('api_usage_log').select('*').gte('created_at', monthStart),
  ])

  return {
    today: aggregate(todayRes.data ?? []),
    month: aggregate(monthRes.data ?? []),
  }
}
