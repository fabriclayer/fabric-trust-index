import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { getScoreColor } from '@/lib/scoring/thresholds'

export const runtime = 'edge'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s+/g, '')

const COLOR_HEX = {
  green: '#0dc956',
  orange: '#f7931e',
  red: '#d03a3d',
} as const

export async function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get('level') ?? '1'

  // Level 1: minimal (already works)
  if (level === '1') {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: 64 }}>
          OG Test Level 1
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // Level 2: use getScoreColor
  if (level === '2') {
    const color = COLOR_HEX[getScoreColor(4.5)]
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: color, fontSize: 64 }}>
          Score Color: {color}
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // Level 3: fetch from supabase REST
  if (level === '3') {
    const url = `${SUPABASE_URL}/rest/v1/services?slug=eq.agentmail&select=name,composite_score&limit=1`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    const rows = await res.json()
    const name = rows?.[0]?.name ?? 'not found'
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: 48 }}>
          Fetched: {name}
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // Level 4: fetch + getScoreColor + complex JSX
  if (level === '4') {
    const url = `${SUPABASE_URL}/rest/v1/services?slug=eq.agentmail&select=name,composite_score&limit=1`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    const rows = await res.json()
    const score = rows?.[0]?.composite_score ?? 0
    const color = COLOR_HEX[getScoreColor(score)]
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', padding: 48 }}>
          <div style={{ display: 'flex', fontSize: 48, color: '#ffffff', fontWeight: 700 }}>
            {rows?.[0]?.name ?? 'unknown'}
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: color, marginTop: 16 }}>
            Score: {score.toFixed(2)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
            <div style={{ display: 'flex', width: 400, height: 20, backgroundColor: '#1a1a16', borderRadius: 10 }}>
              <div style={{ width: Math.max((score / 5) * 400, 4), height: 20, backgroundColor: color, borderRadius: 10 }} />
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // Level 5: full render like the slug route
  const url = `${SUPABASE_URL}/rest/v1/services?slug=eq.agentmail&select=name,composite_score,status,signal_vulnerability,signal_operational,signal_maintenance,signal_adoption,signal_transparency,signal_publisher_trust,category,publisher:publishers!services_publisher_id_fkey(name)&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  const rows = await res.json()
  const service = rows?.[0]
  if (!service) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#787874', fontSize: 24 }}>
          Not found
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  const score = service.composite_score ?? 0
  const scoreColor = COLOR_HEX[getScoreColor(score)]
  const pub = service.publisher
  const publisherName: string = Array.isArray(pub) ? (pub[0]?.name ?? '') : (pub?.name ?? '')
  const statusLabel = (service.status ?? 'pending').toUpperCase()

  const signals = [
    { key: 'vuln', label: 'Vulnerability & Safety', score: service.signal_vulnerability ?? 0 },
    { key: 'ops', label: 'Operational Health', score: service.signal_operational ?? 0 },
    { key: 'maint', label: 'Maintenance Activity', score: service.signal_maintenance ?? 0 },
    { key: 'adopt', label: 'Adoption', score: service.signal_adoption ?? 0 },
    { key: 'trans', label: 'Transparency', score: service.signal_transparency ?? 0 },
    { key: 'pub', label: 'Publisher Trust', score: service.signal_publisher_trust ?? 0 },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', padding: '48px 56px' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: scoreColor, display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          {publisherName ? <div style={{ fontSize: 14, color: '#58584f' }}>by {publisherName}</div> : null}
        </div>
        <div style={{ display: 'flex', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: 40 }}>
              {service.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {signals.map((sig) => {
                const c = COLOR_HEX[getScoreColor(sig.score)]
                return (
                  <div key={sig.key} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: '#787874', width: 190 }}>{sig.label}</div>
                    <div style={{ display: 'flex', flex: 1, height: 14, backgroundColor: '#1a1a16', borderRadius: 7 }}>
                      <div style={{ width: `${Math.max((sig.score / 5) * 100, 2)}%`, height: 14, backgroundColor: c, borderRadius: 7 }} />
                    </div>
                    <div style={{ fontSize: 14, color: c, width: 40, textAlign: 'right' }}>{sig.score.toFixed(1)}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 180, borderRadius: 90, border: `6px solid ${scoreColor}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 56, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score.toFixed(2)}</div>
                <div style={{ fontSize: 13, color: '#58584f', marginTop: 4 }}>/ 5.00</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: scoreColor, marginRight: 8 }} />
              <div style={{ fontSize: 16, color: scoreColor, letterSpacing: 1 }}>{statusLabel}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTop: '1px solid #1a1a16' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#58584f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginRight: 10 }}>F</div>
            <div style={{ fontSize: 14, color: '#58584f' }}>Fabric Layer Trust Index</div>
          </div>
          <div style={{ fontSize: 13, color: '#3a3a34' }}>trust.fabriclayer.ai</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    }
  )
}
