'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── DESIGN TOKENS (synced with MonitorDashboard.tsx) ────────────
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

// ─── TYPES ───────────────────────────────────────────────────────
interface MTask { id: string; section: string; title: string; subtitle: string | null; note: string | null; priority: string; status: string; sort_order: number }
interface MContent { id: string; title: string; type: string; platform: string; target_date: string | null; status: string; url: string | null; notes: string | null; content_body: string | null; sort_order: number }
interface MKol { id: string; name: string; handle: string; platform: string; tier: number; followers: string | null; stage: string; engagement_count: number; last_engaged_at: string | null; notes: string | null }
interface MNetworking { id: string; project_name: string; handle: string | null; platform: string; trust_page_slug: string | null; stage: string; engagement_count: number; last_contacted_at: string | null; notes: string | null }
interface MKpi { id: string; metric: string; month: number; target: number; actual: number }
interface MData { tasks: MTask[]; content: MContent[]; kols: MKol[]; kpis: MKpi[]; networking: MNetworking[] }

// ─── ATOMS ───────────────────────────────────────────────────────
function Mono({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: F.mono, ...s }}>{children}</span>
}
function SecLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>{children}</div>
}
function Badge({ text, color, bg, onClick, style: s }: { text: string; color: string; bg: string; onClick?: () => void; style?: React.CSSProperties }) {
  return <span onClick={onClick} style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 20, color, background: bg, border: `1px solid ${color}22`, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s', ...s }}>{text}</span>
}
function Card({ children, title, right, pad = true }: { children: React.ReactNode; title?: string; right?: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {title && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0' }}><SecLabel>{title}</SecLabel>{right}</div>}
      {pad ? <div style={{ padding: title ? '12px 24px 20px' : '20px 24px' }}>{children}</div> : children}
    </div>
  )
}
function Bar({ pct, color, h = 5 }: { pct: number; color: string; h?: number }) {
  return (
    <div style={{ flex: 1, height: h, background: 'rgba(255,255,255,0.06)', borderRadius: h / 2, overflow: 'hidden', minWidth: 40 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: h / 2, opacity: 0.65, transition: 'width 0.8s ease' }} />
    </div>
  )
}
function Checkbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onClick() }} style={{
      width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
      border: `1.5px solid ${checked ? C.green : C.t3}`,
      background: checked ? C.green : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    }}>
      {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: F.sans, fontSize: 13, background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 12px', outline: 'none',
}
const selectStyle: React.CSSProperties = {
  fontFamily: F.mono, fontSize: 11, background: C.surfaceAlt,
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px',
}
const addBtnStyle: React.CSSProperties = {
  fontFamily: F.mono, fontSize: 11, color: C.blue, background: C.blueDim,
  border: `1px solid ${C.blue}22`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer',
}
const submitBtnStyle: React.CSSProperties = {
  fontFamily: F.mono, fontSize: 11, color: '#000', background: C.green,
  border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600,
}

// ─── CONSTANTS ───────────────────────────────────────────────────
const KOL_STAGES = ['follow', 'like', 'reply', 'quote-tweet', 'dm', 'relationship'] as const
const STAGE_COLORS: Record<string, { color: string; bg: string }> = {
  follow: { color: C.t3, bg: 'rgba(255,255,255,0.05)' },
  like: { color: C.blue, bg: C.blueDim },
  reply: { color: C.green, bg: C.greenDim },
  'quote-tweet': { color: C.purple, bg: C.purpleDim },
  dm: { color: C.orange, bg: C.orangeDim },
  relationship: { color: C.pink, bg: C.pinkDim },
}

const NETWORKING_STAGES = ['identified', 'followed', 'engaged', 'sent-page', 'responded', 'relationship'] as const
const NETWORKING_STAGE_COLORS: Record<string, { color: string; bg: string }> = {
  identified: { color: C.t3, bg: 'rgba(255,255,255,0.05)' },
  followed: { color: C.blue, bg: C.blueDim },
  engaged: { color: C.green, bg: C.greenDim },
  'sent-page': { color: C.orange, bg: C.orangeDim },
  responded: { color: C.purple, bg: C.purpleDim },
  relationship: { color: C.pink, bg: C.pinkDim },
}

const CONTENT_STATUSES = ['idea', 'draft', 'ready', 'published', 'skipped'] as const
const CONTENT_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  idea: { color: C.t3, bg: 'rgba(255,255,255,0.05)' },
  draft: { color: C.blue, bg: C.blueDim },
  ready: { color: C.orange, bg: C.orangeDim },
  published: { color: C.green, bg: C.greenDim },
  skipped: { color: C.t3, bg: 'rgba(255,255,255,0.03)' },
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  'hn-post': { color: C.orange, bg: C.orangeDim },
  'x-article': { color: C.blue, bg: C.blueDim },
  blog: { color: C.purple, bg: C.purpleDim },
  tweet: { color: C.blue, bg: C.blueDim },
  thread: { color: C.blue, bg: C.blueDim },
  linkedin: { color: C.blue, bg: C.blueDim },
  reddit: { color: C.orange, bg: C.orangeDim },
  youtube: { color: C.red, bg: C.redDim },
}

const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  P0: { color: C.red, bg: C.redDim },
  P1: { color: C.orange, bg: C.orangeDim },
  P2: { color: C.blue, bg: C.blueDim },
  DIR: { color: C.purple, bg: C.purpleDim },
}

const KPI_LABELS: Record<string, string> = {
  trust_index_visitors: 'Trust Index Visitors',
  x_followers: 'X Followers',
  api_waitlist: 'API Waitlist',
  blog_views: 'Blog Views',
  backlinks: 'Backlinks',
  organic_search: 'Organic Search',
  hn_front_page: 'HN Front Page',
  newsletter_mentions: 'Newsletter Mentions',
  kol_interactions: 'KOL Interactions',
}

const timeAgo = (iso: string | null) => {
  if (!iso) return '-'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

const profileUrl = (handle: string, platform: string) => {
  if (platform === 'x') return `https://x.com/${handle.replace('@', '')}`
  if (platform === 'bluesky') return `https://bsky.app/profile/${handle.replace('@', '')}`
  if (platform === 'linkedin') return `https://linkedin.com/in/${handle.replace('@', '')}`
  return `https://x.com/${handle.replace('@', '')}`
}

// ─── POST HELPER ─────────────────────────────────────────────────
async function postMarketing(body: Record<string, unknown>) {
  await fetch('/api/monitor/marketing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── KPI SCOREBOARD ──────────────────────────────────────────────
function KpiSection({ kpis, onUpdate }: { kpis: MKpi[]; onUpdate: (id: string, actual: number) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const now = new Date()
  const currentMonth = now.getMonth() === 2 ? 1 : now.getMonth() === 3 ? 2 : now.getMonth() === 4 ? 3 : 1
  const monthKpis = kpis.filter(k => k.month === currentMonth)

  const pctColor = (pct: number) => pct >= 75 ? C.green : pct >= 25 ? C.orange : C.red

  return (
    <Card title="KPI Scoreboard" right={<Mono style={{ fontSize: 11, color: C.t3 }}>Month {currentMonth}</Mono>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {monthKpis.map(k => {
          const pct = k.target > 0 ? Math.round((k.actual / k.target) * 100) : 0
          const isEditing = editingId === k.id
          return (
            <div key={k.id} style={{ background: C.surfaceAlt, borderRadius: 12, padding: '16px 18px', border: `1px solid ${C.border}` }}>
              <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>{KPI_LABELS[k.metric] ?? k.metric}</Mono>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onUpdate(k.id, Number(editVal) || 0); setEditingId(null) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => { onUpdate(k.id, Number(editVal) || 0); setEditingId(null) }}
                    style={{ fontFamily: F.sans, fontSize: 24, fontWeight: 700, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 6, color: C.text, width: 80, padding: '2px 6px', outline: 'none' }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingId(k.id); setEditVal(String(k.actual)) }}
                    style={{ fontFamily: F.sans, fontSize: 24, fontWeight: 700, color: pctColor(pct), cursor: 'pointer', lineHeight: 1 }}
                  >{k.actual.toLocaleString()}</span>
                )}
                <Mono style={{ fontSize: 12, color: C.t3 }}>/ {k.target.toLocaleString()}</Mono>
              </div>
              <div style={{ marginTop: 8 }}><Bar pct={pct} color={pctColor(pct)} h={4} /></div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── CONTENT PIPELINE ────────────────────────────────────────────
function ContentSection({ content, onChange, onCreate, onDelete }: {
  content: MContent[]
  onChange: (id: string, updates: Partial<MContent>) => void
  onCreate: (item: { title: string; type: string; platform: string; content_body?: string }) => void
  onDelete: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState('blog')
  const [newPlatform, setNewPlatform] = useState('x')
  const [newBody, setNewBody] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingBodyId, setEditingBodyId] = useState<string | null>(null)
  const [editBodyVal, setEditBodyVal] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const cycleStatus = (current: string) => {
    const idx = CONTENT_STATUSES.indexOf(current as typeof CONTENT_STATUSES[number])
    return CONTENT_STATUSES[(idx + 1) % CONTENT_STATUSES.length]
  }

  const handleAdd = () => {
    if (!newTitle.trim()) return
    onCreate({ title: newTitle.trim(), type: newType, platform: newPlatform, content_body: newBody.trim() || undefined })
    setNewTitle('')
    setNewBody('')
    setShowAdd(false)
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSaveBody = (id: string) => {
    onChange(id, { content_body: editBodyVal || null } as Partial<MContent>)
    setEditingBodyId(null)
  }

  return (
    <Card title="Content Pipeline" right={
      <button onClick={() => setShowAdd(!showAdd)} style={addBtnStyle}>+ Add</button>
    }>
      {showAdd && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              autoFocus
              placeholder="Content title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !newBody && handleAdd()}
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            />
            <select value={newType} onChange={e => setNewType(e.target.value)} style={selectStyle}>
              {['blog', 'x-article', 'hn-post', 'tweet', 'thread', 'linkedin', 'reddit', 'youtube'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} style={selectStyle}>
              {['x', 'hackernews', 'devto', 'hashnode', 'linkedin', 'reddit', 'youtube', 'bluesky'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={handleAdd} style={submitBtnStyle}>Add</button>
          </div>
          <textarea
            placeholder="Content body (optional)..."
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 80px 40px', gap: 12, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
          <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TITLE</Mono>
          <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TYPE</Mono>
          <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>PLATFORM</Mono>
          <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TARGET</Mono>
          <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>STATUS</Mono>
          <span />
        </div>
        {content.map(item => {
          const sc = CONTENT_STATUS_COLORS[item.status] ?? CONTENT_STATUS_COLORS.idea
          const tc = TYPE_COLORS[item.type] ?? { color: C.t3, bg: 'rgba(255,255,255,0.05)' }
          const isExpanded = expandedId === item.id
          const isEditingBody = editingBodyId === item.id
          return (
            <div key={item.id} style={{ background: C.surface }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 80px 40px', gap: 12, padding: '10px 16px', alignItems: 'center' }}>
                <div>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{ fontFamily: F.sans, fontSize: 13, color: item.status === 'skipped' ? C.t3 : C.text, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <span style={{ fontSize: 10, color: C.t3, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
                    {item.title}
                    {item.content_body && <span style={{ fontSize: 9, color: C.t3, fontFamily: F.mono }}>({item.content_body.length}c)</span>}
                  </div>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 10, color: C.blue, textDecoration: 'none' }}>{item.url.replace(/^https?:\/\//, '').slice(0, 40)}</a>}
                  {item.notes && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, marginTop: 2 }}>{item.notes}</div>}
                </div>
                <Badge text={item.type} color={tc.color} bg={tc.bg} />
                <Mono style={{ fontSize: 11, color: C.t2 }}>{item.platform}</Mono>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{item.target_date ?? '-'}</Mono>
                <Badge text={item.status} color={sc.color} bg={sc.bg} onClick={() => onChange(item.id, { status: cycleStatus(item.status) })} />
                <button
                  onClick={() => { if (confirm('Delete this content item?')) onDelete(item.id) }}
                  style={{ fontFamily: F.mono, fontSize: 12, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  title="Delete"
                >&times;</button>
              </div>
              {/* Expanded content body */}
              {isExpanded && (
                <div style={{ padding: '0 16px 14px 36px', borderTop: `1px solid ${C.border}` }}>
                  {isEditingBody ? (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        autoFocus
                        value={editBodyVal}
                        onChange={e => setEditBodyVal(e.target.value)}
                        rows={8}
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 120, fontSize: 12, fontFamily: F.mono, lineHeight: 1.6 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleSaveBody(item.id)} style={submitBtnStyle}>Save</button>
                        <button onClick={() => setEditingBodyId(null)} style={{ ...addBtnStyle, color: C.t2, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}` }}>Cancel</button>
                      </div>
                    </div>
                  ) : item.content_body ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => handleCopy(item.content_body!, item.id)}
                          style={{ ...addBtnStyle, fontSize: 10, padding: '3px 10px', color: copiedId === item.id ? C.green : C.blue, background: copiedId === item.id ? C.greenDim : C.blueDim }}
                        >{copiedId === item.id ? 'Copied!' : 'Copy'}</button>
                        <button
                          onClick={() => { setEditingBodyId(item.id); setEditBodyVal(item.content_body || '') }}
                          style={{ ...addBtnStyle, fontSize: 10, padding: '3px 10px' }}
                        >Edit</button>
                      </div>
                      <pre style={{
                        fontFamily: F.mono, fontSize: 12, lineHeight: 1.6, color: C.t2,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14,
                        border: `1px solid ${C.border}`, margin: 0,
                      }}>{item.content_body}</pre>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={() => { setEditingBodyId(item.id); setEditBodyVal('') }}
                        style={{ ...addBtnStyle, fontSize: 10, padding: '3px 10px' }}
                      >+ Add Content</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {content.length === 0 && (
          <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}>
            <Mono style={{ fontSize: 12, color: C.t3 }}>No content items yet</Mono>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── CHECKLIST SECTION ───────────────────────────────────────────
function ChecklistSection({ title, tasks, onToggle }: { title: string; tasks: MTask[]; onToggle: (task: MTask) => void }) {
  const done = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const groups = ['P0', 'P1', 'P2', 'DIR']
  const grouped = groups.map(p => ({ priority: p, items: tasks.filter(t => t.priority === p) })).filter(g => g.items.length > 0)

  return (
    <Card title={title} right={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mono style={{ fontSize: 11, color: pct === 100 ? C.green : C.t2 }}>{done}/{total}</Mono>
        <div style={{ width: 80 }}><Bar pct={pct} color={pct === 100 ? C.green : C.blue} h={4} /></div>
      </div>
    }>
      {grouped.map(g => {
        const gDone = g.items.filter(t => t.status === 'done').length
        const pc = PRIORITY_COLORS[g.priority] ?? { color: C.t3, bg: 'rgba(255,255,255,0.05)' }
        return (
          <div key={g.priority} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Badge text={g.priority} color={pc.color} bg={pc.bg} />
              <Mono style={{ fontSize: 10, color: C.t3 }}>{gDone}/{g.items.length}</Mono>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map(task => {
                const isDone = task.status === 'done'
                return (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px',
                    borderRadius: 8, background: isDone ? 'rgba(13,201,86,0.04)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <div style={{ paddingTop: 2 }}><Checkbox checked={isDone} onClick={() => onToggle(task)} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: F.sans, fontSize: 13, color: isDone ? C.t3 : C.text, fontWeight: 500,
                        textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.5 : 1,
                      }}>{task.title}</div>
                      {task.subtitle && <Mono style={{ fontSize: 11, color: C.t3, display: 'block', marginTop: 1 }}>{task.subtitle}</Mono>}
                      {task.note && <div style={{ fontFamily: F.sans, fontSize: 11, color: C.t3, marginTop: 2, fontStyle: 'italic' }}>{task.note}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </Card>
  )
}

// ─── KOL TRACKER ─────────────────────────────────────────────────
function KolSection({ kols, onUpdate, onEngage, onCreate }: {
  kols: MKol[]
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onEngage: (id: string) => void
  onCreate: (item: { name: string; handle: string; platform: string; tier: number; followers?: string; notes?: string }) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newPlatform, setNewPlatform] = useState('x')
  const [newTier, setNewTier] = useState(2)
  const [newFollowers, setNewFollowers] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editNotesVal, setEditNotesVal] = useState('')

  const cycleStage = (current: string) => {
    const idx = KOL_STAGES.indexOf(current as typeof KOL_STAGES[number])
    return KOL_STAGES[(idx + 1) % KOL_STAGES.length]
  }

  const handleAdd = () => {
    if (!newName.trim() || !newHandle.trim()) return
    onCreate({ name: newName.trim(), handle: newHandle.trim(), platform: newPlatform, tier: newTier, followers: newFollowers.trim() || undefined, notes: newNotes.trim() || undefined })
    setNewName(''); setNewHandle(''); setNewFollowers(''); setNewNotes(''); setShowAdd(false)
  }

  return (
    <Card title="KOL Tracker" right={
      <button onClick={() => setShowAdd(!showAdd)} style={addBtnStyle}>+ Add KOL</button>
    } pad={false}>
      {showAdd && (
        <div style={{ padding: '12px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
            <input placeholder="@handle" value={newHandle} onChange={e => setNewHandle(e.target.value)} style={{ ...inputStyle, width: 130 }} />
            <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} style={selectStyle}>
              {['x', 'bluesky', 'linkedin', 'youtube'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={newTier} onChange={e => setNewTier(Number(e.target.value))} style={selectStyle}>
              <option value={1}>Tier 1</option>
              <option value={2}>Tier 2</option>
            </select>
            <input placeholder="Followers (e.g. 12K)" value={newFollowers} onChange={e => setNewFollowers(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input placeholder="Notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleAdd} style={submitBtnStyle}>Add</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 700 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 110px 50px 70px 110px 80px 80px 1fr', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>NAME</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>HANDLE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TIER</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>FOLLOWERS</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>STAGE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>ENGAGED</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>LAST</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>NOTES</Mono>
          </div>
          {kols.map(kol => {
            const sc = STAGE_COLORS[kol.stage] ?? STAGE_COLORS.follow
            const tierColor = kol.tier === 1 ? { color: C.pink, bg: C.pinkDim } : { color: C.blue, bg: C.blueDim }
            const isEditingNotes = editingNotesId === kol.id
            return (
              <div key={kol.id} style={{ display: 'grid', gridTemplateColumns: '140px 110px 50px 70px 110px 80px 80px 1fr', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, fontWeight: 500 }}>{kol.name}</span>
                <a href={profileUrl(kol.handle, kol.platform)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, textDecoration: 'none' }}>{kol.handle}</a>
                <Badge text={`T${kol.tier}`} color={tierColor.color} bg={tierColor.bg} />
                <Mono style={{ fontSize: 12, color: C.t2 }}>{kol.followers ?? '-'}</Mono>
                <Badge text={kol.stage} color={sc.color} bg={sc.bg} onClick={() => onUpdate(kol.id, { stage: cycleStage(kol.stage) })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mono style={{ fontSize: 13, color: C.text }}>{kol.engagement_count}</Mono>
                  <button onClick={() => onEngage(kol.id)} style={{
                    fontFamily: F.mono, fontSize: 10, color: C.green, background: C.greenDim,
                    border: `1px solid ${C.green}22`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600,
                  }}>+1</button>
                </div>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(kol.last_engaged_at)}</Mono>
                <div style={{ overflow: 'hidden' }}>
                  {isEditingNotes ? (
                    <input
                      autoFocus
                      value={editNotesVal}
                      onChange={e => setEditNotesVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { onUpdate(kol.id, { notes: editNotesVal || null }); setEditingNotesId(null) }
                        if (e.key === 'Escape') setEditingNotesId(null)
                      }}
                      onBlur={() => { onUpdate(kol.id, { notes: editNotesVal || null }); setEditingNotesId(null) }}
                      style={{ fontFamily: F.mono, fontSize: 11, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 6px', outline: 'none', width: '100%' }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingNotesId(kol.id); setEditNotesVal(kol.notes || '') }}
                      style={{ fontFamily: F.mono, fontSize: 11, color: kol.notes ? C.t2 : C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'pointer' }}
                    >{kol.notes || 'click to add note'}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ─── NETWORKING SECTION ──────────────────────────────────────────
function NetworkingSection({ networking, onUpdate, onEngage, onCreate, onDelete }: {
  networking: MNetworking[]
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onEngage: (id: string) => void
  onCreate: (item: { project_name: string; handle: string; platform: string; trust_page_slug?: string; notes?: string }) => void
  onDelete: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newPlatform, setNewPlatform] = useState('x')
  const [newSlug, setNewSlug] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editNotesVal, setEditNotesVal] = useState('')

  const cycleStage = (current: string) => {
    const idx = NETWORKING_STAGES.indexOf(current as typeof NETWORKING_STAGES[number])
    return NETWORKING_STAGES[(idx + 1) % NETWORKING_STAGES.length]
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    onCreate({ project_name: newName.trim(), handle: newHandle.trim(), platform: newPlatform, trust_page_slug: newSlug.trim() || undefined, notes: newNotes.trim() || undefined })
    setNewName(''); setNewHandle(''); setNewSlug(''); setNewNotes(''); setShowAdd(false)
  }

  return (
    <Card title="Networking / Outreach" right={
      <button onClick={() => setShowAdd(!showAdd)} style={addBtnStyle}>+ Add Project</button>
    } pad={false}>
      {showAdd && (
        <div style={{ padding: '12px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <input placeholder="@handle" value={newHandle} onChange={e => setNewHandle(e.target.value)} style={{ ...inputStyle, width: 130 }} />
            <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} style={selectStyle}>
              {['x', 'bluesky', 'linkedin'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="Trust page slug (e.g. openai-gpt-4o)" value={newSlug} onChange={e => setNewSlug(e.target.value)} style={{ ...inputStyle, width: 200 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input placeholder="Notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleAdd} style={submitBtnStyle}>Add</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 700 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 110px 130px 110px 80px 80px 1fr 40px', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>PROJECT</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>HANDLE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TRUST PAGE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>STAGE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>CONTACT</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>LAST</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>NOTES</Mono>
            <span />
          </div>
          {networking.map(net => {
            const sc = NETWORKING_STAGE_COLORS[net.stage] ?? NETWORKING_STAGE_COLORS.identified
            const isEditingNotes = editingNotesId === net.id
            return (
              <div key={net.id} style={{ display: 'grid', gridTemplateColumns: '160px 110px 130px 110px 80px 80px 1fr 40px', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, fontWeight: 500 }}>{net.project_name}</span>
                {net.handle ? (
                  <a href={profileUrl(net.handle, net.platform)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, textDecoration: 'none' }}>{net.handle}</a>
                ) : (
                  <Mono style={{ fontSize: 11, color: C.t4 }}>-</Mono>
                )}
                {net.trust_page_slug ? (
                  <a href={`https://trust.fabriclayer.ai/${net.trust_page_slug}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{net.trust_page_slug}</a>
                ) : (
                  <Mono style={{ fontSize: 11, color: C.t4 }}>-</Mono>
                )}
                <Badge text={net.stage} color={sc.color} bg={sc.bg} onClick={() => onUpdate(net.id, { stage: cycleStage(net.stage) })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mono style={{ fontSize: 13, color: C.text }}>{net.engagement_count}</Mono>
                  <button onClick={() => onEngage(net.id)} style={{
                    fontFamily: F.mono, fontSize: 10, color: C.green, background: C.greenDim,
                    border: `1px solid ${C.green}22`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600,
                  }}>+1</button>
                </div>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(net.last_contacted_at)}</Mono>
                <div style={{ overflow: 'hidden' }}>
                  {isEditingNotes ? (
                    <input
                      autoFocus
                      value={editNotesVal}
                      onChange={e => setEditNotesVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { onUpdate(net.id, { notes: editNotesVal || null }); setEditingNotesId(null) }
                        if (e.key === 'Escape') setEditingNotesId(null)
                      }}
                      onBlur={() => { onUpdate(net.id, { notes: editNotesVal || null }); setEditingNotesId(null) }}
                      style={{ fontFamily: F.mono, fontSize: 11, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 6px', outline: 'none', width: '100%' }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingNotesId(net.id); setEditNotesVal(net.notes || '') }}
                      style={{ fontFamily: F.mono, fontSize: 11, color: net.notes ? C.t2 : C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'pointer' }}
                    >{net.notes || 'click to add note'}</span>
                  )}
                </div>
                <button
                  onClick={() => { if (confirm('Remove this project?')) onDelete(net.id) }}
                  style={{ fontFamily: F.mono, fontSize: 12, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  title="Delete"
                >&times;</button>
              </div>
            )
          })}
          {networking.length === 0 && (
            <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}>
              <Mono style={{ fontSize: 12, color: C.t3 }}>No projects yet — add one to start tracking outreach</Mono>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── MAIN MARKETING TAB ─────────────────────────────────────────
export default function MarketingTab() {
  const [data, setData] = useState<MData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/marketing')
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Mutation helpers with optimistic updates ──

  const handleToggleTask = (task: MTask) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    setData(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t) } : prev)
    postMarketing({ action: 'toggle_task', id: task.id, status: newStatus })
  }

  const handleUpdateContent = (id: string, updates: Partial<MContent>) => {
    setData(prev => prev ? { ...prev, content: prev.content.map(c => c.id === id ? { ...c, ...updates } : c) } : prev)
    postMarketing({ action: 'update_content', id, updates })
  }

  const handleCreateContent = async (item: { title: string; type: string; platform: string; content_body?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newItem: MContent = { id: tempId, ...item, target_date: null, status: 'idea', url: null, notes: null, content_body: item.content_body || null, sort_order: 0 }
    setData(prev => prev ? { ...prev, content: [newItem, ...prev.content] } : prev)
    await postMarketing({ action: 'create_content', ...item })
    fetchData()
  }

  const handleDeleteContent = (id: string) => {
    setData(prev => prev ? { ...prev, content: prev.content.filter(c => c.id !== id) } : prev)
    postMarketing({ action: 'delete_content', id })
  }

  const handleUpdateKol = (id: string, updates: Record<string, unknown>) => {
    setData(prev => prev ? { ...prev, kols: prev.kols.map(k => k.id === id ? { ...k, ...updates } : k) } : prev)
    postMarketing({ action: 'update_kol', id, updates })
  }

  const handleEngageKol = (id: string) => {
    setData(prev => prev ? {
      ...prev,
      kols: prev.kols.map(k => k.id === id ? { ...k, engagement_count: k.engagement_count + 1, last_engaged_at: new Date().toISOString() } : k),
    } : prev)
    postMarketing({ action: 'update_kol', id, updates: {}, increment_engagement: true })
  }

  const handleCreateKol = async (item: { name: string; handle: string; platform: string; tier: number; followers?: string; notes?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newKol: MKol = { id: tempId, ...item, followers: item.followers || null, stage: 'follow', engagement_count: 0, last_engaged_at: null, notes: item.notes || null }
    setData(prev => prev ? { ...prev, kols: [...prev.kols, newKol] } : prev)
    await postMarketing({ action: 'create_kol', ...item })
    fetchData()
  }

  const handleUpdateKpi = (id: string, actual: number) => {
    setData(prev => prev ? { ...prev, kpis: prev.kpis.map(k => k.id === id ? { ...k, actual } : k) } : prev)
    postMarketing({ action: 'update_kpi', id, actual })
  }

  const handleCreateNetworking = async (item: { project_name: string; handle: string; platform: string; trust_page_slug?: string; notes?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newNet: MNetworking = { id: tempId, ...item, handle: item.handle || null, trust_page_slug: item.trust_page_slug || null, stage: 'identified', engagement_count: 0, last_contacted_at: null, notes: item.notes || null }
    setData(prev => prev ? { ...prev, networking: [...prev.networking, newNet] } : prev)
    await postMarketing({ action: 'create_networking', ...item })
    fetchData()
  }

  const handleUpdateNetworking = (id: string, updates: Record<string, unknown>) => {
    setData(prev => prev ? { ...prev, networking: prev.networking.map(n => n.id === id ? { ...n, ...updates } : n) } : prev)
    postMarketing({ action: 'update_networking', id, updates })
  }

  const handleEngageNetworking = (id: string) => {
    setData(prev => prev ? {
      ...prev,
      networking: prev.networking.map(n => n.id === id ? { ...n, engagement_count: n.engagement_count + 1, last_contacted_at: new Date().toISOString() } : n),
    } : prev)
    postMarketing({ action: 'update_networking', id, updates: {}, increment_engagement: true })
  }

  const handleDeleteNetworking = (id: string) => {
    setData(prev => prev ? { ...prev, networking: prev.networking.filter(n => n.id !== id) } : prev)
    postMarketing({ action: 'delete_networking', id })
  }

  // ── Render ──

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Loading marketing data...</Mono>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Failed to load marketing data. Make sure the marketing tables exist in Supabase.</Mono>
      </div>
    )
  }

  const platformTasks = data.tasks.filter(t => t.section === 'platform')
  const seoTasks = data.tasks.filter(t => t.section === 'seo')

  return (
    <div style={{ padding: '30px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KpiSection kpis={data.kpis} onUpdate={handleUpdateKpi} />
      <ContentSection content={data.content} onChange={handleUpdateContent} onCreate={handleCreateContent} onDelete={handleDeleteContent} />
      <KolSection kols={data.kols} onUpdate={handleUpdateKol} onEngage={handleEngageKol} onCreate={handleCreateKol} />
      <NetworkingSection networking={data.networking ?? []} onUpdate={handleUpdateNetworking} onEngage={handleEngageNetworking} onCreate={handleCreateNetworking} onDelete={handleDeleteNetworking} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <ChecklistSection title="Platform Setup" tasks={platformTasks} onToggle={handleToggleTask} />
        <ChecklistSection title="SEO Checklist" tasks={seoTasks} onToggle={handleToggleTask} />
      </div>
    </div>
  )
}
