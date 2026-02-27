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
interface CostItem {
  id: string; category: string; provider: string; item: string
  cost_type: string; amount_usd: number; billing_cycle: string | null
  renewal_date: string | null; is_active: boolean; notes: string | null; sort_order: number
}
interface UsageBucket {
  calls: number; input_tokens: number; output_tokens: number; cost_usd: number
  by_caller: Record<string, { calls: number; cost_usd: number }>
}
interface DailySpend { date: string; cost_usd: number; calls: number }
interface CostsData {
  items: CostItem[]
  apiUsage: { today: UsageBucket; month: UsageBucket; daily14: DailySpend[] }
}

// ─── ATOMS ───────────────────────────────────────────────────────
function Mono({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: F.mono, ...s }}>{children}</span>
}
function SecLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 500, color: C.text, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>{children}</div>
}
function Card({ children, title, right, pad = true }: { children: React.ReactNode; title?: string; right?: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {title && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0' }}><SecLabel>{title}</SecLabel>{right}</div>}
      {pad ? <div style={{ padding: title ? '12px 24px 20px' : '20px 24px' }}>{children}</div> : children}
    </div>
  )
}
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: '3px 10px', borderRadius: 20, color, background: bg, border: `1px solid ${color}22`, whiteSpace: 'nowrap' }}>{text}</span>
}
function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 ${pulse ? 10 : 4}px ${color}50`, flexShrink: 0 }} />
}
function Bar({ pct, color, h = 5 }: { pct: number; color: string; h?: number }) {
  return (
    <div style={{ flex: 1, height: h, background: 'rgba(255,255,255,0.06)', borderRadius: h / 2, overflow: 'hidden', minWidth: 40 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: h / 2, opacity: 0.65, transition: 'width 0.8s ease' }} />
    </div>
  )
}

// ─── HELPERS ─────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'infrastructure', label: 'Infrastructure', icon: '🏗️' },
  { id: 'api', label: 'API / Metered', icon: '⚡' },
  { id: 'domains', label: 'Domains', icon: '🌐' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '🔑' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'services', label: 'Services', icon: '📋' },
]
const catLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label ?? id
const catIcon = (id: string) => CATEGORIES.find(c => c.id === id)?.icon ?? '📦'
const fmtTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toString()
const fmtCaller = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

function monthlyEquiv(item: CostItem): number {
  if (item.cost_type === 'metered') return 0
  if (item.billing_cycle === 'annual') return item.amount_usd / 12
  if (item.billing_cycle === 'one-time') return 0
  return item.amount_usd
}

async function postCosts(body: Record<string, unknown>) {
  const res = await fetch('/api/monitor/costs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.json()
}

// ─── INPUT STYLES ────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  fontFamily: F.mono, fontSize: 12, color: C.text, background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', outline: 'none', width: '100%',
}
const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none' as const, cursor: 'pointer',
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────
export default function CostsTab({ githubRate, vercelData }: {
  githubRate: { rateRemaining: number; rateLimit: number }
  vercelData: { functionsInvoked: number } | null
}) {
  const [data, setData] = useState<CostsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Partial<CostItem>>({})

  // Add form
  const [newCat, setNewCat] = useState('infrastructure')
  const [newProvider, setNewProvider] = useState('')
  const [newItem, setNewItem] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newCycle, setNewCycle] = useState('monthly')
  const [newType, setNewType] = useState('fixed')
  const [newRenewal, setNewRenewal] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/costs')
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Mutations ──

  const handleAdd = async () => {
    if (!newProvider.trim() || !newItem.trim()) return
    const tempId = `temp-${Date.now()}`
    const newCostItem: CostItem = {
      id: tempId, category: newCat, provider: newProvider.trim(), item: newItem.trim(),
      cost_type: newType, amount_usd: parseFloat(newAmount) || 0, billing_cycle: newCycle,
      renewal_date: newRenewal || null, is_active: true, notes: newNotes || null, sort_order: 999,
    }
    setData(prev => prev ? { ...prev, items: [...prev.items, newCostItem] } : prev)
    setShowAdd(false)
    setNewProvider(''); setNewItem(''); setNewAmount(''); setNewCycle('monthly'); setNewType('fixed'); setNewRenewal(''); setNewNotes('')
    const res = await postCosts({ action: 'create', category: newCat, provider: newProvider.trim(), item: newItem.trim(), cost_type: newType, amount_usd: parseFloat(newAmount) || 0, billing_cycle: newCycle, renewal_date: newRenewal || null, notes: newNotes || null })
    if (res?.id) {
      setData(prev => prev ? { ...prev, items: prev.items.map(i => i.id === tempId ? { ...i, id: res.id } : i) } : prev)
    }
  }

  const handleUpdate = async (id: string) => {
    setData(prev => prev ? { ...prev, items: prev.items.map(i => i.id === id ? { ...i, ...editFields } : i) } : prev)
    setEditingId(null)
    await postCosts({ action: 'update', id, ...editFields })
  }

  const handleDelete = async (id: string) => {
    setData(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== id) } : prev)
    await postCosts({ action: 'delete', id })
  }

  const handleToggleActive = async (item: CostItem) => {
    const newActive = !item.is_active
    setData(prev => prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, is_active: newActive } : i) } : prev)
    await postCosts({ action: 'update', id: item.id, is_active: newActive })
  }

  // ── Render ──

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Loading cost data...</Mono></div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}><Mono style={{ fontSize: 13, color: C.t3 }}>Failed to load. Run the cost_tracking SQL first.</Mono></div>

  const { items, apiUsage } = data
  const activeItems = items.filter(i => i.is_active)
  const displayItems = showInactive ? items : activeItems

  // Totals
  const fixedMonthly = activeItems.filter(i => i.cost_type !== 'metered').reduce((s, i) => s + monthlyEquiv(i), 0)
  const apiMonthly = apiUsage.month.cost_usd
  const totalMonthly = fixedMonthly + apiMonthly
  const totalAnnual = totalMonthly * 12
  const apiToday = apiUsage.today.cost_usd
  const avgCostPerCall = apiUsage.today.calls > 0 ? apiToday / apiUsage.today.calls : 0
  const dayOfMonth = new Date().getDate()
  const apiRunRate = dayOfMonth > 0 ? (apiMonthly / dayOfMonth) * 30 : 0

  // Category totals
  const catTotals = CATEGORIES.map(cat => {
    const catItems = activeItems.filter(i => i.category === cat.id)
    const fixed = catItems.filter(i => i.cost_type !== 'metered').reduce((s, i) => s + monthlyEquiv(i), 0)
    const metered = cat.id === 'api' ? apiMonthly : 0
    return { ...cat, total: fixed + metered, count: catItems.length, providers: [...new Set(catItems.map(i => i.provider))] }
  }).filter(c => c.total > 0 || c.count > 0)

  // Upcoming renewals (60 days)
  const now = new Date()
  const in60 = new Date(now.getTime() + 60 * 86400000)
  const renewals = activeItems
    .filter(i => i.renewal_date)
    .map(i => ({ ...i, rd: new Date(i.renewal_date! + 'T00:00:00') }))
    .filter(i => i.rd <= in60)
    .sort((a, b) => a.rd.getTime() - b.rd.getTime())

  // Daily chart
  const daily14 = apiUsage.daily14 ?? []
  const maxDaily = Math.max(...daily14.map(d => d.cost_usd), 0.001)

  // Free tier data
  const ghPct = githubRate.rateLimit > 0 ? Math.round((1 - githubRate.rateRemaining / githubRate.rateLimit) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── SECTION 1: MONTHLY BURN RATE ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Mono style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>Monthly Burn Rate</Mono>
            <div style={{ fontFamily: F.sans, fontSize: 40, fontWeight: 700, color: C.text, marginTop: 6, letterSpacing: -2, lineHeight: 1 }}>
              ${totalMonthly.toFixed(2)}
              <span style={{ fontSize: 16, fontWeight: 400, color: C.t3, letterSpacing: 0 }}>/month</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Mono style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: 1 }}>Annual Equivalent</Mono>
            <div style={{ fontFamily: F.sans, fontSize: 24, fontWeight: 700, color: C.t2, marginTop: 6, lineHeight: 1 }}>
              ${totalAnnual.toFixed(0)}
              <span style={{ fontSize: 13, fontWeight: 400, color: C.t3 }}>/year</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 14, display: 'flex', gap: 32 }}>
          <div>
            <Mono style={{ fontSize: 10, color: C.t4 }}>Fixed</Mono>
            <Mono style={{ fontSize: 13, color: C.text, display: 'block', marginTop: 2 }}>${fixedMonthly.toFixed(2)}/mo</Mono>
          </div>
          <div>
            <Mono style={{ fontSize: 10, color: C.t4 }}>API (metered)</Mono>
            <Mono style={{ fontSize: 13, color: C.text, display: 'block', marginTop: 2 }}>${apiMonthly.toFixed(2)}/mo</Mono>
          </div>
          <div>
            <Mono style={{ fontSize: 10, color: C.t4 }}>API Run Rate (30d)</Mono>
            <Mono style={{ fontSize: 13, color: apiRunRate > 50 ? C.orange : C.t2, display: 'block', marginTop: 2 }}>${apiRunRate.toFixed(2)}/mo</Mono>
          </div>
        </div>
      </Card>

      {/* ── SECTION 2: CATEGORY BREAKDOWN ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(catTotals.length, 5)}, 1fr)`, gap: 16 }}>
        {catTotals.map(cat => (
          <Card key={cat.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <Mono style={{ fontSize: 11, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.label}</Mono>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -1 }}>
              ${cat.total.toFixed(2)}
              <span style={{ fontSize: 11, fontWeight: 400, color: C.t3 }}>/mo</span>
            </div>
            <Mono style={{ fontSize: 10, color: C.t3, marginTop: 6, display: 'block' }}>
              {cat.providers.length > 0 ? cat.providers.join(', ') : 'None'}
            </Mono>
          </Card>
        ))}
      </div>

      {/* ── SECTION 3: DETAILED LINE ITEMS ── */}
      <Card title="All Costs" right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            onClick={() => setShowInactive(!showInactive)}
            style={{ fontFamily: F.mono, fontSize: 10, color: showInactive ? C.blue : C.t3, cursor: 'pointer', transition: 'color 0.15s' }}
          >{showInactive ? 'Hide inactive' : 'Show inactive'}</span>
          <button onClick={() => setShowAdd(!showAdd)} style={{
            fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.blue, background: C.blueDim,
            border: `1px solid ${C.blue}22`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
          }}>+ Add Cost</button>
        </div>
      } pad={false}>
        {/* Add form */}
        {showAdd && (
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, background: 'rgba(6,140,255,0.03)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 0.8fr 0.8fr 0.8fr', gap: 8, marginBottom: 8 }}>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} style={selectStyle}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <input placeholder="Provider" value={newProvider} onChange={e => setNewProvider(e.target.value)} style={inputStyle} />
              <input placeholder="Item name" value={newItem} onChange={e => setNewItem(e.target.value)} style={inputStyle} />
              <select value={newType} onChange={e => setNewType(e.target.value)} style={selectStyle}>
                <option value="fixed">Fixed</option>
                <option value="metered">Metered</option>
                <option value="one-time">One-time</option>
              </select>
              <input placeholder="Amount $" value={newAmount} onChange={e => setNewAmount(e.target.value)} style={{ ...inputStyle, textAlign: 'right' }} />
              <select value={newCycle} onChange={e => setNewCycle(e.target.value)} style={selectStyle}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="per-use">Per-use</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" placeholder="Renewal date" value={newRenewal} onChange={e => setNewRenewal(e.target.value)} style={{ ...inputStyle, width: 160 }} />
              <input placeholder="Notes (optional)" value={newNotes} onChange={e => setNewNotes(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleAdd} style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: '#000', background: C.green,
                border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>Add</button>
              <button onClick={() => setShowAdd(false)} style={{
                fontFamily: F.mono, fontSize: 11, color: C.t3, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr 80px 80px 80px 90px 70px', gap: 8, padding: '10px 24px', borderBottom: `1px solid ${C.border}` }}>
          {['Category', 'Provider', 'Item', 'Type', 'Amount', 'Cycle', 'Renewal', ''].map(h => (
            <Mono key={h} style={{ fontSize: 9, color: C.t4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</Mono>
          ))}
        </div>

        {/* Table rows */}
        {displayItems.map((item, i) => {
          const isEditing = editingId === item.id
          const overdue = item.renewal_date && new Date(item.renewal_date + 'T00:00:00') < now && item.is_active
          return (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: '130px 110px 1fr 80px 80px 80px 90px 70px', gap: 8,
              padding: '10px 24px', borderBottom: i < displayItems.length - 1 ? `1px solid ${C.border}` : 'none',
              background: !item.is_active ? 'rgba(255,255,255,0.01)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              opacity: item.is_active ? 1 : 0.4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>{catIcon(item.category)}</span>
                <Mono style={{ fontSize: 11, color: C.t2 }}>{catLabel(item.category)}</Mono>
              </div>
              <Mono style={{ fontSize: 11, color: C.text }}>{item.provider}</Mono>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <Mono style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item}</Mono>
                {item.notes && <Mono style={{ fontSize: 9, color: C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.notes}</Mono>}
              </div>
              <Badge
                text={item.cost_type}
                color={item.cost_type === 'fixed' ? C.blue : item.cost_type === 'metered' ? C.purple : C.orange}
                bg={item.cost_type === 'fixed' ? C.blueDim : item.cost_type === 'metered' ? C.purpleDim : C.orangeDim}
              />
              {isEditing ? (
                <input
                  autoFocus
                  value={editFields.amount_usd ?? item.amount_usd}
                  onChange={e => setEditFields(prev => ({ ...prev, amount_usd: parseFloat(e.target.value) || 0 }))}
                  style={{ fontFamily: F.mono, fontSize: 11, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 6px', outline: 'none', width: 70, textAlign: 'right' }}
                />
              ) : (
                <Mono style={{ fontSize: 11, color: C.text, textAlign: 'right' }}>
                  ${item.amount_usd.toFixed(2)}
                </Mono>
              )}
              {isEditing ? (
                <select
                  value={editFields.billing_cycle ?? item.billing_cycle ?? 'monthly'}
                  onChange={e => setEditFields(prev => ({ ...prev, billing_cycle: e.target.value }))}
                  style={{ fontFamily: F.mono, fontSize: 10, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 4px', outline: 'none' }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                  <option value="per-use">Per-use</option>
                  <option value="one-time">One-time</option>
                </select>
              ) : (
                <Mono style={{ fontSize: 10, color: C.t3 }}>{item.billing_cycle ?? '—'}</Mono>
              )}
              <div>
                {isEditing ? (
                  <input
                    type="date"
                    value={editFields.renewal_date ?? item.renewal_date ?? ''}
                    onChange={e => setEditFields(prev => ({ ...prev, renewal_date: e.target.value || null }))}
                    style={{ fontFamily: F.mono, fontSize: 10, background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 4, color: C.text, padding: '2px 4px', outline: 'none', width: 85 }}
                  />
                ) : item.renewal_date ? (
                  <Mono style={{ fontSize: 10, color: overdue ? C.red : C.t3 }}>
                    {new Date(item.renewal_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {overdue && ' ⚠️'}
                  </Mono>
                ) : (
                  <Mono style={{ fontSize: 10, color: C.t4 }}>—</Mono>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isEditing ? (
                  <>
                    <span onClick={() => handleUpdate(item.id)} style={{ fontFamily: F.mono, fontSize: 10, color: C.green, cursor: 'pointer' }}>Save</span>
                    <span onClick={() => setEditingId(null)} style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, cursor: 'pointer' }}>Cancel</span>
                  </>
                ) : (
                  <>
                    <span
                      onClick={() => { setEditingId(item.id); setEditFields({ amount_usd: item.amount_usd, billing_cycle: item.billing_cycle, renewal_date: item.renewal_date }) }}
                      style={{ fontFamily: F.mono, fontSize: 10, color: C.t3, cursor: 'pointer', transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.blue)}
                      onMouseLeave={e => (e.currentTarget.style.color = C.t3)}
                    >Edit</span>
                    <span
                      onClick={() => handleToggleActive(item)}
                      style={{ fontFamily: F.mono, fontSize: 10, color: item.is_active ? C.t4 : C.green, cursor: 'pointer' }}
                    >{item.is_active ? '×' : '✓'}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* Anthropic API rows (virtual, from api_usage_log) */}
        {Object.entries(apiUsage.month.by_caller).length > 0 && (
          <>
            <div style={{ padding: '8px 24px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
              <Mono style={{ fontSize: 9, color: C.t4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Anthropic API — Auto-tracked from usage log</Mono>
            </div>
            {Object.entries(apiUsage.month.by_caller).sort((a, b) => b[1].cost_usd - a[1].cost_usd).map(([caller, stats]) => (
              <div key={`api-${caller}`} style={{
                display: 'grid', gridTemplateColumns: '130px 110px 1fr 80px 80px 80px 90px 70px', gap: 8,
                padding: '10px 24px', borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>⚡</span>
                  <Mono style={{ fontSize: 11, color: C.t2 }}>API</Mono>
                </div>
                <Mono style={{ fontSize: 11, color: C.text }}>Anthropic</Mono>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Mono style={{ fontSize: 11, color: C.text }}>{fmtCaller(caller)}</Mono>
                  <Mono style={{ fontSize: 9, color: C.t4 }}>{stats.calls.toLocaleString()} calls this month</Mono>
                </div>
                <Badge text="metered" color={C.purple} bg={C.purpleDim} />
                <Mono style={{ fontSize: 11, color: C.text, textAlign: 'right' }}>${stats.cost_usd.toFixed(2)}</Mono>
                <Mono style={{ fontSize: 10, color: C.t3 }}>This month</Mono>
                <Mono style={{ fontSize: 10, color: C.t4 }}>—</Mono>
                <Mono style={{ fontSize: 10, color: C.t4 }}>—</Mono>
              </div>
            ))}
          </>
        )}

        {/* Totals row */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr 80px 80px 80px 90px 70px', gap: 8, padding: '12px 24px', background: 'rgba(255,255,255,0.02)' }}>
          <Mono style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Total</Mono>
          <span />
          <span />
          <span />
          <Mono style={{ fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'right' }}>${totalMonthly.toFixed(2)}</Mono>
          <Mono style={{ fontSize: 10, color: C.t3 }}>/month</Mono>
          <span />
          <span />
        </div>
      </Card>

      {/* ── SECTION 4: ANTHROPIC API BREAKDOWN ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="API Costs — Today">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 12, color: C.t2 }}>Total</Mono>
              <Mono style={{ fontSize: 16, fontWeight: 700, color: apiToday > 5 ? C.orange : C.text }}>${apiToday.toFixed(2)}</Mono>
            </div>
            {Object.entries(apiUsage.today.by_caller).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2 }}>
                {Object.entries(apiUsage.today.by_caller).sort((a, b) => b[1].cost_usd - a[1].cost_usd).map(([caller, stats]) => (
                  <div key={caller} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Mono style={{ fontSize: 11, color: C.t2, flex: 1 }}>{fmtCaller(caller)}</Mono>
                    <Mono style={{ fontSize: 11, color: C.t3, width: 70, textAlign: 'right' }}>{stats.calls.toLocaleString()} {stats.calls === 1 ? 'call' : 'calls'}</Mono>
                    <Mono style={{ fontSize: 11, color: C.text, width: 60, textAlign: 'right' }}>${stats.cost_usd.toFixed(2)}</Mono>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Mono style={{ fontSize: 11, color: C.t3 }}>Tokens</Mono>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{fmtTokens(apiUsage.today.input_tokens)} in · {fmtTokens(apiUsage.today.output_tokens)} out</Mono>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Mono style={{ fontSize: 11, color: C.t3 }}>Avg cost/call</Mono>
                <Mono style={{ fontSize: 11, color: C.t2 }}>${avgCostPerCall.toFixed(3)}</Mono>
              </div>
            </div>
          </div>
        </Card>

        <Card title="API Costs — This Month">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Mono style={{ fontSize: 12, color: C.t2 }}>Total</Mono>
              <Mono style={{ fontSize: 16, fontWeight: 700, color: apiMonthly > 50 ? C.orange : C.text }}>${apiMonthly.toFixed(2)}</Mono>
            </div>
            {Object.entries(apiUsage.month.by_caller).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2 }}>
                {Object.entries(apiUsage.month.by_caller).sort((a, b) => b[1].cost_usd - a[1].cost_usd).map(([caller, stats]) => (
                  <div key={caller} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Mono style={{ fontSize: 11, color: C.t2, flex: 1 }}>{fmtCaller(caller)}</Mono>
                    <Mono style={{ fontSize: 11, color: C.t3, width: 80, textAlign: 'right' }}>{stats.calls.toLocaleString()} calls</Mono>
                    <Mono style={{ fontSize: 11, color: C.text, width: 60, textAlign: 'right' }}>${stats.cost_usd.toFixed(2)}</Mono>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Mono style={{ fontSize: 11, color: C.t3 }}>Tokens</Mono>
                <Mono style={{ fontSize: 11, color: C.t3 }}>{fmtTokens(apiUsage.month.input_tokens)} in · {fmtTokens(apiUsage.month.output_tokens)} out</Mono>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Mono style={{ fontSize: 11, color: C.t3 }}>Monthly run rate</Mono>
                <Mono style={{ fontSize: 11, color: apiRunRate > 50 ? C.orange : C.t2 }}>${apiRunRate.toFixed(2)}</Mono>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 14-day daily spend chart */}
      {daily14.length >= 2 && daily14.some(d => d.cost_usd > 0) && (
        <Card title="Daily API Spend — Last 14 Days" right={
          <Mono style={{ fontSize: 10, color: C.t3 }}>{daily14.reduce((s, d) => s + d.calls, 0)} calls total</Mono>
        }>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {daily14.map(day => {
              const pct = Math.max(2, (day.cost_usd / maxDaily) * 100)
              const isToday = day.date === new Date().toISOString().slice(0, 10)
              return (
                <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Mono style={{ fontSize: 8, color: C.t3 }}>{day.cost_usd > 0 ? `$${day.cost_usd.toFixed(2)}` : ''}</Mono>
                  <div style={{
                    width: '100%', maxWidth: 36, height: `${pct}%`, minHeight: 2,
                    background: isToday ? C.blue : day.cost_usd > 0 ? 'rgba(6,140,255,0.4)' : 'rgba(255,255,255,0.06)',
                    borderRadius: 3, transition: 'height 0.5s ease',
                  }} />
                  <Mono style={{ fontSize: 8, color: isToday ? C.text : C.t4 }}>
                    {new Date(day.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Mono>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── SECTION 5: UPCOMING RENEWALS ── */}
      {renewals.length > 0 && (
        <Card title="Upcoming Renewals" right={
          <Mono style={{ fontSize: 10, color: C.t3 }}>Next 60 days</Mono>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {renewals.map(item => {
              const daysUntil = Math.ceil((item.rd.getTime() - now.getTime()) / 86400000)
              const overdue = daysUntil < 0
              const dotColor = overdue ? C.red : daysUntil <= 30 ? C.orange : C.green
              const cycleLabel = item.billing_cycle === 'annual' ? '/yr' : '/mo'
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <Dot color={dotColor} pulse={overdue} />
                  <Mono style={{ fontSize: 11, color: overdue ? C.red : C.t2, width: 70 }}>
                    {item.rd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Mono>
                  <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text, flex: 1 }}>
                    {item.provider} — {item.item}
                  </span>
                  <Mono style={{ fontSize: 12, color: C.text }}>${item.amount_usd.toFixed(2)}{cycleLabel}</Mono>
                  {overdue && <Badge text="OVERDUE" color={C.red} bg={C.redDim} />}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── SECTION 6: FREE TIER USAGE ── */}
      <Card title="Free Tier Usage" pad={false}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { service: 'GitHub API', usage: `${(githubRate.rateLimit - githubRate.rateRemaining).toLocaleString()} req used`, limit: `${githubRate.rateLimit.toLocaleString()}/hr`, pct: ghPct, status: ghPct >= 90 ? C.red : ghPct >= 70 ? C.orange : C.green },
            ...(vercelData ? [{ service: 'Vercel Functions', usage: `${vercelData.functionsInvoked.toLocaleString()} today`, limit: '100,000/mo (Pro)', pct: Math.round(vercelData.functionsInvoked / 1000), status: C.green }] : []),
          ].map((row, i, arr) => (
            <div key={row.service} style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 120px 60px 50px', gap: 12, alignItems: 'center',
              padding: '12px 24px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <Mono style={{ fontSize: 12, color: C.text }}>{row.service}</Mono>
              <Bar pct={row.pct} color={row.status} h={6} />
              <Mono style={{ fontSize: 11, color: C.t3, textAlign: 'right' }}>{row.limit}</Mono>
              <Mono style={{ fontSize: 11, color: C.t2, textAlign: 'right' }}>{row.pct}%</Mono>
              <Dot color={row.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
