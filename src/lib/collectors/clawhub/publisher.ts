import type { CollectorResult } from '../types'
import { clampScore } from '../types'
import { githubHeaders } from './api'

export async function collectPublisherReputation(
  ownerHandle: string | null,
): Promise<CollectorResult> {
  if (!ownerHandle) {
    return {
      signal_name: 'publisher_reputation',
      score: 2.5,
      metadata: { reason: 'no_owner' },
      sources: [],
    }
  }

  let ghUser: {
    login: string
    created_at: string
    public_repos: number
    type: string
    bio: string | null
    blog: string | null
    followers: number
  } | null = null

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(ownerHandle)}`, {
      headers: githubHeaders(),
    })
    if (res.ok) ghUser = await res.json()
  } catch {
    // fall through
  }

  if (!ghUser) {
    return {
      signal_name: 'publisher_reputation',
      score: 2.5,
      metadata: { reason: 'github_user_not_found', handle: ownerHandle },
      sources: [],
    }
  }

  let rawScore = 0
  const details: Record<string, unknown> = { handle: ownerHandle }

  // Account age
  const ageMs = Date.now() - new Date(ghUser.created_at).getTime()
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
  details.accountAgeYears = Math.round(ageYears * 10) / 10

  if (ageYears >= 5) rawScore += 2.0
  else if (ageYears >= 2) rawScore += 1.5
  else if (ageYears >= 1) rawScore += 1.0
  else if (ageYears >= 0.25) rawScore += 0.5
  else rawScore += 0.2

  // Public repos
  details.publicRepos = ghUser.public_repos
  if (ghUser.public_repos > 20) rawScore += 1.0
  else if (ghUser.public_repos > 10) rawScore += 0.75
  else if (ghUser.public_repos > 5) rawScore += 0.5
  else if (ghUser.public_repos > 0) rawScore += 0.25

  // Organization vs personal
  if (ghUser.type === 'Organization') {
    rawScore += 0.5
    details.isOrg = true
  }

  // Has bio/website
  if (ghUser.bio || ghUser.blog) {
    rawScore += 0.25
    details.hasProfile = true
  }

  // Followers
  if (ghUser.followers > 50) {
    rawScore += 0.5
    details.highFollowers = true
  }

  // Scale raw (max ~4.25) to 0-5
  const scaled = (rawScore / 4.25) * 5

  return {
    signal_name: 'publisher_reputation',
    score: clampScore(scaled),
    metadata: details,
    sources: [`github:users/${ownerHandle}`],
  }
}
