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

const SIGNAL_LABELS: Record<string, string> = {
  vulnerability: 'Vulnerability & Safety',
  operational: 'Operational Health',
  maintenance: 'Maintenance Activity',
  adoption: 'Adoption',
  transparency: 'Transparency',
  publisher_trust: 'Publisher Trust',
}

const SIGNAL_KEYS = [
  'vulnerability',
  'operational',
  'maintenance',
  'adoption',
  'transparency',
  'publisher_trust',
] as const

async function fetchService(slug: string) {
  const url = `${SUPABASE_URL}/rest/v1/services?slug=eq.${encodeURIComponent(slug)}&select=name,composite_score,status,signal_vulnerability,signal_operational,signal_maintenance,signal_adoption,signal_transparency,signal_publisher_trust,category,publisher:publishers!services_publisher_id_fkey(name)&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = await fetchService(slug)

  if (!service) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#787874', fontSize: 24 }}>
          Service not found
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  const score = service.composite_score ?? 0
  const scoreColor = COLOR_HEX[getScoreColor(score)]
  const pub = service.publisher
  const publisherName: string = Array.isArray(pub) ? (pub[0]?.name ?? '') : (pub?.name ?? '')

  const signals = SIGNAL_KEYS.map((key) => ({
    key,
    label: SIGNAL_LABELS[key],
    score: (service[`signal_${key}`] as number) ?? 0,
  }))

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', padding: '48px 56px' }}>
        {/* Top bar accent (flow, not absolute) */}
        <div style={{ display: 'flex', width: 1200, height: 4, backgroundColor: scoreColor, marginTop: -48, marginLeft: -56, marginBottom: 44 }} />

        {/* Title + publisher */}
        <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
          {service.name.length > 30 ? service.name.slice(0, 28) + '...' : service.name}
        </div>
        {publisherName ? (
          <div style={{ display: 'flex', fontSize: 14, color: '#58584f', marginBottom: 32 }}>by {publisherName}</div>
        ) : (
          <div style={{ display: 'flex', marginBottom: 32 }} />
        )}

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1 }}>
          {/* Left: signal bars */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
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

          {/* Right: score circle */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 180, borderRadius: 90, border: `6px solid ${scoreColor}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 56, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score.toFixed(2)}</div>
                <div style={{ fontSize: 13, color: '#58584f', marginTop: 4 }}>/ 5.00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
