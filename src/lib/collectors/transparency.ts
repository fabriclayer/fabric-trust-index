import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'

/**
 * Transparency Collector (weight: 0.10)
 *
 * Checklist-based evaluation:
 * 1. Public source code (public repo)
 * 2. Recognized license (LICENSE file, OSI-approved)
 * 3. Substantial README with examples
 * 4. SECURITY.md present
 * 5. Published schemas/API docs
 * 6. Model cards or system cards
 *
 * Each item = ~0.83 points (6 items = 5.0 max)
 *
 * Data source: GitHub REST API
 */

const GITHUB_API = 'https://api.github.com'
const POINTS_PER_ITEM = 5.0 / 6

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

async function githubExists(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: 'HEAD',
      headers: githubHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

// Common OSI-approved license identifiers
const OSI_LICENSES = new Set([
  'mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'gpl-2.0', 'gpl-3.0',
  'lgpl-2.1', 'lgpl-3.0', 'mpl-2.0', 'isc', 'unlicense', 'artistic-2.0',
  'bsl-1.0', 'cc0-1.0', 'epl-2.0', 'agpl-3.0', 'zlib',
])

export const transparencyCollector: Collector = {
  name: 'transparency',

  async collect(service: DbService): Promise<CollectorResult> {
    if (!service.github_repo) {
      return {
        signal_name: 'transparency',
        score: 2.0,
        metadata: { reason: 'no_github_repo', checklist: {} },
        sources: [],
      }
    }

    const repo = service.github_repo
    const sources = [`github:${repo}`]
    const checklist: Record<string, boolean> = {}
    let score = 0

    // 1. Public source code
    const repoData = await githubGet(`/repos/${repo}`) as {
      private?: boolean
      license?: { spdx_id?: string }
      description?: string
    } | null

    if (repoData && !repoData.private) {
      checklist.public_source = true
      score += POINTS_PER_ITEM
    } else {
      checklist.public_source = false
    }

    // 2. Recognized license
    const licenseId = repoData?.license?.spdx_id?.toLowerCase()
    if (licenseId && OSI_LICENSES.has(licenseId)) {
      checklist.recognized_license = true
      score += POINTS_PER_ITEM
    } else {
      checklist.recognized_license = false
    }

    // 3. Substantial README with examples
    const readme = await githubGet(`/repos/${repo}/readme`) as {
      size?: number
      content?: string
      encoding?: string
    } | null

    if (readme && readme.size && readme.size > 500) {
      // Check if README has code blocks (indicators of examples)
      let hasExamples = false
      if (readme.content && readme.encoding === 'base64') {
        try {
          const decoded = Buffer.from(readme.content, 'base64').toString('utf-8')
          hasExamples = decoded.includes('```') || decoded.includes('    ') // code blocks or indented code
        } catch { /* ignore decode errors */ }
      }
      checklist.readme_with_examples = hasExamples || readme.size > 2000
      if (checklist.readme_with_examples) score += POINTS_PER_ITEM
    } else {
      checklist.readme_with_examples = false
    }

    // 4. SECURITY.md present
    const hasSecurity = await githubExists(`/repos/${repo}/contents/SECURITY.md`)
    checklist.security_md = hasSecurity
    if (hasSecurity) score += POINTS_PER_ITEM

    // 5. Published schemas / API docs
    const hasOpenapi = await githubExists(`/repos/${repo}/contents/openapi.json`)
    const hasOpenApiYaml = !hasOpenapi && await githubExists(`/repos/${repo}/contents/openapi.yaml`)
    const hasDocs = !hasOpenapi && !hasOpenApiYaml && await githubExists(`/repos/${repo}/contents/docs`)
    checklist.api_docs = hasOpenapi || hasOpenApiYaml || hasDocs
    if (checklist.api_docs) score += POINTS_PER_ITEM

    // 6. Model card or system card
    const hasModelCard = await githubExists(`/repos/${repo}/contents/MODEL_CARD.md`)
    const hasSystemCard = !hasModelCard && await githubExists(`/repos/${repo}/contents/SYSTEM_CARD.md`)
    checklist.model_card = hasModelCard || hasSystemCard
    if (checklist.model_card) score += POINTS_PER_ITEM

    return {
      signal_name: 'transparency',
      score: clampScore(score),
      metadata: {
        checklist,
        items_passed: Object.values(checklist).filter(Boolean).length,
        items_total: 6,
        license: licenseId ?? null,
      },
      sources,
    }
  },
}
