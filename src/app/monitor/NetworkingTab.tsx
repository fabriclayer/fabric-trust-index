'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── DESIGN TOKENS (synced with MonitorDashboard.tsx) ────────────
const F = {
  sans: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'DM Mono', 'SF Mono', monospace",
}
const C = {
  bg: '#0a0a0a', surface: 'rgba(255,255,255,0.03)', surfaceAlt: 'rgba(255,255,255,0.015)',
  border: 'rgba(255,255,255,0.08)',
  text: '#fff', t2: 'rgba(255,255,255,0.5)', t3: 'rgba(255,255,255,0.25)', t4: 'rgba(255,255,255,0.12)',
  blue: '#068cff', pink: '#fe83e0', green: '#0dc956', orange: '#f7931e', red: '#e82d35', purple: '#8b5cf6',
  blueDim: 'rgba(6,140,255,0.12)', pinkDim: 'rgba(254,131,224,0.12)',
  greenDim: 'rgba(13,201,86,0.10)', orangeDim: 'rgba(247,147,30,0.10)',
  redDim: 'rgba(232,45,53,0.10)', purpleDim: 'rgba(139,92,246,0.12)',
}

// ─── TYPES ───────────────────────────────────────────────────────
interface MKol { id: string; name: string; handle: string; platform: string; tier: number; followers: string | null; stage: string; engagement_count: number; last_engaged_at: string | null; notes: string | null; project: string | null }

// ─── ATOMS ───────────────────────────────────────────────────────
function Mono({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: F.mono, ...s }}>{children}</span>
}
function SecLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>{children}</div>
}
function Badge({ text, color, bg, onClick }: { text: string; color: string; bg: string; onClick?: () => void }) {
  return <span onClick={onClick} style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 20, color, background: bg, border: `1px solid ${color}22`, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s' }}>{text}</span>
}
function Card({ children, title, right, pad = true }: { children: React.ReactNode; title?: string; right?: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {title && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0' }}><SecLabel>{title}</SecLabel>{right}</div>}
      {pad ? <div style={{ padding: title ? '12px 24px 20px' : '20px 24px' }}>{children}</div> : children}
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

const timeAgo = (iso: string | null) => {
  if (!iso) return '-'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

const profileUrl = (handle: string, platform: string) => {
  if (platform === 'github') return `https://github.com/${handle.replace('@', '')}`
  if (platform === 'x') return `https://x.com/${handle.replace('@', '')}`
  if (platform === 'bluesky') return `https://bsky.app/profile/${handle.replace('@', '')}`
  if (platform === 'linkedin') return `https://linkedin.com/in/${handle.replace('@', '')}`
  return `https://x.com/${handle.replace('@', '')}`
}

// ─── POST HELPER ─────────────────────────────────────────────────
async function postMarketing(body: Record<string, unknown>) {
  const res = await fetch('/api/monitor/marketing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ─── INLINE EDIT CELL ───────────────────────────────────────────
function EditableCell({ value, onSave, placeholder, mono, style: s }: {
  value: string | null
  onSave: (val: string | null) => void
  placeholder?: string
  mono?: boolean
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(val.trim() || null); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
        onBlur={() => { onSave(val.trim() || null); setEditing(false) }}
        style={{ fontFamily: mono ? F.mono : F.sans, fontSize: 12, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 6px', outline: 'none', width: '100%', ...s }}
      />
    )
  }
  return (
    <span
      onClick={() => { setEditing(true); setVal(value || '') }}
      style={{ fontFamily: mono ? F.mono : F.sans, fontSize: 12, color: value ? C.t2 : C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'pointer', ...s }}
    >{value || placeholder || 'click to edit'}</span>
  )
}

// ─── KOL TRACKER ─────────────────────────────────────────────────
function KolSection({ kols, onUpdate, onEngage, onCreate, onDelete }: {
  kols: MKol[]
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onEngage: (id: string) => void
  onCreate: (item: { name: string; handle: string; platform: string; tier: number; project?: string; followers?: string; notes?: string }) => void
  onDelete: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newPlatform, setNewPlatform] = useState('x')
  const [newTier, setNewTier] = useState(2)
  const [newProject, setNewProject] = useState('')
  const [newFollowers, setNewFollowers] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const cycleStage = (current: string) => {
    const idx = KOL_STAGES.indexOf(current as typeof KOL_STAGES[number])
    return KOL_STAGES[(idx + 1) % KOL_STAGES.length]
  }

  const handleAdd = () => {
    if (!newName.trim() || !newHandle.trim()) return
    onCreate({ name: newName.trim(), handle: newHandle.trim(), platform: newPlatform, tier: newTier, project: newProject.trim() || undefined, followers: newFollowers.trim() || undefined, notes: newNotes.trim() || undefined })
    setNewName(''); setNewHandle(''); setNewProject(''); setNewFollowers(''); setNewNotes(''); setShowAdd(false)
  }

  const GRID = '140px 110px 120px 50px 70px 110px 80px 80px 1fr 40px'

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
              {['x', 'github', 'bluesky', 'linkedin', 'youtube'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={newTier} onChange={e => setNewTier(Number(e.target.value))} style={selectStyle}>
              <option value={1}>Tier 1</option>
              <option value={2}>Tier 2</option>
            </select>
            <input placeholder="Followers (e.g. 12K)" value={newFollowers} onChange={e => setNewFollowers(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input placeholder="Project / Company" value={newProject} onChange={e => setNewProject(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            <input placeholder="Notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleAdd} style={submitBtnStyle}>Add</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 900 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>NAME</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>HANDLE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>PROJECT</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>TIER</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>FOLLOWERS</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>STAGE</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>ENGAGED</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>LAST</Mono>
            <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 0.5 }}>NOTES</Mono>
            <span />
          </div>
          {kols.map(kol => {
            const sc = STAGE_COLORS[kol.stage] ?? STAGE_COLORS.follow
            const tierColor = kol.tier === 1 ? { color: C.pink, bg: C.pinkDim } : { color: C.blue, bg: C.blueDim }
            return (
              <div key={kol.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                <EditableCell value={kol.name} onSave={v => v && onUpdate(kol.id, { name: v })} style={{ fontSize: 13, fontWeight: 500, color: C.text }} />
                <EditableCell value={kol.handle} mono onSave={v => v && onUpdate(kol.id, { handle: v })} style={{ color: C.blue }} />
                <EditableCell value={kol.project} onSave={v => onUpdate(kol.id, { project: v })} placeholder="-" style={{ fontSize: 11 }} />
                <Badge text={`T${kol.tier}`} color={tierColor.color} bg={tierColor.bg} onClick={() => onUpdate(kol.id, { tier: kol.tier === 1 ? 2 : 1 })} />
                <EditableCell value={kol.followers} mono onSave={v => onUpdate(kol.id, { followers: v })} placeholder="-" />
                <Badge text={kol.stage} color={sc.color} bg={sc.bg} onClick={() => onUpdate(kol.id, { stage: cycleStage(kol.stage) })} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mono style={{ fontSize: 13, color: C.text }}>{kol.engagement_count}</Mono>
                  <button onClick={() => onEngage(kol.id)} style={{
                    fontFamily: F.mono, fontSize: 10, color: C.green, background: C.greenDim,
                    border: `1px solid ${C.green}22`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600,
                  }}>+1</button>
                </div>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(kol.last_engaged_at)}</Mono>
                <EditableCell value={kol.notes} mono onSave={v => onUpdate(kol.id, { notes: v })} placeholder="click to add note" style={{ fontSize: 11 }} />
                {deleteConfirm === kol.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { onDelete(kol.id); setDeleteConfirm(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>Yes</button>
                    <button onClick={() => setDeleteConfirm(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(kol.id)}
                    style={{ fontFamily: F.mono, fontSize: 18, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', lineHeight: 1 }}
                    title="Delete"
                  >&times;</button>
                )}
              </div>
            )
          })}
          {kols.length === 0 && (
            <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}>
              <Mono style={{ fontSize: 12, color: C.t3 }}>No KOLs tracked yet — add one to start</Mono>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── MAIN NETWORKING TAB ─────────────────────────────────────────
export default function NetworkingTab() {
  const [data, setData] = useState<{ kols: MKol[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/marketing')
      if (!res.ok) return
      const json = await res.json()
      setData({ kols: json.kols ?? [] })
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

  const handleCreateKol = async (item: { name: string; handle: string; platform: string; tier: number; project?: string; followers?: string; notes?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newKol: MKol = { id: tempId, ...item, project: item.project || null, followers: item.followers || null, stage: 'follow', engagement_count: 0, last_engaged_at: null, notes: item.notes || null }
    setData(prev => prev ? { ...prev, kols: [...prev.kols, newKol] } : prev)
    await postMarketing({ action: 'create_kol', ...item })
    fetchData()
  }

  const handleDeleteKol = (id: string) => {
    setData(prev => prev ? { ...prev, kols: prev.kols.filter(k => k.id !== id) } : prev)
    postMarketing({ action: 'delete_kol', id })
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Loading networking data...</Mono></div>
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Failed to load networking data.</Mono></div>
  }

  return (
    <div style={{ padding: '30px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KolSection kols={data.kols} onUpdate={handleUpdateKol} onEngage={handleEngageKol} onCreate={handleCreateKol} onDelete={handleDeleteKol} />
    </div>
  )
}
