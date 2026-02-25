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

/** Check if an OSV vulnerability has a fix available */
export function hasFixAvailable(vuln: OsvVulnerability): boolean {
  return vuln.affected?.some(a =>
    a.ranges?.some(r => r.events.some(e => e.fixed))
  ) ?? false
}

/** Classify an OSV vulnerability into a severity tier based on database metadata or CVSS */
export function classifySeverity(vuln: OsvVulnerability): 'critical' | 'high' | 'medium' | 'low' {
  // 1. Check database_specific.severity first (most reliable for GHSA)
  const dbSev = vuln.database_specific?.severity?.toUpperCase()
  if (dbSev === 'CRITICAL') return 'critical'
  if (dbSev === 'HIGH') return 'high'
  if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') return 'medium'
  if (dbSev === 'LOW') return 'low'

  // 2. Try to parse numeric CVSS score from vector string (e.g. "CVSS:3.1/AV:N/...")
  if (vuln.severity?.length) {
    const scoreStr = vuln.severity[0].score
    // Check if it's a plain numeric score
    const numeric = parseFloat(scoreStr)
    if (!isNaN(numeric)) {
      if (numeric >= 9.0) return 'critical'
      if (numeric >= 7.0) return 'high'
      if (numeric >= 4.0) return 'medium'
      return 'low'
    }
    // CVSS vector string — estimate severity from attack vector components
    if (scoreStr.includes('/C:H/I:H') || scoreStr.includes('/VC:H/VI:H')) return 'critical'
    if (scoreStr.includes('/C:H') || scoreStr.includes('/I:H') || scoreStr.includes('/VC:H') || scoreStr.includes('/VI:H')) return 'high'
    if (scoreStr.includes('/C:L') || scoreStr.includes('/I:L') || scoreStr.includes('/VC:L') || scoreStr.includes('/VI:L')) return 'medium'
  }

  return 'low'
}
