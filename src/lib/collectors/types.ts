import type { DbService } from '@/lib/supabase/types'
import semver from 'semver'

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
  aliases?: string[]
  summary?: string
  severity?: Array<{ type: string; score: string }>
  database_specific?: { severity?: string }
  affected?: Array<{
    package?: { name?: string; ecosystem?: string }
    ranges?: Array<{ type?: string; events: Array<{ introduced?: string; fixed?: string }> }>
  }>
}

export type PatchStatus = 'patched' | 'patch_available' | 'unpatched'

/** Coerce a version string to valid semver, stripping leading 'v' and junk */
function coerceSemver(v: string): string | null {
  const coerced = semver.coerce(v)
  return coerced ? coerced.version : null
}

/** Returns true if the string looks like a 40-char hex commit hash */
function isCommitHash(s: string): boolean {
  return /^[0-9a-f]{40}$/i.test(s)
}

/**
 * Extract all fixed versions from an OSV vulnerability across all affected entries.
 * Skips GIT ranges (commit hashes) and only returns semver-parseable versions.
 */
export function getFixedVersions(vuln: OsvVulnerability): string[] {
  const versions: string[] = []
  for (const a of vuln.affected ?? []) {
    for (const r of a.ranges ?? []) {
      // Skip GIT ranges — they use commit hashes, not version numbers
      if (r.type === 'GIT') continue
      for (const e of r.events) {
        if (e.fixed && !isCommitHash(e.fixed) && coerceSemver(e.fixed)) {
          versions.push(e.fixed)
        }
      }
    }
  }
  return versions
}

/** Check if an OSV vulnerability has a fix available */
export function hasFixAvailable(vuln: OsvVulnerability): boolean {
  return getFixedVersions(vuln).length > 0
}

/** Compare two version strings using semver. Returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const sa = coerceSemver(a)
  const sb = coerceSemver(b)
  if (!sa || !sb) return 0 // can't compare — treat as equal
  return semver.compare(sa, sb)
}

/**
 * Determine the patch status of a vulnerability against the service's latest version.
 * - 'patched': latest version >= fix version (vulnerability resolved in current release)
 * - 'patch_available': fix exists but latest version < fix version
 * - 'unpatched': no fix version exists in the advisory
 */
export function determinePatchStatus(vuln: OsvVulnerability, latestVersion: string | null): PatchStatus {
  const fixedVersions = getFixedVersions(vuln)
  if (fixedVersions.length === 0) return 'unpatched'
  if (!latestVersion) return 'patch_available'

  const current = coerceSemver(latestVersion)
  if (!current) return 'patch_available'

  // Check if the latest version is >= any fix version
  for (const fixed of fixedVersions) {
    const fixedSemver = coerceSemver(fixed)
    if (fixedSemver && semver.gte(current, fixedSemver)) return 'patched'
  }
  return 'patch_available'
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
