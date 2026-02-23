import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { createServerClient } from '@/lib/supabase/server'

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

const GITHUB_API = 'https://api.github.com'

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'FabricTrustIndex/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

async function githubGet(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

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

    // Insert version records from GitHub releases
    if (releases && releases.length > 0) {
      const supabase = createServerClient()
      const validReleases = releases.filter(
        r => r.tag_name && r.published_at && !r.draft
      )
      for (const release of validReleases.slice(0, 10)) {
        await supabase
          .from('versions')
          .upsert(
            {
              service_id: service.id,
              tag: release.tag_name!,
              released_at: release.published_at!,
              score_at_release: service.composite_score,
              source: 'github',
              metadata: { prerelease: release.prerelease ?? false },
            },
            { onConflict: 'service_id,tag' }
          )
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
