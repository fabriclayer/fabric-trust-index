import { createServerClient } from '@/lib/supabase/server'

/**
 * Log a completed cron run to the cron_runs table.
 * Call this at the end of each cron route handler.
 */
export async function logCronRun(
  cronId: string,
  result: Record<string, unknown>,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string,
): Promise<void> {
  try {
    const supabase = createServerClient()
    await supabase.from('cron_runs').insert({
      cron_id: cronId,
      status,
      result,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
  } catch {
    // Never let logging failures break the cron itself
    console.error(`[cron-log] Failed to log run for ${cronId}`)
  }
}
