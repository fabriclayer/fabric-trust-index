/**
 * Shared scoring validation constants.
 * Used by collectors/runner.ts and validation modules.
 */

/** Metadata reasons that indicate a fallback/default score (no real data evaluated) */
export const FALLBACK_REASONS = new Set([
  'no_github_repo',
  'no_packages_to_scan',
  'no_endpoint_configured',
  'no_download_data',
  'publisher_not_found',
  'no_publisher_github',
  'osv_api_unavailable',
  'repo_not_accessible',
  'github_api_failed',
])

/** Default/fallback scores assigned by each collector when real data is unavailable */
export const SIGNAL_DEFAULTS: Record<string, number> = {
  vulnerability: 3.0,
  operational: 2.5,
  maintenance: 3.0,
  adoption: 3.0,
  transparency: 2.0,
  publisher_trust: 2.5,
}
