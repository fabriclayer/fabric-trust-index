'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Service } from '@/data/services'
import { SIGNAL_LABELS, TAG_CLASSES, TAG_COLORS } from '@/lib/utils'
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
}

// ---------- Constants ----------

const scoreColor = {
  trusted: 'text-[#0dc956]',
  caution: 'text-[#f7931e]',
  blocked: 'text-[#d03a3d]',
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
}

const DATA_SOURCES = [
  { icon: '△', label: 'CVE Database', meta: 'Hourly sync · full dependency tree scan' },
  { icon: '◈', label: 'GitHub', meta: 'Commits, issues, PRs' },
  { icon: '◎', label: 'Fabric Monitor', meta: '15-min pings · uptime, latency, behavioral' },
  { icon: '⬡', label: 'npm / PyPI Registry', meta: 'Downloads, versions, dependency scan' },
  { icon: '◎', label: 'Advisory Databases', meta: 'NVD, GitHub Advisories, OSV' },
  { icon: '◎', label: 'Publisher Identity', meta: 'Cross-registry verification · domain linked' },
  { icon: '◇', label: 'Docker Hub', meta: 'Image pulls, tags, vulnerability scan' },
  { icon: '△', label: 'StackOverflow', meta: 'Community questions, sentiment analysis' },
  { icon: '◈', label: 'HuggingFace', meta: 'Model downloads, likes, community activity' },
  { icon: '⬡', label: 'Status Pages', meta: 'Public status page monitoring' },
  { icon: '◎', label: 'DNS & SSL', meta: 'Certificate chain, DNSSEC, domain age' },
  { icon: '◇', label: 'WHOIS Registry', meta: 'Domain ownership, registrar history' },
]

const DATA_SOURCES_INITIAL = 6
const ITEMS_INITIAL = 6
const LOAD_MORE_BATCH = 10

// ---------- Helper components ----------

function SignalRow({ name, score, weight, detail }: { name: string; score: number; weight: string; detail: string }) {
  const [open, setOpen] = useState(false)
  const pct = (score / 5) * 100
  const level = score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low'
  const barColor = level === 'high' ? 'bg-gradient-to-r from-[#0dc956] to-[#00E676]' : level === 'medium' ? 'bg-gradient-to-r from-[#f7931e] to-[#FFC107]' : 'bg-gradient-to-r from-[#d03a3d] to-[#ef5350]'

  return (
    <div>
      <div className="grid grid-cols-[180px_1fr_50px_42px_20px] items-center gap-4 max-md:grid-cols-[100px_1fr_40px_36px_20px] max-md:gap-2">
        <span className="font-mono text-[0.72rem] text-fabric-600">{name}</span>
        <div className="h-1.5 bg-fabric-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full signal-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[0.78rem] font-medium text-black text-right">{score.toFixed(1)}</span>
        <span className="font-mono text-[0.62rem] text-fabric-400 text-right">{weight}</span>
        <button
          onClick={() => setOpen(!open)}
          className={`w-5 h-5 rounded-full flex items-center justify-center border text-fabric-400 font-mono text-[0.6rem] font-semibold cursor-pointer transition-all flex-shrink-0 leading-none ${open ? 'border-pink text-pink bg-[rgba(254,131,224,0.08)]' : 'border-fabric-200 bg-white hover:border-pink hover:text-pink'}`}
        >
          i
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-[180px_1fr_50px_42px_20px] gap-4 max-md:grid-cols-[100px_1fr_40px_36px_20px] max-md:gap-2 py-1.5">
          <div />
          <div className="text-[0.75rem] text-fabric-500 leading-normal">{detail}</div>
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
  if (score === undefined) return 'text-fabric-400'
  if (score >= 3.5) return 'text-[#0dc956]'
  if (score >= 2.5) return 'text-[#f7931e]'
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
}: ProductPageProps) {
  const [incidentsCount, setIncidentsCount] = useState(ITEMS_INITIAL)
  const [depsCount, setDepsCount] = useState(ITEMS_INITIAL)
  const [versionsCount, setVersionsCount] = useState(ITEMS_INITIAL)
  const [sourcesCount, setSourcesCount] = useState(DATA_SOURCES_INITIAL)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

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

  // Data source count
  const activeSourceCount = [
    service.npm_package ? 1 : 0,
    service.pypi_package ? 1 : 0,
    service.github_repo ? 1 : 0,
    service.endpoint_url ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  return (
    <>
      <Nav />

      <div className="max-w-page mx-auto px-8 pt-7 pb-16 max-md:px-4 max-md:pt-4">
        {/* ═══ HERO ═══ */}
        <div className="bg-white border border-fabric-200 rounded-2xl p-6 max-md:p-5 mb-5">
          <div className="flex items-start justify-between gap-6 max-md:flex-col max-md:gap-4">
            <div className="flex items-start gap-5 flex-1 min-w-0 flex-wrap">
              <ServiceLogo domain={service.domain} githubRepo={service.github_repo} name={service.name} size={56} className="rounded-[14px] max-md:!w-11 max-md:!h-11 max-md:!rounded-[11px]" />
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold tracking-tight leading-tight max-md:text-xl">{service.name}</h1>
                <div className="font-mono text-[0.78rem] text-fabric-500 mt-0.5">
                  by <span className="text-fabric-600">{service.publisher}</span> · last scanned {service.updated}
                </div>
              </div>

              {/* Hero tags */}
              <div className="w-full flex flex-wrap gap-1.5 items-center -mt-[4px]">
                {heroTags.map(t => (
                  <Link
                    key={t}
                    href={`/?category=${service.category}`}
                    className="font-mono text-[0.58rem] py-[3px] px-2 rounded-full uppercase tracking-wider font-medium border border-fabric-200 text-fabric-400 cursor-pointer transition-all hover:text-pink hover:border-pink hover:bg-[rgba(254,131,224,0.08)] no-underline"
                  >
                    {t}
                  </Link>
                ))}
              </div>

              {/* Hero links */}
              <div className="w-full flex gap-2 -mt-[11px]">
                {[
                  { title: 'Website', href: service.domain ? `https://${service.domain}` : null, d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM2 12h20M12 2c2.5 2.8 4 6.2 4 10s-1.5 7.2-4 10c-2.5-2.8-4-6.2-4-10s1.5-7.2 4-10z' },
                  { title: 'GitHub', href: service.github_repo ? `https://github.com/${service.github_repo}` : null, fill: true, d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' },
                  { title: 'npm', href: service.npm_package ? `https://www.npmjs.com/package/${service.npm_package}` : null, d: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
                  { title: 'PyPI', href: service.pypi_package ? `https://pypi.org/project/${service.pypi_package}` : null, d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
                  { title: 'Status Page', href: service.endpoint_url || null, d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
                ].filter(link => link.href).map(link => (
                  <a
                    key={link.title}
                    href={link.href!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.title}
                    className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-fabric-400 border border-fabric-200 bg-white cursor-pointer transition-all hover:border-pink hover:text-pink hover:bg-[rgba(254,131,224,0.06)] no-underline"
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
              <ScoreStatus status={service.status} />
            </div>
          </div>

          {/* Hero meta */}
          <div className="flex gap-6 flex-wrap font-mono text-[0.68rem] text-fabric-400 mt-4 pt-4 border-t border-fabric-100">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              6 signals analysed
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
              {activeSourceCount > 0 ? `${activeSourceCount} active source${activeSourceCount > 1 ? 's' : ''}` : '12 data sources'}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              No manual reviews · fully automated
            </span>
          </div>
        </div>

        {/* ═══ TRUST SIGNAL BREAKDOWN ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Trust Signal Breakdown</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">6 signals · weighted composite</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {SIGNAL_LABELS.map((signal, i) => (
              <SignalRow
                key={signal.name}
                name={signal.name}
                score={service.signals[i]}
                weight={signal.weight}
                detail={signal.detail}
              />
            ))}
          </div>
        </div>

        {/* ═══ ABOUT THIS SERVICE ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl mb-5 overflow-hidden">
          <div className="p-7 max-md:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">About this Service</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">auto-indexed</span>
            </div>
            <p className="text-[0.92rem] leading-relaxed text-fabric-700 max-w-[680px]">{service.description}</p>

            {/* Capabilities */}
            {service.capabilities && service.capabilities.length > 0 && (
              <div className="mt-6 pt-5 border-t border-fabric-100">
                <span className="font-mono text-[0.72rem] uppercase tracking-wider text-fabric-400 font-medium">Capabilities</span>
                <div className="flex flex-wrap gap-2 mt-3">
                  {service.capabilities.map(cap => (
                    <span key={cap} className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] py-1.5 px-3 bg-fabric-50 border border-fabric-100 rounded-lg text-fabric-700">
                      <svg className="w-3 h-3 text-[#0dc956] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing & Specs */}
            {service.pricing && (
              <div className="mt-6 pt-5 border-t border-fabric-100">
                <span className="font-mono text-[0.72rem] uppercase tracking-wider text-fabric-400 font-medium">Pricing & Specs</span>
                <div className="mt-3 flex flex-wrap gap-3 items-start">
                  <span className={`inline-flex items-center gap-1.5 font-mono text-[0.72rem] py-1.5 px-3 rounded-lg font-medium ${
                    service.pricing.model === 'open-source' || service.pricing.model === 'open-weight'
                      ? 'bg-[rgba(13,201,86,0.08)] text-[#0dc956] border border-[rgba(13,201,86,0.2)]'
                      : 'bg-fabric-50 text-fabric-700 border border-fabric-100'
                  }`}>
                    {service.pricing.model === 'open-source' ? '◇ Open Source' :
                     service.pricing.model === 'open-weight' ? '◇ Open Weight' :
                     service.pricing.model}
                  </span>
                  {service.language && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] py-1.5 px-3 bg-fabric-50 border border-fabric-100 rounded-lg text-fabric-600">
                      Language: {service.language}
                    </span>
                  )}
                  {service.pricing.tiers && service.pricing.tiers.length > 0 && (
                    <div className="w-full mt-1">
                      {service.pricing.tiers.map(tier => (
                        <div key={tier.label} className="flex justify-between items-center py-2 border-b border-fabric-100 last:border-b-0">
                          <span className="font-mono text-[0.72rem] text-fabric-600">{tier.label}</span>
                          <span className="font-mono text-[0.72rem] font-medium text-black">{tier.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

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
              <div className="p-6">
                <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Uptime (30d)</div>
                <div className="text-[1.65rem] font-bold text-black tracking-tight leading-none">
                  {service.uptime_30d.toFixed(2)}<span className="text-base text-fabric-500 font-normal ml-0.5">%</span>
                </div>
                <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                  {service.p50_latency_ms ? `p50: ${service.p50_latency_ms}ms` : ''}
                  {service.p50_latency_ms && service.p99_latency_ms ? ' · ' : ''}
                  {service.p99_latency_ms ? `p99: ${service.p99_latency_ms}ms` : ''}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Uptime (30d)</div>
                <div className="text-[1.1rem] font-medium text-fabric-300 tracking-tight leading-none">No endpoint monitored</div>
                <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">Health checks run when endpoint_url is set</div>
              </div>
            )}

            <div className="p-6 border-l border-fabric-200 max-md:border-l-0 max-md:border-t">
              <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Avg Latency</div>
              {service.avg_latency_ms && service.avg_latency_ms > 0 ? (
                <>
                  <div className="text-[1.65rem] font-bold text-black tracking-tight leading-none">
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

            <div className="p-6 border-l border-fabric-200 max-md:border-l-0 max-md:border-t">
              <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">Weekly Downloads</div>
              {hasDownloads ? (
                <>
                  <div className="text-[1.65rem] font-bold text-black tracking-tight leading-none">
                    {formatNumber(adoptionMeta!.weekly_downloads as number)}
                    {typeof adoptionMeta!.growth_rate === 'number' && (
                      <span className={`text-[0.88rem] font-normal ml-1 ${(adoptionMeta!.growth_rate as number) >= 0 ? 'text-[#0dc956]' : 'text-[#d03a3d]'}`}>
                        {(adoptionMeta!.growth_rate as number) >= 0 ? '+' : ''}{(adoptionMeta!.growth_rate as number).toFixed(1)}%
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
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Transparency & Compliance</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">
                {String(transparencyMeta?.items_passed ?? 0)}/{String(transparencyMeta?.items_total ?? 6)} passed
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {[
                { key: 'public_source', label: 'Open Source Code', metaTrue: 'Public repository on GitHub', metaFalse: 'No public source code found' },
                { key: 'recognized_license', label: 'OSI License', metaTrue: `Licensed under ${(transparencyMeta?.license as string)?.toUpperCase() || 'OSI-approved'}`, metaFalse: 'No recognized open-source license' },
                { key: 'readme_with_examples', label: 'Documentation', metaTrue: 'README with examples/code blocks', metaFalse: 'README missing or lacks examples' },
                { key: 'security_md', label: 'SECURITY.md', metaTrue: 'Security policy published', metaFalse: 'No security policy found' },
                { key: 'api_docs', label: 'API Documentation', metaTrue: 'OpenAPI spec or docs directory found', metaFalse: 'No API documentation detected' },
                { key: 'model_card', label: 'Model / System Card', metaTrue: 'Model card or system card published', metaFalse: 'No model card found' },
              ].map(item => {
                const passed = checklist?.[item.key] ?? false
                return (
                  <div key={item.key} className="flex items-start gap-2.5 p-3 bg-fabric-50 border border-fabric-100 rounded-lg">
                    <div className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 text-sm ${passed ? 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]' : 'bg-fabric-100 text-fabric-500'}`}>
                      {passed ? '✓' : '✗'}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[0.72rem] font-medium text-fabric-800">{item.label}</span>
                      <span className="font-mono text-[0.62rem] text-fabric-400">{passed ? item.metaTrue : item.metaFalse}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ INCIDENTS ═══ */}
        {incidents.length > 0 && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Incidents & Alerts</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">last 90 days</span>
            </div>
            <div className="flex flex-col max-h-[400px] overflow-y-auto no-scrollbar">
              {incidents.slice(0, incidentsCount).map((inc) => (
                <div key={inc.id} className="flex gap-4 py-3 border-b border-fabric-100 last:border-b-0 items-start">
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
                  <button onClick={() => setIncidentsCount(c => Math.min(c + LOAD_MORE_BATCH, incidents.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SCORE HISTORY ═══ */}
        {hasScoreHistory && chartData && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Score History</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">{signalHistory.length} snapshots</span>
            </div>
            <div className="w-full h-40 relative mt-2">
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
              <div className="absolute top-0 right-0 h-40 flex flex-col justify-between py-1">
                {['5.00', '3.75', '2.50', '1.25', '0.00'].map(v => (
                  <span key={v} className="font-mono text-[0.58rem] text-fabric-300 text-right">{v}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-2">
              {signalHistory.length > 0 && (
                <>
                  <span className="font-mono text-[0.58rem] text-fabric-400">{formatDate(signalHistory[0].recorded_at)}</span>
                  <span className="font-mono text-[0.58rem] text-blue">{formatDate(signalHistory[signalHistory.length - 1].recorded_at)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ COMMUNITY & ECOSYSTEM ═══ */}
        {hasCommunity && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Community & Ecosystem</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">adoption signals</span>
            </div>
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-3">
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
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Supply Chain & Dependencies</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">trust chain</span>
            </div>
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto no-scrollbar">
              {supplyChain.slice(0, depsCount).map(dep => (
                <div key={dep.dependency_name} className="flex items-center gap-2 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg">
                  <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">
                    {dep.dependency_type === 'npm' ? '⬡' : dep.dependency_type === 'pypi' ? '◈' : '◇'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[0.72rem] font-medium text-fabric-800">{dep.dependency_name}</div>
                    <div className="font-mono text-[0.6rem] text-fabric-400">
                      {dep.dependency_type}{dep.dependency_version ? ` · ${dep.dependency_version}` : ''}
                      {dep.cve_count > 0 ? ` · ${dep.cve_count} CVE${dep.cve_count > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  {dep.trust_score !== undefined && dep.trust_score !== null && (
                    <>
                      <span className="text-fabric-300 text-[0.72rem]">→</span>
                      <div className={`font-mono text-[0.72rem] font-medium ${dep.trust_score >= 3.5 ? 'text-[#0dc956]' : dep.trust_score >= 2.5 ? 'text-[#f7931e]' : 'text-[#d03a3d]'}`}>
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
                  <button onClick={() => setDepsCount(c => Math.min(c + LOAD_MORE_BATCH, supplyChain.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ API QUICK ACCESS ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">API Quick Access</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">v1 · REST</span>
          </div>
          <div className="bg-fabric-800 rounded-lg p-5 overflow-x-auto">
            <pre className="font-mono text-[0.72rem] text-fabric-300 leading-relaxed whitespace-pre">{``}<span className="text-fabric-500">// Evaluate trust before routing</span>{`
`}<span className="text-[#f7931e]">POST</span>{` `}<span className="text-white">https://api.fabriclayer.dev/v1/evaluate</span>{`

{
  `}<span className="text-blue-light">&quot;agentId&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;{service.name}&quot;</span>{`
}

`}<span className="text-fabric-500">// Response</span>{`
{
  `}<span className="text-blue-light">&quot;provider&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;{service.name}&quot;</span>{`,
  `}<span className="text-blue-light">&quot;trust_score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.score.toFixed(2)}</span>{`,
  `}<span className="text-blue-light">&quot;status&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;{service.status}&quot;</span>{`,
  `}<span className="text-blue-light">&quot;category&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;{service.category}&quot;</span>{`,
  `}<span className="text-blue-light">&quot;signals&quot;</span>{`: {
    `}<span className="text-blue-light">&quot;vulnerability_safety&quot;</span>{`:  { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[0].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.25</span>{` },
    `}<span className="text-blue-light">&quot;operational_health&quot;</span>{`:    { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[1].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.20</span>{` },
    `}<span className="text-blue-light">&quot;maintenance_activity&quot;</span>{`:  { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[2].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.20</span>{` },
    `}<span className="text-blue-light">&quot;adoption&quot;</span>{`:              { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[3].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.15</span>{` },
    `}<span className="text-blue-light">&quot;transparency&quot;</span>{`:          { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[4].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.10</span>{` },
    `}<span className="text-blue-light">&quot;publisher_trust&quot;</span>{`:       { `}<span className="text-blue-light">&quot;score&quot;</span>{`: `}<span className="text-[#f7931e]">{service.signals[5].toFixed(1)}</span>{`, `}<span className="text-blue-light">&quot;weight&quot;</span>{`: `}<span className="text-[#f7931e]">0.10</span>{` }
  },
  `}<span className="text-blue-light">&quot;modifiers&quot;</span>{`: [],
  `}<span className="text-blue-light">&quot;sources&quot;</span>{`: `}<span className="text-[#f7931e]">{activeSourceCount || 12}</span>{`,
  `}<span className="text-blue-light">&quot;updated&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;2026-02-20T06:41:00Z&quot;</span>{`
}`}</pre>
          </div>
        </div>

        {/* ═══ DATA SOURCES + SCORE THRESHOLDS (2-col) ═══ */}
        <div className="grid grid-cols-2 gap-5 mb-5 max-md:grid-cols-1">
          <div className="bg-white border border-fabric-200 rounded-xl p-7 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Data Sources</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">{DATA_SOURCES.length} indexed</span>
            </div>
            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto no-scrollbar">
              {DATA_SOURCES.slice(0, sourcesCount).map(src => (
                <div key={src.label} className="flex items-center gap-2.5 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg">
                  <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">{src.icon}</div>
                  <div className="flex flex-col gap-px">
                    <span className="font-mono text-[0.7rem] font-medium text-fabric-800">{src.label}</span>
                    <span className="font-mono text-[0.62rem] text-fabric-400">{src.meta}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
              <span className="font-mono text-[0.65rem] text-fabric-400">
                Showing {Math.min(sourcesCount, DATA_SOURCES.length)} of {DATA_SOURCES.length} sources
              </span>
              <div className="flex gap-3">
                {sourcesCount > DATA_SOURCES_INITIAL && (
                  <button onClick={() => setSourcesCount(DATA_SOURCES_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                    ← Show less
                  </button>
                )}
                {sourcesCount < DATA_SOURCES.length && (
                  <button onClick={() => setSourcesCount(c => Math.min(c + LOAD_MORE_BATCH, DATA_SOURCES.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-fabric-200 rounded-xl p-7 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Score Thresholds & Modifiers</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">from scoring engine</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { range: '2.50 – 5.00', label: 'Trusted · auto-approve', color: 'text-[#0dc956]' },
                { range: '1.00 – 2.49', label: 'Caution · human confirm', color: 'text-[#f7931e]' },
                { range: '0.00 – 0.99', label: 'Blocked · deny by default', color: 'text-[#d03a3d]' },
              ].map(t => (
                <div key={t.range} className="flex justify-between items-center py-1.5 border-b border-fabric-100">
                  <span className="font-mono text-[0.72rem] text-fabric-600">{t.range}</span>
                  <span className={`font-mono text-[0.72rem] font-medium ${t.color}`}>{t.label}</span>
                </div>
              ))}
              <div className="mt-2 flex flex-col gap-2">
                {[
                  { label: '<10 transactions', value: '0.8× new provider penalty' },
                  { label: 'Inactive 7+ days', value: '0.7× inactive multiplier' },
                  { label: 'Active modifiers', value: 'None', color: 'text-[#0dc956]' },
                ].map(m => (
                  <div key={m.label} className="flex justify-between items-center py-1.5 border-b border-fabric-100 last:border-b-0">
                    <span className="font-mono text-[0.72rem] text-fabric-600">{m.label}</span>
                    <span className={`font-mono text-[0.72rem] font-medium ${m.color || 'text-black'}`}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ VERSION HISTORY ═══ */}
        {versions.length > 0 && (
          <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Version History</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">score per release</span>
            </div>
            {/* Header */}
            <div className="grid grid-cols-[100px_1fr_60px_80px] max-md:grid-cols-[80px_1fr_50px_65px] gap-4 max-md:gap-2 pb-2 mb-1 border-b border-fabric-200">
              <span className="font-mono text-[0.65rem] text-fabric-400">VERSION</span>
              <span className="font-mono text-[0.65rem] text-fabric-400">RELEASED</span>
              <span className="font-mono text-[0.65rem] text-fabric-400 text-right">SCORE</span>
              <span className="font-mono text-[0.65rem] text-fabric-400 text-right">DELTA</span>
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
                const scoreClass = v.score_at_release !== undefined && v.score_at_release !== null && v.score_at_release >= 3.5
                  ? 'text-[#0dc956]'
                  : v.score_at_release !== undefined && v.score_at_release !== null && v.score_at_release >= 2.5
                    ? 'text-[#f7931e]'
                    : 'text-fabric-400'
                return (
                  <div key={v.tag} className="grid grid-cols-[100px_1fr_60px_80px] max-md:grid-cols-[80px_1fr_50px_65px] gap-4 max-md:gap-2 py-2.5 border-b border-fabric-100 last:border-b-0">
                    <span className="font-mono text-[0.72rem] text-fabric-700">{v.tag}</span>
                    <span className="font-mono text-[0.65rem] text-fabric-400">{formatFullDate(v.released_at)}</span>
                    <span className={`font-mono text-[0.75rem] font-medium text-right ${scoreClass}`}>{scoreStr}</span>
                    <span className={`font-mono text-[0.65rem] text-right ${deltaClass}`}>{deltaStr}</span>
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
                  <button onClick={() => setVersionsCount(c => Math.min(c + LOAD_MORE_BATCH, versions.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                    Show more →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ CTA — Are you the publisher? ═══ */}
        <div className="bg-black border border-fabric-700 rounded-xl p-8 flex flex-col gap-6 mt-4 relative overflow-hidden max-md:p-6">
          <div className="absolute -top-20 -right-20 w-[200px] h-[200px] bg-[radial-gradient(circle,rgba(61,138,247,0.15)_0%,transparent_70%)] pointer-events-none" />

          {/* Row 1: Publisher */}
          <div className="flex items-center justify-between gap-8 flex-wrap relative z-10">
            <div>
              <h3 className="text-[1.15rem] font-semibold text-white tracking-tight mb-1.5">Are you the publisher?</h3>
              <p className="font-mono text-[0.72rem] text-fabric-400 leading-relaxed">Claim this profile to unlock deeper evaluation, real-time monitoring,<br className="max-md:hidden" />and trust signals that help agents discover your service.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => setShowClaimModal(true)} className="font-mono text-[0.72rem] py-2.5 px-5 bg-transparent text-pink border border-pink/40 rounded-lg cursor-pointer transition-all hover:!bg-pink hover:!text-white hover:!border-pink whitespace-nowrap">Claim Provider</button>
              <button onClick={() => setShowReportModal(true)} className="font-mono text-[0.72rem] py-2.5 px-5 bg-transparent text-pink border border-pink/40 rounded-lg cursor-pointer transition-all hover:!bg-pink hover:!text-white hover:!border-pink whitespace-nowrap">Report Issue</button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-fabric-700" />

          {/* Row 2: Share */}
          <div className="flex items-center justify-between gap-8 flex-wrap relative z-10">
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
