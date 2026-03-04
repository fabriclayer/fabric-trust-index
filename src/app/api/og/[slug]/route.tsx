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
  const { slug } = await params

  // Debug mode: return minimal image to verify ImageResponse works
  if (request.nextUrl.searchParams.get('debug') === '1') {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: 48 }}>
          Debug: {slug}
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  try {
    const supabase = createAnonClient()
    const { data: service, error } = await supabase
      .from('services')
      .select(
        'name, publisher_id, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust, category, publisher:publishers!services_publisher_id_fkey(name)'
      )
      .eq('slug', slug)
      .single()

    // Debug mode: return query result as JSON
    if (request.nextUrl.searchParams.get('debug') === '2') {
      return new Response(JSON.stringify({ service, error }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Debug mode: simple image with real data (test data rendering)
    if (request.nextUrl.searchParams.get('debug') === '3') {
      const s = service
      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', padding: 48 }}>
            <div style={{ display: 'flex', fontSize: 48, color: '#ffffff', fontWeight: 700 }}>{s?.name ?? slug}</div>
            <div style={{ display: 'flex', fontSize: 24, color: '#787874', marginTop: 16 }}>Score: {(s?.composite_score ?? 0).toFixed(2)}</div>
            <div style={{ display: 'flex', fontSize: 18, color: '#58584f', marginTop: 8 }}>Status: {s?.status ?? 'unknown'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Vulnerability: {(s?.signal_vulnerability ?? 0).toFixed(1)}</div>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Operational: {(s?.signal_operational ?? 0).toFixed(1)}</div>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Maintenance: {(s?.signal_maintenance ?? 0).toFixed(1)}</div>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Adoption: {(s?.signal_adoption ?? 0).toFixed(1)}</div>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Transparency: {(s?.signal_transparency ?? 0).toFixed(1)}</div>
              <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginBottom: 6 }}>Publisher Trust: {(s?.signal_publisher_trust ?? 0).toFixed(1)}</div>
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    // Debug mode: test signal bars with .map()
    if (request.nextUrl.searchParams.get('debug') === '4' && service) {
      const sigs = SIGNAL_KEYS.map((key) => ({
        key,
        label: SIGNAL_LABELS[key],
        score: (service as Record<string, number>)[`signal_${key}`] ?? 0,
      }))
      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', padding: 48 }}>
            <div style={{ display: 'flex', fontSize: 36, color: '#ffffff', marginBottom: 24 }}>{service.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sigs.map((sig) => (
                <div key={sig.key} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', fontSize: 13, color: '#787874', width: 190 }}>{sig.label}</div>
                  <div style={{ display: 'flex', width: 400, height: 14, backgroundColor: '#1a1a16', borderRadius: 7 }}>
                    <div style={{ width: Math.max((sig.score / 5) * 400, 4), height: 14, backgroundColor: getColor(sig.score), borderRadius: 7 }} />
                  </div>
                  <div style={{ display: 'flex', fontSize: 14, color: '#787874', marginLeft: 12 }}>{sig.score.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

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

    const score = service.composite_score ?? 0
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
  } catch (err) {
    // Return error as visible image so we can debug
    const msg = err instanceof Error ? err.message : String(err)
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#d03a3d', fontSize: 20, padding: 40 }}>
          <div style={{ display: 'flex', marginBottom: 16, fontSize: 32 }}>OG Error</div>
          <div style={{ display: 'flex', color: '#787874' }}>{msg.slice(0, 200)}</div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
