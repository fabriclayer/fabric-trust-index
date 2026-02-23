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

// ─── Shared OSV types ───

export interface OsvVulnerability {
  id: string
  summary?: string
  severity?: Array<{ type: string; score: string }>
  database_specific?: { severity?: string }
  affected?: Array<{
    package?: { name?: string; ecosystem?: string }
    ranges?: Array<{ events: Array<{ introduced?: string; fixed?: string }> }>
  }>
}

/** Classify an OSV vulnerability into a severity tier based on CVSS or database metadata */
export function classifySeverity(vuln: OsvVulnerability): 'critical' | 'high' | 'medium' | 'low' {
  if (vuln.severity?.length) {
    const cvss = parseFloat(vuln.severity[0].score)
    if (cvss >= 9.0) return 'critical'
    if (cvss >= 7.0) return 'high'
    if (cvss >= 4.0) return 'medium'
    return 'low'
  }
  const dbSev = vuln.database_specific?.severity?.toUpperCase()
  if (dbSev === 'CRITICAL') return 'critical'
  if (dbSev === 'HIGH') return 'high'
  if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') return 'medium'
  return 'low'
}
