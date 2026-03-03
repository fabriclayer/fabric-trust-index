'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import MarketingTab from './MarketingTab'
import NetworkingTab from './NetworkingTab'
import CostsTab from './CostsTab'
import SubmissionsTab from './SubmissionsTab'

// ─── FABRIC DESIGN TOKENS ──────────────────────────────────────────
const F = {
  sans: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'DM Mono', 'SF Mono', monospace",
}
const C = {
  bg: '#0a0a0a', surface: 'rgba(255,255,255,0.03)', surfaceAlt: 'rgba(255,255,255,0.015)',
  border: 'rgba(255,255,255,0.08)', borderSolid: '#1a1a1a',
  text: '#fff', t2: 'rgba(255,255,255,0.5)', t3: 'rgba(255,255,255,0.25)', t4: 'rgba(255,255,255,0.12)',
  blue: '#068cff', pink: '#fe83e0', green: '#0dc956', orange: '#f7931e', red: '#e82d35', purple: '#8b5cf6',
  blueDim: 'rgba(6,140,255,0.12)', pinkDim: 'rgba(254,131,224,0.12)',
  greenDim: 'rgba(13,201,86,0.10)', orangeDim: 'rgba(247,147,30,0.10)',
  redDim: 'rgba(232,45,53,0.10)', purpleDim: 'rgba(139,92,246,0.12)',
}

// ─── TYPES ────────────────────────────────────────────────────────
interface MonitorData {
  overview: {
    total: number; trusted: number; caution: number; blocked: number; pending: number
    todayDiscovered: number; todayScored: number
  }
  health: {
    supabase: { rowsServices: number; rowsSignalHistory: number; rowsIncidents: number; rowsCveRecords: number; rowsDiscoveryQueue: number; rowsDiscoveryPending?: number }
    github: { rateRemaining: number; rateLimit: number; resetsAt: string | null }
    vercel: { functionsInvoked: number; errors: number; avgLatency: number; p99Latency: number } | null
    endpoints?: EndpointHealth[]
    cronHealth?: CronHealthItem[]
    costs?: { today: UsageBucket; month: UsageBucket; daily7?: DailySpend[] }
    systemStatus?: 'nominal' | 'degraded' | 'outage'
    scoring: {
      confidenceHigh: number; confidenceMed: number; confidenceLow: number; confidenceMinimal: number
      fallbackRates: Record<string, number>; staleCount: number; overrideCounts: Record<string, number>
    }
    assessments: { total: number; pending: number }
  }
  cves: { total: number; critical: number; high: number; medium: number; low: number; unpatched: number }
  incidents: { total: number; unresolved: number; critical: number; warning: number; info: number }
  discoveryQueue: DiscoveryItem[]
  approvedDiscoveries: ApprovedDiscovery[]
  unscoredSlugs: string[]
  timeline: TimelineEvent[]
  events: ActivityEvent[]
  schedule: {
    lastScoredAt: string | null
    lastDiscoveredAt: string | null
    lastIncidentAt: string | null
    todayUpdated: number
    totalNonPending: number
  }
  timestamp: string
}

interface DiscoveryItem {
  id: string; source: string; created_at: string
  name?: string; slug?: string; description?: string; publisher?: string
  homepage_url?: string; github_repo?: string; stars?: number; votes?: number
  tags?: string[]
}

interface ApprovedDiscovery {
  id: string; name: string; slug: string; source: string
  approved_at: string; score: number | null; status: string; scored: boolean
}

interface TimelineEvent {
  type: 'scored' | 'discovered' | 'incident'
  name: string; slug: string; detail: string
  severity?: string; timestamp: string
}

interface ActivityEvent {
  type: 'scored' | 'discovered' | 'incident' | 'cve'
  name: string; slug: string; detail: string
  severity?: string; timestamp: string
}

interface EndpointHealth {
  endpoint: string; label: string; status: 'up' | 'degraded' | 'down'
  response_ms: number | null; status_code: number | null; last_checked: string; uptime_24h: number
}

interface CronHealthItem {
  cronId: string; name: string; schedule: string; expectedIntervalMs: number
  lastRunAt: string | null; status: 'on_schedule' | 'overdue' | 'missed'; nextExpectedAt: string
}

interface UsageBucket {
  calls: number; input_tokens: number; output_tokens: number; cost_usd: number
  by_caller: Record<string, { calls: number; cost_usd: number }>
}

interface DailySpend {
  date: string; cost_usd: number; calls: number
}

// ─── HELPERS ───────────────────────────────────────────────────────
const sevC = (s: string) => s === 'critical' ? C.red : s === 'high' || s === 'warning' || s === 'medium' ? C.orange : s === 'low' ? C.t3 : C.blue
const sevBg = (s: string) => s === 'critical' ? C.redDim : s === 'warning' || s === 'high' || s === 'medium' ? C.orangeDim : C.blueDim
const statC = (s: string) => s === 'ok' ? C.green : s === 'warning' ? C.orange : s === 'error' ? C.red : C.t3
const timeAgo = (iso: string | null) => {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}
const srcIcon = (s: string) => s === 'producthunt' ? '🟠' : s === 'github-trending' ? '⭐' : s === 'hackernews' ? '🟧' : s === 'yc-launches' ? '🚀' : s === 'watchlist' ? '📋' : '📦'
const srcLabel = (s: string) => s === 'producthunt' ? 'Product Hunt' : s === 'github-trending' ? 'GitHub Trending' : s === 'hackernews' ? 'Hacker News' : s === 'yc-launches' ? 'YC Launches' : s === 'watchlist' ? 'Watchlist' : s === 'monitor:approved' || s === 'approved' ? 'Manual' : s === 'monitor:manual' || s === 'manual' ? 'Manual' : s

const TABS = [
  { id: 'health', label: 'System Health' },
  { id: 'activity', label: 'Activity' },
  { id: 'review', label: 'Dev Review' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'networking', label: 'Networking' },
  { id: 'costs', label: 'Costs' },
  { id: 'crons', label: 'Crons' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'submissions', label: 'Submissions' },
]

// ─── OVERRIDE DEFINITIONS ─────────────────────────────────────────
const OVERRIDE_DEFS: Record<string, { effect: string; trigger: string; sev: string }> = {
  vulnerability_zero_override: { effect: '→ signal=0, blocked', trigger: 'Critical/high CVE with no patch available', sev: 'critical' },
  vulnerability_patch_available: { effect: '→ signal≤1.5, caution', trigger: 'Critical/high CVE with patch available but not applied', sev: 'warning' },
  zero_signal_override: { effect: '→ capped 2.99', trigger: 'Any signal = 0.0 (with real data)', sev: 'warning' },
  repo_archived: { effect: '→ 0.99 blocked', trigger: 'GitHub repo is archived', sev: 'critical' },
  npm_deprecated: { effect: '→ 0.99 blocked', trigger: 'npm deprecated flag set', sev: 'critical' },
  vt_suspicious_override: { effect: '→ capped 2.99', trigger: 'VirusTotal suspicious (score ≤ 2.0)', sev: 'warning' },
  vt_scan_override: { effect: '→ 0.99 blocked', trigger: 'VirusTotal confirms malware', sev: 'critical' },
  malware_blocked: { effect: '→ 0.99 blocked', trigger: 'VirusTotal confirms malware', sev: 'critical' },
  content_safety_override: { effect: '→ 0.99 blocked', trigger: 'Content safety critical failure', sev: 'critical' },
  content_safety_caution_override: { effect: '→ capped 2.99', trigger: 'Content safety suspicious', sev: 'warning' },
  repo_transferred: { effect: '→ frozen, -1.0', trigger: 'Different-owner repo transfer', sev: 'critical' },
  npm_owner_changed: { effect: '→ caution', trigger: 'npm package ownership changed', sev: 'warning' },
  pypi_yanked: { effect: '→ blocked', trigger: 'PyPI package yanked', sev: 'critical' },
}

// Static pipeline definitions for crons tab
const PIPELINES = [
  { id: 'collect-cve-fast', name: 'CVE Fast-Path', freq: '5 min', schedule: '*/5 * * * *', step: 'collection' },
  { id: 'health-check', name: 'Uptime Monitor', freq: '15 min', schedule: '*/15 * * * *', step: 'collection' },
  { id: 'collect-cve', name: 'CVE Full Scan', freq: 'hourly', schedule: '0 * * * *', step: 'collection' },
  { id: 'collect-daily', name: 'Daily 6-Signal Scoring', freq: 'daily 2am', schedule: '0 2 * * *', step: 'collection' },
  { id: 'watchdog', name: 'Watchdog QA', freq: 'daily 3am', schedule: '0 3 * * *', step: 'watchdog' },
  { id: 'discover', name: 'Registry Discovery', freq: 'daily 4am', schedule: '0 4 * * *', step: 'discovery' },
  { id: 'discover-ai-news', name: 'AI News Scanner', freq: 'daily 4:30am', schedule: '30 4 * * *', step: 'discovery' },
  { id: 'discover-clawhub', name: 'ClawHub Discovery', freq: 'daily 5am', schedule: '0 5 * * *', step: 'discovery' },
  { id: 'discover-mcp', name: 'MCP Discovery', freq: 'daily 6am', schedule: '0 6 * * *', step: 'discovery' },
  { id: 'enrich-metadata', name: 'Metadata Enrichment', freq: 'on-demand', schedule: 'manual', step: 'enrichment' },
  { id: 'enrich-publishers', name: 'Publisher Enrichment', freq: 'on-demand', schedule: 'manual', step: 'enrichment' },
  { id: 'collect-clawhub', name: 'ClawHub Scoring', freq: 'on pending', schedule: '*/30 * * * *', step: 'collection' },
  { id: 'generate-assessments', name: 'AI Assessments', freq: 'daily 8am', schedule: '0 8 * * *', step: 'assessment' },
  { id: 'review-dashboard', name: 'AI Dashboard Review', freq: '12h (10,22 UTC)', schedule: '0 10,22 * * *', step: 'assessment' },
  { id: 'recompute', name: 'Composite Recompute', freq: 'manual', schedule: 'manual', step: 'collection' },
]

// ─── ATOMS ─────────────────────────────────────────────────────────
function Mono({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: F.mono, ...s }}>{children}</span>
}
function SecLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>{children}</div>
}
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 20, color, background: bg, border: `1px solid ${color}22`, whiteSpace: 'nowrap' }}>{text}</span>
}
function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 ${pulse ? 10 : 4}px ${color}50`, transition: 'box-shadow 1s', flexShrink: 0 }} />
}
function Card({ children, title, right, pad = true, style: s }: { children: React.ReactNode; title?: string; right?: React.ReactNode; pad?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', ...s }}>
      {title && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0' }}><SecLabel>{title}</SecLabel>{right}</div>}
      {pad ? <div style={{ padding: title ? '12px 24px 20px' : '20px 24px' }}>{children}</div> : children}
    </div>
  )
}
function StatBox({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{ background: C.surface, padding: '18px 22px', borderRadius: 0 }}>
      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.t3, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, letterSpacing: -1.5, color: color || C.text, marginTop: 4, lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
function Grid({ children, cols = 4, gap = 1 }: { children: React.ReactNode; cols?: number; gap?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, background: gap === 1 ? C.border : 'transparent', borderRadius: 16, overflow: 'hidden' }}>{children}</div>
}
function Row({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', background: C.surface, ...s }}>{children}</div>
}
function Bar({ pct, color, h = 5 }: { pct: number; color: string; h?: number }) {
  return (
    <div style={{ flex: 1, height: h, background: 'rgba(255,255,255,0.06)', borderRadius: h / 2, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: h / 2, opacity: 0.65, transition: 'width 0.8s ease' }} />
    </div>
  )
}

// ─── SYSTEM HEALTH TAB ────────────────────────────────────────────
function HealthTab({ data }: { data: MonitorData }) {
  const h = data.health
  const np = h.scoring.confidenceHigh + h.scoring.confidenceMed + h.scoring.confidenceLow + h.scoring.confidenceMinimal || 1
  const endpoints = h.endpoints ?? []
  const cronHealth = h.cronHealth ?? []
  const epStatusColor = (s: string) => s === 'up' ? C.green : s === 'degraded' ? C.orange : C.red
  const cronStatusColor = (s: string) => s === 'on_schedule' ? C.green : s === 'overdue' ? C.orange : C.red
  const cronStatusBg = (s: string) => s === 'on_schedule' ? C.greenDim : s === 'overdue' ? C.orangeDim : C.redDim

  // Backfill state
  const [assessmentState, setAssessmentState] = useState<'idle' | 'confirm' | 'running'>('idle')
  const [assessmentResult, setAssessmentResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [backfillState, setBackfillState] = useState<'idle' | 'confirm' | 'running' | 'stopped'>('idle')
  const [backfillProgress, setBackfillProgress] = useState<{
    processed: number; total: number; reCollected: number; purged: number; skipped: number; errors: number; batchNumber: number
  } | null>(null)
  const [backfillResult, setBackfillResult] = useState<{ ok: boolean; message: string } | null>(null)
  const abortRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const batchRef = useRef(1)
  const cumulativeRef = useRef({ processed: 0, reCollected: 0, purged: 0, skipped: 0, errors: 0 })

  // Persist/restore backfill state from localStorage
  const STORAGE_KEY = 'fabric_backfill_state'
  const saveBackfillState = useCallback((cursor: string | null, batch: number, cumulative: typeof cumulativeRef.current, total: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cursor, batch, cumulative, total, savedAt: Date.now() }))
    } catch { /* ignore */ }
  }, [])
  const clearBackfillState = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  // Client-driven batch chain
  const runBackfillChain = useCallback(async (startCursor: string | null, startBatch: number, startCumulative: typeof cumulativeRef.current) => {
    abortRef.current = false
    cursorRef.current = startCursor
    batchRef.current = startBatch
    cumulativeRef.current = { ...startCumulative }

    let cursor = startCursor
    let batch = startBatch

    while (!abortRef.current) {
      try {
        const res = await fetch('/api/monitor/backfill-cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ after: cursor || undefined, batchNumber: batch }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          setBackfillResult({ ok: false, message: err.error || `Failed (${res.status})` })
          setBackfillState('stopped')
          return
        }
        const data = await res.json()

        // Accumulate totals
        cumulativeRef.current.processed += data.processed ?? 0
        cumulativeRef.current.reCollected += data.reCollected ?? 0
        cumulativeRef.current.purged += data.purged ?? 0
        cumulativeRef.current.skipped += data.skipped ?? 0
        cumulativeRef.current.errors += data.errors ?? 0

        const progress = {
          ...cumulativeRef.current,
          total: data.total ?? 0,
          batchNumber: batch,
        }
        setBackfillProgress(progress)
        saveBackfillState(data.nextCursor, batch + 1, cumulativeRef.current, data.total ?? 0)

        if (data.done) {
          clearBackfillState()
          setBackfillResult({
            ok: true,
            message: `Done — ${cumulativeRef.current.reCollected} re-collected, ${cumulativeRef.current.purged} purged, ${cumulativeRef.current.skipped} skipped, ${cumulativeRef.current.errors} errors`,
          })
          setBackfillState('idle')
          return
        }

        cursor = data.nextCursor
        cursorRef.current = cursor
        batch++
        batchRef.current = batch
      } catch {
        setBackfillResult({ ok: false, message: 'Network error — you can resume from where it stopped' })
        setBackfillState('stopped')
        return
      }

      // Check abort before next iteration
      if (abortRef.current) {
        setBackfillState('stopped')
        return
      }
    }
    // Aborted
    setBackfillState('stopped')
  }, [saveBackfillState, clearBackfillState])

  // On mount: check for saved state or active server-side backfill
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        // Only restore if saved less than 1 hour ago
        if (state.savedAt && Date.now() - state.savedAt < 60 * 60 * 1000) {
          cursorRef.current = state.cursor
          batchRef.current = state.batch ?? 1
          cumulativeRef.current = state.cumulative ?? { processed: 0, reCollected: 0, purged: 0, skipped: 0, errors: 0 }
          setBackfillProgress({
            ...cumulativeRef.current,
            total: state.total ?? 0,
            batchNumber: batchRef.current,
          })
          setBackfillState('stopped')
          setBackfillResult({ ok: false, message: `Stopped at batch ${state.batch ?? 1} — resume to continue` })
          return
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch { /* ignore */ }

    // Also check server status
    ;(async () => {
      try {
        const res = await fetch('/api/monitor/backfill-status')
        if (!res.ok) return
        const status = await res.json()
        if (status.status === 'stale') {
          setBackfillProgress({
            processed: status.processed ?? 0,
            total: status.total ?? 0,
            reCollected: status.reCollected ?? 0,
            purged: status.purged ?? 0,
            skipped: status.skipped ?? 0,
            errors: status.errors ?? 0,
            batchNumber: status.batchNumber ?? 0,
          })
          cursorRef.current = status.nextCursor ?? null
          batchRef.current = (status.batchNumber ?? 0) + 1
          setBackfillState('stopped')
          setBackfillResult({ ok: false, message: 'Previous backfill stalled — resume to continue' })
        }
      } catch { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRunAssessments = async () => {
    if (assessmentState === 'idle') {
      setAssessmentState('confirm')
      setAssessmentResult(null)
      return
    }
    if (assessmentState === 'confirm') {
      setAssessmentState('running')
      const runStartedAt = new Date().toISOString()
      let totalSucceeded = 0
      let totalFailed = 0
      let remaining = 0

      try {
        // Auto-chain batches until all assessments are regenerated
        let hasMore = true
        while (hasMore) {
          const res = await fetch('/api/monitor/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'generate-assessments', params: { run_started_at: runStartedAt } }),
          })
          const body = await res.json()

          if (!res.ok) {
            setAssessmentResult({ ok: false, message: body.error || `Failed (${res.status})` })
            setAssessmentState('idle')
            return
          }

          if (body.status === 'triggered') {
            // Function timed out (>10s) — it's still running server-side, stop chaining
            setAssessmentResult({ ok: true, message: `${totalSucceeded} generated so far — batch running in background, click again to continue` })
            setAssessmentState('idle')
            return
          }

          const r = body.result ?? body
          totalSucceeded += r.succeeded ?? 0
          totalFailed += r.failed ?? 0
          remaining = r.remaining ?? 0

          setAssessmentResult({
            ok: true,
            message: `${totalSucceeded} generated, ${totalFailed} failed, ${remaining} remaining...`,
          })

          hasMore = remaining > 0 && (r.processed ?? 0) > 0
        }

        setAssessmentResult({
          ok: totalFailed === 0,
          message: `Done — ${totalSucceeded} generated${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
        })
      } catch {
        setAssessmentResult({ ok: false, message: `Network error after ${totalSucceeded} generated` })
      }
      setAssessmentState('idle')
    }
  }

  const handleBackfill = () => {
    if (backfillState === 'idle') {
      setBackfillState('confirm')
      setBackfillResult(null)
      setBackfillProgress(null)
      return
    }
    if (backfillState === 'confirm') {
      setBackfillState('running')
      cumulativeRef.current = { processed: 0, reCollected: 0, purged: 0, skipped: 0, errors: 0 }
      runBackfillChain(null, 1, cumulativeRef.current)
      return
    }
  }

  const handleBackfillStop = () => {
    abortRef.current = true
  }

  const handleBackfillResume = () => {
    setBackfillState('running')
    setBackfillResult(null)
    runBackfillChain(cursorRef.current, batchRef.current, cumulativeRef.current)
  }

  const handleBackfillReset = () => {
    abortRef.current = true
    clearBackfillState()
    cursorRef.current = null
    batchRef.current = 1
    cumulativeRef.current = { processed: 0, reCollected: 0, purged: 0, skipped: 0, errors: 0 }
    setBackfillState('idle')
    setBackfillProgress(null)
    setBackfillResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Infrastructure Endpoints */}
      {endpoints.length > 0 && (
        <Card title="Infrastructure Endpoints" right={
          <Mono style={{ fontSize: 10, color: C.t3 }}>{endpoints.filter(e => e.status === 'up').length}/{endpoints.length} up</Mono>
        }>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(endpoints.length, 4)}, 1fr)`, gap: 12 }}>
            {endpoints.map(ep => (
              <div key={ep.endpoint} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${ep.status === 'up' ? C.green + '44' : epStatusColor(ep.status) + '33'}`, boxShadow: ep.status === 'up' ? `0 0 12px ${C.green}22, inset 0 0 12px ${C.green}08` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Dot color={epStatusColor(ep.status)} pulse={ep.status !== 'up'} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ep.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Mono style={{ fontSize: 10, color: C.t3 }}>Response</Mono>
                  <Mono style={{ fontSize: 10, color: ep.response_ms && ep.response_ms > 2000 ? C.orange : C.t2 }}>
                    {ep.response_ms ? `${ep.response_ms}ms` : '—'}
                  </Mono>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Mono style={{ fontSize: 10, color: C.t3 }}>24h uptime</Mono>
                  <Mono style={{ fontSize: 10, color: ep.uptime_24h >= 99 ? C.green : ep.uptime_24h >= 95 ? C.orange : C.red }}>
                    {ep.uptime_24h}%
                  </Mono>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Mono style={{ fontSize: 10, color: C.t3 }}>Checked</Mono>
                  <Mono style={{ fontSize: 10, color: C.t4 }}>{timeAgo(ep.last_checked)}</Mono>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cron Schedule Health */}
      {cronHealth.length > 0 && (
        <Card title="Cron Schedule Health" pad={false}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cronHealth.map((cron, i) => (
              <div key={cron.cronId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
                borderBottom: i < cronHealth.length - 1 ? `1px solid ${C.border}` : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>
                <Dot color={cronStatusColor(cron.status)} pulse={cron.status !== 'on_schedule'} />
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text, width: 160 }}>{cron.name}</span>
                <Mono style={{ fontSize: 11, color: C.t3, width: 120 }}>{cron.schedule}</Mono>
                <div style={{ flex: 1 }}>
                  <Mono style={{ fontSize: 11, color: C.t2 }}>Last run: {cron.lastRunAt ? timeAgo(cron.lastRunAt) : 'never'}</Mono>
                </div>
                <Badge text={cron.status.replace('_', ' ')} color={cronStatusColor(cron.status)} bg={cronStatusBg(cron.status)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Infrastructure — row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Supabase">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>services</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.supabase.rowsServices.toLocaleString()} rows</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>signal_history</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.supabase.rowsSignalHistory.toLocaleString()} rows</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>incidents</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.supabase.rowsIncidents.toLocaleString()} rows</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>cve_records</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.supabase.rowsCveRecords.toLocaleString()} rows</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>discovery_queue</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.supabase.rowsDiscoveryQueue.toLocaleString()} rows</Mono></div>
          </div>
        </Card>
        <Card title="GitHub API">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Mono style={{ fontSize: 12, color: C.t2 }}>Rate limit</Mono>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bar pct={(h.github.rateRemaining / h.github.rateLimit) * 100} color={h.github.rateRemaining < 500 ? C.red : C.green} />
                <Mono style={{ fontSize: 11, color: C.text }}>{h.github.rateRemaining.toLocaleString()}/{h.github.rateLimit.toLocaleString()}</Mono>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 12, color: C.t2 }}>Resets at</Mono>
              <Mono style={{ fontSize: 12, color: C.t3 }}>{h.github.resetsAt ? new Date(h.github.resetsAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}</Mono>
            </div>
          </div>
        </Card>
      </div>

      {/* Infrastructure — row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Vercel">
          {h.vercel ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Functions invoked today</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.vercel.functionsInvoked.toLocaleString()}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Errors today</Mono><Mono style={{ fontSize: 12, color: h.vercel.errors > 0 ? C.red : C.green }}>{h.vercel.errors.toLocaleString()}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Avg latency</Mono><Mono style={{ fontSize: 12, color: h.vercel.avgLatency > 5000 ? C.orange : C.text }}>{h.vercel.avgLatency > 0 ? `${h.vercel.avgLatency.toLocaleString()}ms` : '—'}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>p99 latency</Mono><Mono style={{ fontSize: 12, color: h.vercel.p99Latency > 10000 ? C.red : h.vercel.p99Latency > 5000 ? C.orange : C.text }}>{h.vercel.p99Latency > 0 ? `${h.vercel.p99Latency.toLocaleString()}ms` : '—'}</Mono></div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
              <Mono style={{ fontSize: 12, color: C.t3 }}>Configure VERCEL_TOKEN to enable</Mono>
            </div>
          )}
        </Card>
        <Card title="External APIs" right={<Mono style={{ fontSize: 10, color: C.t3 }}>8 data sources</Mono>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { name: 'OSV.dev', desc: 'Vulnerability database' },
              { name: 'npm Registry', desc: 'Package metadata' },
              { name: 'PyPI', desc: 'Python packages' },
              { name: 'GitHub API', desc: 'Repos, orgs, trending' },
              { name: 'VirusTotal', desc: 'Malware scanning' },
              { name: 'ClawHub', desc: 'MCP tool registry' },
              { name: 'Product Hunt', desc: 'AI tool discovery' },
              { name: 'HN Algolia', desc: 'News discovery' },
            ].map(api => (
              <div key={api.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Dot color={C.green} />
                <Mono style={{ fontSize: 12, color: C.text, width: 100 }}>{api.name}</Mono>
                <Mono style={{ fontSize: 11, color: C.t3, flex: 1 }}>{api.desc}</Mono>
                <Mono style={{ fontSize: 11, color: C.t4 }}>—</Mono>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Score Confidence Distribution */}
      <Card title="Score Confidence Distribution">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {[
            { l: 'High (6/6)', v: h.scoring.confidenceHigh, c: C.green },
            { l: 'Medium (4-5/6)', v: h.scoring.confidenceMed, c: C.blue },
            { l: 'Low (1-3/6)', v: h.scoring.confidenceLow, c: C.orange },
            { l: 'Minimal (0/6)', v: h.scoring.confidenceMinimal, c: C.red },
          ].map((item) => (
            <div key={item.l} style={{ textAlign: 'center', padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, color: item.c, letterSpacing: -1 }}>{item.v.toLocaleString()}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 4 }}>{item.l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Signal Fallback Rates */}
      <Card title="Signal Fallback Rates" right={<Mono style={{ fontSize: 10, color: C.t3 }}>% of services using default scores</Mono>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(h.scoring.fallbackRates).map(([sig, pct]) => (
            <div key={sig} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Mono style={{ fontSize: 12, color: C.t2, width: 120 }}>{sig.replace(/_/g, ' ')}</Mono>
              <Bar pct={pct} color={pct > 30 ? C.red : pct > 15 ? C.orange : C.green} h={6} />
              <Mono style={{ fontSize: 11, color: pct > 30 ? C.red : pct > 15 ? C.orange : C.green, width: 35, textAlign: 'right' }}>{pct}%</Mono>
            </div>
          ))}
        </div>
        {/* Backfill action */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Mono style={{ fontSize: 11, color: C.t3, flex: 1, minWidth: 200 }}>
            {(h.scoring.confidenceLow + h.scoring.confidenceMinimal).toLocaleString()} services with ≤3 signals — re-collect those with metadata, purge empty ones
          </Mono>
          {(backfillState === 'running' || backfillState === 'stopped') && backfillProgress && (
            <Mono style={{ fontSize: 11, color: C.blue, whiteSpace: 'nowrap' }}>
              Batch {backfillProgress.batchNumber} — {backfillProgress.processed.toLocaleString()}/{backfillProgress.total.toLocaleString()} processed
            </Mono>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {(backfillState === 'idle' || backfillState === 'confirm') && (
              <button
                onClick={handleBackfill}
                style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 500,
                  color: backfillState === 'confirm' ? C.orange : C.blue,
                  background: backfillState === 'confirm' ? C.orangeDim : C.blueDim,
                  border: `1px solid ${backfillState === 'confirm' ? C.orange + '33' : C.blue + '33'}`,
                  borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {backfillState === 'idle' ? 'Run Backfill' : 'Confirm — this chains batches'}
              </button>
            )}
            {backfillState === 'running' && (
              <button
                onClick={handleBackfillStop}
                style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 500,
                  color: C.red, background: C.redDim,
                  border: `1px solid ${C.red}33`,
                  borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                Stop
              </button>
            )}
            {backfillState === 'stopped' && (
              <>
                <button
                  onClick={handleBackfillResume}
                  style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 500,
                    color: C.green, background: C.greenDim,
                    border: `1px solid ${C.green}33`,
                    borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  Resume
                </button>
                <button
                  onClick={handleBackfillReset}
                  style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 500,
                    color: C.t3, background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
        {(backfillState === 'running' || backfillState === 'stopped') && backfillProgress && backfillProgress.processed > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
            <Mono style={{ fontSize: 10, color: C.green }}>{backfillProgress.reCollected} re-collected</Mono>
            <Mono style={{ fontSize: 10, color: C.orange }}>{backfillProgress.purged} purged</Mono>
            <Mono style={{ fontSize: 10, color: C.t2 }}>{backfillProgress.skipped} skipped</Mono>
            {backfillProgress.errors > 0 && <Mono style={{ fontSize: 10, color: C.red }}>{backfillProgress.errors} errors</Mono>}
          </div>
        )}
        {backfillResult && (
          <div style={{ marginTop: 8 }}>
            <Mono style={{ fontSize: 11, color: backfillResult.ok ? C.green : C.orange }}>{backfillResult.message}</Mono>
          </div>
        )}
      </Card>

      {/* AI Assessments + Quick Numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="AI Assessments">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Total generated</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.assessments.total.toLocaleString()}</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Pending</Mono><Mono style={{ fontSize: 12, color: h.assessments.pending > 100 ? C.orange : C.text }}>{h.assessments.pending}</Mono></div>
          </div>
          {h.assessments.pending > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Mono style={{ fontSize: 11, color: C.t3, flex: 1, minWidth: 200 }}>
                {h.assessments.pending} services need assessments — generates up to 25 per run
              </Mono>
              <button
                onClick={handleRunAssessments}
                disabled={assessmentState === 'running'}
                style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 500,
                  color: assessmentState === 'running' ? C.t3 : assessmentState === 'confirm' ? C.orange : C.purple,
                  background: assessmentState === 'running' ? 'rgba(255,255,255,0.02)' : assessmentState === 'confirm' ? C.orangeDim : C.purpleDim,
                  border: `1px solid ${assessmentState === 'running' ? C.border : assessmentState === 'confirm' ? C.orange + '33' : C.purple + '33'}`,
                  borderRadius: 8, padding: '6px 16px', cursor: assessmentState === 'running' ? 'wait' : 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {assessmentState === 'running' ? 'Running…' : assessmentState === 'confirm' ? 'Confirm' : 'Run Assessments'}
              </button>
            </div>
          )}
          {assessmentResult && (
            <div style={{ marginTop: 8 }}>
              <Mono style={{ fontSize: 11, color: assessmentResult.ok ? C.green : C.orange }}>{assessmentResult.message}</Mono>
            </div>
          )}
        </Card>
        <Card title="Quick Numbers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Stale scores (&gt;7d)</Mono><Mono style={{ fontSize: 12, color: h.scoring.staleCount > 0 ? C.orange : C.green }}>{h.scoring.staleCount}</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Avg signals/service</Mono><Mono style={{ fontSize: 12, color: C.text }}>{np > 0 ? ((h.scoring.confidenceHigh * 6 + h.scoring.confidenceMed * 5 + h.scoring.confidenceLow * 2 + h.scoring.confidenceMinimal * 0) / np).toFixed(1) : '—'}</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Unresolved incidents</Mono><Mono style={{ fontSize: 12, color: data.incidents.unresolved > 0 ? C.orange : C.green }}>{data.incidents.unresolved}</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>CVEs unpatched</Mono><Mono style={{ fontSize: 12, color: C.red }}>{data.cves.unpatched}</Mono></div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── ACTIVITY TAB ─────────────────────────────────────────────────
const ACTIVITY_TYPES: Record<string, { color: string; dimColor: string; label: string; icon: string }> = {
  scored: { color: C.pink, dimColor: C.pinkDim, label: 'SCORED', icon: '◆' },
  discovered: { color: C.blue, dimColor: C.blueDim, label: 'DISCOVERED', icon: '●' },
  incident: { color: C.orange, dimColor: C.orangeDim, label: 'INCIDENT', icon: '▲' },
  cve: { color: C.red, dimColor: C.redDim, label: 'CVE', icon: '■' },
}

function ActivityTab({ data }: { data: MonitorData }) {
  const [filter, setFilter] = useState('all')
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const events = (data.events ?? []).filter(e => new Date(e.timestamp).getTime() >= cutoff)
  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  // Group events by date
  const grouped: Record<string, ActivityEvent[]> = {}
  for (const e of filtered) {
    const date = new Date(e.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(e)
  }

  // Count by type
  const counts: Record<string, number> = {}
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mono style={{ fontSize: 11, color: C.t3 }}>Filter:</Mono>
        {['all', ...Object.keys(ACTIVITY_TYPES)].map(f => {
          const cfg = ACTIVITY_TYPES[f]
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: F.mono, fontSize: 10, color: filter === f ? (cfg?.color ?? C.pink) : C.t3,
              background: filter === f ? (cfg?.dimColor ?? 'rgba(254,131,224,0.08)') : 'transparent',
              border: `1px solid ${filter === f ? (cfg?.color ?? C.pink) + '33' : C.border}`,
              borderRadius: 8, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s',
            }}>{f === 'all' ? `All (${events.length})` : `${cfg?.label ?? f} (${counts[f] ?? 0})`}</button>
          )
        })}
      </div>

      {/* Event timeline grouped by date */}
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date}>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>{date}</div>
          <Card pad={false}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dayEvents.map((event, i) => {
                const cfg = ACTIVITY_TYPES[event.type] ?? ACTIVITY_TYPES.scored
                return (
                  <div key={`${event.timestamp}-${i}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
                    borderBottom: i < dayEvents.length - 1 ? `1px solid ${C.border}` : 'none',
                    background: 'transparent',
                  }}>
                    {/* Time */}
                    <Mono style={{ fontSize: 11, color: C.t3, width: 50, flexShrink: 0 }}>
                      {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </Mono>
                    {/* Type indicator */}
                    <span style={{ fontSize: 10, color: cfg.color, width: 14, textAlign: 'center', flexShrink: 0 }}>{cfg.icon}</span>
                    <Badge text={cfg.label} color={cfg.color} bg={cfg.dimColor} />
                    {/* Name */}
                    {event.slug ? (
                      <a href={`/${event.slug}`} target="_blank" rel="noreferrer" style={{
                        fontSize: 13, fontWeight: 600, color: C.text, textDecoration: 'none', flexShrink: 0, maxWidth: 200,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{event.name}</a>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</span>
                    )}
                    {/* Detail */}
                    <span style={{ fontSize: 12, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.detail}</span>
                    {/* Severity badge for incidents/CVEs */}
                    {event.severity && (
                      <Badge text={event.severity} color={sevC(event.severity)} bg={sevBg(event.severity)} />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Mono style={{ fontSize: 13, color: C.t3 }}>No events{filter !== 'all' ? ` of type "${filter}"` : ''}</Mono>
        </div>
      )}
    </div>
  )
}

// ─── SCHEDULE TAB ─────────────────────────────────────────────────
interface CronDef {
  id: string; name: string; schedule: string; color: string
  getProgress: (data: MonitorData) => { pct: number; label: string }
  getLastRun: (data: MonitorData) => string | null
  getNextRun: () => string
}

function nextCronUTC(hour: number, minute = 0): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

function nextHourlyCron(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0))
  return next.toISOString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const SCHEDULED_CRONS: CronDef[] = [
  {
    id: 'collect-daily', name: 'Daily Scoring', schedule: '2:00 AM UTC', color: C.pink,
    getProgress: (d) => {
      const pct = d.schedule.totalNonPending > 0 ? Math.round((d.schedule.todayUpdated / d.schedule.totalNonPending) * 100) : 0
      return { pct, label: `${d.schedule.todayUpdated.toLocaleString()} / ${d.schedule.totalNonPending.toLocaleString()} services` }
    },
    getLastRun: (d) => d.schedule.lastScoredAt,
    getNextRun: () => nextCronUTC(2),
  },
  {
    id: 'discover', name: 'Registry Discovery', schedule: '4:00 AM UTC', color: C.blue,
    getProgress: (d) => {
      const n = d.overview.todayDiscovered
      return { pct: n > 0 ? 100 : 0, label: n > 0 ? `${n} new services found` : 'Waiting for next run' }
    },
    getLastRun: (d) => d.schedule.lastDiscoveredAt,
    getNextRun: () => nextCronUTC(4),
  },
  {
    id: 'discover-ai-news', name: 'AI News Scanner', schedule: '4:30 AM UTC', color: C.blue,
    getProgress: (d) => {
      const n = d.discoveryQueue.length
      return { pct: 100, label: n > 0 ? `${n} pending review` : 'Queue clear' }
    },
    getLastRun: (d) => d.schedule.lastDiscoveredAt,
    getNextRun: () => nextCronUTC(4, 30),
  },
  {
    id: 'discover-clawhub', name: 'ClawHub Discovery', schedule: '5:00 AM UTC', color: C.blue,
    getProgress: () => ({ pct: 100, label: 'Daily scan' }),
    getLastRun: (d) => d.schedule.lastDiscoveredAt,
    getNextRun: () => nextCronUTC(5),
  },
  {
    id: 'discover-mcp', name: 'MCP Discovery', schedule: '6:00 AM UTC', color: C.blue,
    getProgress: () => ({ pct: 100, label: 'Daily scan' }),
    getLastRun: (d) => d.schedule.lastDiscoveredAt,
    getNextRun: () => nextCronUTC(6),
  },
  {
    id: 'watchdog', name: 'Watchdog QA', schedule: '3:00 AM UTC', color: C.green,
    getProgress: () => ({ pct: 100, label: 'Anomaly detection + auto-fix' }),
    getLastRun: (d) => d.schedule.lastIncidentAt,
    getNextRun: () => nextCronUTC(3),
  },
  {
    id: 'collect-cve', name: 'CVE Full Scan', schedule: 'Hourly :00', color: C.orange,
    getProgress: (d) => {
      const n = d.cves.unpatched
      return { pct: 100, label: `${d.cves.total.toLocaleString()} CVEs tracked · ${n} unpatched` }
    },
    getLastRun: (d) => d.schedule.lastScoredAt,
    getNextRun: () => nextHourlyCron(),
  },
  {
    id: 'generate-assessments', name: 'AI Assessments', schedule: '8:00 AM UTC', color: C.purple,
    getProgress: (d) => {
      const total = d.health.assessments.total + d.health.assessments.pending
      const pct = total > 0 ? Math.round((d.health.assessments.total / total) * 100) : 0
      return { pct, label: `${d.health.assessments.total.toLocaleString()} generated · ${d.health.assessments.pending} pending` }
    },
    getLastRun: () => null,
    getNextRun: () => nextCronUTC(8),
  },
]

function ScheduleTab({ data }: { data: MonitorData }) {
  const now = new Date()
  const [running, setRunning] = useState<Record<string, 'confirm' | 'running' | null>>({})
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  const handleRun = async (cronId: string, cronName: string) => {
    const state = running[cronId]
    if (!state) {
      // First click — show confirmation
      setRunning(r => ({ ...r, [cronId]: 'confirm' }))
      setResults(r => { const n = { ...r }; delete n[cronId]; return n })
      return
    }
    if (state === 'confirm') {
      // Second click — trigger the cron
      setRunning(r => ({ ...r, [cronId]: 'running' }))
      try {
        const res = await fetch('/api/monitor/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: cronId }),
        })
        const body = await res.json()
        if (res.ok) {
          setResults(r => ({ ...r, [cronId]: { ok: true, message: body.status === 'triggered' ? `${cronName} triggered — still running` : `${cronName} completed` } }))
        } else {
          setResults(r => ({ ...r, [cronId]: { ok: false, message: body.error || `Failed (${res.status})` } }))
        }
      } catch {
        setResults(r => ({ ...r, [cronId]: { ok: false, message: 'Network error' } }))
      }
      setRunning(r => ({ ...r, [cronId]: null }))
    }
  }

  const cancelConfirm = (cronId: string) => {
    setRunning(r => ({ ...r, [cronId]: null }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {SCHEDULED_CRONS.map((cron) => {
        const progress = cron.getProgress(data)
        const lastRun = cron.getLastRun(data)
        const nextRun = cron.getNextRun()
        const nextTime = new Date(nextRun)
        const msUntil = nextTime.getTime() - now.getTime()
        const hoursUntil = Math.max(0, Math.floor(msUntil / 3600000))
        const minsUntil = Math.max(0, Math.floor((msUntil % 3600000) / 60000))
        const countdownLabel = hoursUntil > 0 ? `in ${hoursUntil}h ${minsUntil}m` : minsUntil > 0 ? `in ${minsUntil}m` : 'now'
        const cronState = running[cron.id]
        const result = results[cron.id]

        return (
          <div key={cron.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Dot color={cron.color} pulse={progress.pct > 0 && progress.pct < 100} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{cron.name}</span>
                    <Mono style={{ fontSize: 11, color: C.t3 }}>{cron.schedule}</Mono>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {cronState === 'running' ? (
                      <>
                        <div style={{
                          width: 12, height: 12, border: `2px solid ${C.t4}`, borderTopColor: cron.color,
                          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                        <Mono style={{ fontSize: 10, color: cron.color }}>Running...</Mono>
                      </>
                    ) : cronState === 'confirm' ? (
                      <>
                        <Mono style={{ fontSize: 10, color: C.orange }}>Run now?</Mono>
                        <button onClick={() => handleRun(cron.id, cron.name)} style={{
                          fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.green, background: C.greenDim,
                          border: `1px solid ${C.green}22`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                        }}>Yes</button>
                        <button onClick={() => cancelConfirm(cron.id)} style={{
                          fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent',
                          border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                        }}>No</button>
                      </>
                    ) : (
                      <button onClick={() => handleRun(cron.id, cron.name)} style={{
                        fontFamily: F.mono, fontSize: 10, fontWeight: 500, color: C.t2, background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 12px', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>Run</button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {lastRun && (
                  <div style={{ textAlign: 'right' }}>
                    <Mono style={{ fontSize: 9, color: C.t4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Last run</Mono>
                    <Mono style={{ fontSize: 11, color: C.t2, display: 'block' }}>{timeAgo(lastRun)}</Mono>
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <Mono style={{ fontSize: 9, color: C.t4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Next run</Mono>
                  <Mono style={{ fontSize: 11, color: C.text, display: 'block' }}>{formatTime(nextRun)} <span style={{ color: C.t3 }}>({countdownLabel})</span></Mono>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, progress.pct)}%`, background: cron.color,
                  borderRadius: 4, opacity: 0.7, transition: 'width 1s ease',
                }} />
              </div>
              <Mono style={{ fontSize: 11, color: progress.pct >= 100 ? C.green : cron.color, minWidth: 36, textAlign: 'right' }}>
                {progress.pct}%
              </Mono>
              <Mono style={{ fontSize: 11, color: C.t2 }}>{progress.label}</Mono>
              {result && (
                <Mono style={{ fontSize: 10, color: result.ok ? C.green : C.red, marginLeft: 8 }}>{result.message}</Mono>
              )}
            </div>
          </div>
        )
      })}
      {/* Spin keyframe — inject once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── RECENT ACTIVITY (used in timeline within schedule) ───────────
const EVENT_CONFIG: Record<string, { color: string; dimColor: string; label: string }> = {
  scored: { color: C.pink, dimColor: C.pinkDim, label: 'SCORED' },
  discovered: { color: C.blue, dimColor: C.blueDim, label: 'DISCOVERED' },
  incident: { color: C.orange, dimColor: C.orangeDim, label: 'INCIDENT' },
}

// ─── MANUAL ENTRY FORM ───────────────────────────────────────────
function ManualEntryForm({ onAdded }: { onAdded: (slug: string) => void }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [form, setForm] = useState({ name: '', github_repo: '', homepage_url: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/monitor/add-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        const sc = data.scoring
        const msg = sc ? `Scored: ${sc.success.length} signals${sc.failed.length ? `, ${sc.failed.length} failed` : ''}` : 'Queued for scoring'
        setResult({ ok: true, message: `Added "${form.name}" — ${msg}` })
        setForm({ name: '', github_repo: '', homepage_url: '' })
        onAdded(data.slug)
      } else {
        setResult({ ok: false, message: data.error || 'Failed to add service' })
      }
    } catch {
      setResult({ ok: false, message: 'Network error' })
    }
    setSubmitting(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: F.mono, fontSize: 12, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { fontFamily: F.mono, fontSize: 10, color: C.t3, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        fontFamily: F.mono, fontSize: 11, color: C.blue, background: C.blueDim,
        border: `1px solid ${C.blue}22`, borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
      }}>+ Add Service Manually</button>
    )
  }

  return (
    <Card title="Add Service Manually" right={
      <button onClick={() => { setOpen(false); setResult(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
    }>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. CodePilot Pro" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>GitHub Repo</label>
            <input value={form.github_repo} onChange={e => setForm(p => ({ ...p, github_repo: e.target.value }))} placeholder="owner/repo" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Homepage URL</label>
            <input value={form.homepage_url} onChange={e => setForm(p => ({ ...p, homepage_url: e.target.value }))} placeholder="https://..." style={inputStyle} />
          </div>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t4, marginTop: 8 }}>Slug, publisher, category, description, npm/pypi packages are resolved automatically via enrichment pipeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button type="submit" disabled={submitting || !form.name} style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: '#fff', background: C.blue,
            border: 'none', borderRadius: 8, padding: '8px 20px', cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting || !form.name ? 0.5 : 1,
          }}>{submitting ? 'Adding...' : 'Add to Index'}</button>
          {result && (
            <Mono style={{ fontSize: 11, color: result.ok ? C.green : C.red }}>{result.message}</Mono>
          )}
        </div>
      </form>
    </Card>
  )
}

// ─── DISCOVERY TAB ────────────────────────────────────────────────
function DiscoveryTab({ data, onAction, onRefresh }: { data: MonitorData; onAction: (id: string, action: 'approve' | 'dismiss') => Promise<boolean>; onRefresh: () => void }) {
  const [subTab, setSubTab] = useState<'pending' | 'approved'>('pending')
  const [filter, setFilter] = useState('all')
  const [acting, setActing] = useState<string | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<{ scored: number; failed: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const items = data.discoveryQueue
  const filtered = filter === 'all' ? items : items.filter(i => i.source === filter)
  const approved = data.approvedDiscoveries ?? []
  const allUnscoredSlugs = data.unscoredSlugs ?? []
  const unscoredCount = allUnscoredSlugs.length

  const [actionError, setActionError] = useState<string | null>(null)
  const handleAction = async (id: string, action: 'approve' | 'dismiss') => {
    setActing(id)
    setActionError(null)
    const ok = await onAction(id, action)
    if (!ok) setActionError(`Failed to ${action} — check console`)
    setActing(null)
  }

  const handleBatchScore = async () => {
    if (allUnscoredSlugs.length === 0) return
    setScoring(true)
    setScoreResult(null)
    try {
      // collect-sample endpoint handles max 50 at a time
      let scored = 0
      let failed = 0
      for (let i = 0; i < allUnscoredSlugs.length; i += 50) {
        const batch = allUnscoredSlugs.slice(i, i + 50)
        const authCookie = document.cookie.split('fabric_monitor_auth=')[1]?.split(';')[0] ?? ''
        const res = await fetch('/api/cron/collect-sample', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authCookie}` },
          body: JSON.stringify({ slugs: batch }),
        })
        if (res.ok) {
          const data = await res.json()
          scored += (data.results ?? []).filter((r: { composite_score: number }) => r.composite_score > 0).length
          failed += (data.results ?? []).filter((r: { composite_score: number }) => r.composite_score === 0).length
        } else {
          failed += batch.length
        }
      }
      setScoreResult({ scored, failed })
      onRefresh()
    } catch {
      setScoreResult({ scored: 0, failed: allUnscoredSlugs.length })
    } finally {
      setScoring(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.id)))
  }

  const handleBulkApprove = async () => {
    if (selected.size === 0) return
    setBulkApproving(true)
    setActionError(null)
    const ids = Array.from(selected)
    let failures = 0
    setBulkProgress({ done: 0, total: ids.length })
    for (let i = 0; i < ids.length; i++) {
      const ok = await onAction(ids[i], 'approve')
      if (!ok) failures++
      setBulkProgress({ done: i + 1, total: ids.length })
    }
    setSelected(new Set())
    setBulkApproving(false)
    setBulkProgress(null)
    if (failures > 0) setActionError(`${failures}/${ids.length} approvals failed`)
    onRefresh()
  }

  const statusColor = (s: string) => s === 'trusted' ? C.green : s === 'caution' ? C.orange : s === 'blocked' ? C.red : C.t3

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-tab toggle */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {([['pending', `Pending (${items.length})`], ['approved', `Approved (${approved.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            fontFamily: F.mono, fontSize: 11, color: subTab === id ? C.pink : C.t3,
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px',
            borderBottom: subTab === id ? `2px solid ${C.pink}` : '2px solid transparent',
            transition: 'all 0.15s', letterSpacing: 0.3,
          }}>{label}</button>
        ))}
      </div>

      {subTab === 'pending' && (
        <>
          {/* Manual Entry */}
          <ManualEntryForm onAdded={() => onRefresh()} />

          {/* Filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mono style={{ fontSize: 11, color: C.t3 }}>Filter:</Mono>
            {['all', 'producthunt', 'github-trending', 'hackernews', 'yc-launches'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: F.mono, fontSize: 10, color: filter === f ? C.pink : C.t3, background: filter === f ? 'rgba(254,131,224,0.08)' : 'transparent',
                border: `1px solid ${filter === f ? C.pink + '33' : C.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s',
              }}>{f === 'all' ? 'All' : srcLabel(f)}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {selected.size > 0 && (
                <button onClick={handleBulkApprove} disabled={bulkApproving} style={{
                  fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: bulkApproving ? C.t3 : C.green,
                  background: bulkApproving ? C.surface : C.greenDim,
                  border: `1px solid ${bulkApproving ? C.border : C.green + '33'}`, borderRadius: 6,
                  padding: '5px 14px', cursor: bulkApproving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}>{bulkApproving && bulkProgress ? `Approving ${bulkProgress.done}/${bulkProgress.total}...` : `Approve ${selected.size} Selected`}</button>
              )}
              <Badge text={`${items.length} pending review`} color={C.orange} bg={C.orangeDim} />
            </div>
          </div>

          {actionError && (
            <div style={{ padding: '8px 16px', background: C.redDim, borderRadius: 8, border: `1px solid ${C.red}33` }}>
              <Mono style={{ fontSize: 11, color: C.red }}>{actionError}</Mono>
            </div>
          )}

          {/* Pending review table */}
          <Card pad={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 24px 180px 1fr 90px 70px 120px', gap: 0, padding: '10px 24px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: C.pink }} />
              {['', 'Service', 'Description', 'Source', 'Stars', 'Actions'].map(h => (
                <Mono key={h} style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</Mono>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>No pending discoveries{filter !== 'all' ? ` from ${srcLabel(filter)}` : ''}</Mono></div>
            ) : filtered.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '28px 24px 180px 1fr 90px 70px 120px', gap: 0, padding: '12px 24px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', opacity: acting === item.id ? 0.5 : 1 }}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} disabled={bulkApproving} style={{ width: 14, height: 14, cursor: bulkApproving ? 'not-allowed' : 'pointer', accentColor: C.pink }} />
                <span style={{ fontSize: 14 }}>{srcIcon(item.source)}</span>
                <div>
                  {item.homepage_url ? (
                    <a href={item.homepage_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.blue, textDecoration: 'none' }}>{item.name || item.slug}</a>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.name || item.slug}</span>
                  )}
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3 }}>{item.publisher || '—'}</div>
                </div>
                <span style={{ fontSize: 12, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{item.description || '—'}</span>
                <Badge text={srcLabel(item.source).split(' ')[0]} color={C.t2} bg={C.surface} />
                <Mono style={{ fontSize: 11, color: item.stars ? C.text : C.t4 }}>{item.stars ? item.stars.toLocaleString() : '—'}</Mono>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleAction(item.id, 'approve')} disabled={!!acting} style={{ fontFamily: F.mono, fontSize: 10, color: C.green, background: C.greenDim, border: `1px solid ${C.green}22`, borderRadius: 6, padding: '4px 10px', cursor: acting ? 'not-allowed' : 'pointer' }}>Approve</button>
                  <button onClick={() => handleAction(item.id, 'dismiss')} disabled={!!acting} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}22`, borderRadius: 6, padding: '4px 10px', cursor: acting ? 'not-allowed' : 'pointer' }}>Dismiss</button>
                  {item.github_repo && <a href={`https://github.com/${item.github_repo}`} target="_blank" rel="noreferrer" style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', textDecoration: 'none' }}>GH</a>}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {subTab === 'approved' && (
        <>
        {unscoredCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBatchScore} disabled={scoring} style={{
              fontFamily: F.mono, fontSize: 11, color: scoring ? C.t3 : C.blue,
              background: scoring ? C.surface : 'rgba(6,140,255,0.08)',
              border: `1px solid ${scoring ? C.border : C.blue + '33'}`, borderRadius: 8,
              padding: '6px 16px', cursor: scoring ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}>{scoring ? 'Scoring...' : `Score ${unscoredCount} Unscored Services`}</button>
            {scoreResult && (
              <Mono style={{ fontSize: 11, color: scoreResult.failed > 0 ? C.orange : C.green }}>
                {scoreResult.scored} scored{scoreResult.failed > 0 ? `, ${scoreResult.failed} failed` : ''}
              </Mono>
            )}
          </div>
        )}
        <Card pad={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 90px 120px 80px 100px 70px', gap: 0, padding: '10px 24px', borderBottom: `1px solid ${C.border}` }}>
            {['Service', 'Source', 'Approved', 'Score', 'Status', 'Scored'].map(h => (
              <Mono key={h} style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</Mono>
            ))}
          </div>
          {approved.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>No approved discoveries yet</Mono></div>
          ) : approved.map(item => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '200px 90px 120px 80px 100px 70px', gap: 0, padding: '12px 24px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <a href={`https://trust.fabriclayer.ai/${item.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</a>
              <Badge text={srcLabel(item.source).split(' ')[0]} color={C.t2} bg={C.surface} />
              <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(item.approved_at)}</Mono>
              <Mono style={{ fontSize: 13, fontWeight: 600, color: item.score != null ? statusColor(item.status) : C.t4 }}>
                {item.score != null ? item.score.toFixed(2) : '—'}
              </Mono>
              {item.status !== 'pending' ? (
                <Badge text={item.status} color={statusColor(item.status)} bg={item.status === 'trusted' ? C.greenDim : item.status === 'caution' ? C.orangeDim : item.status === 'blocked' ? C.redDim : C.surface} />
              ) : (
                <Badge text="pending" color={C.t3} bg={C.surface} />
              )}
              <span style={{ fontSize: 14, textAlign: 'center' }}>
                {item.scored ? (
                  <span style={{ color: C.green }}>&#10003;</span>
                ) : (
                  <span style={{ color: C.orange }}>&#9679;</span>
                )}
              </span>
            </div>
          ))}
        </Card>
        </>
      )}
    </div>
  )
}

// ─── ALERTS TAB ──────────────────────────────────────────────────
function AlertsTab({ data }: { data: MonitorData }) {
  const overrides = Object.entries(data.health.scoring.overrideCounts)
    .map(([name, count]) => ({
      name,
      count,
      ...(OVERRIDE_DEFS[name] || { effect: '→ override', trigger: name, sev: 'warning' }),
    }))
    .sort((a, b) => b.count - a.count)

  const totalOverrides = overrides.reduce((s, o) => s + o.count, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card title="Active Alerts" right={<Mono style={{ fontSize: 10, color: C.t3 }}>{totalOverrides} total active</Mono>} pad={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
          {overrides.length === 0 ? (
            <Row><Mono style={{ fontSize: 12, color: C.t3 }}>No active alerts</Mono></Row>
          ) : overrides.map((o) => (
            <Row key={o.name}>
              <Dot color={sevC(o.sev)} />
              <Mono style={{ fontSize: 12, color: C.text, width: 220, fontWeight: 500 }}>{o.name}</Mono>
              <span style={{ fontSize: 12, color: C.t2, flex: 1 }}>{o.trigger}</span>
              <Badge text={o.effect} color={o.sev === 'critical' ? C.red : C.orange} bg={o.sev === 'critical' ? C.redDim : C.orangeDim} />
              <Mono style={{ fontSize: 14, fontWeight: 700, color: o.count > 20 ? C.text : C.t2, width: 40, textAlign: 'right' }}>{o.count}</Mono>
            </Row>
          ))}
        </div>
      </Card>

      <Card title="CVE Overview">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 20 }}>
          {[
            { l: 'Total', v: data.cves.total, c: C.text },
            { l: 'Critical', v: data.cves.critical, c: C.red },
            { l: 'High', v: data.cves.high, c: C.orange },
            { l: 'Medium', v: data.cves.medium, c: C.orange },
            { l: 'Unpatched', v: data.cves.unpatched, c: C.red },
          ].map((item) => (
            <div key={item.l} style={{ textAlign: 'center', padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, color: item.c, letterSpacing: -1 }}>{item.v.toLocaleString()}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 4, textTransform: 'uppercase' }}>{item.l}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Unresolved Incidents">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {[
            { l: 'Total Unresolved', v: data.incidents.unresolved, c: C.text },
            { l: 'Critical', v: data.incidents.critical, c: C.red },
            { l: 'Warning', v: data.incidents.warning, c: C.orange },
            { l: 'Info', v: data.incidents.info, c: C.blue },
          ].map((item) => (
            <div key={item.l} style={{ textAlign: 'center', padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, color: item.c, letterSpacing: -1 }}>{item.v.toLocaleString()}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 4, textTransform: 'uppercase' }}>{item.l}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── REVIEW TAB ──────────────────────────────────────────────────
interface ReviewData {
  id: string
  created_at: string
  status: 'pending' | 'completed' | 'failed'
  analysis: string | null
  token_usage: { input_tokens: number; output_tokens: number; cost_estimate: number } | null
  duration_ms: number | null
  action_total?: number
  action_completed?: number
}

interface ReviewAction {
  action_hash: string
  action_text: string
  completed: boolean
  completed_at: string | null
}

// djb2 hash — stable, fast, no crypto needed
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36)
}

interface ExtractedAction {
  hash: string
  text: string
  lineIndex: number
  isCodeBlock: boolean
}

function extractActions(md: string): ExtractedAction[] {
  const lines = md.split('\n')
  const actions: ExtractedAction[] = []
  let currentSection = ''
  let inCode = false
  let codeStart = -1
  let codeBlock: string[] = []
  const isFixPrompts = (section: string) =>
    section.toLowerCase().includes('fix prompt')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      currentSection = line.slice(3)
    }

    // Only detect actions under Fix Prompts section
    if (line.startsWith('```')) {
      if (inCode) {
        if (isFixPrompts(currentSection)) {
          const text = codeBlock.join('\n').trim()
          if (text) {
            actions.push({ hash: hashString(text), text, lineIndex: codeStart, isCodeBlock: true })
          }
        }
        codeBlock = []
        inCode = false
      } else {
        inCode = true
        codeStart = i
      }
      continue
    }
    if (inCode) { codeBlock.push(line); continue }


  }

  return actions
}

function ActionCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
        border: `1.5px solid ${checked ? C.green : C.t3}`,
        background: checked ? C.green : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5L4 7L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

function CodeBlock({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        style={{
          position: 'absolute', top: 6, right: 6, fontFamily: F.mono, fontSize: 9, fontWeight: 600,
          color: copied ? C.green : C.t3, background: copied ? C.greenDim : 'rgba(255,255,255,0.06)',
          border: `1px solid ${copied ? C.green + '33' : C.border}`, borderRadius: 4,
          padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s', zIndex: 1,
        }}
      >{copied ? 'Copied!' : 'Copy'}</button>
      <pre style={{
        background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '12px 16px', paddingRight: 70, overflowX: 'auto', fontFamily: F.mono, fontSize: 11,
        color: C.t2, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{code}</pre>
    </div>
  )
}

function renderMarkdown(
  md: string,
  actionLineMap?: Map<number, { hash: string; completed: boolean }>,
  onToggle?: (hash: string, text: string, completed: boolean) => void,
): React.ReactNode[] {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let inCode = false
  let codeBlock: string[] = []
  let codeStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block toggle
    if (line.startsWith('```')) {
      if (inCode) {
        const code = codeBlock.join('\n')
        const action = actionLineMap?.get(codeStart)
        if (action && onToggle) {
          elements.push(
            <div key={`code-action-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: action.completed ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ paddingTop: 12 }}>
                <ActionCheckbox checked={action.completed} onClick={() => onToggle(action.hash, code, !action.completed)} />
              </div>
              <div style={{ flex: 1, textDecoration: action.completed ? 'line-through' : 'none' }}>
                <CodeBlock key={`code-${i}`} code={code} id={`code-${i}`} />
              </div>
            </div>
          )
        } else {
          elements.push(<CodeBlock key={`code-${i}`} code={code} id={`code-${i}`} />)
        }
        codeBlock = []
        inCode = false
      } else {
        inCode = true
        codeStart = i
      }
      continue
    }
    if (inCode) { codeBlock.push(line); continue }

    // ## Headers
    if (line.startsWith('## ')) {
      const text = line.slice(3)
      const hColor = text.includes('Critical') ? C.red : text.includes('Warning') ? C.orange : text.includes('Healthy') ? C.green : text.includes('Trend') ? C.blue : text.includes('Recommend') ? C.purple : C.text
      elements.push(
        <div key={`h-${i}`} style={{ fontSize: 15, fontWeight: 700, color: hColor, marginTop: 20, marginBottom: 8, letterSpacing: -0.3 }}>
          {text}
        </div>
      )
      continue
    }

    // ### Subheaders
    if (line.startsWith('### ')) {
      elements.push(
        <div key={`sh-${i}`} style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 14, marginBottom: 4 }}>
          {line.slice(4)}
        </div>
      )
      continue
    }

    // Manual step items: "- [ ] step" — render as plain bullet
    if (line.match(/^- \[ \] /)) {
      const text = line.slice(6)
      elements.push(
        <div key={`ms-${i}`} style={{ display: 'flex', gap: 6, marginLeft: 8, marginTop: 3, alignItems: 'flex-start' }}>
          <span style={{ color: C.t3, flexShrink: 0 }}>•</span>
          <span style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{renderInline(text)}</span>
        </div>
      )
      continue
    }

    // Bullet points
    if (line.match(/^[-*] /)) {
      elements.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: 8, marginLeft: 8, marginTop: 3, alignItems: 'flex-start' }}>
          <span style={{ color: C.t3, flexShrink: 0 }}>{'•'}</span>
          <span style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{renderInline(line.slice(2))}</span>
        </div>
      )
      continue
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. (.*)/)
      if (match) {
        elements.push(
          <div key={`ol-${i}`} style={{ display: 'flex', gap: 8, marginLeft: 8, marginTop: 3 }}>
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.t3, flexShrink: 0, minWidth: 18 }}>{match[1]}.</span>
            <span style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{renderInline(match[2])}</span>
          </div>
        )
        continue
      }
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} style={{ height: 6 }} />)
      continue
    }

    // Normal paragraph
    elements.push(
      <div key={`p-${i}`} style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginTop: 2 }}>
        {renderInline(line)}
      </div>
    )
  }

  return elements
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**, `code`, and plain text
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/)

    // Find the earliest match
    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity
    const codeIdx = codeMatch ? remaining.indexOf(codeMatch[0]) : Infinity

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }

    if (boldIdx <= codeIdx && boldMatch) {
      if (boldIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>)
      parts.push(<strong key={key++} style={{ color: C.text, fontWeight: 600 }}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldIdx + boldMatch[0].length)
    } else if (codeMatch) {
      if (codeIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, codeIdx)}</span>)
      parts.push(
        <code key={key++} style={{
          fontFamily: F.mono, fontSize: 11, background: 'rgba(255,255,255,0.06)',
          padding: '1px 5px', borderRadius: 3, color: C.pink,
        }}>{codeMatch[1]}</code>
      )
      remaining = remaining.slice(codeIdx + codeMatch[0].length)
    }
  }

  return <>{parts}</>
}

function ReviewTab() {
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [running, setRunning] = useState<null | 'confirm' | 'running'>(null)
  const [runResult, setRunResult] = useState<{ ok: boolean; message: string } | null>(null)
  // Action state: keyed by review_id → map of action_hash → completed
  const [actionState, setActionState] = useState<Record<string, Record<string, boolean>>>({})
  const [loadedActions, setLoadedActions] = useState<Set<string>>(new Set())

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/reviews')
      if (!res.ok) return
      const data = await res.json()
      setReviews(data.reviews ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchActionsForReview = useCallback(async (reviewId: string) => {
    if (loadedActions.has(reviewId)) return
    try {
      const res = await fetch(`/api/monitor/reviews/actions?review_id=${reviewId}`)
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, boolean> = {}
      for (const a of (data.actions ?? []) as ReviewAction[]) {
        map[a.action_hash] = a.completed
      }
      setActionState(prev => ({ ...prev, [reviewId]: { ...(prev[reviewId] ?? {}), ...map } }))
      setLoadedActions(prev => new Set(prev).add(reviewId))
    } catch { /* ignore */ }
  }, [loadedActions])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  // Load actions for latest review when reviews are fetched
  useEffect(() => {
    const latest = reviews.find(r => r.status === 'completed')
    if (latest) fetchActionsForReview(latest.id)
  }, [reviews, fetchActionsForReview])

  const handleToggleAction = async (reviewId: string, hash: string, text: string, completed: boolean) => {
    // Optimistic update
    setActionState(prev => ({
      ...prev,
      [reviewId]: { ...(prev[reviewId] ?? {}), [hash]: completed },
    }))
    // Also update review counts optimistically
    setReviews(prev => prev.map(r => {
      if (r.id !== reviewId) return r
      const prevCompleted = r.action_completed ?? 0
      const delta = completed ? 1 : -1
      const prevTotal = r.action_total ?? 0
      return {
        ...r,
        action_completed: Math.max(0, prevCompleted + delta),
        action_total: Math.max(prevTotal, (actionState[reviewId] ? Object.keys(actionState[reviewId]).length : 0)),
      }
    }))

    try {
      await fetch('/api/monitor/reviews/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, action_hash: hash, action_text: text, completed }),
      })
    } catch {
      // Revert on failure
      setActionState(prev => ({
        ...prev,
        [reviewId]: { ...(prev[reviewId] ?? {}), [hash]: !completed },
      }))
    }
  }

  const buildActionLineMap = (reviewId: string, analysis: string): Map<number, { hash: string; completed: boolean }> => {
    const extracted = extractActions(analysis)
    const state = actionState[reviewId] ?? {}
    const map = new Map<number, { hash: string; completed: boolean }>()
    for (const action of extracted) {
      map.set(action.lineIndex, { hash: action.hash, completed: state[action.hash] ?? false })
    }
    return map
  }

  const getActionProgress = (reviewId: string, analysis: string | null): { total: number; completed: number } => {
    if (!analysis) return { total: 0, completed: 0 }
    const extracted = extractActions(analysis)
    const state = actionState[reviewId] ?? {}
    const completed = extracted.filter(a => state[a.hash]).length
    return { total: extracted.length, completed }
  }

  const handleRunReview = async () => {
    if (!running) {
      setRunning('confirm')
      setRunResult(null)
      return
    }
    if (running === 'confirm') {
      setRunning('running')
      try {
        const res = await fetch('/api/monitor/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'review-dashboard' }),
        })
        const body = await res.json()
        if (res.ok) {
          setRunResult({ ok: true, message: body.status === 'triggered' ? 'Review triggered — running in background (~60s)' : 'Review completed' })
          setTimeout(fetchReviews, 5000)
          setTimeout(fetchReviews, 30000)
          setTimeout(fetchReviews, 90000)
        } else {
          setRunResult({ ok: false, message: body.error || `Failed (${res.status})` })
        }
      } catch {
        setRunResult({ ok: false, message: 'Network error' })
      }
      setRunning(null)
    }
  }

  const latest = reviews.find(r => r.status === 'completed')

  const formatReviewTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }) + ' AEST'
  }

  const now2 = new Date()
  const monthReviews = reviews.filter(r => {
    const d = new Date(r.created_at)
    return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear() && r.status === 'completed'
  })
  const totalCostMonth = monthReviews.reduce((s, r) => s + (r.token_usage?.cost_estimate ?? 0), 0)
  const avgCostReview = monthReviews.length > 0 ? totalCostMonth / monthReviews.length : 0

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Loading reviews...</Mono>
      </div>
    )
  }

  const latestProgress = latest ? getActionProgress(latest.id, latest.analysis) : null
  const latestAllDone = latestProgress && latestProgress.total > 0 && latestProgress.completed === latestProgress.total
  const previousReviewsList = latestAllDone ? reviews : reviews.filter(r => r !== latest)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>AI Dashboard Review</span>
          <Mono style={{ fontSize: 10, color: C.t3 }}>Opus 4.6 · twice daily</Mono>
          {latest && (
            <Mono style={{ fontSize: 10, color: C.t3 }}>
              Last review: {formatReviewTime(latest.created_at)} ({timeAgo(latest.created_at)})
            </Mono>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {runResult && (
            <Mono style={{ fontSize: 10, color: runResult.ok ? C.green : C.red }}>{runResult.message}</Mono>
          )}
          {running === 'confirm' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mono style={{ fontSize: 10, color: C.orange }}>Run review now?</Mono>
              <button onClick={handleRunReview} style={{
                fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.green, background: C.greenDim,
                border: `1px solid ${C.green}22`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              }}>Yes</button>
              <button onClick={() => setRunning(null)} style={{
                fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              }}>No</button>
            </div>
          ) : running === 'running' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 12, height: 12, border: `2px solid ${C.t4}`, borderTopColor: C.purple,
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              <Mono style={{ fontSize: 10, color: C.purple }}>Running review...</Mono>
            </div>
          ) : (
            <button onClick={handleRunReview} style={{
              fontFamily: F.mono, fontSize: 10, fontWeight: 500, color: C.purple, background: C.purpleDim,
              border: `1px solid ${C.purple}22`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>Run Review</button>
          )}
        </div>
      </div>

      {/* Cost stats — scoped to current calendar month */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: C.border, borderRadius: 16, overflow: 'hidden' }}>
        <StatBox label="Reviews This Month" value={monthReviews.length} color={C.purple} />
        <StatBox label="Avg Duration" value={monthReviews.filter(r => r.duration_ms).length > 0
          ? `${Math.round(monthReviews.filter(r => r.duration_ms).reduce((s, r) => s + (r.duration_ms ?? 0), 0) / monthReviews.filter(r => r.duration_ms).length / 1000)}s`
          : '—'} color={C.text} />
        <StatBox label="Avg Cost/Review" value={monthReviews.length > 0 ? `$${avgCostReview.toFixed(3)}` : '—'} color={C.text} sub="Opus 4.6" />
        <StatBox label="Cost This Month" value={`$${totalCostMonth.toFixed(2)}`} color={totalCostMonth > 15 ? C.orange : C.text} />
      </div>

      {/* Latest review — collapses into previous list when all actions are done */}
      {latest && !latestAllDone ? (
        <Card title="Latest Review" right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {latestProgress && latestProgress.total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(latestProgress.completed / latestProgress.total) * 100}%`, background: latestProgress.completed === latestProgress.total ? C.green : C.purple, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <Mono style={{ fontSize: 10, color: latestProgress.completed === latestProgress.total ? C.green : C.purple }}>
                  {latestProgress.completed}/{latestProgress.total} actions
                </Mono>
              </div>
            )}
            {latest.token_usage && (
              <Mono style={{ fontSize: 10, color: C.t3 }}>
                {latest.token_usage.input_tokens.toLocaleString()} in · {latest.token_usage.output_tokens.toLocaleString()} out · ${latest.token_usage.cost_estimate.toFixed(3)}
              </Mono>
            )}
            {latest.duration_ms && (
              <Mono style={{ fontSize: 10, color: C.t3 }}>{(latest.duration_ms / 1000).toFixed(1)}s</Mono>
            )}
          </div>
        }>
          <div>{latest.analysis ? renderMarkdown(
            latest.analysis,
            buildActionLineMap(latest.id, latest.analysis),
            (hash, text, completed) => handleToggleAction(latest.id, hash, text, completed),
          ) : <Mono style={{ fontSize: 12, color: C.t3 }}>No analysis available</Mono>}</div>
        </Card>
      ) : !latest ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Mono style={{ fontSize: 13, color: C.t3 }}>No reviews yet. Click "Run Review" to generate the first one.</Mono>
          </div>
        </Card>
      ) : null}

      {/* Previous reviews */}
      {previousReviewsList.length > 0 && (
        <Card title={latestAllDone ? 'Reviews' : 'Previous Reviews'} pad={false}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {previousReviewsList.map((review, i) => {
              const progress = review.action_total ? { total: review.action_total, completed: review.action_completed ?? 0 } : null
              return (
                <div key={review.id}>
                  <div
                    onClick={() => {
                      const newId = expandedId === review.id ? null : review.id
                      setExpandedId(newId)
                      if (newId && review.analysis) fetchActionsForReview(review.id)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
                      borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.t3, transform: expandedId === review.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>{'▶'}</span>
                    <Mono style={{ fontSize: 11, color: C.t2, width: 160 }}>{formatReviewTime(review.created_at)}</Mono>
                    <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(review.created_at)}</Mono>
                    <div style={{ flex: 1 }} />
                    {progress && progress.total > 0 && (
                      <Mono style={{
                        fontSize: 10,
                        color: progress.completed === progress.total ? C.green : progress.completed > 0 ? C.orange : C.t3,
                      }}>
                        {progress.completed}/{progress.total}
                      </Mono>
                    )}
                    <Badge
                      text={review.status}
                      color={review.status === 'completed' ? C.green : review.status === 'failed' ? C.red : C.orange}
                      bg={review.status === 'completed' ? C.greenDim : review.status === 'failed' ? C.redDim : C.orangeDim}
                    />
                    {review.duration_ms && (
                      <Mono style={{ fontSize: 10, color: C.t3 }}>{(review.duration_ms / 1000).toFixed(1)}s</Mono>
                    )}
                    {review.token_usage && (
                      <Mono style={{ fontSize: 10, color: C.t3 }}>${review.token_usage.cost_estimate.toFixed(3)}</Mono>
                    )}
                  </div>
                  {expandedId === review.id && review.analysis && (
                    <div style={{ padding: '16px 24px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
                      {(() => {
                        const prog = getActionProgress(review.id, review.analysis)
                        return prog.total > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(prog.completed / prog.total) * 100}%`, background: prog.completed === prog.total ? C.green : C.purple, borderRadius: 2, transition: 'width 0.3s' }} />
                            </div>
                            <Mono style={{ fontSize: 10, color: prog.completed === prog.total ? C.green : C.purple }}>
                              {prog.completed} / {prog.total} actions completed
                            </Mono>
                          </div>
                        ) : null
                      })()}
                      {renderMarkdown(
                        review.analysis,
                        buildActionLineMap(review.id, review.analysis),
                        (hash, text, completed) => handleToggleAction(review.id, hash, text, completed),
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── COMBINED CRONS TAB ──────────────────────────────────────────
function CombinedCronsTab({ data }: { data: MonitorData }) {
  const headers = ['Pipeline', 'Frequency', 'Schedule', 'Step', '']
  const cols = '240px 140px 140px 120px 40px'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Schedule section on top */}
      <ScheduleTab data={data} />

      {/* All registered pipelines */}
      <Card pad={false}>
        <div style={{ padding: '20px 24px 0' }}><SecLabel>All Cron Endpoints · {PIPELINES.length} registered</SecLabel></div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 0, padding: '12px 24px 8px', borderBottom: `1px solid ${C.border}`, minWidth: 680 }}>
            {headers.map(h => <Mono key={h} style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</Mono>)}
          </div>
          {PIPELINES.map((p, i) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: cols, padding: '12px 24px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', minWidth: 680, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{p.name}</span>
              <Mono style={{ fontSize: 11, color: C.t3 }}>{p.freq}</Mono>
              <Mono style={{ fontSize: 11, color: C.t2 }}>{p.schedule}</Mono>
              <Badge text={p.step} color={C.t2} bg={C.surface} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Dot color={C.green} /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── LOGIN FORM ───────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (pw: string) => Promise<boolean> }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const ok = await onLogin(password)
    if (!ok) setError('Invalid password')
    setLoading(false)
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: F.sans, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <svg viewBox="0 0 344.26 344.26" fill="currentColor" style={{ height: 24, color: C.text }}>
            <path d="M326.84,0H17.42C7.8,0,0,7.8,0,17.42v309.42c0,9.62,7.8,17.42,17.42,17.42h309.42c9.62,0,17.42-7.8,17.42-17.42V17.42c0-9.62-7.8-17.42-17.42-17.42h0ZM202.31,59.23l20.07,14.45-9.53,82.75,42.82-58.44,18.2,13.13-44.86,61.81-36.31-26.46,9.6-87.24h0ZM91.88,95.87l75.69,34.68-42.29-58.93,18.21-13.13,44.87,61.67-36.35,26.51-79.88-36.08,19.77-14.72h-.02ZM72.63,227.06l56.72-61.62-69.2,22.13-7.01-21.29,72.57-23.53,13.86,42.72-59.02,64.79-7.92-23.2h0ZM191.5,285.76l-41.01-73.18-.25,72.91-22.71.1v-76.33l45.12-.1,43.34,76.16-24.5.43h0ZM283.79,190.87l-81.46,16.43,68.43,22.63-6.7,21.49-72.53-23.52,13.86-42.78,85.71-17.72-7.32,23.47h.01Z" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Fabric Monitor</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: F.mono, fontSize: 11, color: C.t3, display: 'block', marginBottom: 6 }}>CRON SECRET</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, fontFamily: F.mono, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {error && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.red, marginBottom: 12 }}>{error}</div>}
          <button type="submit" disabled={loading || !password} style={{
            width: '100%', padding: '10px 0', background: C.blue, color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !password ? 0.5 : 1,
          }}>{loading ? 'Authenticating...' : 'Sign In'}</button>
        </form>
      </div>
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────
export default function MonitorDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null) // null = checking
  const [data, setData] = useState<MonitorData | null>(null)
  const [tab, setTab] = useState('health')
  const [now, setNow] = useState(new Date())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyJson = () => {
    if (!data) return
    const summary = {
      overview: data.overview,
      systemStatus: data.health.systemStatus,
      scoring: data.health.scoring,
      github: data.health.github,
      assessments: data.health.assessments,
      endpoints: (data.health.endpoints ?? []).filter(e => e.status !== 'up'),
      crons: (data.health.cronHealth ?? []).filter(c => c.status !== 'on_schedule'),
      cves: data.cves,
      incidents: data.incidents,
      schedule: data.schedule,
      unscoredCount: data.unscoredSlugs.length,
      discoveryQueuePending: data.health.supabase?.rowsDiscoveryPending ?? 0,
      costs: data.health.costs ? { todayUsd: data.health.costs.today?.cost_usd ?? 0, monthUsd: data.health.costs.month?.cost_usd ?? 0, monthCalls: data.health.costs.month?.calls ?? 0 } : null,
      timestamp: data.timestamp,
    }
    const text = `Review my Fabric Trust Index monitor dashboard data. Flag critical issues, warnings, and recommendations with specific actions.\n\n` + JSON.stringify(summary, null, 2)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor')
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setData(json)
      setAuthed(true)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    }
  }, [])

  // Initial check + periodic refresh
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(interval); clearInterval(clock) }
  }, [fetchData])

  const handleLogin = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/monitor/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setAuthed(true)
        fetchData()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const handleDiscoveryAction = async (id: string, action: 'approve' | 'dismiss'): Promise<boolean> => {
    try {
      const res = await fetch(`/api/monitor/discovery/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error(`Discovery ${action} failed for ${id}:`, err)
        return false
      }
      // Use functional updater to avoid stale closure during bulk operations
      setData(prev => prev ? { ...prev, discoveryQueue: prev.discoveryQueue.filter(d => d.id !== id) } : prev)
      return true
    } catch (err) {
      console.error('Discovery action failed:', err)
      return false
    }
  }

  // Loading state
  if (authed === null) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Loading...</Mono>
      </div>
    )
  }

  // Login form
  if (!authed) {
    return <LoginForm onLogin={handleLogin} />
  }

  // Loading data
  if (!data) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Fetching dashboard data...</Mono>
      </div>
    )
  }

  const d = data.overview

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: F.sans, color: C.text, WebkitFontSmoothing: 'antialiased', display: 'flex', flexDirection: 'column' }}>
      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 56, background: '#000', borderBottom: `1px solid ${C.border}`, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg viewBox="0 0 344.26 344.26" fill="currentColor" style={{ height: 20, color: C.text }}>
            <path d="M326.84,0H17.42C7.8,0,0,7.8,0,17.42v309.42c0,9.62,7.8,17.42,17.42,17.42h309.42c9.62,0,17.42-7.8,17.42-17.42V17.42c0-9.62-7.8-17.42-17.42-17.42h0ZM202.31,59.23l20.07,14.45-9.53,82.75,42.82-58.44,18.2,13.13-44.86,61.81-36.31-26.46,9.6-87.24h0ZM91.88,95.87l75.69,34.68-42.29-58.93,18.21-13.13,44.87,61.67-36.35,26.51-79.88-36.08,19.77-14.72h-.02ZM72.63,227.06l56.72-61.62-69.2,22.13-7.01-21.29,72.57-23.53,13.86,42.72-59.02,64.79-7.92-23.2h0ZM191.5,285.76l-41.01-73.18-.25,72.91-22.71.1v-76.33l45.12-.1,43.34,76.16-24.5.43h0ZM283.79,190.87l-81.46,16.43,68.43,22.63-6.7,21.49-72.53-23.52,13.86-42.78,85.71-17.72-7.32,23.47h.01Z" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>Fabric Monitor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, borderRight: `1px solid ${C.border}`, paddingRight: 16 }}>
            <Mono style={{ fontSize: 11, color: C.green }}>{d.total.toLocaleString()} services</Mono>
            <Mono style={{ fontSize: 11, color: C.t3 }}>·</Mono>
            <Mono style={{ fontSize: 11, color: C.blue }}>+{d.todayDiscovered} discovered</Mono>
            <Mono style={{ fontSize: 11, color: C.t3 }}>·</Mono>
            <Mono style={{ fontSize: 11, color: C.pink }}>{d.todayScored.toLocaleString()} scored</Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(() => {
              const status = error ? 'error' : (data?.health?.systemStatus ?? 'nominal')
              const statusColor = status === 'nominal' ? C.green : status === 'degraded' ? C.orange : C.red
              return (
                <>
                  <Dot color={statusColor} pulse />
                  <Mono style={{ fontSize: 12, color: statusColor }}>{status}</Mono>
                </>
              )
            })()}
          </div>
          <button onClick={handleCopyJson} style={{
            fontFamily: F.mono, fontSize: 10, color: copied ? C.green : C.t3,
            background: 'none', border: `1px solid ${copied ? C.green + '44' : C.border}`,
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s',
          }}>{copied ? 'Copied!' : 'Copy JSON'}</button>
          <Mono style={{ fontSize: 11, color: C.t3 }}>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Mono>
        </div>
      </nav>

      {/* OVERVIEW STATS */}
      <div style={{ padding: '24px 40px 0', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <Grid cols={5} gap={1}>
          <StatBox label="Total Services" value={d.total} color={C.text} />
          <StatBox label="Trusted" value={d.trusted} color={C.green} sub={`${((d.trusted / (d.total || 1)) * 100).toFixed(0)}%`} />
          <StatBox label="Caution" value={d.caution} color={C.orange} sub={`${((d.caution / (d.total || 1)) * 100).toFixed(0)}%`} />
          <StatBox label="Blocked" value={d.blocked} color={C.red} sub={`${((d.blocked / (d.total || 1)) * 100).toFixed(0)}%`} />
          <StatBox label="Pending" value={d.pending} color={C.t3} />
        </Grid>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, padding: '0 40px', background: 'rgba(255,255,255,0.01)', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: F.mono, fontSize: 12, color: tab === t.id ? C.pink : C.t3,
            background: 'none', border: 'none', cursor: 'pointer', padding: '14px 20px',
            borderBottom: tab === t.id ? `2px solid ${C.pink}` : '2px solid transparent',
            transition: 'all 0.15s', letterSpacing: 0.3,
          }}>{t.label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: '24px 40px 60px', maxWidth: 1400, margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>
        {tab === 'health' && <HealthTab data={data} />}
        {tab === 'activity' && <ActivityTab data={data} />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'discovery' && <DiscoveryTab data={data} onAction={handleDiscoveryAction} onRefresh={fetchData} />}
        {tab === 'marketing' && <MarketingTab />}
        {tab === 'networking' && <NetworkingTab />}
        {tab === 'costs' && <CostsTab githubRate={data.health.github} vercelData={data.health.vercel} />}
        {tab === 'crons' && <CombinedCronsTab data={data} />}
        {tab === 'alerts' && <AlertsTab data={data} />}
        {tab === 'submissions' && <SubmissionsTab />}
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.border}`, height: 56, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: C.t3 }}>© 2026 Fabric Layer Technologies LTD · <span style={{ color: C.t2 }}>Motherbird</span></span>
        <Mono style={{ fontSize: 11, color: C.t3 }}>fabric monitor v1.0 · last refresh: {timeAgo(data.timestamp)}</Mono>
      </footer>
    </div>
  )
}
