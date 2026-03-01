import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult, SubSignalScore } from './types'
import { clampScore, computeSubSignalScore } from './types'
import { createServerClient } from '@/lib/supabase/server'
import { githubGet, githubExists } from './github'

/**
 * Maintenance Activity Collector (weight: 0.15)
 *
 * Sub-signals:
 *   commit_recency       (0.30) — days since last commit
 *   release_cadence      (0.25) — days since last release
 *   issue_responsiveness (0.20) — median time to close issues
 *   ci_cd_presence       (0.25) — GitHub Actions workflows present
 *
 * Also detects override conditions (repo_archived, repo_transferred,
 * repo_renamed, pypi_yanked, smithery_scan) as metadata flags for runner.ts.
 */

function scoreDaysTier(days: number): number {
  if (days < 7) return 5.0
  if (days < 30) return 4.0
  if (days < 90) return 3.0
  if (days < 180) return 2.0
  if (days < 365) return 1.0
  return 0.0
}

function scoreResponseTime(medianHours: number): number {
  if (medianHours < 24) return 5.0
  if (medianHours < 72) return 4.0
  if (medianHours < 168) return 3.0
  if (medianHours < 720) return 2.0
  return 1.0
}

export const maintenanceCollector: Collector = {
  name: 'maintenance',

  async collect(service: DbService): Promise<CollectorResult> {
    if (!service.github_repo) {
      return {
        signal_name: 'maintenance',
        score: 0,
        sub_signals: [
          { name: 'commit_recency', score: 0, weight: 0.30, has_data: false },
          { name: 'release_cadence', score: 0, weight: 0.25, has_data: false },
          { name: 'issue_responsiveness', score: 0, weight: 0.20, has_data: false },
          { name: 'ci_cd_presence', score: 0, weight: 0.25, has_data: false },
        ],
        metadata: { reason: 'no_github_repo' },
        sources: [],
      }
    }

    const repo = service.github_repo
    const sources = [`github:${repo}`]
    const metadata: Record<string, unknown> = {}

    const repoData = await githubGet(`/repos/${repo}`) as {
      pushed_at?: string
      open_issues_count?: number
      archived?: boolean
      full_name?: string
    } | null

    if (!repoData) {
      return {
        signal_name: 'maintenance',
        score: 0,
        sub_signals: [
          { name: 'commit_recency', score: 0, weight: 0.30, has_data: false },
          { name: 'release_cadence', score: 0, weight: 0.25, has_data: false },
          { name: 'issue_responsiveness', score: 0, weight: 0.20, has_data: false },
          { name: 'ci_cd_presence', score: 0, weight: 0.25, has_data: false },
        ],
        metadata: { reason: 'repo_not_accessible' },
        sources,
      }
    }

    // Override detection
    if (repoData.archived) {
      metadata.repo_archived = true
    }

    if (repoData.full_name && repoData.full_name.toLowerCase() !== repo.toLowerCase()) {
      const oldOwner = repo.split('/')[0].toLowerCase()
      const newOwner = repoData.full_name.split('/')[0].toLowerCase()
      if (oldOwner === newOwner) {
        metadata.repo_renamed = true
      } else {
        metadata.repo_transferred = true
      }
      metadata.old_owner = repo.split('/')[0]
      metadata.new_owner = repoData.full_name.split('/')[0]
      metadata.old_repo_name = repo
      metadata.new_repo_name = repoData.full_name
    }

    // ── Sub-signal 1: commit_recency (0.30) ──
    let commitRecencyScore = 0
    let commitRecencyHasData = false

    const lastPush = repoData.pushed_at ? new Date(repoData.pushed_at) : null
    if (lastPush) {
      const daysSinceLastPush = (Date.now() - lastPush.getTime()) / 86400000
      metadata.days_since_last_push = Math.round(daysSinceLastPush)
      commitRecencyScore = scoreDaysTier(daysSinceLastPush)
      commitRecencyHasData = true
    }

    // ── Sub-signal 2: release_cadence (0.25) ──
    let releaseCadenceScore = 2.0
    let releaseCadenceHasData = false

    const releases = await githubGet(`/repos/${repo}/releases?per_page=10`) as Array<{
      tag_name?: string
      published_at?: string
      prerelease?: boolean
      draft?: boolean
    }> | null

    if (releases) {
      releaseCadenceHasData = true

      if (releases.length > 0) {
        const releaseDates = releases
          .filter(r => r.published_at)
          .map(r => new Date(r.published_at!).getTime())
          .sort((a, b) => b - a)

        if (releaseDates.length > 0) {
          const daysSinceLastRelease = (Date.now() - releaseDates[0]) / 86400000
          metadata.days_since_last_release = Math.round(daysSinceLastRelease)
          releaseCadenceScore = scoreDaysTier(daysSinceLastRelease)
        }

        metadata.total_releases = releases.length
      }
    }

    // ── Sub-signal 3: issue_responsiveness (0.20) ──
    let issueResponsivenessScore = 0
    let issueResponsivenessHasData = false

    const closedIssues = await githubGet(`/repos/${repo}/issues?state=closed&sort=updated&per_page=10&direction=desc`) as Array<{
      created_at?: string
      closed_at?: string
      pull_request?: unknown
    }> | null

    if (closedIssues && closedIssues.length > 0) {
      const issuesOnly = closedIssues.filter(i => !i.pull_request)
      if (issuesOnly.length > 0) {
        const responseTimes = issuesOnly
          .filter(i => i.created_at && i.closed_at)
          .map(i => {
            const created = new Date(i.created_at!).getTime()
            const closed = new Date(i.closed_at!).getTime()
            return (closed - created) / 3600000
          })
          .sort((a, b) => a - b)

        if (responseTimes.length > 0) {
          const median = responseTimes[Math.floor(responseTimes.length / 2)]
          metadata.median_issue_response_hours = Math.round(median)
          issueResponsivenessScore = scoreResponseTime(median)
          issueResponsivenessHasData = true
        }
      }
    }

    // ── Sub-signal 4: ci_cd_presence (0.25) ──
    const hasWorkflows = await githubExists(`/repos/${repo}/contents/.github/workflows`)
    metadata.ci_cd_present = hasWorkflows

    const sub_signals: SubSignalScore[] = [
      { name: 'commit_recency', score: commitRecencyScore, weight: 0.30, has_data: commitRecencyHasData },
      { name: 'release_cadence', score: releaseCadenceScore, weight: 0.25, has_data: releaseCadenceHasData },
      { name: 'issue_responsiveness', score: issueResponsivenessScore, weight: 0.20, has_data: issueResponsivenessHasData },
      { name: 'ci_cd_presence', score: hasWorkflows ? 5.0 : 2.0, weight: 0.25, has_data: true },
    ]

    const score = computeSubSignalScore(sub_signals)

    metadata.open_issues = repoData.open_issues_count ?? 0

    // Insert version records from GitHub releases
    if (releases && releases.length > 0) {
      const supabase = createServerClient()
      const validReleases = releases.filter(r => r.tag_name && r.published_at && !r.draft)
      const top10 = validReleases.slice(0, 10)

      const { data: compositeHistory } = await supabase
        .from('signal_history')
        .select('score, recorded_at')
        .eq('service_id', service.id)
        .eq('signal_name', 'composite')
        .order('recorded_at', { ascending: true })

      const history = compositeHistory ?? []

      function scoreAtDate(dateStr: string): number | null {
        if (history.length === 0) return null
        const target = new Date(dateStr).getTime()
        let best: { score: number; diff: number } | null = null
        for (const h of history) {
          const t = new Date(h.recorded_at).getTime()
          const diff = target - t
          if (diff >= -86400000) {
            if (!best || (diff >= 0 && best.diff < 0) || Math.abs(diff) < Math.abs(best.diff)) {
              best = { score: h.score, diff }
            }
          }
        }
        return best?.score ?? null
      }

      const sorted = [...top10].sort((a, b) =>
        new Date(a.published_at!).getTime() - new Date(b.published_at!).getTime()
      )

      let prevScore: number | null = null
      for (const release of sorted) {
        const scoreAtRel = scoreAtDate(release.published_at!)
        const delta = scoreAtRel !== null && prevScore !== null
          ? Math.round((scoreAtRel - prevScore) * 100) / 100
          : null

        await supabase
          .from('versions')
          .upsert(
            {
              service_id: service.id,
              tag: release.tag_name!,
              released_at: release.published_at!,
              score_at_release: scoreAtRel,
              score_delta: delta,
              source: 'github',
              metadata: { prerelease: release.prerelease ?? false },
            },
            { onConflict: 'service_id,tag' }
          )

        if (scoreAtRel !== null) prevScore = scoreAtRel
      }
    }

    // PyPI yanked check
    if (service.pypi_package) {
      try {
        const pypiRes = await fetch(`https://pypi.org/pypi/${service.pypi_package}/json`)
        if (pypiRes.ok) {
          const pypiData = await pypiRes.json() as { info?: { yanked?: boolean; yanked_reason?: string } }
          if (pypiData.info?.yanked) {
            metadata.pypi_yanked = true
            metadata.pypi_yanked_reason = pypiData.info.yanked_reason || 'unknown'
          }
          sources.push(`pypi:${service.pypi_package}`)
        }
      } catch { /* best-effort */ }
    }

    // Smithery security scan for MCP servers
    if (service.discovered_from === 'smithery' && service.github_repo) {
      try {
        const smitheryRes = await fetch(
          `https://registry.smithery.ai/servers/${service.github_repo}`,
          { headers: { Accept: 'application/json', 'User-Agent': 'FabricTrustIndex/1.0' } }
        )
        if (smitheryRes.ok) {
          const smitheryData = await smitheryRes.json() as { security?: { scanPassed?: boolean; issues?: string[] } }
          if (smitheryData.security && smitheryData.security.scanPassed === false) {
            metadata.smithery_scan_failed = true
            metadata.smithery_scan_issues = smitheryData.security.issues ?? []
          }
          sources.push(`smithery:${service.github_repo}`)
        }
      } catch { /* best-effort */ }
    }

    return {
      signal_name: 'maintenance',
      score: clampScore(score),
      sub_signals,
      metadata,
      sources,
    }
  },
}
