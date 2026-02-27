'use client'

import { useState, useEffect, useCallback } from 'react'

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
    supabase: { rowsServices: number; rowsSignalHistory: number; rowsIncidents: number; rowsCveRecords: number; rowsDiscoveryQueue: number }
    github: { rateRemaining: number; rateLimit: number; resetsAt: string | null }
    vercel: { functionsInvoked: number; errors: number; avgLatency: number; p99Latency: number } | null
    scoring: {
      confidenceHigh: number; confidenceMed: number; confidenceLow: number; confidenceMinimal: number
      fallbackRates: Record<string, number>; staleCount: number; overrideCounts: Record<string, number>
    }
    assessments: { total: number; pending: number }
  }
  cves: { total: number; critical: number; high: number; medium: number; low: number; unpatched: number }
  incidents: { total: number; unresolved: number; critical: number; warning: number; info: number }
  discoveryQueue: DiscoveryItem[]
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
const srcLabel = (s: string) => s === 'producthunt' ? 'Product Hunt' : s === 'github-trending' ? 'GitHub Trending' : s === 'hackernews' ? 'Hacker News' : s === 'yc-launches' ? 'YC Launches' : s === 'watchlist' ? 'Watchlist' : s

const TABS = [
  { id: 'health', label: 'System Health' },
  { id: 'activity', label: 'Activity' },
  { id: 'pipeline', label: 'Schedule' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'overrides', label: 'Overrides & CVEs' },
  { id: 'crons', label: 'All Crons' },
]

// ─── OVERRIDE DEFINITIONS ─────────────────────────────────────────
const OVERRIDE_DEFS: Record<string, { effect: string; trigger: string; sev: string }> = {
  vulnerability_zero_override: { effect: '→ signal=0, blocked', trigger: 'Critical/high CVE with no patch available', sev: 'critical' },
  vulnerability_patch_available: { effect: '→ signal≤1.5, caution', trigger: 'Critical/high CVE with patch available but not applied', sev: 'warning' },
  zero_signal_override: { effect: '→ capped 3.24', trigger: 'Any signal = 0.0 (with real data)', sev: 'warning' },
  repo_archived: { effect: '→ 0.99 blocked', trigger: 'GitHub repo is archived', sev: 'critical' },
  npm_deprecated: { effect: '→ 0.99 blocked', trigger: 'npm deprecated flag set', sev: 'critical' },
  vt_suspicious_override: { effect: '→ capped 3.24', trigger: 'VirusTotal suspicious (score ≤ 2.0)', sev: 'warning' },
  vt_scan_override: { effect: '→ 0.99 blocked', trigger: 'VirusTotal confirms malware', sev: 'critical' },
  malware_blocked: { effect: '→ 0.99 blocked', trigger: 'VirusTotal confirms malware', sev: 'critical' },
  content_safety_override: { effect: '→ 0.99 blocked', trigger: 'Content safety critical failure', sev: 'critical' },
  content_safety_caution_override: { effect: '→ capped 3.24', trigger: 'Content safety suspicious', sev: 'warning' },
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
      </Card>

      {/* AI Assessments + Quick Numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="AI Assessments">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Total generated</Mono><Mono style={{ fontSize: 12, color: C.text }}>{h.assessments.total.toLocaleString()}</Mono></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Mono style={{ fontSize: 12, color: C.t2 }}>Pending</Mono><Mono style={{ fontSize: 12, color: h.assessments.pending > 100 ? C.orange : C.text }}>{h.assessments.pending}</Mono></div>
          </div>
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
  const events = data.events ?? []
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
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: C.border, borderRadius: 16, overflow: 'hidden' }}>
        {Object.entries(ACTIVITY_TYPES).map(([type, cfg]) => (
          <div key={type} style={{ background: C.surface, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: F.sans, fontSize: 24, fontWeight: 700, color: cfg.color, letterSpacing: -1 }}>{(counts[type] ?? 0).toLocaleString()}</div>
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cfg.label}</div>
          </div>
        ))}
      </div>

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
              <Dot color={cron.color} pulse={progress.pct > 0 && progress.pct < 100} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 160 }}>{cron.name}</span>
              <Mono style={{ fontSize: 11, color: C.t3, minWidth: 110 }}>{cron.schedule}</Mono>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Run button / confirmation / spinner */}
                {cronState === 'running' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 12, height: 12, border: `2px solid ${C.t4}`, borderTopColor: cron.color,
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                    <Mono style={{ fontSize: 10, color: cron.color }}>Running...</Mono>
                  </div>
                ) : cronState === 'confirm' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mono style={{ fontSize: 10, color: C.orange }}>Run {cron.name}?</Mono>
                    <button onClick={() => handleRun(cron.id, cron.name)} style={{
                      fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.green, background: C.greenDim,
                      border: `1px solid ${C.green}22`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                    }}>Yes</button>
                    <button onClick={() => cancelConfirm(cron.id)} style={{
                      fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent',
                      border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                    }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => handleRun(cron.id, cron.name)} style={{
                    fontFamily: F.mono, fontSize: 10, fontWeight: 500, color: C.t2, background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 12px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>Run</button>
                )}
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
function DiscoveryTab({ data, onAction, onRefresh }: { data: MonitorData; onAction: (id: string, action: 'approve' | 'dismiss') => void; onRefresh: () => void }) {
  const [filter, setFilter] = useState('all')
  const [acting, setActing] = useState<string | null>(null)

  const items = data.discoveryQueue
  const filtered = filter === 'all' ? items : items.filter(i => i.source === filter)

  const handleAction = async (id: string, action: 'approve' | 'dismiss') => {
    setActing(id)
    await onAction(id, action)
    setActing(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
        <div style={{ marginLeft: 'auto' }}><Badge text={`${items.length} pending review`} color={C.orange} bg={C.orangeDim} /></div>
      </div>

      {/* Review table */}
      <Card pad={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px 180px 1fr 90px 70px 120px', gap: 0, padding: '10px 24px', borderBottom: `1px solid ${C.border}` }}>
          {['', 'Service', 'Description', 'Source', 'Stars', 'Actions'].map(h => (
            <Mono key={h} style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</Mono>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>No pending discoveries{filter !== 'all' ? ` from ${srcLabel(filter)}` : ''}</Mono></div>
        ) : filtered.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px 180px 1fr 90px 70px 120px', gap: 0, padding: '12px 24px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', opacity: acting === item.id ? 0.5 : 1 }}>
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
    </div>
  )
}

// ─── OVERRIDES & CVEs TAB ─────────────────────────────────────────
function OverridesTab({ data }: { data: MonitorData }) {
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
      <Card title="Active Overrides" right={<Mono style={{ fontSize: 10, color: C.t3 }}>{totalOverrides} total active</Mono>} pad={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
          {overrides.length === 0 ? (
            <Row><Mono style={{ fontSize: 12, color: C.t3 }}>No active overrides</Mono></Row>
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

      <Card title="CVE Summary">
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

// ─── ALL CRONS TAB ────────────────────────────────────────────────
function CronsTab() {
  const headers = ['Pipeline', 'Frequency', 'Schedule', 'Step', '']
  const cols = '240px 140px 140px 120px 40px'
  return (
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
    const text = `Review my Fabric Trust Index monitor dashboard data. Flag critical issues, warnings, and recommendations with specific actions.\n\n` + JSON.stringify(data, null, 2)
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
    const interval = setInterval(fetchData, 30000)
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

  const handleDiscoveryAction = async (id: string, action: 'approve' | 'dismiss') => {
    try {
      const res = await fetch(`/api/monitor/discovery/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok && data) {
        setData({ ...data, discoveryQueue: data.discoveryQueue.filter(d => d.id !== id) })
      }
    } catch (err) {
      console.error('Discovery action failed:', err)
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
            <Dot color={error ? C.red : C.green} pulse />
            <Mono style={{ fontSize: 12, color: error ? C.red : C.green }}>{error ? 'error' : 'nominal'}</Mono>
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
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, padding: '0 40px', background: 'rgba(255,255,255,0.01)' }}>
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
        {tab === 'pipeline' && <ScheduleTab data={data} />}
        {tab === 'discovery' && <DiscoveryTab data={data} onAction={handleDiscoveryAction} onRefresh={fetchData} />}
        {tab === 'overrides' && <OverridesTab data={data} />}
        {tab === 'crons' && <CronsTab />}
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.border}`, height: 56, padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: C.t3 }}>© 2026 Fabric Layer Technologies LTD · <span style={{ color: C.t2 }}>Motherbird</span></span>
        <Mono style={{ fontSize: 11, color: C.t3 }}>fabric monitor v1.0 · last refresh: {timeAgo(data.timestamp)}</Mono>
      </footer>
    </div>
  )
}
