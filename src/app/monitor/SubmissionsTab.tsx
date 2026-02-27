'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── DESIGN TOKENS ───────────────────────────────────────────────
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
interface Claim { id: string; service_slug: string; service_name: string; contact_name: string; contact_email: string; role: string | null; message: string | null; status: string; created_at: string }
interface Report { id: string; service_slug: string; service_name: string; issue_type: string; description: string; contact_email: string | null; status: string; created_at: string }
interface ServiceRequest { id: string; service_name: string; url: string | null; email: string | null; status: string; created_at: string }
interface WaitlistEntry { id: string; email: string; source: string; created_at: string }
interface SData { claims: Claim[]; reports: Report[]; requests: ServiceRequest[]; waitlist: WaitlistEntry[] }

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

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending: { color: C.orange, bg: C.orangeDim },
  approved: { color: C.green, bg: C.greenDim },
  rejected: { color: C.red, bg: C.redDim },
  reviewing: { color: C.blue, bg: C.blueDim },
  resolved: { color: C.green, bg: C.greenDim },
  dismissed: { color: C.t3, bg: 'rgba(255,255,255,0.05)' },
  indexed: { color: C.green, bg: C.greenDim },
  declined: { color: C.red, bg: C.redDim },
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  incorrect_score: 'Incorrect Score',
  incorrect_info: 'Incorrect Info',
  security_concern: 'Security Concern',
  other: 'Other',
}

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

async function postSubmissions(body: Record<string, unknown>) {
  const res = await fetch('/api/monitor/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function SubmissionsTab() {
  const [data, setData] = useState<SData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/submissions')
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const updateClaimStatus = (id: string, status: string) => {
    setData(prev => prev ? { ...prev, claims: prev.claims.map(c => c.id === id ? { ...c, status } : c) } : prev)
    postSubmissions({ action: 'update_claim', id, status })
  }

  const updateReportStatus = (id: string, status: string) => {
    setData(prev => prev ? { ...prev, reports: prev.reports.map(r => r.id === id ? { ...r, status } : r) } : prev)
    postSubmissions({ action: 'update_report', id, status })
  }

  const updateRequestStatus = (id: string, status: string) => {
    setData(prev => prev ? { ...prev, requests: prev.requests.map(r => r.id === id ? { ...r, status } : r) } : prev)
    postSubmissions({ action: 'update_request', id, status })
  }

  const deleteClaim = (id: string) => {
    setData(prev => prev ? { ...prev, claims: prev.claims.filter(c => c.id !== id) } : prev)
    postSubmissions({ action: 'delete_claim', id })
  }

  const deleteReport = (id: string) => {
    setData(prev => prev ? { ...prev, reports: prev.reports.filter(r => r.id !== id) } : prev)
    postSubmissions({ action: 'delete_report', id })
  }

  const deleteRequest = (id: string) => {
    setData(prev => prev ? { ...prev, requests: prev.requests.filter(r => r.id !== id) } : prev)
    postSubmissions({ action: 'delete_request', id })
  }

  const deleteWaitlist = (id: string) => {
    setData(prev => prev ? { ...prev, waitlist: prev.waitlist.filter(w => w.id !== id) } : prev)
    postSubmissions({ action: 'delete_waitlist', id })
  }

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const DeleteBtn = ({ id, onDelete }: { id: string; onDelete: (id: string) => void }) => (
    deleteConfirm === id ? (
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={() => { onDelete(id); setDeleteConfirm(null) }} style={{ fontFamily: F.mono, fontSize: 10, color: C.red, background: C.redDim, border: `1px solid ${C.red}33`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Yes</button>
        <button onClick={() => setDeleteConfirm(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>No</button>
      </div>
    ) : (
      <button onClick={() => setDeleteConfirm(id)} style={{ fontFamily: F.mono, fontSize: 18, color: C.t3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', lineHeight: 1, flexShrink: 0 }} title="Delete">&times;</button>
    )
  )

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Loading submissions...</Mono></div>
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Failed to load submissions data.</Mono></div>
  }

  const pendingClaims = data.claims.filter(c => c.status === 'pending').length
  const pendingReports = data.reports.filter(r => r.status === 'pending').length
  const pendingRequests = data.requests.filter(r => r.status === 'pending').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Provider Claims */}
      <Card title="Provider Claims" right={
        <div style={{ display: 'flex', gap: 8 }}>
          {pendingClaims > 0 && <Badge text={`${pendingClaims} pending`} color={C.orange} bg={C.orangeDim} />}
          <Mono style={{ fontSize: 11, color: C.t3 }}>{data.claims.length} total</Mono>
        </div>
      } pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 140px 160px 120px 1fr 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
              {['SERVICE', 'NAME', 'EMAIL', 'ROLE', 'MESSAGE', 'STATUS', 'WHEN', ''].map(h => (
                <Mono key={h} style={{ fontSize: 9, color: C.t3, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</Mono>
              ))}
            </div>
            {data.claims.length === 0 ? (
              <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}><Mono style={{ fontSize: 12, color: C.t3 }}>No claims yet</Mono></div>
            ) : data.claims.map(claim => {
              const sc = STATUS_COLORS[claim.status] ?? STATUS_COLORS.pending
              return (
                <div key={claim.id} style={{ display: 'grid', gridTemplateColumns: '160px 140px 160px 120px 1fr 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                  <a href={`https://trust.fabriclayer.ai/${claim.service_slug}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.service_name}</a>
                  <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.contact_name}</span>
                  <a href={`mailto:${claim.contact_email}`} style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.contact_email}</a>
                  <Mono style={{ fontSize: 11, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.role || '-'}</Mono>
                  <Mono style={{ fontSize: 11, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{claim.message || '-'}</Mono>
                  <Badge text={claim.status} color={sc.color} bg={sc.bg} onClick={() => {
                    const next = claim.status === 'pending' ? 'approved' : claim.status === 'approved' ? 'rejected' : 'pending'
                    updateClaimStatus(claim.id, next)
                  }} />
                  <Mono style={{ fontSize: 10, color: C.t3 }}>{timeAgo(claim.created_at)}</Mono>
                  <DeleteBtn id={claim.id} onDelete={deleteClaim} />
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Issue Reports */}
      <Card title="Issue Reports" right={
        <div style={{ display: 'flex', gap: 8 }}>
          {pendingReports > 0 && <Badge text={`${pendingReports} pending`} color={C.orange} bg={C.orangeDim} />}
          <Mono style={{ fontSize: 11, color: C.t3 }}>{data.reports.length} total</Mono>
        </div>
      } pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr 140px 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
              {['SERVICE', 'TYPE', 'DESCRIPTION', 'EMAIL', 'STATUS', 'WHEN', ''].map(h => (
                <Mono key={h} style={{ fontSize: 9, color: C.t3, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</Mono>
              ))}
            </div>
            {data.reports.length === 0 ? (
              <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}><Mono style={{ fontSize: 12, color: C.t3 }}>No reports yet</Mono></div>
            ) : data.reports.map(report => {
              const sc = STATUS_COLORS[report.status] ?? STATUS_COLORS.pending
              const tc = report.issue_type === 'security_concern' ? { color: C.red, bg: C.redDim } : report.issue_type === 'incorrect_score' ? { color: C.orange, bg: C.orangeDim } : { color: C.blue, bg: C.blueDim }
              return (
                <div key={report.id} style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr 140px 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                  <a href={`https://trust.fabriclayer.ai/${report.service_slug}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.service_name}</a>
                  <Badge text={ISSUE_TYPE_LABELS[report.issue_type] ?? report.issue_type} color={tc.color} bg={tc.bg} />
                  <Mono style={{ fontSize: 11, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.description}</Mono>
                  {report.contact_email ? (
                    <a href={`mailto:${report.contact_email}`} style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.contact_email}</a>
                  ) : (
                    <Mono style={{ fontSize: 11, color: C.t4 }}>-</Mono>
                  )}
                  <Badge text={report.status} color={sc.color} bg={sc.bg} onClick={() => {
                    const next = report.status === 'pending' ? 'reviewing' : report.status === 'reviewing' ? 'resolved' : report.status === 'resolved' ? 'dismissed' : 'pending'
                    updateReportStatus(report.id, next)
                  }} />
                  <Mono style={{ fontSize: 10, color: C.t3 }}>{timeAgo(report.created_at)}</Mono>
                  <DeleteBtn id={report.id} onDelete={deleteReport} />
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Service Requests */}
      <Card title="Service Requests" right={
        <div style={{ display: 'flex', gap: 8 }}>
          {pendingRequests > 0 && <Badge text={`${pendingRequests} pending`} color={C.orange} bg={C.orangeDim} />}
          <Mono style={{ fontSize: 11, color: C.t3 }}>{data.requests.length} total</Mono>
        </div>
      } pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 500 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 200px 180px 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
              {['SERVICE NAME', 'URL', 'EMAIL', 'STATUS', 'WHEN', ''].map(h => (
                <Mono key={h} style={{ fontSize: 9, color: C.t3, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</Mono>
              ))}
            </div>
            {data.requests.length === 0 ? (
              <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}><Mono style={{ fontSize: 12, color: C.t3 }}>No service requests yet</Mono></div>
            ) : data.requests.map(req => {
              const sc = STATUS_COLORS[req.status] ?? STATUS_COLORS.pending
              return (
                <div key={req.id} style={{ display: 'grid', gridTemplateColumns: '200px 200px 180px 90px 80px 40px', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                  <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.service_name}</span>
                  {req.url ? (
                    <a href={req.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.url.replace(/^https?:\/\//, '').slice(0, 30)}</a>
                  ) : (
                    <Mono style={{ fontSize: 11, color: C.t4 }}>-</Mono>
                  )}
                  {req.email ? (
                    <a href={`mailto:${req.email}`} style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.email}</a>
                  ) : (
                    <Mono style={{ fontSize: 11, color: C.t4 }}>-</Mono>
                  )}
                  <Badge text={req.status} color={sc.color} bg={sc.bg} onClick={() => {
                    const next = req.status === 'pending' ? 'reviewing' : req.status === 'reviewing' ? 'indexed' : req.status === 'indexed' ? 'declined' : 'pending'
                    updateRequestStatus(req.id, next)
                  }} />
                  <Mono style={{ fontSize: 10, color: C.t3 }}>{timeAgo(req.created_at)}</Mono>
                  <DeleteBtn id={req.id} onDelete={deleteRequest} />
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* API Waitlist */}
      <Card title="API Waitlist Signups" right={
        <Mono style={{ fontSize: 11, color: C.t3 }}>{data.waitlist.length} signups</Mono>
      } pad={false}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, minWidth: 400 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 40px', gap: 10, padding: '10px 16px', background: C.bg, alignItems: 'center' }}>
              {['EMAIL', 'SOURCE', 'SIGNED UP', ''].map(h => (
                <Mono key={h} style={{ fontSize: 9, color: C.t3, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</Mono>
              ))}
            </div>
            {data.waitlist.length === 0 ? (
              <div style={{ padding: '20px 16px', background: C.surface, textAlign: 'center' }}><Mono style={{ fontSize: 12, color: C.t3 }}>No signups yet</Mono></div>
            ) : data.waitlist.map(entry => (
              <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 40px', gap: 10, padding: '10px 16px', background: C.surface, alignItems: 'center' }}>
                <a href={`mailto:${entry.email}`} style={{ fontFamily: F.mono, fontSize: 12, color: C.blue, textDecoration: 'none' }}>{entry.email}</a>
                <Badge text={entry.source || 'unknown'} color={C.purple} bg={C.purpleDim} />
                <Mono style={{ fontSize: 10, color: C.t3 }}>{timeAgo(entry.created_at)}</Mono>
                <DeleteBtn id={entry.id} onDelete={deleteWaitlist} />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
