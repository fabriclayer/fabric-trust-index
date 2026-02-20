import type { DbService } from '@/lib/supabase/types'

export interface CollectorResult {
  signal_name: string
  score: number // 0.0–5.0
  metadata: Record<string, unknown>
  sources: string[]
}

export interface Collector {
  name: string
  collect(service: DbService): Promise<CollectorResult>
}

/** Clamp a value between 0 and 5 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(5, Math.round(score * 100) / 100))
}
