import type { DbService } from '@/lib/supabase/types'
import type { Collector, CollectorResult, SubSignalScore } from './types'
import { clampScore, computeSubSignalScore } from './types'
import { githubGet, githubExists } from './github'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Transparency Collector (weight: 0.15)
 *
 * Sub-signals:
 *   1. open_source     (0.30) — Public repo + license type
 *   2. documentation   (0.25) — README quality + docs presence
 *   3. security_policy (0.20) — SECURITY.md presence
 *   4. changelog       (0.25) — CHANGELOG.md + release history
 */

const MODEL_CARD_CATEGORIES = new Set(['llm', 'image-generation', 'speech', 'vision'])

const OSI_LICENSES = new Set([
  'mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'gpl-2.0', 'gpl-3.0',
  'lgpl-2.1', 'lgpl-3.0', 'mpl-2.0', 'isc', 'unlicense', 'artistic-2.0',
  'bsl-1.0', 'cc0-1.0', 'epl-2.0', 'agpl-3.0', 'zlib',
])

const COPYLEFT_LICENSES = new Set([
  'gpl-2.0', 'gpl-3.0', 'lgpl-2.1', 'lgpl-3.0', 'agpl-3.0',
])

const SOURCE_AVAILABLE_LICENSES = new Set([
  'bsl-1.1', 'sspl-1.0', 'elastic-2.0', 'confluent-community-1.0',
])

export const transparencyCollector: Collector = {
  name: 'transparency',

  async collect(service: DbService): Promise<CollectorResult> {
    if (!service.github_repo) {
      return {
        signal_name: 'transparency',
        score: 0,
        sub_signals: [
          { name: 'open_source', score: 0, weight: 0.30, has_data: false },
          { name: 'documentation', score: 0, weight: 0.25, has_data: false },
          { name: 'security_policy', score: 0, weight: 0.20, has_data: false },
          { name: 'changelog', score: 0, weight: 0.25, has_data: false },
        ],
        metadata: { reason: 'no_github_repo' },
        sources: [],
      }
    }

    const repo = service.github_repo
    const sources = [`github:${repo}`]

    const repoData = await githubGet(`/repos/${repo}`) as {
      private?: boolean
      license?: { spdx_id?: string }
    } | null

    if (!repoData) {
      return {
        signal_name: 'transparency',
        score: 0,
        sub_signals: [
          { name: 'open_source', score: 0, weight: 0.30, has_data: false },
          { name: 'documentation', score: 0, weight: 0.25, has_data: false },
          { name: 'security_policy', score: 0, weight: 0.20, has_data: false },
          { name: 'changelog', score: 0, weight: 0.25, has_data: false },
        ],
        metadata: { reason: 'repo_not_accessible' },
        sources: [`github:${repo}`],
      }
    }

    const checklist: Record<string, boolean> = {}
    const licenseId = repoData.license?.spdx_id?.toLowerCase() ?? null

    // ── Sub-signal 1: open_source (0.30) ──
    let openSourceScore: number
    let openSourceDetail: string
    const isPublic = !repoData.private

    if (isPublic && licenseId) {
      if (OSI_LICENSES.has(licenseId) && !COPYLEFT_LICENSES.has(licenseId)) {
        openSourceScore = 5.0
        openSourceDetail = `Public repo with OSI-approved license (${licenseId})`
      } else if (COPYLEFT_LICENSES.has(licenseId)) {
        openSourceScore = 4.0
        openSourceDetail = `Public repo with copyleft license (${licenseId})`
      } else if (SOURCE_AVAILABLE_LICENSES.has(licenseId)) {
        openSourceScore = 3.0
        openSourceDetail = `Public repo with source-available license (${licenseId})`
      } else {
        openSourceScore = 3.0
        openSourceDetail = `Public repo with non-OSI license (${licenseId})`
      }
      checklist.public_source = true
      checklist.recognized_license = OSI_LICENSES.has(licenseId)
    } else if (isPublic && !licenseId) {
      openSourceScore = 2.0
      openSourceDetail = 'Public repo but no license detected'
      checklist.public_source = true
      checklist.recognized_license = false
    } else {
      if (service.docs_url || service.homepage_url) {
        openSourceScore = 1.0
        openSourceDetail = 'Closed source but documented'
      } else {
        openSourceScore = 0.0
        openSourceDetail = 'Closed source, undocumented'
      }
      checklist.public_source = false
      checklist.recognized_license = false
    }

    const openSourceSubSignal: SubSignalScore = {
      name: 'open_source',
      score: clampScore(openSourceScore),
      weight: 0.30,
      has_data: true,
      detail: openSourceDetail,
    }

    // ── Sub-signal 2: documentation (0.25) ──
    const readme = await githubGet(`/repos/${repo}/readme`) as {
      size?: number
      content?: string
      encoding?: string
    } | null

    let docScore: number
    let docDetail: string

    const hasOpenapi = await githubExists(`/repos/${repo}/contents/openapi.json`)
    const hasOpenApiYaml = !hasOpenapi && await githubExists(`/repos/${repo}/contents/openapi.yaml`)
    const hasDocs = !hasOpenapi && !hasOpenApiYaml && await githubExists(`/repos/${repo}/contents/docs`)
    const hasDocsSite = hasOpenapi || hasOpenApiYaml || hasDocs

    checklist.api_docs = hasDocsSite

    let apiDocsUrl: string | null = null
    if (hasOpenapi) apiDocsUrl = `https://github.com/${repo}/blob/main/openapi.json`
    else if (hasOpenApiYaml) apiDocsUrl = `https://github.com/${repo}/blob/main/openapi.yaml`
    else if (hasDocs) apiDocsUrl = `https://github.com/${repo}/tree/main/docs`

    if (!readme) {
      docScore = 0.0
      docDetail = 'No README found'
      checklist.readme_with_examples = false
    } else {
      const readmeSize = readme.size ?? 0

      let hasExamples = false
      if (readme.content && readme.encoding === 'base64') {
        try {
          const decoded = Buffer.from(readme.content, 'base64').toString('utf-8')
          hasExamples = decoded.includes('```') || decoded.includes('    ')
        } catch { /* ignore decode errors */ }
      }

      if (hasDocsSite && readmeSize > 2000 && hasExamples) {
        docScore = 5.0
        docDetail = 'Docs site present with comprehensive README (>2000 bytes + examples)'
      } else if (readmeSize > 2000 && hasExamples) {
        docScore = 4.0
        docDetail = 'Good README (>2000 bytes with examples)'
      } else if (readmeSize > 5000) {
        docScore = 4.0
        docDetail = 'Thorough README (>5000 bytes)'
      } else if (readmeSize > 500) {
        docScore = 3.0
        docDetail = 'Adequate README (>500 bytes)'
      } else if (readmeSize > 100) {
        docScore = 2.0
        docDetail = `Minimal README (${readmeSize} bytes)`
      } else {
        docScore = 1.0
        docDetail = `Sparse README (${readmeSize} bytes)`
      }

      checklist.readme_with_examples = hasExamples || readmeSize > 2000
    }

    // Model card bonus for model categories
    const includeModelCard = MODEL_CARD_CATEGORIES.has(service.category ?? '')
    let hasModelCard = false

    if (includeModelCard) {
      const hasModelCardFile = await githubExists(`/repos/${repo}/contents/MODEL_CARD.md`)
      const hasSystemCard = !hasModelCardFile && await githubExists(`/repos/${repo}/contents/SYSTEM_CARD.md`)
      hasModelCard = hasModelCardFile || hasSystemCard
      checklist.model_card = hasModelCard

      if (hasModelCard) {
        docScore = Math.min(5.0, docScore + 0.5)
        docDetail += ' + model/system card bonus'
      }
    }

    const documentationSubSignal: SubSignalScore = {
      name: 'documentation',
      score: clampScore(docScore),
      weight: 0.25,
      has_data: true,
      detail: docDetail,
    }

    // ── Sub-signal 3: security_policy (0.20) ──
    let hasSecurity = await githubExists(`/repos/${repo}/contents/SECURITY.md`)
    let securitySource = 'repo'

    // Fallback: check org-level .github repo (GitHub inheritance)
    if (!hasSecurity) {
      const org = repo.split('/')[0]
      hasSecurity = await githubExists(`/repos/${org}/.github/contents/SECURITY.md`)
      if (hasSecurity) securitySource = 'org'
    }

    checklist.security_md = hasSecurity

    const securityPolicySubSignal: SubSignalScore = {
      name: 'security_policy',
      score: hasSecurity ? 5.0 : 2.0,
      weight: 0.20,
      has_data: true,
      detail: hasSecurity
        ? (securitySource === 'org' ? 'SECURITY.md inherited from org .github repo' : 'SECURITY.md present')
        : 'No SECURITY.md found',
    }

    // ── Sub-signal 4: changelog (0.25) ──
    const hasChangelog = await githubExists(`/repos/${repo}/contents/CHANGELOG.md`)

    let hasReleases = false
    try {
      const supabase = createServerClient()
      const { data: versionRows, error } = await supabase
        .from('versions')
        .select('id')
        .eq('service_id', service.id)
        .limit(1)

      if (!error && versionRows && versionRows.length > 0) {
        hasReleases = true
      }
    } catch { /* best-effort */ }

    let changelogScore: number
    let changelogDetail: string

    if (hasChangelog && hasReleases) {
      changelogScore = 5.0
      changelogDetail = 'CHANGELOG.md present and releases exist'
    } else if (!hasChangelog && hasReleases) {
      changelogScore = 4.0
      changelogDetail = 'Releases exist but no CHANGELOG.md'
    } else if (hasChangelog && !hasReleases) {
      changelogScore = 3.0
      changelogDetail = 'CHANGELOG.md present but no releases found'
    } else {
      changelogScore = 2.0
      changelogDetail = 'No CHANGELOG.md and no releases found'
    }

    const changelogSubSignal: SubSignalScore = {
      name: 'changelog',
      score: changelogScore,
      weight: 0.25,
      has_data: true,
      detail: changelogDetail,
    }

    // ── Compute final score ──
    const sub_signals: SubSignalScore[] = [
      openSourceSubSignal,
      documentationSubSignal,
      securityPolicySubSignal,
      changelogSubSignal,
    ]

    const score = computeSubSignalScore(sub_signals)

    const totalItems = includeModelCard ? 6 : 5
    const itemsPassed = Object.values(checklist).filter(v => v === true).length

    return {
      signal_name: 'transparency',
      score,
      sub_signals,
      metadata: {
        checklist,
        items_passed: itemsPassed,
        items_total: totalItems,
        model_card_applicable: includeModelCard,
        license: licenseId,
        api_docs_url: apiDocsUrl,
        has_changelog: hasChangelog,
        has_releases: hasReleases,
      },
      sources,
    }
  },
}
