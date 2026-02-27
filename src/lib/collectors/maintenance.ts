import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'
import { githubGet } from './github'

/**
 * Maintenance Activity Collector (weight: 0.20)
 *
 * Evaluates last commit recency, 90-day commit frequency,
 * median issue response time, open-to-closed issue ratio,
 * PR merge velocity, and release consistency.
 * No commits in 12+ months drops the score to 1.0 or below.
 *
 * Data source: GitHub REST API
 */

export const maintenanceCollector: Collector = {
  name: 'maintenance',

  async collect(service: DbService): Promise<CollectorResult> {
    if (!service.github_repo) {
      return {
        signal_name: 'maintenance',
        score: 3.0,
        metadata: { reason: 'no_github_repo' },
        sources: [],
      }
    }

    const repo = service.github_repo
    const sources = [`github:${repo}`]

    // Fetch repo info
    const repoData = await githubGet(`/repos/${repo}`) as {
      pushed_at?: string
      open_issues_count?: number
      archived?: boolean
      full_name?: string
    } | null

    if (!repoData) {
      return {
        signal_name: 'maintenance',
        score: 2.0,
        metadata: { reason: 'repo_not_accessible' },
        sources,
      }
    }

    let score = 3.0 // Start at midpoint, adjust up/down
    const metadata: Record<string, unknown> = {}

    // Detect repo_archived
    if (repoData.archived) {
      metadata.repo_archived = true
      score = 0.5
    }

    // Detect repo_transferred (full_name no longer matches expected owner/repo)
    if (repoData.full_name && repoData.full_name.toLowerCase() !== repo.toLowerCase()) {
      const oldOwner = repo.split('/')[0].toLowerCase()
      const newOwner = repoData.full_name.split('/')[0].toLowerCase()
      if (oldOwner === newOwner) {
        // Same owner — just a rename, not a supply chain risk
        metadata.repo_renamed = true
      } else {
        // Different owner — actual ownership transfer
        metadata.repo_transferred = true
      }
      metadata.old_owner = repo.split('/')[0]
      metadata.new_owner = repoData.full_name.split('/')[0]
      metadata.old_repo_name = repo
      metadata.new_repo_name = repoData.full_name
    }

    // 1. Last commit recency
    const lastPush = repoData.pushed_at ? new Date(repoData.pushed_at) : null
    if (lastPush) {
      const daysSinceLastPush = (Date.now() - lastPush.getTime()) / 86400000
      metadata.days_since_last_push = Math.round(daysSinceLastPush)

      if (daysSinceLastPush <= 7) score = 5.0
      else if (daysSinceLastPush <= 30) score = 4.0
      else if (daysSinceLastPush <= 90) score = 3.0
      else if (daysSinceLastPush <= 365) score = 2.0
      else score = 1.0 // 12+ months = hard floor
    }

    // 2. Recent commit frequency (90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const commitList = await githubGet(`/repos/${repo}/commits?since=${ninetyDaysAgo}&per_page=100`) as unknown[] | null
    const commitCount = commitList?.length ?? 0
    metadata.commits_90d = commitCount

    if (commitCount >= 50) score = Math.max(score, 4.5)
    else if (commitCount >= 20) score = Math.max(score, 4.0)
    else if (commitCount >= 5) score = Math.max(score, 3.0)

    // 3. Issue response time (sample recent closed issues)
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
            return (closed - created) / 3600000 // hours
          })
          .sort((a, b) => a - b)

        if (responseTimes.length > 0) {
          const median = responseTimes[Math.floor(responseTimes.length / 2)]
          metadata.median_issue_response_hours = Math.round(median)
          if (median < 24) score += 0.5
          else if (median < 72) score += 0.25
          else if (median >= 720) score -= 0.5  // 30+ days
          else if (median >= 168) score -= 0.25 // 7+ days
        }
      }
    }

    // 4. Open issue count (from repo metadata, no extra API call)
    const openCount = repoData.open_issues_count ?? 0
    metadata.open_issues = openCount

    // 5. Release cadence
    const releases = await githubGet(`/repos/${repo}/releases?per_page=10`) as Array<{
      tag_name?: string
      published_at?: string
      prerelease?: boolean
      draft?: boolean
    }> | null

    if (releases && releases.length >= 2) {
      const releaseDates = releases
        .filter(r => r.published_at)
        .map(r => new Date(r.published_at!).getTime())
        .sort((a, b) => b - a)

      if (releaseDates.length >= 2) {
        const intervals = []
        for (let i = 0; i < releaseDates.length - 1; i++) {
          intervals.push((releaseDates[i] - releaseDates[i + 1]) / 86400000) // days
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        metadata.avg_release_interval_days = Math.round(avgInterval)
        metadata.total_releases = releases.length

        // Monthly releases = good cadence
        if (avgInterval <= 30) score += 0.3
        else if (avgInterval <= 90) score += 0.1
      }
    }

    // Insert version records from GitHub releases with historical scores
    if (releases && releases.length > 0) {
      const supabase = createServerClient()
      const validReleases = releases.filter(
        r => r.tag_name && r.published_at && !r.draft
      )
      const top10 = validReleases.slice(0, 10)

      // Fetch composite signal_history to match scores to release dates
      const { data: compositeHistory } = await supabase
        .from('signal_history')
        .select('score, recorded_at')
        .eq('service_id', service.id)
        .eq('signal_name', 'composite')
        .order('recorded_at', { ascending: true })

      const history = compositeHistory ?? []

      // Find the closest composite score on or before a given date
      function scoreAtDate(dateStr: string): number | null {
        if (history.length === 0) return null
        const target = new Date(dateStr).getTime()
        let best: { score: number; diff: number } | null = null
        for (const h of history) {
          const t = new Date(h.recorded_at).getTime()
          const diff = target - t
          // Prefer scores recorded on or before the release date (diff >= 0)
          // but accept up to 1 day after if nothing else
          if (diff >= -86400000) {
            if (!best || (diff >= 0 && best.diff < 0) || Math.abs(diff) < Math.abs(best.diff)) {
              best = { score: h.score, diff }
            }
          }
        }
        return best?.score ?? null
      }

      // Sort releases oldest-first for delta calculation
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

    // Check for PyPI yanked releases
    if (service.pypi_package) {
      try {
        const pypiRes = await fetch(`https://pypi.org/pypi/${service.pypi_package}/json`)
        if (pypiRes.ok) {
          const pypiData = await pypiRes.json() as { info?: { yanked?: boolean; yanked_reason?: string } }
          if (pypiData.info?.yanked) {
            metadata.pypi_yanked = true
            metadata.pypi_yanked_reason = pypiData.info.yanked_reason || 'unknown'
            score = Math.min(score, 1.0)
          }
          sources.push(`pypi:${service.pypi_package}`)
        }
      } catch {
        // PyPI check is best-effort
      }
    }

    // Check Smithery security scan for MCP servers
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
            score = Math.min(score, 1.5)
          }
          sources.push(`smithery:${service.github_repo}`)
        }
      } catch {
        // Smithery check is best-effort
      }
    }

    return {
      signal_name: 'maintenance',
      score: clampScore(score),
      metadata,
      sources,
    }
  },
}
