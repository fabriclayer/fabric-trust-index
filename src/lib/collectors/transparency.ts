import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult } from './types'
import { clampScore } from './types'
import { githubGet, githubExists } from './github'

/**
 * Transparency Collector (weight: 0.15)
 *
 * Checklist-based evaluation:
 * 1. Public source code (public repo)
 * 2. Recognized license (LICENSE file, OSI-approved)
 * 3. Substantial README with examples
 * 4. SECURITY.md present
 * 5. Published schemas/API docs
 * 6. Model cards or system cards (only for llm, image-generation, speech, vision)
 *
 * For model-related categories: 6 items x 0.833 = 5.0 max
 * For other categories: 5 items x 1.0 = 5.0 max (model card skipped)
 *
 * Data source: GitHub REST API
 */

// Categories where model card check applies
const MODEL_CARD_CATEGORIES = new Set(['llm', 'image-generation', 'speech', 'vision'])

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

    // Determine if model card check applies to this category
    const includeModelCard = MODEL_CARD_CATEGORIES.has(service.category ?? '')
    const totalItems = includeModelCard ? 6 : 5
    const pointsPerItem = 5.0 / totalItems

    let score = 0

    // 1. Public source code
    const repoData = await githubGet(`/repos/${repo}`) as {
      private?: boolean
      license?: { spdx_id?: string }
      description?: string
    } | null

    if (repoData && !repoData.private) {
      checklist.public_source = true
      score += pointsPerItem
    } else {
      checklist.public_source = false
    }

    // 2. Recognized license
    const licenseId = repoData?.license?.spdx_id?.toLowerCase()
    if (licenseId && OSI_LICENSES.has(licenseId)) {
      checklist.recognized_license = true
      score += pointsPerItem
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
      let hasExamples = false
      if (readme.content && readme.encoding === 'base64') {
        try {
          const decoded = Buffer.from(readme.content, 'base64').toString('utf-8')
          hasExamples = decoded.includes('```') || decoded.includes('    ')
        } catch { /* ignore decode errors */ }
      }
      checklist.readme_with_examples = hasExamples || readme.size > 2000
      if (checklist.readme_with_examples) score += pointsPerItem
    } else {
      checklist.readme_with_examples = false
    }

    // 4. SECURITY.md present
    const hasSecurity = await githubExists(`/repos/${repo}/contents/SECURITY.md`)
    checklist.security_md = hasSecurity
    if (hasSecurity) score += pointsPerItem

    // 5. Published schemas / API docs
    const hasOpenapi = await githubExists(`/repos/${repo}/contents/openapi.json`)
    const hasOpenApiYaml = !hasOpenapi && await githubExists(`/repos/${repo}/contents/openapi.yaml`)
    const hasDocs = !hasOpenapi && !hasOpenApiYaml && await githubExists(`/repos/${repo}/contents/docs`)
    checklist.api_docs = hasOpenapi || hasOpenApiYaml || hasDocs
    if (checklist.api_docs) score += pointsPerItem

    // 6. Model card or system card (only for model-related categories)
    if (includeModelCard) {
      const hasModelCard = await githubExists(`/repos/${repo}/contents/MODEL_CARD.md`)
      const hasSystemCard = !hasModelCard && await githubExists(`/repos/${repo}/contents/SYSTEM_CARD.md`)
      checklist.model_card = hasModelCard || hasSystemCard
      if (checklist.model_card) score += pointsPerItem
    } else {
      checklist.model_card_skipped = true
    }

    return {
      signal_name: 'transparency',
      score: clampScore(score),
      metadata: {
        checklist,
        items_passed: Object.values(checklist).filter(v => v === true).length,
        items_total: totalItems,
        model_card_applicable: includeModelCard,
        license: licenseId ?? null,
      },
      sources,
    }
  },
}
