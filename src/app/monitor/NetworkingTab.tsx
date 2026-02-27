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

// ─── EDIT DROPDOWN ──────────────────────────────────────────────
function KolEditDropdown({ kol, onUpdate, onClose }: {
  kol: MKol
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(kol.name)
  const [handle, setHandle] = useState(kol.handle)
  const [platform, setPlatform] = useState(kol.platform)
  const [tier, setTier] = useState(kol.tier)
  const [followers, setFollowers] = useState(kol.followers || '')
  const [project, setProject] = useState(kol.project || '')
  const [notes, setNotes] = useState(kol.notes || '')

  const handleSave = () => {
    const updates: Record<string, unknown> = {}
    if (name.trim() && name.trim() !== kol.name) updates.name = name.trim()
    if (handle.trim() && handle.trim() !== kol.handle) updates.handle = handle.trim()
    if (platform !== kol.platform) updates.platform = platform
    if (tier !== kol.tier) updates.tier = tier
    if ((followers.trim() || null) !== kol.followers) updates.followers = followers.trim() || null
    if ((project.trim() || null) !== kol.project) updates.project = project.trim() || null
    if ((notes.trim() || null) !== kol.notes) updates.notes = notes.trim() || null
    if (Object.keys(updates).length > 0) onUpdate(kol.id, updates)
    onClose()
  }

  const fieldLabel: React.CSSProperties = { fontFamily: F.mono, fontSize: 10, color: C.t3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }
  const fieldInput: React.CSSProperties = { ...inputStyle, width: '100%', fontSize: 12 }

  return (
    <div style={{ padding: '14px 24px 18px', background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 100px', gap: 12 }}>
        <div>
          <div style={fieldLabel}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} style={fieldInput} />
        </div>
        <div>
          <div style={fieldLabel}>Handle</div>
          <input value={handle} onChange={e => setHandle(e.target.value)} style={{ ...fieldInput, fontFamily: F.mono }} />
        </div>
        <div>
          <div style={fieldLabel}>Project</div>
          <input value={project} onChange={e => setProject(e.target.value)} style={fieldInput} placeholder="Company / project" />
        </div>
        <div>
          <div style={fieldLabel}>Platform</div>
          <select value={platform} onChange={e => setPlatform(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {['x', 'github', 'bluesky', 'linkedin', 'youtube'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={fieldLabel}>Tier</div>
          <select value={tier} onChange={e => setTier(Number(e.target.value))} style={{ ...selectStyle, width: '100%' }}>
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, marginTop: 10 }}>
        <div>
          <div style={fieldLabel}>Followers</div>
          <input value={followers} onChange={e => setFollowers(e.target.value)} style={{ ...fieldInput, fontFamily: F.mono }} placeholder="e.g. 12K" />
        </div>
        <div>
          <div style={fieldLabel}>Notes</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={fieldInput} placeholder="Optional notes" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ fontFamily: F.mono, fontSize: 11, color: C.t2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 16px', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} style={submitBtnStyle}>Save</button>
      </div>
    </div>
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
  const [editingId, setEditingId] = useState<string | null>(null)

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
            const isEditing = editingId === kol.id
            return (
              <div key={kol.id}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 16px', background: isEditing ? 'rgba(6,140,255,0.04)' : C.surface, alignItems: 'center', borderLeft: isEditing ? `2px solid ${C.blue}` : '2px solid transparent' }}>
                  <span
                    onClick={() => setEditingId(isEditing ? null : kol.id)}
                    style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                    title="Click to edit"
                  >{kol.name}</span>
                  <a href={profileUrl(kol.handle, kol.platform)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{kol.handle}</a>
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: kol.project ? C.t2 : C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kol.project || '-'}</span>
                  <Badge text={`T${kol.tier}`} color={tierColor.color} bg={tierColor.bg} onClick={() => onUpdate(kol.id, { tier: kol.tier === 1 ? 2 : 1 })} />
                  <Mono style={{ fontSize: 12, color: C.t2 }}>{kol.followers || '-'}</Mono>
                  <Badge text={kol.stage} color={sc.color} bg={sc.bg} onClick={() => onUpdate(kol.id, { stage: cycleStage(kol.stage) })} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mono style={{ fontSize: 13, color: C.text }}>{kol.engagement_count}</Mono>
                    <button onClick={() => onEngage(kol.id)} style={{
                      fontFamily: F.mono, fontSize: 10, color: C.green, background: C.greenDim,
                      border: `1px solid ${C.green}22`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600,
                    }}>+1</button>
                  </div>
                  <Mono style={{ fontSize: 11, color: C.t3 }}>{timeAgo(kol.last_engaged_at)}</Mono>
                  <Mono style={{ fontSize: 11, color: kol.notes ? C.t2 : C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kol.notes || '-'}</Mono>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    {deleteConfirm === kol.id ? (
                      <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 6px', zIndex: 10, whiteSpace: 'nowrap' }}>
                        <button onClick={() => { onDelete(kol.id); setDeleteConfirm(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(kol.id)}
                        style={{ fontFamily: F.mono, fontSize: 18, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', lineHeight: 1 }}
                        title="Delete"
                      >&times;</button>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <KolEditDropdown
                    kol={kol}
                    onUpdate={(id, updates) => { onUpdate(id, updates); setEditingId(null) }}
                    onClose={() => setEditingId(null)}
                  />
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
