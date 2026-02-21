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

const scoreColor = {
  trusted: 'text-[#0dc956]',
  caution: 'text-[#f7931e]',
  blocked: 'text-[#d03a3d]',
}

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

// Mock incidents data
const INCIDENTS = [
  { dot: 'bg-[#0dc956]', date: 'Feb 18', text: 'Score increased to 4.65 after transparency improvements detected', score: '4.65', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-blue', date: 'Feb 10', text: 'New model version indexed automatically', score: '4.65', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#f7931e]', date: 'Jan 03', text: 'API incident — uptime dropped below 99.9% for 4hrs. Score dipped', score: '4.52', scoreColor: 'text-[#f7931e]' },
  { dot: 'bg-[#0dc956]', date: 'Jan 03', text: 'Incident resolved within 4hrs. Uptime restored. Score recovered', score: '4.61', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#0dc956]', date: 'Dec 15', text: 'CVE-2024-51234 patched in dependency tree within 6hrs', score: '4.63', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-blue', date: 'Nov 28', text: 'Initial indexing complete — provider added to Trust Index', score: '4.58', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#0dc956]', date: 'Nov 15', text: 'Dependency update resolved 3 medium-severity advisories', score: '4.55', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#f7931e]', date: 'Nov 02', text: 'Latency spike detected — p99 exceeded 8s for 45 minutes', score: '4.48', scoreColor: 'text-[#f7931e]' },
  { dot: 'bg-[#0dc956]', date: 'Nov 02', text: 'Latency normalized after upstream provider scaling', score: '4.52', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-blue', date: 'Oct 20', text: 'New API version detected — documentation updated', score: '4.50', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#0dc956]', date: 'Oct 05', text: 'SOC 2 Type II certification verified', score: '4.50', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-blue', date: 'Sep 22', text: 'Model card published — transparency score improved', score: '4.46', scoreColor: 'text-[#0dc956]' },
  { dot: 'bg-[#d03a3d]', date: 'Sep 10', text: 'Critical CVE-2024-48901 found in transitive dependency', score: '4.32', scoreColor: 'text-[#d03a3d]' },
  { dot: 'bg-[#0dc956]', date: 'Sep 10', text: 'CVE-2024-48901 patched within 3hrs — score recovered', score: '4.44', scoreColor: 'text-[#0dc956]' },
]

const PRIVACY_ITEMS = [
  { icon: '✓', status: 'good', label: 'Training on user data', meta: 'Disabled by default on API tier' },
  { icon: '✓', status: 'good', label: 'Data retention policy', meta: '30-day retention · configurable to 0' },
  { icon: '✓', status: 'good', label: 'SOC 2 Type II', meta: 'Certified · last audited Jan 2025' },
  { icon: '✓', status: 'good', label: 'GDPR compliance', meta: 'DPA available · EU data processing' },
  { icon: '✓', status: 'good', label: 'System / model card', meta: 'Published · covers bias, safety, limits' },
  { icon: '—', status: 'neutral', label: 'HIPAA eligibility', meta: 'BAA available on Enterprise tier only' },
]

const privacyIconStyles: Record<string, string> = {
  good: 'bg-[rgba(13,201,86,0.1)] text-[#0dc956]',
  warn: 'bg-[rgba(247,147,30,0.1)] text-[#f7931e]',
  bad: 'bg-[rgba(208,58,61,0.1)] text-[#d03a3d]',
  neutral: 'bg-fabric-100 text-fabric-500',
}

const SUPPLY_CHAIN = [
  { emoji: '☁️', name: 'Amazon Web Services (GovCloud)', type: 'Infrastructure provider', score: '4.8' },
  { emoji: '🔐', name: 'Cloudflare', type: 'CDN · DDoS protection', score: '4.9' },
  { emoji: '💳', name: 'Stripe', type: 'Payment processor', score: '4.7' },
  { emoji: '📊', name: 'Datadog', type: 'Monitoring · observability', score: '4.5' },
  { emoji: '🪪', name: 'Auth0 (Okta)', type: 'Identity · authentication', score: '4.6' },
  { emoji: '📦', name: 'npm Registry', type: 'Package distribution', score: '4.4' },
  { emoji: '🔑', name: 'HashiCorp Vault', type: 'Secrets management', score: '4.7' },
  { emoji: '📡', name: 'Fastly', type: 'Edge computing · CDN', score: '4.5' },
  { emoji: '🗄️', name: 'PostgreSQL (Supabase)', type: 'Database · storage', score: '4.6' },
]

const VERSIONS = [
  { tag: 'v20250210', date: 'Feb 10, 2025', score: '4.65', delta: '+0.02', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20250115', date: 'Jan 15, 2025', score: '4.63', delta: '+0.05', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20241201', date: 'Dec 01, 2024', score: '4.58', delta: '—', deltaClass: 'text-fabric-400' },
  { tag: 'v20241018', date: 'Oct 18, 2024', score: '4.58', delta: '+0.12', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20240901', date: 'Sep 01, 2024', score: '4.46', delta: 'initial', deltaClass: 'text-fabric-400' },
  { tag: 'v20240715', date: 'Jul 15, 2024', score: '4.40', delta: '+0.08', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20240601', date: 'Jun 01, 2024', score: '4.32', delta: '+0.04', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20240420', date: 'Apr 20, 2024', score: '4.28', delta: '-0.03', deltaClass: 'text-[#f7931e]' },
  { tag: 'v20240310', date: 'Mar 10, 2024', score: '4.31', delta: '+0.11', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20240201', date: 'Feb 01, 2024', score: '4.20', delta: '+0.06', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20240105', date: 'Jan 05, 2024', score: '4.14', delta: '+0.14', deltaClass: 'text-[#0dc956]' },
  { tag: 'v20231115', date: 'Nov 15, 2023', score: '4.00', delta: 'initial', deltaClass: 'text-fabric-400' },
]

const DATA_SOURCES = [
  { icon: '△', label: 'CVE Database', meta: 'Hourly sync · full dependency tree scan' },
  { icon: '◈', label: 'GitHub', meta: 'Commits, issues, PRs' },
  { icon: '◎', label: 'Fabric Monitor', meta: '15-min pings · uptime, latency, behavioral' },
  { icon: '⬡', label: 'npm / PyPI Registry', meta: 'Downloads, versions, dependency scan' },
  { icon: '◎', label: 'Advisory Databases', meta: 'NVD, GitHub Advisories, OSV' },
  { icon: '◎', label: 'Publisher Identity', meta: 'Cross-registry verification · domain linked' },
]

// Tags that appear on the hero for various categories
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

const INCIDENTS_INITIAL = 6
const SUPPLY_CHAIN_INITIAL = 5
const VERSIONS_INITIAL = 5
const LOAD_MORE_BATCH = 10

export default function ProductPageClient({ service }: { service: Service }) {
  const [incidentsCount, setIncidentsCount] = useState(INCIDENTS_INITIAL)
  const [depsCount, setDepsCount] = useState(SUPPLY_CHAIN_INITIAL)
  const [versionsCount, setVersionsCount] = useState(VERSIONS_INITIAL)

  const tagClass = TAG_CLASSES[service.category] || ''
  const tagColor = TAG_COLORS[tagClass]
  const heroTags = HERO_TAGS[service.category] || [service.category]

  return (
    <>
      <Nav />

      <div className="max-w-page mx-auto px-8 pt-7 pb-16 max-md:px-4 max-md:pt-4">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] text-fabric-400 no-underline hover:text-pink mb-4 transition-colors">
          <span>←</span> Back to Trust Index
        </Link>

        {/* ═══ HERO ═══ */}
        <div className="bg-white border border-fabric-200 rounded-2xl p-6 max-md:p-5 mb-5">
          <div className="flex items-start justify-between gap-6 max-md:flex-col max-md:gap-4">
            <div className="flex items-start gap-5 flex-1 min-w-0 flex-wrap">
              <ServiceLogo domain={service.domain} name={service.name} size={56} className="rounded-[14px] max-md:!w-11 max-md:!h-11 max-md:!rounded-[11px]" />
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold tracking-tight leading-tight max-md:text-xl">{service.name}</h1>
                <div className="font-mono text-[0.78rem] text-fabric-500 mt-0.5">
                  by <span className="text-fabric-600">{service.publisher}</span> · last scanned 2h ago
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
                  { title: 'GitHub', href: null, fill: true, d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' },
                  { title: 'API Docs', href: null, d: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
                  { title: 'Model Card', href: null, d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
                  { title: 'Status Page', href: null, d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
                  { title: 'System Card', href: null, d: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z' },
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
              12 data sources
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-fabric-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              No manual reviews · fully automated
            </span>
          </div>
        </div>

        {/* ═══ METRICS CARD ═══ */}
        <div className="grid grid-cols-3 max-md:grid-cols-1 bg-white border border-fabric-200 rounded-xl mb-5 overflow-hidden">
          {[
            { label: 'Uptime (30d)', value: '99.95', unit: '%', trend: '+0.03%', sub: '1 incident · avg resolution 8m' },
            { label: 'Avg Latency', value: '1.2', unit: 's', trend: '↓0.1s', sub: 'p50: 0.9s · p99: 4.2s' },
            { label: 'Monthly Requests', value: '48', unit: 'M', trend: '+24%', sub: 'via 12,400 unique callers' },
          ].map((m, i) => (
            <div key={m.label} className={`p-6 ${i > 0 ? 'border-l border-fabric-200 max-md:border-l-0 max-md:border-t' : ''}`}>
              <div className="font-mono text-[0.68rem] uppercase tracking-wider text-fabric-400 mb-2.5">{m.label}</div>
              <div className="text-[1.65rem] font-bold text-black tracking-tight leading-none">
                {m.value}<span className="text-base text-fabric-500 font-normal ml-0.5">{m.unit}</span>
                <span className="text-[0.88rem] text-[#0dc956] font-normal ml-1">{m.trend}</span>
              </div>
              <div className="font-mono text-[0.68rem] text-fabric-400 mt-1">{m.sub}</div>
            </div>
          ))}
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
          <div className="p-7 border-b border-fabric-100 max-md:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">About this Service</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">auto-indexed from API + docs</span>
            </div>
            <p className="text-[0.92rem] leading-relaxed text-fabric-700 max-w-[680px]">{service.description}</p>
          </div>
          <div className="grid grid-cols-2 max-md:grid-cols-1">
            <div className="p-6 max-md:p-5">
              <div className="text-[1.05rem] font-semibold text-black tracking-tight mb-3.5">Capabilities</div>
              <div className="flex flex-col gap-2">
                {['Multi-turn conversation', 'Function calling & tool use', 'Vision & image understanding', 'Structured output & JSON mode', 'Extended thinking mode'].map(cap => (
                  <div key={cap} className="flex items-start gap-2 font-mono text-[0.72rem] text-fabric-700 leading-relaxed">
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-blue mt-px">✓</span>
                    {cap}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-l border-fabric-100 max-md:border-l-0 max-md:border-t max-md:p-5">
              <div className="text-[1.05rem] font-semibold text-black tracking-tight mb-3.5">Pricing & Specs</div>
              <div className="flex flex-col gap-2">
                {[
                  ['Input tokens', '$3 / 1M'],
                  ['Output tokens', '$15 / 1M'],
                  ['Context window', '200k tokens'],
                  ['Max output', '8,192 tokens'],
                  ['Training cutoff', 'Apr 2025'],
                  ['License', 'Commercial API'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-fabric-100 last:border-b-0">
                    <span className="font-mono text-[0.72rem] text-fabric-600">{label}</span>
                    <span className="font-mono text-[0.72rem] text-black font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Request / Response Schema */}
          <div className="grid grid-cols-2 max-md:grid-cols-1">
            <div className="p-5 border-t border-fabric-100">
              <div className="text-[1.05rem] font-semibold text-black tracking-tight mb-3">Request Schema</div>
              <div className="bg-fabric-800 rounded-lg p-4 overflow-x-auto">
                <pre className="font-mono text-[0.68rem] text-fabric-300 leading-relaxed whitespace-pre">{`{
  `}<span className="text-blue-light">&quot;model&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;claude-4-sonnet-20250514&quot;</span>{`,
  `}<span className="text-blue-light">&quot;max_tokens&quot;</span>{`: `}<span className="text-[#f7931e]">1024</span>{`,
  `}<span className="text-blue-light">&quot;messages&quot;</span>{`: [
    { `}<span className="text-blue-light">&quot;role&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;user&quot;</span>{`, `}<span className="text-blue-light">&quot;content&quot;</span>{`: `}<span className="text-pink">string</span>{` }
  ],
  `}<span className="text-blue-light">&quot;tools&quot;</span>{`: `}<span className="text-pink">array</span>{`,        `}<span className="text-fabric-500">// optional</span>{`
  `}<span className="text-blue-light">&quot;temperature&quot;</span>{`: `}<span className="text-pink">number</span>{`  `}<span className="text-fabric-500">// 0.0–1.0</span>{`
}`}</pre>
              </div>
            </div>
            <div className="p-5 border-t border-fabric-100 border-l max-md:border-l-0">
              <div className="text-[1.05rem] font-semibold text-black tracking-tight mb-3">Response Schema</div>
              <div className="bg-fabric-800 rounded-lg p-4 overflow-x-auto">
                <pre className="font-mono text-[0.68rem] text-fabric-300 leading-relaxed whitespace-pre">{`{
  `}<span className="text-blue-light">&quot;id&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;msg_01XFDUDYJgAACzvnp...&quot;</span>{`,
  `}<span className="text-blue-light">&quot;type&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;message&quot;</span>{`,
  `}<span className="text-blue-light">&quot;role&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;assistant&quot;</span>{`,
  `}<span className="text-blue-light">&quot;content&quot;</span>{`: [
    { `}<span className="text-blue-light">&quot;type&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;text&quot;</span>{`, `}<span className="text-blue-light">&quot;text&quot;</span>{`: `}<span className="text-pink">string</span>{` }
  ],
  `}<span className="text-blue-light">&quot;usage&quot;</span>{`: { `}<span className="text-blue-light">&quot;input&quot;</span>{`: `}<span className="text-[#f7931e]">25</span>{`, `}<span className="text-blue-light">&quot;output&quot;</span>{`: `}<span className="text-[#f7931e]">150</span>{` }
}`}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ DATA & PRIVACY ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Data & Privacy Signals</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">enterprise-critical</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {PRIVACY_ITEMS.map(item => (
              <div key={item.label} className="flex items-start gap-2.5 p-3 bg-fabric-50 border border-fabric-100 rounded-lg">
                <div className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 text-sm ${privacyIconStyles[item.status]}`}>
                  {item.icon}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[0.72rem] font-medium text-fabric-800">{item.label}</span>
                  <span className="font-mono text-[0.62rem] text-fabric-400">{item.meta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ INCIDENTS ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Incidents & Alerts</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">last 90 days</span>
          </div>
          <div className="flex flex-col max-h-[400px] overflow-y-auto subtle-scroll">
            {INCIDENTS.slice(0, incidentsCount).map((inc, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-fabric-100 last:border-b-0 items-start">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${inc.dot}`} />
                <span className="font-mono text-[0.65rem] text-fabric-400 min-w-[56px] flex-shrink-0 mt-px">{inc.date}</span>
                <span className="font-mono text-[0.72rem] text-fabric-700 leading-relaxed flex-1">{inc.text}</span>
                <span className={`font-mono text-[0.68rem] font-medium flex-shrink-0 mt-px ${inc.scoreColor}`}>{inc.score}</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
            <span className="font-mono text-[0.65rem] text-fabric-400">
              Showing {Math.min(incidentsCount, INCIDENTS.length)} of {INCIDENTS.length} events
            </span>
            <div className="flex gap-3">
              {incidentsCount > INCIDENTS_INITIAL && (
                <button onClick={() => setIncidentsCount(INCIDENTS_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                  ← Show less
                </button>
              )}
              {incidentsCount < INCIDENTS.length && (
                <button onClick={() => setIncidentsCount(c => Math.min(c + LOAD_MORE_BATCH, INCIDENTS.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                  Show more →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══ SCORE HISTORY ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Score History (90d)</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">daily snapshots</span>
          </div>
          <div className="w-full h-40 relative mt-2">
            <svg className="w-full h-full" viewBox="0 0 800 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3d8af7" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#3d8af7" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="0" x2="800" y2="0" className="stroke-fabric-100 stroke-1" />
              <line x1="0" y1="40" x2="800" y2="40" className="stroke-fabric-100 stroke-1" />
              <line x1="0" y1="80" x2="800" y2="80" className="stroke-fabric-100 stroke-1" />
              <line x1="0" y1="120" x2="800" y2="120" className="stroke-fabric-100 stroke-1" />
              <line x1="0" y1="160" x2="800" y2="160" className="stroke-fabric-100 stroke-1" />
              <path fill="url(#chartGrad)" d="M0,24 L32,22 L64,20 L96,28 L128,26 L160,18 L192,16 L224,14 L256,12 L288,14 L320,10 L352,12 L384,32 L416,22 L448,12 L480,10 L512,8 L544,10 L576,8 L608,6 L640,6 L672,8 L704,6 L736,6 L768,4 L800,4 L800,160 L0,160Z" />
              <path fill="none" stroke="#3d8af7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M0,24 L32,22 L64,20 L96,28 L128,26 L160,18 L192,16 L224,14 L256,12 L288,14 L320,10 L352,12 L384,32 L416,22 L448,12 L480,10 L512,8 L544,10 L576,8 L608,6 L640,6 L672,8 L704,6 L736,6 L768,4 L800,4" />
              <circle cx="384" cy="32" r="4" fill="#f7931e" stroke="white" strokeWidth="2" />
              <circle cx="800" cy="4" r="4" fill="#3d8af7" stroke="white" strokeWidth="2" />
            </svg>
            <div className="absolute top-0 right-0 h-40 flex flex-col justify-between py-1">
              {['5.00', '4.75', '4.50', '4.25', '4.00'].map(v => (
                <span key={v} className="font-mono text-[0.58rem] text-fabric-300 text-right">{v}</span>
              ))}
            </div>
          </div>
          <div className="flex justify-between mt-2">
            {['Nov 22', 'Dec 06', 'Dec 20', 'Jan 03', 'Jan 17', 'Jan 31', 'Feb 14', 'Today'].map((lbl, i) => (
              <span key={lbl} className={`font-mono text-[0.58rem] ${i === 3 ? 'text-[#f7931e]' : i === 7 ? 'text-blue' : 'text-fabric-400'}`}>
                {i === 3 ? 'Jan 03 · incident' : lbl}
              </span>
            ))}
          </div>
        </div>

        {/* ═══ COMMUNITY & ECOSYSTEM ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Community & Ecosystem</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">adoption signals</span>
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-3">
            {[
              { value: '68k', label: 'GitHub Stars', sub: 'SDK · anthropic-sdk-python' },
              { value: '2.4k', label: 'Contributors', sub: 'across 14 repos' },
              { value: '340+', label: 'Integrations', sub: 'MCP servers · plugins · SDKs' },
            ].map(item => (
              <div key={item.label} className="p-4 bg-fabric-50 border border-fabric-100 rounded-lg text-center">
                <div className="text-xl font-bold text-black tracking-tight">{item.value}</div>
                <div className="font-mono text-[0.62rem] text-fabric-400 uppercase tracking-wider mt-1">{item.label}</div>
                <div className="font-mono text-[0.6rem] text-fabric-400 mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {['Official Python SDK', 'Official TypeScript SDK', 'MCP Server', 'LangChain', 'LlamaIndex', 'Vercel AI SDK', 'AWS Bedrock', 'Google Vertex'].map(tag => (
              <span key={tag} className="font-mono text-[0.6rem] py-1 px-2 rounded-full border border-fabric-200 text-fabric-500 inline-flex items-center gap-1.5 leading-none">
                <span className="w-[5px] h-[5px] rounded-full bg-[#0dc956]" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ═══ SUPPLY CHAIN ═══ */}
        <div className="bg-white border border-fabric-200 rounded-xl p-7 mb-5 max-md:p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[1.05rem] font-semibold text-black tracking-tight">Supply Chain & Dependencies</span>
            <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">trust chain</span>
          </div>
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto subtle-scroll">
            {SUPPLY_CHAIN.slice(0, depsCount).map(dep => (
              <div key={dep.name} className="flex items-center gap-2 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg">
                <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">{dep.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[0.72rem] font-medium text-fabric-800">{dep.name}</div>
                  <div className="font-mono text-[0.6rem] text-fabric-400">{dep.type}</div>
                </div>
                <span className="text-fabric-300 text-[0.72rem]">→</span>
                <div className="font-mono text-[0.72rem] font-medium text-[#0dc956]">{dep.score}</div>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
            <span className="font-mono text-[0.65rem] text-fabric-400">
              Showing {Math.min(depsCount, SUPPLY_CHAIN.length)} of {SUPPLY_CHAIN.length} dependencies
            </span>
            <div className="flex gap-3">
              {depsCount > SUPPLY_CHAIN_INITIAL && (
                <button onClick={() => setDepsCount(SUPPLY_CHAIN_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                  ← Show less
                </button>
              )}
              {depsCount < SUPPLY_CHAIN.length && (
                <button onClick={() => setDepsCount(c => Math.min(c + LOAD_MORE_BATCH, SUPPLY_CHAIN.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                  Show more →
                </button>
              )}
            </div>
          </div>
        </div>

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
  `}<span className="text-blue-light">&quot;sources&quot;</span>{`: `}<span className="text-[#f7931e]">12</span>{`,
  `}<span className="text-blue-light">&quot;updated&quot;</span>{`: `}<span className="text-[#0dc956]">&quot;2026-02-20T06:41:00Z&quot;</span>{`
}`}</pre>
          </div>
        </div>

        {/* ═══ DATA SOURCES + SCORE THRESHOLDS (2-col) ═══ */}
        <div className="grid grid-cols-2 gap-5 mb-5 max-md:grid-cols-1">
          <div className="bg-white border border-fabric-200 rounded-xl p-7 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Data Sources</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">12 indexed</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {DATA_SOURCES.map(src => (
                <div key={src.label} className="flex items-center gap-2.5 p-2.5 bg-fabric-50 border border-fabric-100 rounded-lg">
                  <div className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-fabric-200 rounded-md text-[0.72rem] flex-shrink-0">{src.icon}</div>
                  <div className="flex flex-col gap-px">
                    <span className="font-mono text-[0.7rem] font-medium text-fabric-800">{src.label}</span>
                    <span className="font-mono text-[0.62rem] text-fabric-400">{src.meta}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-fabric-200 rounded-xl p-7 max-md:p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[1.05rem] font-semibold text-black tracking-tight">Score Thresholds & Modifiers</span>
              <span className="font-mono text-[0.62rem] py-0.5 px-2 bg-fabric-100 text-fabric-400 rounded-full">from scoring engine</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { range: '3.50 – 5.00', label: 'Trusted · auto-approve', color: 'text-[#0dc956]' },
                { range: '2.50 – 3.49', label: 'Caution · human confirm', color: 'text-[#f7931e]' },
                { range: '0.00 – 2.49', label: 'Blocked · deny by default', color: 'text-[#d03a3d]' },
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
          <div className="max-h-[400px] overflow-y-auto subtle-scroll">
            {VERSIONS.slice(0, versionsCount).map(v => (
              <div key={v.tag} className="grid grid-cols-[100px_1fr_60px_80px] max-md:grid-cols-[80px_1fr_50px_65px] gap-4 max-md:gap-2 py-2.5 border-b border-fabric-100 last:border-b-0">
                <span className="font-mono text-[0.72rem] text-fabric-700">{v.tag}</span>
                <span className="font-mono text-[0.65rem] text-fabric-400">{v.date}</span>
                <span className="font-mono text-[0.75rem] font-medium text-[#0dc956] text-right">{v.score}</span>
                <span className={`font-mono text-[0.65rem] text-right ${v.deltaClass}`}>{v.delta}</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-fabric-100 mt-1 flex items-center justify-between">
            <span className="font-mono text-[0.65rem] text-fabric-400">
              Showing {Math.min(versionsCount, VERSIONS.length)} of {VERSIONS.length} releases
            </span>
            <div className="flex gap-3">
              {versionsCount > VERSIONS_INITIAL && (
                <button onClick={() => setVersionsCount(VERSIONS_INITIAL)} className="font-mono text-[0.68rem] text-fabric-400 cursor-pointer hover:text-fabric-600 transition-opacity bg-transparent border-none p-0">
                  ← Show less
                </button>
              )}
              {versionsCount < VERSIONS.length && (
                <button onClick={() => setVersionsCount(c => Math.min(c + LOAD_MORE_BATCH, VERSIONS.length))} className="font-mono text-[0.68rem] text-pink cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0">
                  Show more →
                </button>
              )}
            </div>
          </div>
        </div>

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
              <span className="font-mono text-[0.72rem] py-2.5 px-5 bg-fabric-700 text-fabric-500 rounded-lg cursor-not-allowed font-medium whitespace-nowrap opacity-50">Claim Provider</span>
              <span className="font-mono text-[0.72rem] py-2.5 px-5 bg-transparent text-fabric-400 border border-fabric-600 rounded-lg cursor-pointer transition-all hover:border-fabric-400 hover:text-white whitespace-nowrap">Report Issue</span>
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
    </>
  )
}
