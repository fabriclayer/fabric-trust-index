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
interface MKol { id: string; name: string; handle: string; platform: string; tier: number; followers: string | null; stage: string; engagement_count: number; last_engaged_at: string | null; notes: string | null }
interface MNetworking { id: string; project_name: string; handle: string | null; platform: string; trust_page_slug: string | null; website_url: string | null; stage: string; engagement_count: number; last_contacted_at: string | null; notes: string | null }
interface MContact { id: string; networking_id: string; name: string; role: string | null; x_handle: string | null; linkedin_handle: string | null; telegram_handle: string | null }
interface NData { kols: MKol[]; networking: MNetworking[]; contacts: MContact[] }

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
  const res = await fetch('/api/monitor/marketing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
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
function NetworkingSection({ networking, contacts, onUpdate, onEngage, onCreate, onDelete, onCreateContact, onUpdateContact, onDeleteContact }: {
  networking: MNetworking[]
  contacts: MContact[]
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onEngage: (id: string) => void
  onCreate: (item: { project_name: string; handle: string; platform: string; trust_page_slug?: string; website_url?: string; notes?: string }) => void
  onDelete: (id: string) => void
  onCreateContact: (item: { networking_id: string; name: string; role?: string; x_handle?: string; linkedin_handle?: string; telegram_handle?: string }) => void
  onUpdateContact: (id: string, updates: Record<string, unknown>) => void
  onDeleteContact: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newPlatform, setNewPlatform] = useState('x')
  const [newSlug, setNewSlug] = useState('')
  const [newWebsite, setNewWebsite] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editNotesVal, setEditNotesVal] = useState('')
  const [addingContactFor, setAddingContactFor] = useState<string | null>(null)
  const [cName, setCName] = useState('')
  const [cRole, setCRole] = useState('')
  const [cX, setCX] = useState('')
  const [cLinkedin, setCLinkedin] = useState('')
  const [cTelegram, setCTelegram] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteContactConfirm, setDeleteContactConfirm] = useState<string | null>(null)

  const cycleStage = (current: string) => {
    const idx = NETWORKING_STAGES.indexOf(current as typeof NETWORKING_STAGES[number])
    return NETWORKING_STAGES[(idx + 1) % NETWORKING_STAGES.length]
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    onCreate({ project_name: newName.trim(), handle: newHandle.trim(), platform: newPlatform, trust_page_slug: newSlug.trim() || undefined, website_url: newWebsite.trim() || undefined, notes: newNotes.trim() || undefined })
    setNewName(''); setNewHandle(''); setNewSlug(''); setNewWebsite(''); setNewNotes(''); setShowAdd(false)
  }

  const handleAddContact = (networkingId: string) => {
    if (!cName.trim()) return
    onCreateContact({ networking_id: networkingId, name: cName.trim(), role: cRole.trim() || undefined, x_handle: cX.trim() || undefined, linkedin_handle: cLinkedin.trim() || undefined, telegram_handle: cTelegram.trim() || undefined })
    setCName(''); setCRole(''); setCX(''); setCLinkedin(''); setCTelegram(''); setAddingContactFor(null)
  }

  const GRID = '20px 160px 110px 130px 110px 80px 80px 1fr 40px'

  return (
    <Card title="Networking / Outreach" right={
      <button onClick={() => setShowAdd(!showAdd)} style={addBtnStyle}>+ Add Project</button>
    } pad={false}>
      {showAdd && (
        <div style={{ padding: '12px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <input placeholder="Website URL" value={newWebsite} onChange={e => setNewWebsite(e.target.value)} style={{ ...inputStyle, width: 200 }} />
            <input placeholder="@handle" value={newHandle} onChange={e => setNewHandle(e.target.value)} style={{ ...inputStyle, width: 130 }} />
            <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} style={selectStyle}>
              {['x', 'bluesky', 'linkedin'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Trust page slug (e.g. openai-gpt-4o)" value={newSlug} onChange={e => setNewSlug(e.target.value)} style={{ ...inputStyle, width: 220 }} />
            <input placeholder="Notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleAdd} style={submitBtnStyle}>Add</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 700 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
            <span />
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
            const isExpanded = expandedId === net.id
            const projectContacts = contacts.filter(c => c.networking_id === net.id)
            const isAddingContact = addingContactFor === net.id
            return (
              <div key={net.id} style={{ background: C.surface }}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '10px 16px', alignItems: 'center' }}>
                  <span
                    onClick={() => setExpandedId(isExpanded ? null : net.id)}
                    style={{ fontSize: 10, color: C.t3, cursor: 'pointer', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', textAlign: 'center' }}
                  >&#9654;</span>
                  <div>
                    <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, fontWeight: 500 }}>{net.project_name}</span>
                    {net.website_url && (
                      <a href={net.website_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 10, color: C.blue, textDecoration: 'none', display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {net.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    )}
                  </div>
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
                  {deleteConfirm === net.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { onDelete(net.id); setDeleteConfirm(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>Yes</button>
                      <button onClick={() => setDeleteConfirm(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(net.id)}
                      style={{ fontFamily: F.mono, fontSize: 18, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', lineHeight: 1 }}
                      title="Delete"
                    >&times;</button>
                  )}
                </div>
                {/* Expanded: contacts */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px 46px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mono style={{ fontSize: 10, color: C.t3, letterSpacing: 1, textTransform: 'uppercase' }}>Founders / Contacts</Mono>
                      <Mono style={{ fontSize: 10, color: C.t4 }}>({projectContacts.length})</Mono>
                    </div>
                    {projectContacts.map(contact => (
                      <div key={contact.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.surfaceAlt, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: C.text }}>{contact.name}</span>
                          {contact.role && <Mono style={{ fontSize: 10, color: C.t3, marginLeft: 8 }}>{contact.role}</Mono>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                          {contact.x_handle && (
                            <a href={`https://x.com/${contact.x_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none' }} title="X/Twitter">𝕏 {contact.x_handle}</a>
                          )}
                          {contact.linkedin_handle && (
                            <a href={`https://linkedin.com/in/${contact.linkedin_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none' }} title="LinkedIn">in/{contact.linkedin_handle}</a>
                          )}
                          {contact.telegram_handle && (
                            <a href={`https://t.me/${contact.telegram_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none' }} title="Telegram">✈ {contact.telegram_handle}</a>
                          )}
                          {deleteContactConfirm === contact.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => { onDeleteContact(contact.id); setDeleteContactConfirm(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Yes</button>
                              <button onClick={() => setDeleteContactConfirm(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>No</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteContactConfirm(contact.id)}
                              style={{ fontFamily: F.mono, fontSize: 18, color: C.t4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', lineHeight: 1 }}
                            >&times;</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {isAddingContact ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                        <input placeholder="Name" value={cName} onChange={e => setCName(e.target.value)} style={{ ...inputStyle, width: 120, fontSize: 12, padding: '6px 10px' }} autoFocus />
                        <input placeholder="Role (CEO, Founder...)" value={cRole} onChange={e => setCRole(e.target.value)} style={{ ...inputStyle, width: 130, fontSize: 12, padding: '6px 10px' }} />
                        <input placeholder="@x_handle" value={cX} onChange={e => setCX(e.target.value)} style={{ ...inputStyle, width: 110, fontSize: 12, padding: '6px 10px' }} />
                        <input placeholder="linkedin" value={cLinkedin} onChange={e => setCLinkedin(e.target.value)} style={{ ...inputStyle, width: 100, fontSize: 12, padding: '6px 10px' }} />
                        <input placeholder="telegram" value={cTelegram} onChange={e => setCTelegram(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddContact(net.id)} style={{ ...inputStyle, width: 100, fontSize: 12, padding: '6px 10px' }} />
                        <button onClick={() => handleAddContact(net.id)} style={{ ...submitBtnStyle, fontSize: 10, padding: '5px 12px' }}>Add</button>
                        <button onClick={() => setAddingContactFor(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => setAddingContactFor(net.id)}
                        style={{ fontFamily: F.mono, fontSize: 11, color: C.t3, cursor: 'pointer', display: 'inline-block', marginTop: 6, padding: '4px 0', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.blue)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.t3)}
                      >+ Add contact</span>
                    )}
                  </div>
                )}
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

// ─── MAIN NETWORKING TAB ─────────────────────────────────────────
export default function NetworkingTab() {
  const [data, setData] = useState<NData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/marketing')
      if (!res.ok) return
      const json = await res.json()
      setData({ kols: json.kols ?? [], networking: json.networking ?? [], contacts: json.contacts ?? [] })
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── KOL mutation helpers ──

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

  // ── Networking mutation helpers ──

  const handleCreateNetworking = async (item: { project_name: string; handle: string; platform: string; trust_page_slug?: string; website_url?: string; notes?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newNet: MNetworking = { id: tempId, ...item, handle: item.handle || null, trust_page_slug: item.trust_page_slug || null, website_url: item.website_url || null, stage: 'identified', engagement_count: 0, last_contacted_at: null, notes: item.notes || null }
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

  // ── Contact mutation helpers ──

  const handleCreateContact = async (item: { networking_id: string; name: string; role?: string; x_handle?: string; linkedin_handle?: string; telegram_handle?: string }) => {
    const tempId = `temp-${Date.now()}`
    const newContact: MContact = { id: tempId, networking_id: item.networking_id, name: item.name, role: item.role || null, x_handle: item.x_handle || null, linkedin_handle: item.linkedin_handle || null, telegram_handle: item.telegram_handle || null }
    setData(prev => prev ? { ...prev, contacts: [...prev.contacts, newContact] } : prev)
    await postMarketing({ action: 'create_contact', ...item })
    fetchData()
  }

  const handleUpdateContact = (id: string, updates: Record<string, unknown>) => {
    setData(prev => prev ? { ...prev, contacts: prev.contacts.map(c => c.id === id ? { ...c, ...updates } : c) } : prev)
    postMarketing({ action: 'update_contact', id, updates })
  }

  const handleDeleteContact = (id: string) => {
    setData(prev => prev ? { ...prev, contacts: prev.contacts.filter(c => c.id !== id) } : prev)
    postMarketing({ action: 'delete_contact', id })
  }

  // ── Render ──

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Loading networking data...</Mono>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono style={{ fontSize: 13, color: C.t3 }}>Failed to load networking data.</Mono>
      </div>
    )
  }

  return (
    <div style={{ padding: '30px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KolSection kols={data.kols} onUpdate={handleUpdateKol} onEngage={handleEngageKol} onCreate={handleCreateKol} />
      <NetworkingSection
        networking={data.networking}
        contacts={data.contacts}
        onUpdate={handleUpdateNetworking}
        onEngage={handleEngageNetworking}
        onCreate={handleCreateNetworking}
        onDelete={handleDeleteNetworking}
        onCreateContact={handleCreateContact}
        onUpdateContact={handleUpdateContact}
        onDeleteContact={handleDeleteContact}
      />
    </div>
  )
}
