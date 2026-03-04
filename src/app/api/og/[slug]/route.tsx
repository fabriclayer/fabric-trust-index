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

function getColor(score: number): string {
  return COLOR_HEX[getScoreColor(score)]
}

interface ServiceRow {
  name: string
  composite_score: number | null
  status: string | null
  category: string | null
  signal_vulnerability: number | null
  signal_operational: number | null
  signal_maintenance: number | null
  signal_adoption: number | null
  signal_transparency: number | null
  signal_publisher_trust: number | null
  publisher: { name: string } | { name: string }[] | null
}

async function fetchService(slug: string): Promise<ServiceRow | null> {
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
  const scoreColor = getColor(score)
  const pub = service.publisher
  const publisherName: string = Array.isArray(pub)
    ? (pub[0]?.name ?? '')
    : (pub?.name ?? '')
  const categoryLabel = (service.category ?? '')
    .replace(/-/g, ' ')
    .toUpperCase()

  const signalScores: Record<string, number> = {
    vulnerability: service.signal_vulnerability ?? 0,
    operational: service.signal_operational ?? 0,
    maintenance: service.signal_maintenance ?? 0,
    adoption: service.signal_adoption ?? 0,
    transparency: service.signal_transparency ?? 0,
    publisher_trust: service.signal_publisher_trust ?? 0,
  }

  const signals = SIGNAL_KEYS.map((key) => ({
    key,
    label: SIGNAL_LABELS[key],
    score: signalScores[key],
  }))

  const statusLabel = (service.status ?? 'pending').toUpperCase()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0a0a',
          padding: '48px 56px',
        }}
      >
        {/* Top bar accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            backgroundColor: scoreColor,
            display: 'flex',
          }}
        />

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          {categoryLabel ? (
            <div style={{ fontSize: 14, color: '#a0a09c', letterSpacing: 1, marginRight: 16 }}>
              {categoryLabel}
            </div>
          ) : null}
          {publisherName ? (
            <div style={{ fontSize: 14, color: '#58584f' }}>
              by {publisherName}
            </div>
          ) : null}
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, marginBottom: 40 }}>
              {service.name.length > 30 ? service.name.slice(0, 28) + '...' : service.name}
            </div>

            {/* Signal bars */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {signals.map((signal) => {
                const barColor = getColor(signal.score)
                return (
                  <div key={signal.key} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: '#787874', width: 190 }}>
                      {signal.label}
                    </div>
                    <div style={{ display: 'flex', flex: 1, height: 14, backgroundColor: '#1a1a16', borderRadius: 7 }}>
                      <div style={{ width: `${Math.max((signal.score / 5) * 100, 2)}%`, height: 14, backgroundColor: barColor, borderRadius: 7 }} />
                    </div>
                    <div style={{ fontSize: 14, color: barColor, width: 40, textAlign: 'right' }}>
                      {signal.score.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right column: score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 180, borderRadius: 90, border: `6px solid ${scoreColor}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 56, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
                  {score.toFixed(2)}
                </div>
                <div style={{ fontSize: 13, color: '#58584f', marginTop: 4 }}>
                  / 5.00
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: scoreColor, marginRight: 8 }} />
              <div style={{ fontSize: 16, color: scoreColor, letterSpacing: 1 }}>
                {statusLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTop: '1px solid #1a1a16' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#58584f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#0a0a0a', marginRight: 10 }}>
              F
            </div>
            <div style={{ fontSize: 14, color: '#58584f' }}>
              Fabric Layer Trust Index
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#3a3a34' }}>
            trust.fabriclayer.ai
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  )
}
