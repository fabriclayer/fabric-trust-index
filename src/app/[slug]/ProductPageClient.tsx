'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Service } from '@/data/services'
import { SIGNAL_LABELS, SKILL_SIGNAL_LABELS, SKILL_DATA_SOURCES, TAG_CLASSES, TAG_COLORS } from '@/lib/utils'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import RatingBoxes from '@/components/RatingBoxes'
import ScoreStatus from '@/components/ScoreStatus'
import ServiceLogo from '@/components/ServiceLogo'
import ClaimProviderModal from '@/components/ClaimProviderModal'
import ReportIssueModal from '@/components/ReportIssueModal'

// ---------- Types for detail data ----------

interface Incident {
  id: string
  type: string
  severity: string
  title: string
  description?: string
  score_at_time?: number
  created_at: string
}

interface SignalHistoryEntry {
  signal_name: string
  score: number
  recorded_at: string
  metadata?: Record<string, unknown>
}

interface Version {
  tag: string
  released_at: string
  score_at_release?: number
  score_delta?: number
}

interface SupplyChainEntry {
  dependency_name: string
  dependency_type: string
  dependency_version?: string
  cve_count: number
  trust_score?: number
  cve_severity_counts?: Record<string, number> | null
}

interface ProductPageProps {
  service: Service
  incidents: Incident[]
  signalHistory: SignalHistoryEntry[]
  versions: Version[]
  supplyChain: SupplyChainEntry[]
  transparencyMeta: Record<string, unknown> | null
  adoptionMeta: Record<string, unknown> | null
  maintenanceMeta: Record<string, unknown> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signalMetas?: Record<string, Record<string, any>>
}

// ---------- Constants ----------

const scoreColor: Record<string, string> = {
  trusted: 'text-[#0dc956]',
  caution: 'text-[#f7931e]',
  blocked: 'text-[#d03a3d]',
  pending: 'text-[#a0a09c]',
}

const HERO_TAGS: Record<string, string[]> = {
  llm: ['llm', 'reasoning', 'tool-use', 'vision', '200k context'],
  'image-generation': ['image-gen', 'text-to-image', 'inpainting'],
  'web-search': ['search', 'web-crawl', 'RAG'],
  code: ['code', 'completions', 'chat'],
  speech: ['speech', 'audio', 'real-time'],
  'data-api': ['data-api', 'REST', 'webhooks'],
  agent: ['agent', 'tool-use', 'multi-step'],
  embedding: ['embedding', 'semantic-search', 'clustering'],
  vision: ['vision', 'image-understanding', 'OCR'],
  infra: ['infra', 'serverless', 'GPU'],
  skill: ['skill', 'openclaw', 'agent-skill'],
}

function getDataSources(service: Service) {
  return [
    { icon: '◎', label: 'OSV.dev', meta: 'CVE database · vulnerability scanning for npm & PyPI packages', url: 'https://osv.dev' },
    { icon: '◈', label: 'GitHub API', meta: 'Commits, issues, releases, repo metadata, transparency checks', url: service.github_repo ? `https://github.com/${service.github_repo}` : 'https://github.com' },
    { icon: '⬡', label: 'npm Registry', meta: 'Package metadata, weekly downloads, maintainers, dependencies', url: service.npm_package ? `https://www.npmjs.com/package/${service.npm_package}` : 'https://www.npmjs.com' },
    { icon: '⬡', label: 'PyPI', meta: 'Package metadata, weekly downloads, dependency tree', url: service.pypi_package ? `https://pypi.org/project/${service.pypi_package}` : 'https://pypi.org' },
    { icon: '△', label: 'HTTP Health Checks', meta: '15-min pings · uptime, latency, status monitoring', url: service.endpoint_url || (service.domain ? `https://${service.domain}` : null) },
    { icon: '◎', label: 'PyPI Stats', meta: 'Download statistics and trends', url: service.pypi_package ? `https://pypistats.org/packages/${service.pypi_package}` : 'https://pypistats.org' },
  ]
}
const ITEMS_INITIAL = 6
const LOAD_MORE_BATCH = 10

const MODIFIER_LABELS: Record<string, string> = {
  vulnerability_zero_override: 'Unpatched critical/high CVE — blocked',
  vulnerability_patch_available: 'Critical/high CVE with available patch — capped at caution',
  zero_signal_override: 'Missing signal — held at caution',
  pending_evaluation: 'Awaiting first evaluation',
  stale_publisher_trust: 'Publisher data stale',
  stale_transparency: 'Transparency data stale',
  repo_archived: 'Repository archived — blocked',
  repo_transferred: 'Repository ownership changed — under review',
  npm_deprecated: 'npm package deprecated — blocked',
  npm_owner_changed: 'npm package maintainers changed — under review',
}

// ---------- Signal detail helpers ----------

// Map SKILL_SIGNAL_LABELS index to signal_history signal_name
const SKILL_SIGNAL_KEYS = [
  'virustotal_scan', 'content_safety', 'publisher_reputation',
  'adoption', 'freshness', 'transparency',
]

// Map SIGNAL_LABELS index to signal_history signal_name (standard services)
const STANDARD_SIGNAL_KEYS = [
  'vulnerability', 'operational', 'maintenance',
  'adoption', 'transparency', 'publisher_trust',
]

function scoreBadgeColor(score: number): string {
  if (score >= 4) return 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]'
  if (score >= 2) return 'bg-[rgba(247,147,30,0.1)] text-[#f7931e]'
  return 'bg-[rgba(208,58,61,0.1)] text-[#d03a3d]'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStandardSignalDetail(key: string, meta: Record<string, any>, service: { uptime_30d?: number; avg_latency_ms?: number; category: string }): string {
  switch (key) {
    case 'vulnerability': {
      const total = meta.total_cves as number | undefined
      if (total == null || total === 0) return 'No known CVEs found. Package checked against OSV.dev vulnerability database.'
      const cves = meta.cves as Array<{ severity: string; patch_status: string }> | undefined
      if (!cves) return `${total} CVE${total > 1 ? 's' : ''} found.`
      const bySev = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>
      const byPatch = { patched: 0, patch_available: 0, unpatched: 0 } as Record<string, number>
      for (const c of cves) { bySev[c.severity] = (bySev[c.severity] ?? 0) + 1; byPatch[c.patch_status] = (byPatch[c.patch_status] ?? 0) + 1 }
      const sevParts = ['critical', 'high', 'medium', 'low'].filter(s => bySev[s] > 0).map(s => `${bySev[s]} ${s}`)
      const patchParts = ['patched', 'patch_available', 'unpatched'].filter(s => byPatch[s] > 0).map(s => `${byPatch[s]} ${s.replace('_', ' ')}`)
      let text = `${total} CVE${total > 1 ? 's' : ''} found — ${sevParts.join(', ')}. ${patchParts.join(', ')}.`
      if (meta.supply_chain_cve_count) text += ` ${meta.supply_chain_cve_count} additional CVEs in the dependency supply chain.`
      if (meta.has_critical_unpatched) text += ' Unpatched critical vulnerability detected — score capped.'
      return text
    }
    case 'operational': {
      if (meta.reason === 'no_endpoint_configured') return 'No endpoint configured — operational health not monitored.'
      const parts: string[] = []
      const uptime = meta.uptime_percent ?? service.uptime_30d
      if (uptime != null) parts.push(`${Number(uptime).toFixed(1)}% uptime over 30 days`)
      const p50 = meta.p50_latency_ms ?? meta.p50_ms
      if (p50 != null) parts.push(`p50 latency: ${p50}ms`)
      const p99 = meta.p99_latency_ms
      if (p99 != null) parts.push(`p99: ${p99}ms`)
      if (meta.total_checks) parts.push(`${meta.total_checks} health checks performed`)
      if (meta.is_up != null) parts.push(meta.is_up ? 'Currently up' : 'Currently down')
      return parts.length > 0 ? parts.join('. ') + '.' : 'No operational data available.'
    }
    case 'maintenance': {
      if (meta.reason === 'no_github_repo') return 'No GitHub repository linked.'
      if (meta.repo_archived) return 'Repository is archived — no longer actively maintained.'
      if (meta.repo_transferred) return `Repository ownership transferred from ${meta.old_owner ?? 'unknown'} to ${meta.new_owner ?? 'unknown'} — under review.`
      const parts: string[] = []
      if (meta.commits_90d != null) parts.push(`${meta.commits_90d} commits in the last 90 days`)
      if (meta.days_since_last_push != null) parts.push(`Last push: ${meta.days_since_last_push}d ago`)
      if (meta.total_releases != null) {
        let relText = `${meta.total_releases} releases`
        if (meta.avg_release_interval_days != null) relText += ` (avg ${Math.round(meta.avg_release_interval_days)}d apart)`
        parts.push(relText)
      }
      if (meta.open_issues != null) parts.push(`${meta.open_issues} open issues`)
      if (meta.median_issue_response_hours != null) {
        const hrs = Math.round(meta.median_issue_response_hours as number)
        if (hrs >= 48) parts.push(`Median issue response: ${Math.round(hrs / 24)}d`)
        else parts.push(`Median issue response: ${hrs}h`)
      }
      return parts.length > 0 ? parts.join('. ') + '.' : 'No maintenance data available.'
    }
    case 'adoption': {
      if (meta.reason === 'no_download_data') return 'No download data available for this service.'
      const parts: string[] = []
      if (meta.weekly_downloads != null) parts.push(`${formatCompact(meta.weekly_downloads)} weekly downloads`)
      if (meta.growth_rate != null) {
        const rate = Number(meta.growth_rate)
        const prior = Number(meta.prior_week_downloads ?? 0)
        if (prior < 10 && rate > 100) {
          parts.push('First weeks tracked — growth rate not yet meaningful')
        } else if (rate > 999) {
          parts.push('>999% week-over-week growth')
        } else if (rate > 0) {
          parts.push(`${rate.toFixed(0)}% week-over-week growth`)
        } else if (rate < 0) {
          parts.push(`${Math.abs(rate).toFixed(0)}% weekly decline`)
        } else {
          parts.push('Stable download volume')
        }
      }
      if (meta.category_percentile != null && meta.category_peer_count != null) {
        const pct = Math.round(100 - Number(meta.category_percentile))
        parts.push(`Top ${pct > 0 ? pct : 1}% among ${meta.category_peer_count} ${service.category} peers`)
      }
      if (meta.stars != null) parts.push(`${formatCompact(meta.stars)} GitHub stars`)
      return parts.length > 0 ? parts.join('. ') + '.' : 'No adoption data available.'
    }
    case 'transparency': {
      if (meta.reason === 'no_github_repo') return 'No GitHub repository linked — transparency not evaluated.'
      const parts: string[] = []
      const cl = meta.checklist as Record<string, boolean | undefined> | undefined
      if (cl) {
        const items: string[] = []
        if (cl.public_source != null) items.push(cl.public_source ? 'Public source ✓' : 'Public source ✗')
        if (cl.recognized_license != null) items.push(cl.recognized_license ? `License (${meta.license ?? 'recognized'}) ✓` : 'License ✗')
        if (cl.readme_with_examples != null) items.push(cl.readme_with_examples ? 'README with examples ✓' : 'README ✗')
        if (cl.security_md != null) items.push(cl.security_md ? 'SECURITY.md ✓' : 'SECURITY.md ✗')
        if (cl.api_docs != null) items.push(cl.api_docs ? 'API docs ✓' : 'API docs ✗')
        if (cl.model_card != null) items.push(cl.model_card ? 'Model card ✓' : 'Model card ✗')
        else if (meta.model_card_applicable === false) items.push('Model card N/A')
        if (items.length > 0) parts.push(items.join(' · '))
      }
      if (meta.items_passed != null && meta.items_total != null) parts.push(`${meta.items_passed}/${meta.items_total} transparency checks passed`)
      return parts.length > 0 ? parts.join('. ') + '.' : 'No transparency data available.'
    }
    case 'publisher_trust': {
      if (meta.reason) return meta.reason === 'publisher_not_found' ? 'Publisher not found in the database.' : meta.reason === 'no_publisher_github' ? 'No GitHub organization linked to publisher.' : 'Publisher data unavailable.'
      const parts: string[] = []
      if (meta.account_age_years != null) {
        const age = Number(meta.account_age_years)
        const label = meta.is_organization ? 'organization' : 'user'
        parts.push(age >= 1 ? `${age.toFixed(1)}-year-old ${label} account` : `${Math.round(age * 12)}-month-old ${label} account`)
      }
      if (meta.public_repos != null) parts.push(`${meta.public_repos} public repositories`)
      if (meta.identity_registries) {
        const regs = meta.identity_registries as string[]
        if (regs.length > 0) parts.push(`Present on: ${regs.join(', ')}`)
      }
      if (meta.npm_maintainers) parts.push(`${(meta.npm_maintainers as string[]).length} npm maintainers`)
      if (meta.project_age_days != null) {
        const d = Number(meta.project_age_days)
        parts.push(d < 30 ? `Project age: ${d} days (new)` : d < 365 ? `Project age: ${Math.round(d / 30)} months` : `Project age: ${(d / 365).toFixed(1)} years`)
      }
      if (meta.npm_deprecated) parts.push('Warning: npm package is marked as deprecated')
      return parts.length > 0 ? parts.join('. ') + '.' : 'No publisher data available.'
    }
    default:
      return ''
  }
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SignalDetailCards({ signals, metas, homepageUrl }: { signals: number[]; metas: Record<string, Record<string, any>>; homepageUrl?: string | null }) {
  const vtMeta = metas.virustotal_scan
  const csMeta = metas.content_safety
  const pubMeta = metas.publisher_reputation
  const adMeta = metas.adoption
  const frMeta = metas.freshness
  const trMeta = metas.transparency

  const cardClass = 'bg-fabric-50/50 border border-fabric-100 rounded-xl p-5'
  const headerClass = 'flex items-center justify-between mb-3'
  const titleClass = 'font-mono text-[0.72rem] font-semibold text-fabric-700 uppercase tracking-wider'
  const labelClass = 'font-mono text-[0.66rem] text-fabric-400'
  const valueClass = 'font-mono text-[0.72rem] text-fabric-700'
  const rowClass = 'flex items-center justify-between py-1.5 border-b border-fabric-100 last:border-0'

  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      {/* CARD 1: VirusTotal Scan */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>VirusTotal Scan</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[0])}`}>{signals[0].toFixed(1)}</span>
        </div>
        {vtMeta ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-block text-[0.62rem] font-mono font-semibold px-2 py-0.5 rounded-full ${
                vtMeta.reason === 'clean_moderation' ? 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]' :
                vtMeta.reason === 'malware_blocked' ? 'bg-[rgba(208,58,61,0.1)] text-[#d03a3d]' :
                vtMeta.reason === 'suspicious_flagged' ? 'bg-[rgba(247,147,30,0.1)] text-[#f7931e]' :
                'bg-fabric-100 text-fabric-500'
              }`}>
                {vtMeta.reason === 'clean_moderation' ? 'CLEAN' :
                 vtMeta.reason === 'malware_blocked' ? 'MALWARE BLOCKED' :
                 vtMeta.reason === 'suspicious_flagged' ? 'SUSPICIOUS' : 'PENDING'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {vtMeta.isMalwareBlocked !== undefined && (
                <div className={rowClass}>
                  <span className={labelClass}>Malware blocked</span>
                  <span className={`font-mono text-[0.68rem] font-medium ${vtMeta.isMalwareBlocked ? 'text-[#d03a3d]' : 'text-[#0dc956]'}`}>{vtMeta.isMalwareBlocked ? 'Yes' : 'No'}</span>
                </div>
              )}
              {vtMeta.isSuspicious !== undefined && (
                <div className={rowClass}>
                  <span className={labelClass}>Suspicious flag</span>
                  <span className={`font-mono text-[0.68rem] font-medium ${vtMeta.isSuspicious ? 'text-[#f7931e]' : 'text-[#0dc956]'}`}>{vtMeta.isSuspicious ? 'Yes' : 'No'}</span>
                </div>
              )}
            </div>
            <p className="text-[0.68rem] text-fabric-400 leading-relaxed">ClawHub submits every skill to VirusTotal on publish. Scanned by 70+ security vendors for malware, trojans, and suspicious patterns.</p>
            <span className={labelClass}>Source: {vtMeta.source === 'virustotal_api' ? 'VirusTotal API' : 'ClawHub moderation'}</span>
          </div>
        ) : (
          <p className={labelClass}>No scan data available</p>
        )}
      </div>

      {/* CARD 2: Content Safety */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>Content Safety</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[1])}`}>{signals[1].toFixed(1)}</span>
        </div>
        {csMeta ? (
          <div className="flex flex-col gap-2">
            {(csMeta.findingsCount as number ?? 0) === 0 ? (
              <span className="inline-block text-[0.62rem] font-mono font-semibold px-2 py-0.5 rounded-full bg-[rgba(13,201,86,0.1)] text-[#0dc956] w-fit">NO ISSUES</span>
            ) : (
              <span className="inline-block text-[0.62rem] font-mono font-semibold px-2 py-0.5 rounded-full bg-[rgba(247,147,30,0.1)] text-[#f7931e] w-fit">{csMeta.findingsCount} FINDING{(csMeta.findingsCount as number) > 1 ? 'S' : ''}</span>
            )}
            {((csMeta.findings as string[]) ?? []).length > 0 && (
              <div className="flex flex-col gap-1">
                {(csMeta.findings as string[]).map((f: string, i: number) => (
                  <span key={i} className="font-mono text-[0.66rem] text-[#f7931e]">{'\u26A0'} {f}</span>
                ))}
              </div>
            )}
            {csMeta.hasDisclosures && (
              <span className="font-mono text-[0.66rem] text-[#0dc956]">{'\u2713'} Self-disclosed sensitive operations</span>
            )}
            <p className="text-[0.68rem] text-fabric-400 leading-relaxed">Scanned for credential leaks, shell injection, config tampering, base64 payloads, sensitive path access, SOUL.md/AGENTS.md tampering.</p>
            {csMeta.contentLength != null && (
              <span className={labelClass}>{(csMeta.contentLength as number).toLocaleString()} characters analyzed</span>
            )}
          </div>
        ) : (
          <p className={labelClass}>No content safety data available</p>
        )}
      </div>

      {/* CARD 3: Publisher Reputation */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>Publisher Reputation</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[2])}`}>{signals[2].toFixed(1)}</span>
        </div>
        {pubMeta ? (
          <div className="flex flex-col gap-0.5">
            {pubMeta.handle && (
              <div className={rowClass}>
                <span className={labelClass}>GitHub</span>
                <a href={`https://github.com/${pubMeta.handle}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[0.68rem] text-blue hover:underline">{pubMeta.handle as string}</a>
              </div>
            )}
            {pubMeta.accountAgeYears != null && (
              <div className={rowClass}>
                <span className={labelClass}>Account age</span>
                <span className={valueClass}>{(pubMeta.accountAgeYears as number).toFixed(1)} years</span>
              </div>
            )}
            {pubMeta.publicRepos != null && (
              <div className={rowClass}>
                <span className={labelClass}>Public repos</span>
                <span className={valueClass}>{pubMeta.publicRepos as number}</span>
              </div>
            )}
            {pubMeta.followers != null && (
              <div className={rowClass}>
                <span className={labelClass}>Followers</span>
                <span className={valueClass}>{pubMeta.followers as number}</span>
              </div>
            )}
            {pubMeta.isOrg && (
              <div className={rowClass}>
                <span className={labelClass}>Type</span>
                <span className={valueClass}>Organization</span>
              </div>
            )}
          </div>
        ) : (
          <p className={labelClass}>No publisher data available</p>
        )}
      </div>

      {/* CARD 4: Adoption */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>Adoption</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[3])}`}>{signals[3].toFixed(1)}</span>
        </div>
        {adMeta ? (
          <div className="flex flex-col gap-0.5">
            {adMeta.installsAllTime != null && (
              <div className={rowClass}>
                <span className={labelClass}>Installs</span>
                <span className={valueClass}>{(adMeta.installsAllTime as number).toLocaleString()}</span>
              </div>
            )}
            {adMeta.downloads != null && (
              <div className={rowClass}>
                <span className={labelClass}>Downloads</span>
                <span className={valueClass}>{(adMeta.downloads as number).toLocaleString()}</span>
              </div>
            )}
            {adMeta.stars != null && (
              <div className={rowClass}>
                <span className={labelClass}>Stars</span>
                <span className={valueClass}>{adMeta.stars as number}</span>
              </div>
            )}
            {adMeta.comments != null && (
              <div className={rowClass}>
                <span className={labelClass}>Comments</span>
                <span className={valueClass}>{adMeta.comments as number}</span>
              </div>
            )}
            {homepageUrl && (
              <div className="pt-2">
                <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[0.66rem] text-blue hover:underline">View on ClawHub</a>
              </div>
            )}
          </div>
        ) : (
          <p className={labelClass}>No adoption data available</p>
        )}
      </div>

      {/* CARD 5: Freshness */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>Freshness</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[4])}`}>{signals[4].toFixed(1)}</span>
        </div>
        {frMeta ? (
          <div className="flex flex-col gap-0.5">
            {frMeta.daysSinceUpdate != null && (
              <div className={rowClass}>
                <span className={labelClass}>Last updated</span>
                <span className={valueClass}>{(frMeta.daysSinceUpdate as number) === 0 ? 'Today' : `${frMeta.daysSinceUpdate}d ago`}</span>
              </div>
            )}
            {frMeta.latestVersion && (
              <div className={rowClass}>
                <span className={labelClass}>Latest version</span>
                <span className={valueClass}>v{frMeta.latestVersion as string}</span>
              </div>
            )}
            {frMeta.versions != null && (
              <div className={rowClass}>
                <span className={labelClass}>Versions published</span>
                <span className={valueClass}>{frMeta.versions as number}</span>
              </div>
            )}
            {frMeta.hasChangelog != null && (
              <div className={rowClass}>
                <span className={labelClass}>Changelog</span>
                <span className={`font-mono text-[0.68rem] font-medium ${frMeta.hasChangelog ? 'text-[#0dc956]' : 'text-fabric-400'}`}>{frMeta.hasChangelog ? 'Present' : 'None'}</span>
              </div>
            )}
          </div>
        ) : (
          <p className={labelClass}>No freshness data available</p>
        )}
      </div>

      {/* CARD 6: Transparency */}
      <div className={cardClass}>
        <div className={headerClass}>
          <span className={titleClass}>Transparency</span>
          <span className={`font-mono text-[0.68rem] font-semibold px-2 py-0.5 rounded-full ${scoreBadgeColor(signals[5])}`}>{signals[5].toFixed(1)}</span>
        </div>
        {trMeta?.checks ? (() => {
          const checks = trMeta.checks as Record<string, boolean>
          const total = Object.keys(checks).length
          const passed = Object.values(checks).filter(Boolean).length
          const pct = total > 0 ? (passed / total) * 100 : 0
          return (
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={labelClass}>{passed}/{total} checks passed</span>
                  <span className={`font-mono text-[0.66rem] font-medium ${pct === 100 ? 'text-[#0dc956]' : pct >= 50 ? 'text-[#f7931e]' : 'text-[#d03a3d]'}`}>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-fabric-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct === 100 ? 'bg-[#0dc956]' : pct >= 50 ? 'bg-[#f7931e]' : 'bg-[#d03a3d]'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(checks).map(([k, v]) => (
                  <span key={k} className="font-mono text-[0.64rem]">
                    <span className={v ? 'text-[#0dc956]' : 'text-[#d03a3d]'}>{v ? '\u2713' : '\u2717'}</span>
                    {' '}<span className="text-fabric-500">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()}</span>
                  </span>
                ))}
              </div>
            </div>
          )
        })() : (
          <p className={labelClass}>No transparency data available</p>
        )}
      </div>
    </div>
  )
}

// ---------- Helper components ----------

// ── Signal & sub-signal metadata ──

const SIGNAL_META: Record<string, { name: string; icon: string; description: string }> = {
  vulnerability: {
    name: 'Vulnerability & Safety',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    description: 'CVEs, dependency health, and supply chain integrity',
  },
  operational: {
    name: 'Operational Reliability',
    icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    description: 'Uptime, latency, error rates, and incident history',
  },
  maintenance: {
    name: 'Maintenance Activity',
    icon: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
    description: 'Commit recency, release cadence, issue response, CI/CD',
  },
  adoption: {
    name: 'Adoption',
    icon: 'M23 6l-9.5 9.5-5-5L1 18',
    description: 'Downloads, stars, dependents, and growth trajectory',
  },
  transparency: {
    name: 'Transparency',
    icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
    description: 'License, documentation, security policy, changelog',
  },
  publisher_trust: {
    name: 'Publisher Trust',
    icon: 'M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18zM6 12H2v10h4zM18 8h4v14h-4z',
    description: 'Track record, org maturity, community standing',
  },
}

const SUB_SIGNAL_META: Record<string, { name: string; source: string }> = {
  known_cves: { name: 'Known CVEs', source: 'OSV.dev' },
  dependency_health: { name: 'Dependency Health', source: 'npm / PyPI' },
  supply_chain_basics: { name: 'Supply Chain', source: 'npm provenance' },
  uptime: { name: 'Uptime', source: 'Health checks' },
  response_latency: { name: 'Response Latency', source: 'Health checks' },
  error_rate: { name: 'Error Rate', source: 'Health checks' },
  incident_history: { name: 'Incident History', source: 'Incidents table' },
  commit_recency: { name: 'Commit Recency', source: 'GitHub' },
  release_cadence: { name: 'Release Cadence', source: 'GitHub' },
  issue_responsiveness: { name: 'Issue Response', source: 'GitHub' },
  ci_cd_presence: { name: 'CI/CD Presence', source: 'GitHub Actions' },
  download_volume: { name: 'Download Volume', source: 'npm / PyPI' },
  github_stars: { name: 'GitHub Stars', source: 'GitHub' },
  dependent_packages: { name: 'Dependent Packages', source: 'npm' },
  growth_trend: { name: 'Growth Trend', source: 'npm' },
  open_source: { name: 'Open Source', source: 'GitHub' },
  documentation: { name: 'Documentation', source: 'GitHub' },
  security_policy: { name: 'Security Policy', source: 'GitHub' },
  changelog: { name: 'Changelog', source: 'GitHub' },
  track_record: { name: 'Track Record', source: 'Fabric index' },
  org_maturity: { name: 'Org Maturity', source: 'GitHub' },
  community_standing: { name: 'Community Standing', source: 'GitHub' },
  cross_platform_presence: { name: 'Cross-Platform', source: 'Registry scan' },
}

function signalBarColor(score: number): string {
  if (score >= 3.00) return 'bg-gradient-to-r from-[#0dc956] to-[#00E676]'
  if (score >= 1.0) return 'bg-gradient-to-r from-[#f7931e] to-[#FFC107]'
  return 'bg-gradient-to-r from-[#d03a3d] to-[#ef5350]'
}

function signalScoreColor(score: number): string {
  if (score >= 3.00) return 'text-[#0dc956]'
  if (score >= 1.0) return 'text-[#f7931e]'
  return 'text-[#d03a3d]'
}

function SignalIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
      <path d={d} />
    </svg>
  )
}

interface SubSignal {
  name: string
  score: number
  weight: number
  has_data: boolean
  detail?: string
}

function SignalCard({ signalKey, score, weight, subSignals, defaultExpanded }: {
  signalKey: string
  score: number
  weight: string
  subSignals: SubSignal[]
  defaultExpanded: boolean
}) {
  const [open, setOpen] = useState(defaultExpanded)
  const meta = SIGNAL_META[signalKey]
  if (!meta) return null

  const pct = (score / 5) * 100
  const withData = subSignals.filter(s => s.has_data)
  const totalDataWeight = withData.reduce((sum, s) => sum + s.weight, 0)

  return (
    <div className={`border rounded-lg transition-colors ${open ? 'border-fabric-200 bg-fabric-50/50' : 'border-transparent hover:border-fabric-100'}`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 cursor-pointer max-[480px]:gap-2 max-[480px]:px-2.5"
      >
        <span className="font-mono text-[0.72rem] text-fabric-700 text-left flex-shrink-0 whitespace-nowrap w-[160px] max-md:w-[140px] max-[480px]:w-[120px]">{meta.name}</span>
        <span className="font-mono text-[0.58rem] text-fabric-400 flex-shrink-0 max-[480px]:hidden">{weight}</span>
        <div className="flex-1 h-1.5 bg-fabric-100 rounded-full overflow-hidden min-w-[40px]">
          <div className={`h-full rounded-full signal-bar-fill ${signalBarColor(score)}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`font-mono text-[0.78rem] font-medium text-right w-[36px] flex-shrink-0 ${signalScoreColor(score)}`}>{score.toFixed(1)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-fabric-400 flex-shrink-0 chevron-rotate" data-open={open}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expandable sub-signals */}
      <div className="signal-card-expand" data-open={open}>
        <div>
          <div className="px-3.5 pb-3.5 pt-0.5 max-[480px]:px-2.5">
            <p className="text-[0.72rem] text-fabric-500 mb-2">{meta.description}</p>
            <p className="font-mono text-[0.6rem] text-fabric-400 mb-3">
              {withData.length} of {subSignals.length} sub-signals with data
            </p>
            <div className="flex flex-col gap-2">
              {subSignals.map(sub => {
                const subMeta = SUB_SIGNAL_META[sub.name]
                const displayName = subMeta?.name ?? sub.name.replace(/_/g, ' ')
                const source = subMeta?.source ?? ''
                const subPct = sub.has_data ? (sub.score / 5) * 100 : 0
                const effectiveWeight = sub.has_data && totalDataWeight > 0
                  ? Math.round((sub.weight / totalDataWeight) * 100)
                  : 0

                return (
                  <div key={sub.name} className={`rounded-md px-2.5 py-2 ${sub.has_data ? 'bg-white border border-fabric-100' : 'bg-fabric-50 border border-dashed border-fabric-200'}`}>
                    <div className="flex items-center gap-2 mb-1 max-[480px]:gap-1.5">
                      <span className="font-mono text-[0.68rem] text-fabric-600 flex-1 truncate">{displayName}</span>
                      {sub.has_data ? (
                        <span className="font-mono text-[0.56rem] text-fabric-400 flex-shrink-0 max-[480px]:hidden">{effectiveWeight}%</span>
                      ) : (
                        <span className="font-mono text-[0.54rem] px-1.5 py-0.5 bg-fabric-100 text-fabric-400 rounded flex-shrink-0">no data</span>
                      )}
                      <span className={`font-mono text-[0.72rem] font-medium flex-shrink-0 w-[30px] text-right ${sub.has_data ? signalScoreColor(sub.score) : 'text-fabric-300'}`}>
                        {sub.has_data ? sub.score.toFixed(1) : '—'}
                      </span>
                    </div>
                    {sub.has_data ? (
                      <>
                        <div className="h-1 bg-fabric-100 rounded-full overflow-hidden mb-1.5">
                          <div className={`h-full rounded-full ${signalBarColor(sub.score)}`} style={{ width: `${subPct}%` }} />
                        </div>
                        {sub.detail && (
                          <p className="text-[0.66rem] text-fabric-500 leading-snug">{sub.detail}</p>
                        )}
                        {source && (
                          <p className="font-mono text-[0.56rem] text-fabric-300 mt-0.5">via {source}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-[0.64rem] text-fabric-400 italic">Weight redistributed to sub-signals with data</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Legacy flat signal row for skills and services without signal_scores
function SignalRow({ name, score, weight, detail, note, isSkill }: { name: string; score: number; weight: string; detail: string; note?: string; isSkill?: boolean }) {
  const [open, setOpen] = useState(false)
  const pct = (score / 5) * 100
  const barColor = signalBarColor(score)

  return (
    <div>
      <div className={`grid items-center gap-4 max-md:gap-2 max-[480px]:gap-1.5 ${isSkill ? 'grid-cols-[180px_1fr_50px_42px] max-md:grid-cols-[100px_1fr_40px_36px] max-[480px]:grid-cols-[80px_1fr_36px_30px]' : 'grid-cols-[180px_1fr_50px_42px_20px] max-md:grid-cols-[100px_1fr_40px_36px_20px] max-[480px]:grid-cols-[80px_1fr_36px_30px_16px]'}`}>
        <span className="font-mono text-[0.72rem] text-fabric-600">{name}</span>
        <div className="h-1.5 bg-fabric-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full signal-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[0.78rem] font-medium text-black text-right">{score.toFixed(1)}</span>
        <span className="font-mono text-[0.62rem] text-fabric-400 text-right">{weight}</span>
        {!isSkill && (
          <button
            onClick={() => setOpen(!open)}
            className={`w-5 h-5 rounded-full flex items-center justify-center border text-fabric-400 font-mono text-[0.6rem] font-semibold cursor-pointer transition-all flex-shrink-0 leading-none ${open ? 'border-blue text-blue bg-[rgba(61,138,247,0.08)]' : 'border-fabric-200 bg-white hover:border-blue hover:text-blue'}`}
          >
            i
          </button>
        )}
      </div>
      {!isSkill && open && (
        <div className="grid grid-cols-[180px_1fr_50px_42px_20px] gap-4 max-md:grid-cols-[100px_1fr_40px_36px_20px] max-md:gap-2 max-[480px]:grid-cols-[80px_1fr_36px_30px_16px] max-[480px]:gap-1.5 py-1.5">
          <div />
          <div className="text-[0.75rem] text-fabric-500 leading-normal">
            {detail}
            {note && <p className="mt-1.5 text-[0.68rem] text-fabric-400 italic">{note}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Helpers ----------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function incidentDotColor(type: string, severity: string): string {
  if (type === 'cve_found' || severity === 'critical') return 'bg-[#d03a3d]'
  if (type === 'uptime_drop' || severity === 'warning') return 'bg-[#f7931e]'
  if (type === 'uptime_restored' || type === 'cve_patched') return 'bg-[#0dc956]'
  if (type === 'version_release' || type === 'initial_index') return 'bg-blue'
  if (type === 'score_change') return 'bg-[#0dc956]'
  return 'bg-fabric-400'
}

function incidentScoreColor(score: number | undefined): string {
  if (score === undefined || score === null) return 'text-fabric-400'
  if (score >= 3.00) return 'text-[#0dc956]'
  if (score >= 1.00) return 'text-[#f7931e]'
  return 'text-[#d03a3d]'
}

function buildScoreHistoryPath(entries: SignalHistoryEntry[], width: number, height: number): { linePath: string; fillPath: string; points: { x: number; y: number; score: number; date: string }[] } {
  if (entries.length === 0) return { linePath: '', fillPath: '', points: [] }

  const minScore = 0
  const maxScore = 5
  const padding = 4

  const points = entries.map((e, i) => {
    const x = entries.length === 1 ? width / 2 : (i / (entries.length - 1)) * width
    const y = padding + ((maxScore - e.score) / (maxScore - minScore)) * (height - padding * 2)
    return { x, y, score: e.score, date: e.recorded_at }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${width},${height} L0,${height}Z`

  return { linePath, fillPath, points }
}

// ---------- Main Component ----------

export default function ProductPageClient({
  service,
  incidents,
  signalHistory,
  versions,
  supplyChain,
  transparencyMeta,
  adoptionMeta,
  maintenanceMeta,
  signalMetas = {},
}: ProductPageProps) {
  const [incidentsCount, setIncidentsCount] = useState(ITEMS_INITIAL)
  const [depsCount, setDepsCount] = useState(ITEMS_INITIAL)
  const [versionsCount, setVersionsCount] = useState(ITEMS_INITIAL)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showThresholds, setShowThresholds] = useState(false)

  const tagClass = TAG_CLASSES[service.category] || ''
  const tagColor = TAG_COLORS[tagClass]
  const heroTags = HERO_TAGS[service.category] || [service.category]

  // Metrics availability
  const hasMetrics = (service.uptime_30d && service.uptime_30d > 0) || (service.avg_latency_ms && service.avg_latency_ms > 0)
  const hasDownloads = adoptionMeta && typeof adoptionMeta.weekly_downloads === 'number' && adoptionMeta.weekly_downloads > 0

  // Transparency checklist
  const checklist = transparencyMeta?.checklist as Record<string, boolean> | undefined
  const hasTransparency = checklist && Object.keys(checklist).length > 0

  // Community data
  const hasCommunity = hasDownloads || (maintenanceMeta && typeof maintenanceMeta.commits_90d === 'number')

  // Score history chart
  const hasScoreHistory = signalHistory.length >= 2
  const chartData = hasScoreHistory ? buildScoreHistoryPath(signalHistory, 800, 160) : null

  // Data sources
  const dataSources = service.category === 'skill' ? SKILL_DATA_SOURCES : getDataSources(service)

  return (
    <>
      <Nav />

      <div className="max-w-page mx-auto px-8 pt-7 pb-16 max-md:px-4 max-md:pt-4">
        {/* ═══ HERO ═══ */}
        <div className="bg-white border border-fabric-200 rounded-2xl p-6 max-md:p-5 max-[480px]:p-4 mb-5">
          <div className="flex items-start justify-between gap-6 max-md:flex-col max-md:gap-4">
            <div className="flex items-start gap-5 flex-1 min-w-0 flex-wrap">
              <ServiceLogo logoUrl={service.logo_url} domain={service.domain} githubRepo={service.github_repo} name={service.name} size={56} className="rounded-[14px] max-md:!w-11 max-md:!h-11 max-md:!rounded-[11px]" />
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold tracking-tight leading-tight max-md:text-xl">{service.name}</h1>
                <div className="font-mono text-[0.78rem] text-fabric-500 mt-0.5">
                  {service.rank != null && (
                    <><span className="text-fabric-400">#{service.rank}</span>{' · '}</>
                  )}
                  by {service.publisher_url ? (
                    <a href={service.publisher_url} target="_blank" rel="noopener noreferrer" className="text-fabric-600 hover:text-pink transition-colors no-underline">{service.publisher}</a>
                  ) : (
                    <span className="text-fabric-600">{service.publisher}</span>
                  )}
                </div>
              </div>

              {/* Hero tags */}
              <div className="w-full flex flex-wrap gap-1.5 items-center -mt-[4px]">
                {heroTags.map(t => (
                  <Link
                    key={t}
                    href={`/?category=${service.category}`}
                    className="font-mono text-[0.58rem] py-[3px] px-2 rounded-full uppercase tracking-wider font-medium border border-fabric-200 text-fabric-400 cursor-pointer transition-all hover:text-blue hover:border-blue hover:bg-[rgba(61,138,247,0.08)] no-underline"
                  >
                    {t}
                  </Link>
                ))}
              </div>

              {/* Hero links */}
              <div className="w-full flex gap-2 -mt-[11px]">
                {[
                  { title: 'Website', href: service.homepage_url || (service.domain ? `https://${service.domain}` : null), d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM2 12h20M12 2c2.5 2.8 4 6.2 4 10s-1.5 7.2-4 10c-2.5-2.8-4-6.2-4-10s1.5-7.2 4-10z' },
                  { title: 'Docs', href: service.docs_url || null, d: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
                  { title: 'GitHub', href: service.github_repo ? `https://github.com/${service.github_repo}` : null, fill: true, d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' },
                  { title: 'npm', href: service.npm_package ? `https://www.npmjs.com/package/${service.npm_package}` : null, d: 'M3 3h18v18H3V3zm3 3v12h4.5V9h3v9H18V6H6z', fill: true },
                  { title: 'PyPI', href: service.pypi_package ? `https://pypi.org/project/${service.pypi_package}` : null, d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
                  { title: 'X', href: service.x_url || null, d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', fill: true },
                  { title: 'Discord', href: service.discord_url || null, fill: true, d: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z' },
                  { title: 'Status', href: service.status_page_url || null, d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
                ].filter(link => link.href).map(link => (
                  <a
                    key={link.title}
                    href={link.href!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.title}
                    className="w-[30px] h-[30px] max-[480px]:w-9 max-[480px]:h-9 rounded-lg flex items-center justify-center text-fabric-400 border border-fabric-200 bg-white cursor-pointer transition-all hover:border-blue hover:text-blue hover:bg-[rgba(61,138,247,0.06)] no-underline"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill={link.fill ? 'currentColor' : 'none'} stroke={link.fill ? 'none' : 'currentColor'} strokeWidth={link.fill ? undefined : 2}>
                      <path d={link.d} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Score box - right side */}
            <div className="flex-shrink-0 flex flex-col items-end gap-1 text-right max-md:items-center max-md:text-center">
              <RatingBoxes score={service.score} status={service.status} size="lg" />
              <div className="flex items-center gap-2 mt-1">
                <span className={`font-mono text-[0.82rem] font-semibold tracking-tight ${scoreColor[service.status]}`}>
                  {service.score.toFixed(2)}
                </span>
                <span className="font-mono text-[0.62rem] text-fabric-400">/ 5.00</span>
              </div>
              <div className="relative flex items-center gap-1.5">
                <ScoreStatus status={service.status} />
                <span className="font-mono text-[0.5rem] font-semibold uppercase tracking-wider text-fabric-400 border border-fabric-200 rounded px-1 py-[1px] leading-tight cursor-default" title="The Fabric scoring engine is in active beta. Signals and thresholds are being calibrated as new data sources come online.">Beta</span>
                <button
                  onClick={() => setShowThresholds(!showThresholds)}
                  className={`w-4 h-4 rounded-full flex items-center justify-center border text-fabric-400 font-mono text-[0.5rem] font-semibold cursor-pointer transition-all leading-none flex-shrink-0 ${showThresholds ? 'border-blue text-blue bg-[rgba(61,138,247,0.08)]' : 'border-fabric-200 bg-white hover:border-blue hover:text-blue'}`}
                >
                  i
                </button>
                {showThresholds && (
                  <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-fabric-200 rounded-xl shadow-lg p-4 w-[280px] max-[480px]:w-[260px]">
                    <span className="font-mono text-[0.65rem] font-semibold text-fabric-600 uppercase tracking-wider">Score Thresholds</span>
                    <div className="flex flex-col gap-1 mt-2">
                      {[
                        { range: '3.00 – 5.00', label: 'Trusted · auto-approve', color: 'text-[#0dc956]' },
                        { range: '1.00 – 2.99', label: 'Caution · human confirm', color: 'text-[#f7931e]' },
                        { range: '0.00 – 0.99', label: 'Blocked · deny by default', color: 'text-[#d03a3d]' },
                      ].map(t => (
                        <div key={t.range} className="flex justify-between items-center py-1 border-b border-fabric-100 last:border-b-0">
                          <span className="font-mono text-[0.65rem] text-fabric-500">{t.range}</span>
                          <span className={`font-mono text-[0.65rem] font-medium ${t.color}`}>{t.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-fabric-100">
                      <span className="font-mono text-[0.65rem] text-fabric-500">Modifiers</span>
                      {service.active_modifiers && service.active_modifiers.length > 0 ? (
                        <span className="font-mono text-[0.65rem] font-medium text-[#f7931e] text-right max-w-[160px]">
                          {service.active_modifiers.map(m => MODIFIER_LABELS[m] || m.replace(/_/g, ' ')).join(', ')}
                        </span>
                      ) : (
                        <span className="font-mono text-[0.65rem] font-medium text-[#0dc956]">None</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Override explanation */}
          {service.active_modifiers && service.active_modifiers.some(m => m === 'vulnerability_zero_override' || m === 'vulnerability_patch_available' || m === 'zero_signal_override') && (
            <div className="flex items-start gap-2.5 mt-4 p-3 bg-[rgba(208,58,61,0.06)] border border-[rgba(208,58,61,0.15)] rounded-lg">
              <svg className="w-4 h-4 text-[#d03a3d] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="font-mono text-[0.72rem] text-fabric-700 leading-relaxed">
                {(() => {
                  const scorePart = `Score capped to ${service.score.toFixed(2)}${service.raw_composite_score ? ` (raw score: ${service.raw_composite_score.toFixed(2)})` : ''}`
                  if (service.active_modifiers!.includes('vulnerability_zero_override')) {
                    return `${scorePart} — critical/high CVE detected with no known fix. Status blocked until the vulnerability is patched.`
                  }
                  if (service.active_modifiers!.includes('vulnerability_patch_available')) {
                    const vulnMeta = signalMetas.vulnerability
                    const fixedVersion = vulnMeta?.critical_fixed_version as string | undefined
                    return `${scorePart} — critical/high CVE with patch available${fixedVersion ? ` (v${fixedVersion})` : ''} but not yet applied to the latest release. Status held at caution until update is applied.`
                  }
                  return `${scorePart} due to insufficient data in one or more signals. The composite is held at caution level until all signals can be fully evaluated.`
                })()}
              </span>
            </div>
          )}

          {/* Pending status banner */}
          {service.status === 'pending' && (
            <div className="flex items-start gap-2.5 mt-4 p-3 bg-[rgba(160,160,156,0.06)] border border-[rgba(160,160,156,0.15)] rounded-lg">
              <svg className="w-4 h-4 text-fabric-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="font-mono text-[0.72rem] text-fabric-500 leading-relaxed">
                This service is awaiting its first evaluation. Scores will appear once collectors have run.
              </span>
            </div>
          )}

          {/* Hero meta */}
          <div className="flex gap-6 max-[480px]:gap-3 flex-wrap font-mono text-[0.68rem] text-fabric-400 mt-4 pt-4 border-t border-fabric-100">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {service.updated}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              6 signals analysed
            </span>
            {maintenanceMeta?.commits_90d !== undefined && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" /></svg>
                {maintenanceMeta.commits_90d as number} commits (90d)
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              No manual reviews · fully automated
            </span>
          </div>
        </div>

        {/* ═══ TRUST SIGNAL BREAKDOWN ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
          <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Trust Signal Breakdown</span>
            <div className="flex items-center gap-2">
              {service.signal_scores ? (() => {
                const totalSubs = Object.values(service.signal_scores).reduce((sum, sig) => sum + (sig.sub_signals?.length ?? 0), 0)
                const signalsWithData = service.signals_with_data ?? 0
                const confidence = signalsWithData >= 5 ? 'high' : signalsWithData >= 3 ? 'medium' : signalsWithData >= 1 ? 'low' : 'unverified'
                const confColor = confidence === 'high' ? 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]' : confidence === 'medium' ? 'bg-[rgba(247,147,30,0.1)] text-[#f7931e]' : confidence === 'low' ? 'bg-[rgba(208,58,61,0.1)] text-[#d03a3d]' : 'bg-fabric-100 text-fabric-400'
                return (
                  <>
                    <span className={`font-mono text-[0.58rem] py-0.5 px-2 rounded-full ${confColor}`}>
                      {confidence}
                    </span>
                    <span className="font-mono text-[0.58rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full max-[480px]:hidden">
                      {totalSubs} sub-signals across 6 dimensions
                    </span>
                  </>
                )
              })() : (
                <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">
                  {service.signals_with_data != null
                    ? `${service.signals_with_data}/6 signals scored`
                    : '6 signals · weighted composite'}
                </span>
              )}
            </div>
          </div>

          {/* Sub-signal cards (services with signal_scores) */}
          {service.signal_scores ? (
            <div className="flex flex-col gap-1.5">
              {STANDARD_SIGNAL_KEYS.map((key, i) => {
                const signalData = service.signal_scores?.[key]
                const isLowScore = service.signals[i] < 3.00
                const isFirst = i === 0
                return (
                  <SignalCard
                    key={key}
                    signalKey={key}
                    score={service.signals[i]}
                    weight={SIGNAL_LABELS[i].weight}
                    subSignals={signalData?.sub_signals ?? []}
                    defaultExpanded={false}
                  />
                )
              })}
            </div>
          ) : (
            /* Legacy flat rows (skills or services without signal_scores) */
            <div className="flex flex-col gap-3.5">
              {(service.category === 'skill' ? SKILL_SIGNAL_LABELS : SIGNAL_LABELS).map((signal, i) => {
                const isSkill = service.category === 'skill'
                const signalKey = isSkill ? SKILL_SIGNAL_KEYS[i] : STANDARD_SIGNAL_KEYS[i]
                const rawMeta = signalKey ? signalMetas[signalKey] : undefined
                const detail = !isSkill && signalKey && rawMeta
                  ? getStandardSignalDetail(signalKey, rawMeta, service)
                  : signal.detail
                return (
                  <SignalRow
                    key={signal.name}
                    name={signal.name}
                    score={service.signals[i]}
                    weight={signal.weight}
                    detail={detail}
                    note={isSkill && signal.name === 'VirusTotal Scan' && (service.signals[i] === 2.5 || service.signals[i] === 3.0)
                      ? 'Based on ClawHub moderation status — direct VirusTotal scan pending'
                      : undefined}
                    isSkill={isSkill}
                  />
                )
              })}
            </div>
          )}

          {service.signals_with_data != null && service.signals_with_data < 4 && (
            <p className="font-mono text-[0.62rem] text-fabric-400 mt-3 pt-3 border-t border-fabric-100">
              Limited data available — {6 - service.signals_with_data} of 6 signals pending evaluation
            </p>
          )}

          {/* About this score */}
          <details className="mt-4 pt-4 border-t border-fabric-100 group">
            <summary className="font-mono text-[0.62rem] text-fabric-400 cursor-pointer select-none list-none flex items-center gap-1.5 hover:text-fabric-600 transition-colors">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              About this score
            </summary>
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="font-mono text-[0.58rem] text-fabric-500">
                {service.signal_scores ? `Scored across ${Object.values(service.signal_scores).reduce((sum, sig) => sum + (sig.sub_signals?.length ?? 0), 0)} sub-signals in 6 dimensions` : 'Scored across 6 signal dimensions'}
              </span>
              <span className="font-mono text-[0.58rem] text-fabric-500">Scoring engine v1 (beta) — actively being expanded</span>
              <span className="font-mono text-[0.58rem] text-fabric-400">Phase 1: Core sub-signal architecture (live)</span>
              <span className="font-mono text-[0.58rem] text-fabric-400">Phase 2: Permission scope &amp; expanded collection (in progress)</span>
            </div>
          </details>
        </div>

        {/* ═══ SIGNAL DETAILS (skills only) ═══ */}
        {service.category === 'skill' && Object.keys(signalMetas).length > 0 && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Signal Details</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">from signal_history</span>
            </div>
            <SignalDetailCards signals={service.signals} metas={signalMetas} homepageUrl={service.homepage_url} />
          </div>
        )}

        {/* ═══ ABOUT THIS SERVICE ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl mb-5 overflow-hidden">
          <div className="p-7 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Trust Assessment</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">AI Assessment</span>
            </div>
            {service.ai_assessment ? (
              <div>
                <p className="text-[0.92rem] leading-[1.7] text-fabric-700 whitespace-pre-line">{service.ai_assessment}</p>
                <p className="font-mono text-[0.62rem] text-fabric-400 mt-3">
                  Generated by Fabric AI{service.ai_assessment_updated_at ? ` · ${new Date(service.ai_assessment_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(service.ai_assessment_updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
                </p>
              </div>
            ) : (
              <p className="text-[0.92rem] leading-relaxed text-fabric-700">{service.description}</p>
            )}

            {/* Licence */}

            {/* Request / Response Schema */}
            {(service.request_schema || service.response_schema) && (
              <div className="mt-6 pt-5 border-t border-fabric-100">
                <span className="font-mono text-[0.72rem] uppercase tracking-wider text-fabric-400 font-medium">Request / Response Schema</span>
                <div className="grid grid-cols-2 gap-3 mt-3 max-md:grid-cols-1">
                  {service.request_schema && (
                    <div>
                      <span className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider">Request</span>
                      <pre className="mt-1.5 bg-fabric-800 text-fabric-300 rounded-lg p-4 font-mono text-[0.68rem] leading-relaxed overflow-x-auto whitespace-pre">{service.request_schema}</pre>
                    </div>
                  )}
                  {service.response_schema && (
                    <div>
                      <span className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider">Response</span>
                      <pre className="mt-1.5 bg-fabric-800 text-fabric-300 rounded-lg p-4 font-mono text-[0.68rem] leading-relaxed overflow-x-auto whitespace-pre">{service.response_schema}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ METRICS CARD ═══ */}
        {(hasMetrics || hasDownloads) && (
          <div className="grid grid-cols-3 max-md:grid-cols-1 bg-white border border-fabric-200 rounded-xl mb-5 overflow-hidden">
            {service.uptime_30d && service.uptime_30d > 0 ? (
              <div className="p-6 max-[480px]:p-4">
                <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">{service.endpoint_url ? 'Service Health' : 'Package Availability'} (30d)</div>
                <div className="text-[1.65rem] max-[480px]:text-[1.25rem] font-bold text-black tracking-tight leading-none">
                  {service.uptime_30d.toFixed(2)}<span className="text-base text-fabric-500 font-normal ml-0.5">%</span>
                </div>
                <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                  {service.p50_latency_ms ? `p50: ${service.p50_latency_ms}ms` : ''}
                  {service.p50_latency_ms && service.p99_latency_ms ? ' · ' : ''}
                  {service.p99_latency_ms ? `p99: ${service.p99_latency_ms}ms` : ''}
                </div>
              </div>
            ) : (
              <div className="p-6 max-[480px]:p-4">
                <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Uptime (30d)</div>
                <div className="text-[1.1rem] font-medium text-fabric-300 tracking-tight leading-none">No endpoint monitored</div>
                <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">Health checks run when endpoint_url is set</div>
              </div>
            )}

            <div className="p-6 max-[480px]:p-4 border-l border-fabric-200 max-md:border-l-0 max-md:border-t">
              <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Avg Latency</div>
              {service.avg_latency_ms && service.avg_latency_ms > 0 ? (
                <>
                  <div className="text-[1.65rem] max-[480px]:text-[1.25rem] font-bold text-black tracking-tight leading-none">
                    {service.avg_latency_ms < 1000
                      ? <>{service.avg_latency_ms}<span className="text-base text-fabric-500 font-normal ml-0.5">ms</span></>
                      : <>{(service.avg_latency_ms / 1000).toFixed(1)}<span className="text-base text-fabric-500 font-normal ml-0.5">s</span></>
                    }
                  </div>
                  <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">averaged across 30d health checks</div>
                </>
              ) : (
                <>
                  <div className="text-[1.1rem] font-medium text-fabric-300 tracking-tight leading-none">—</div>
                  <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">awaiting health check data</div>
                </>
              )}
            </div>

            <div className="p-6 max-[480px]:p-4 border-l border-fabric-200 max-md:border-l-0 max-md:border-t">
              <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Weekly Downloads</div>
              {hasDownloads ? (
                <>
                  <div className="text-[1.65rem] max-[480px]:text-[1.25rem] font-bold text-black tracking-tight leading-none">
                    {formatNumber(adoptionMeta!.weekly_downloads as number)}
                    {typeof adoptionMeta!.growth_rate === 'number' && (
                      <span className={`text-[0.88rem] font-normal ml-1 ${(adoptionMeta!.growth_rate as number) >= 0 ? 'text-[#0dc956]' : 'text-[#d03a3d]'}`}>
                        {(adoptionMeta!.growth_rate as number) >= 0 ? '+' : ''}{Math.round(adoptionMeta!.growth_rate as number)}%
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                    {service.npm_package ? 'npm' : ''}{service.npm_package && service.pypi_package ? ' + ' : ''}{service.pypi_package ? 'PyPI' : ''} weekly
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[1.1rem] font-medium text-fabric-300 tracking-tight leading-none">—</div>
                  <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">no package registry data</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ TRANSPARENCY & COMPLIANCE ═══ */}
        {hasTransparency && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Transparency & Compliance</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">
                {String(transparencyMeta?.items_passed ?? 0)}/{String(transparencyMeta?.items_total ?? 6)} passed
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {(() => {
                const gh = service.github_repo ? `https://github.com/${service.github_repo}` : null
                const items = [
                  { key: 'public_source', label: 'Open Source Code', metaTrue: 'Public repository on GitHub', metaFalse: 'No public source code found', url: gh },
                  { key: 'recognized_license', label: 'OSI License', metaTrue: `Licensed under ${(transparencyMeta?.license as string)?.toUpperCase() || 'OSI-approved'}`, metaFalse: 'No recognized open-source license', url: gh ? `${gh}/blob/main/LICENSE` : null },
                  { key: 'readme_with_examples', label: 'Documentation', metaTrue: 'README with examples/code blocks', metaFalse: 'README missing or lacks examples', url: gh ? `${gh}#readme` : null },
                  { key: 'security_md', label: 'SECURITY.md', metaTrue: 'Security policy published', metaFalse: 'No security policy found', url: gh ? `${gh}/security` : null },
                  { key: 'api_docs', label: 'API Documentation', metaTrue: 'OpenAPI spec or docs directory found', metaFalse: 'No API documentation detected', url: (transparencyMeta?.api_docs_url as string) || service.docs_url || null },
                  { key: 'model_card', label: 'Model / System Card', metaTrue: 'Model card or system card published', metaFalse: 'No model card found', url: null as string | null },
                ]
                return items.filter(item => {
                  if (item.key === 'model_card' && transparencyMeta?.model_card_applicable === false) return false
                  if (item.key === 'model_card' && checklist?.['model_card_skipped']) return false
                  return true
                }).map(item => {
                  const passed = checklist?.[item.key] ?? false
                  const linkUrl = passed ? item.url : null
                  const inner = (
                    <>
                      <div className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 text-sm ${passed ? 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]' : 'bg-fabric-100 text-fabric-500'}`}>
                        {passed ? '✓' : '✗'}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="font-mono text-[0.72rem] font-medium text-fabric-800">{item.label}</span>
                        <span className="font-mono text-[0.62rem] text-fabric-400">{passed ? item.metaTrue : item.metaFalse}</span>
                      </div>
                      {linkUrl && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fabric-300 flex-shrink-0 mt-1">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      )}
                    </>
                  )
                  return linkUrl ? (
                    <a key={item.key} href={linkUrl} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 p-3 bg-fabric-50 border border-fabric-100 rounded-lg no-underline hover:border-blue hover:bg-[rgba(61,138,247,0.04)] transition-all cursor-pointer">
                      {inner}
                    </a>
                  ) : (
                    <div key={item.key} className="flex items-start gap-2.5 p-3 bg-fabric-50 border border-fabric-100 rounded-lg">
                      {inner}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* ═══ INCIDENTS ═══ */}
        {incidents.length > 0 && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Incidents & Alerts</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">last 90 days</span>
            </div>
            <div className="flex flex-col max-h-[400px] overflow-y-auto no-scrollbar">
              {incidents.slice(0, incidentsCount).map((inc) => (
                <div key={inc.id} className="flex gap-4 max-[480px]:gap-2 py-3 border-b border-fabric-100 last:border-b-0 items-start">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${incidentDotColor(inc.type, inc.severity)}`} />
                  <span className="font-mono text-[0.65rem] text-fabric-400 min-w-[56px] flex-shrink-0 mt-px">{formatDate(inc.created_at)}</span>
                  <span className="font-mono text-[0.72rem] text-fabric-700 leading-relaxed flex-1">{inc.title}</span>
                  {inc.score_at_time !== undefined && inc.score_at_time !== null && (
                    <span className={`font-mono text-[0.68rem] font-medium flex-shrink-0 mt-px ${incidentScoreColor(inc.score_at_time)}`}>
                      {inc.score_at_time.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
              <span className="font-mono text-[0.65rem] text-fabric-400">
                Showing {Math.min(incidentsCount, incidents.length)} of {incidents.length} events
              </span>
              <div className="flex gap-3">
                {incidentsCount > ITEMS_INITIAL && (
                  <button onClick={() => setIncidentsCount(ITEMS_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                    ← Show less
                  </button>
                )}
                {incidentsCount < incidents.length && (
                  <button onClick={() => setIncidentsCount(c => Math.min(c + LOAD_MORE_BATCH, incidents.length))} className="font-mono text-[0.68rem] text-blue cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SCORE HISTORY ═══ */}
        {hasScoreHistory && chartData && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Score History</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">{signalHistory.length} snapshots</span>
            </div>
            <div className="w-full h-40 relative mt-2 pr-10 max-[480px]:pr-6">
              <svg className="w-full h-full" viewBox="0 0 800 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3d8af7" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#3d8af7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 40, 80, 120, 160].map(y => (
                  <line key={y} x1="0" y1={y} x2="800" y2={y} className="stroke-fabric-100 stroke-1" />
                ))}
                <path fill="url(#chartGrad)" d={chartData.fillPath} />
                <path fill="none" stroke="#3d8af7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={chartData.linePath} />
                {/* End point */}
                {chartData.points.length > 0 && (
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="4" fill="#3d8af7" stroke="white" strokeWidth="2"
                  />
                )}
              </svg>
              <div className="absolute top-0 right-0 h-40 flex flex-col justify-between">
                {['5.00', '3.75', '2.50', '1.25', '0.00'].map(v => (
                  <span key={v} className="font-mono text-[0.62rem] text-fabric-300 text-right leading-none">{v}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-2">
              {signalHistory.length > 0 && (
                <>
                  <span className="font-mono text-[0.62rem] text-fabric-400">{formatDate(signalHistory[0].recorded_at)}</span>
                  <span className="font-mono text-[0.62rem] text-blue">{formatDate(signalHistory[signalHistory.length - 1].recorded_at)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ COMMUNITY & ECOSYSTEM ═══ */}
        {hasCommunity && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Community & Ecosystem</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">adoption signals</span>
            </div>
            <div className="grid grid-cols-3 gap-3 max-[480px]:grid-cols-1">
              {hasDownloads && (
                <div className="p-4 bg-fabric-50 border border-fabric-100 rounded-lg text-center">
                  <div className="text-xl font-bold text-black tracking-tight">{formatNumber(adoptionMeta!.weekly_downloads as number)}</div>
                  <div className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider mt-1">Weekly Downloads</div>
                  <div className="font-mono text-[0.6rem] text-fabric-400 mt-0.5">
                    {service.npm_package ? 'npm' : ''}{service.npm_package && service.pypi_package ? ' + ' : ''}{service.pypi_package ? 'PyPI' : ''}
                  </div>
                </div>
              )}
              {maintenanceMeta && typeof maintenanceMeta.commits_90d === 'number' && (
                <div className="p-4 bg-fabric-50 border border-fabric-100 rounded-lg text-center">
                  <div className="text-xl font-bold text-black tracking-tight">{maintenanceMeta.commits_90d as number}</div>
                  <div className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider mt-1">Commits (90d)</div>
                  <div className="font-mono text-[0.6rem] text-fabric-400 mt-0.5">
                    {service.github_repo ? service.github_repo.split('/')[1] : 'GitHub'}
                  </div>
                </div>
              )}
              {maintenanceMeta && typeof maintenanceMeta.total_releases === 'number' && (
                <div className="p-4 bg-fabric-50 border border-fabric-100 rounded-lg text-center">
                  <div className="text-xl font-bold text-black tracking-tight">{maintenanceMeta.total_releases as number}</div>
                  <div className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider mt-1">Releases</div>
                  <div className="font-mono text-[0.6rem] text-fabric-400 mt-0.5">
                    {maintenanceMeta.avg_release_interval_days
                      ? `avg ${maintenanceMeta.avg_release_interval_days}d apart`
                      : 'on GitHub'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ SUPPLY CHAIN ═══ */}
        {supplyChain.length > 0 && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Supply Chain & Dependencies</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">trust chain</span>
            </div>
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto no-scrollbar">
              {supplyChain.slice(0, depsCount).map(dep => (
                <div key={dep.dependency_name} className="flex items-center gap-2 max-[480px]:gap-1 p-2.5 max-[480px]:p-2 bg-fabric-50 border border-fabric-100 rounded-lg">
                  <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">
                    {dep.dependency_type === 'npm' ? '⬡' : dep.dependency_type === 'pypi' ? '◈' : '◇'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[0.72rem] font-medium text-fabric-800">{dep.dependency_name}</div>
                    <div className="font-mono text-[0.6rem] text-fabric-400">
                      {dep.dependency_type}{dep.dependency_version ? ` · ${dep.dependency_version}` : ''}
                      {dep.cve_count > 0 ? ` · ${dep.cve_count} CVE${dep.cve_count > 1 ? 's' : ''}` : ''}
                      {dep.cve_severity_counts && Object.keys(dep.cve_severity_counts).length > 0 && (
                        <span className="ml-1">
                          {Object.entries(dep.cve_severity_counts).map(([sev, count]) => (
                            <span key={sev} className={`mr-1 ${sev.includes('critical') ? 'text-[#d03a3d]' : sev.includes('high') ? 'text-[#f7931e]' : 'text-fabric-400'}`}>
                              {count as number}{sev.charAt(0).toUpperCase()}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  {dep.trust_score !== undefined && dep.trust_score !== null && (
                    <>
                      <span className="text-fabric-300 text-[0.72rem]">→</span>
                      <div className={`font-mono text-[0.72rem] font-medium ${dep.trust_score >= 3.00 ? 'text-[#0dc956]' : dep.trust_score >= 1.00 ? 'text-[#f7931e]' : 'text-[#d03a3d]'}`}>
                        {dep.trust_score.toFixed(1)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
              <span className="font-mono text-[0.65rem] text-fabric-400">
                Showing {Math.min(depsCount, supplyChain.length)} of {supplyChain.length} dependencies
              </span>
              <div className="flex gap-3">
                {depsCount > ITEMS_INITIAL && (
                  <button onClick={() => setDepsCount(ITEMS_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                    ← Show less
                  </button>
                )}
                {depsCount < supplyChain.length && (
                  <button onClick={() => setDepsCount(c => Math.min(c + LOAD_MORE_BATCH, supplyChain.length))} className="font-mono text-[0.68rem] text-blue cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ DATA SOURCES ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Data Sources</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">{dataSources.length} indexed</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
            {dataSources.map(src => {
              const inner = (
                <>
                  <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">{src.icon}</div>
                  <div className="flex flex-col gap-px flex-1 min-w-0">
                    <span className="font-mono text-[0.7rem] font-medium text-fabric-800">{src.label}</span>
                    <span className="font-mono text-[0.62rem] text-fabric-400">{src.meta}</span>
                  </div>
                  {src.url && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fabric-300 flex-shrink-0">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  )}
                </>
              )
              return src.url ? (
                <a key={src.label} href={src.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg no-underline hover:border-blue hover:bg-[rgba(61,138,247,0.04)] transition-all cursor-pointer">
                  {inner}
                </a>
              ) : (
                <div key={src.label} className="flex items-center gap-2.5 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg">
                  {inner}
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══ VERSION HISTORY ═══ */}
        {versions.length > 0 && (() => {
          const hasScoreData = versions.some(v => v.score_at_release != null)
          return (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5 max-[480px]:p-4">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Version History</span>
              {hasScoreData && <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">score per release</span>}
            </div>
            {/* Header */}
            <div className={`grid ${hasScoreData ? 'grid-cols-[100px_1fr_60px_80px] max-md:grid-cols-[80px_1fr_50px_65px]' : 'grid-cols-[100px_1fr] max-md:grid-cols-[80px_1fr]'} gap-4 max-md:gap-2 pb-2 mb-1 border-b border-fabric-200`}>
              <span className="font-mono text-[0.65rem] text-fabric-400">VERSION</span>
              <span className="font-mono text-[0.65rem] text-fabric-400">RELEASED</span>
              {hasScoreData && <span className="font-mono text-[0.65rem] text-fabric-400 text-right">SCORE</span>}
              {hasScoreData && <span className="font-mono text-[0.65rem] text-fabric-400 text-right">DELTA</span>}
            </div>
            <div className="max-h-[400px] overflow-y-auto no-scrollbar">
              {versions.slice(0, versionsCount).map(v => {
                const deltaStr = v.score_delta !== undefined && v.score_delta !== null
                  ? (v.score_delta > 0 ? `+${v.score_delta.toFixed(2)}` : v.score_delta < 0 ? v.score_delta.toFixed(2) : '—')
                  : '—'
                const deltaClass = v.score_delta !== undefined && v.score_delta !== null
                  ? (v.score_delta > 0 ? 'text-[#0dc956]' : v.score_delta < 0 ? 'text-[#d03a3d]' : 'text-fabric-400')
                  : 'text-fabric-400'
                const scoreStr = v.score_at_release !== undefined && v.score_at_release !== null
                  ? v.score_at_release.toFixed(2)
                  : '—'
                const scoreClass = v.score_at_release !== undefined && v.score_at_release !== null && v.score_at_release >= 3.00
                  ? 'text-[#0dc956]'
                  : v.score_at_release !== undefined && v.score_at_release !== null && v.score_at_release >= 1.00
                    ? 'text-[#f7931e]'
                    : 'text-fabric-400'
                return (
                  <div key={v.tag} className={`grid ${hasScoreData ? 'grid-cols-[100px_1fr_60px_80px] max-md:grid-cols-[80px_1fr_50px_65px]' : 'grid-cols-[100px_1fr] max-md:grid-cols-[80px_1fr]'} gap-4 max-md:gap-2 py-2.5 border-b border-fabric-100 last:border-b-0`}>
                    <span className="font-mono text-[0.72rem] text-fabric-700">{v.tag}</span>
                    <span className="font-mono text-[0.65rem] text-fabric-400">{formatFullDate(v.released_at)}</span>
                    {hasScoreData && <span className={`font-mono text-[0.75rem] font-medium text-right ${scoreClass}`}>{scoreStr}</span>}
                    {hasScoreData && <span className={`font-mono text-[0.65rem] text-right ${deltaClass}`}>{deltaStr}</span>}
                  </div>
                )
              })}
            </div>
            <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
              <span className="font-mono text-[0.65rem] text-fabric-400">
                Showing {Math.min(versionsCount, versions.length)} of {versions.length} releases
              </span>
              <div className="flex gap-3">
                {versionsCount > ITEMS_INITIAL && (
                  <button onClick={() => setVersionsCount(ITEMS_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                    ← Show less
                  </button>
                )}
                {versionsCount < versions.length && (
                  <button onClick={() => setVersionsCount(c => Math.min(c + LOAD_MORE_BATCH, versions.length))} className="font-mono text-[0.68rem] text-blue cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
          )
        })()}

        {/* ═══ CTA — Are you the publisher? ═══ */}
        <div className="bg-black border border-fabric-700 rounded-xl p-8 flex flex-col gap-6 mt-4 relative overflow-hidden max-md:p-6 max-[480px]:p-4 max-[480px]:gap-4">
          <div className="absolute -top-20 -right-20 w-[200px] h-[200px] bg-[radial-gradient(circle,rgba(61,138,247,0.15)_0%,transparent_70%)] pointer-events-none" />

          {/* Row 1: Publisher */}
          <div className="flex items-center justify-between gap-8 flex-wrap relative z-10 max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-3">
            <div>
              <h3 className="text-[1.15rem] font-semibold text-white tracking-tight mb-1.5">Are you the publisher?</h3>
              <p className="font-mono text-[0.72rem] text-fabric-400 leading-relaxed">Claim this profile to unlock deeper evaluation, real-time monitoring,<br className="max-md:hidden" />and trust signals that help agents discover your service.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0 max-[480px]:w-full max-[480px]:flex-col">
              <button onClick={() => setShowClaimModal(true)} className="font-mono text-[0.72rem] py-2.5 px-5 bg-transparent text-blue border border-blue/40 rounded-lg cursor-pointer transition-all hover:!bg-blue hover:!text-white hover:!border-blue whitespace-nowrap">Claim Provider</button>
              <button onClick={() => setShowReportModal(true)} className="font-mono text-[0.72rem] py-2.5 px-5 bg-transparent text-blue border border-blue/40 rounded-lg cursor-pointer transition-all hover:!bg-blue hover:!text-white hover:!border-blue whitespace-nowrap">Report Issue</button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-fabric-700" />

          {/* Row 2: Share */}
          <div className="flex items-center justify-between gap-8 flex-wrap relative z-10 max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-3">
            <div>
              <h3 className="text-[1.15rem] font-semibold text-white tracking-tight mb-1.5">Share this Trust Score</h3>
              <p className="font-mono text-[0.72rem] text-fabric-400 leading-relaxed">Generate a scorecard image optimised for X, LinkedIn and other social platforms.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <span className="font-mono text-[0.72rem] py-2.5 px-5 bg-fabric-700 text-fabric-500 rounded-lg cursor-not-allowed font-medium whitespace-nowrap opacity-50">⬇ Download Score Card</span>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {showClaimModal && (
        <ClaimProviderModal
          serviceName={service.name}
          serviceSlug={service.slug}
          onClose={() => setShowClaimModal(false)}
        />
      )}

      {showReportModal && (
        <ReportIssueModal
          serviceName={service.name}
          serviceSlug={service.slug}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </>
  )
}
