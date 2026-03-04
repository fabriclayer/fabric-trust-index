import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { getScoreColor } from '@/lib/scoring/thresholds'

export const runtime = 'edge'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const supabase = createAnonClient()
    const { data: service, error } = await supabase
      .from('services')
      .select(
        'name, publisher_id, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, category, publisher:publishers!services_publisher_id_fkey(name)'
      )
      .eq('slug', slug)
      .single()

    if (error || !service) {
      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#787874', fontSize: 24 }}>
            Service not found
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    const score = service.composite_score
    const scoreColor = getColor(score)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = service.publisher as any
    const publisherName: string = Array.isArray(pub)
      ? (pub[0]?.name ?? '')
      : (pub?.name ?? '')
    const categoryLabel = (service.category ?? '')
      .replace(/-/g, ' ')
      .toUpperCase()

    const signalScores: Record<string, number> = {
      vulnerability: service.signal_vulnerability,
      operational: service.signal_operational,
      maintenance: service.signal_maintenance,
      adoption: service.signal_adoption,
      transparency: service.signal_transparency,
      publisher_trust: service.signal_publisher_trust,
    }

    const signals = SIGNAL_KEYS.map((key) => ({
      key,
      label: SIGNAL_LABELS[key],
      score: signalScores[key] ?? 0,
    }))

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
            fontFamily: 'sans-serif',
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
              background: `linear-gradient(90deg, ${scoreColor}, #068cff)`,
              display: 'flex',
            }}
          />

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            {categoryLabel && (
              <div style={{ fontSize: 14, color: '#a0a09c', letterSpacing: '0.06em', marginRight: 16 }}>
                {categoryLabel}
              </div>
            )}
            {publisherName && (
              <div style={{ fontSize: 14, color: '#58584f' }}>
                by {publisherName}
              </div>
            )}
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', flex: 1 }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
              <div style={{ fontSize: 52, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 40 }}>
                {service.name.length > 30 ? service.name.slice(0, 28) + '...' : service.name}
              </div>

              {/* Signal bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {signals.map((signal) => {
                  const barWidth = Math.max((signal.score / 5) * 100, 2)
                  const barColor = getColor(signal.score)
                  return (
                    <div key={signal.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 13, color: '#787874', width: 190, flexShrink: 0 }}>
                        {signal.label}
                      </div>
                      <div style={{ display: 'flex', flex: 1, height: 14, backgroundColor: '#1a1a16', borderRadius: 7, overflow: 'hidden' }}>
                        <div style={{ width: `${barWidth}%`, height: '100%', backgroundColor: barColor, borderRadius: 7 }} />
                      </div>
                      <div style={{ fontSize: 14, color: barColor, width: 36, textAlign: 'right', flexShrink: 0 }}>
                        {signal.score.toFixed(1)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right column: score */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 240, flexShrink: 0 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: scoreColor }} />
                <div style={{ fontSize: 16, color: scoreColor, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  {service.status === 'pending' ? 'PENDING' : service.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTop: '1px solid #1a1a16' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#58584f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>
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
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), stack: (err as Error)?.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
