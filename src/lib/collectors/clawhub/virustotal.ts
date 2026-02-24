import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import type { ClawHubSkillData } from './api'
import { getVTReport } from './vt-client'

/**
 * VirusTotal Scan signal (weight: 0.30)
 *
 * ClawHub submits every skill to VirusTotal on publish. Since the API
 * doesn't expose the file hash, we use ClawHub's moderation flags as
 * the primary signal, with direct VT API lookup when a hash is known.
 *
 * Scoring:
 * - VT scan found, 0 malicious + 0 suspicious -> 5.0
 * - VT scan found, 0 malicious, 1-2 suspicious -> 3.5 (likely false positive)
 * - VT scan found, 1-2 malicious -> 1.5
 * - VT scan found, 3+ malicious -> 0.0
 * - ClawHub moderation: isMalwareBlocked -> 0.0
 * - ClawHub moderation: isSuspicious only -> 3.0
 * - ClawHub moderation: clean (both false) -> 4.5
 * - No moderation data -> 2.5 (neutral)
 * - VT not available / hash unknown -> 2.5
 */
export async function collectVirusTotalScan(
  data: ClawHubSkillData | null,
  vtHash?: string | null,
): Promise<CollectorResult> {
  const metadata: Record<string, unknown> = {}

  // If we have a VT hash, try direct VT API lookup (most accurate)
  if (vtHash) {
    const report = await getVTReport(vtHash)
    if (report) {
      metadata.source = 'virustotal_api'
      metadata.sha256 = report.sha256
      metadata.malicious = report.malicious
      metadata.suspicious = report.suspicious
      metadata.undetected = report.undetected
      metadata.harmless = report.harmless
      metadata.reputation = report.reputation
      metadata.lastAnalysisDate = report.lastAnalysisDate

      let score: number
      if (report.malicious >= 3) {
        score = 0.0
      } else if (report.malicious >= 1) {
        score = 1.5
      } else if (report.suspicious >= 3) {
        score = 2.0
      } else if (report.suspicious >= 1) {
        score = 3.5
      } else {
        score = 5.0
      }

      return {
        signal_name: 'virustotal_scan',
        score: clampScore(score),
        metadata,
        sources: [`virustotal:${report.sha256}`],
      }
    }
    // VT lookup failed — fall through to moderation data
    metadata.vtLookupFailed = true
  }

  // Fall back to ClawHub moderation data
  if (!data) {
    return {
      signal_name: 'virustotal_scan',
      score: 2.5,
      metadata: { source: 'none', reason: 'api_unavailable' },
      sources: [],
    }
  }

  metadata.source = 'clawhub_moderation'
  const mod = data.moderation as { isSuspicious?: boolean; isMalwareBlocked?: boolean } | null

  if (!mod) {
    // No moderation data at all — neutral default
    metadata.reason = 'no_moderation_data'
    return {
      signal_name: 'virustotal_scan',
      score: 2.5,
      metadata,
      sources: ['clawhub:api'],
    }
  }

  metadata.isSuspicious = mod.isSuspicious ?? false
  metadata.isMalwareBlocked = mod.isMalwareBlocked ?? false

  let score: number
  if (mod.isMalwareBlocked) {
    score = 0.0
    metadata.reason = 'malware_blocked'
  } else if (mod.isSuspicious) {
    // Flagged but not blocked — could be false positive (link-brain, qa-patrol)
    score = 3.0
    metadata.reason = 'suspicious_flagged'
  } else {
    // Clean moderation — slightly below 5.0 since we don't have full VT data
    score = 4.5
    metadata.reason = 'clean_moderation'
  }

  return {
    signal_name: 'virustotal_scan',
    score: clampScore(score),
    metadata,
    sources: ['clawhub:api'],
  }
}
