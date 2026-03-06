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

const RATING_PATH = "M0,14.57v94.17c0,8.05,6.52,14.57,14.57,14.57h94.17c8.05,0,14.57-6.52,14.57-14.57V14.57c0-8.05-6.52-14.57-14.57-14.57H14.57C6.52,0,0,6.52,0,14.57ZM72.96,19.4l7.51,5.41-3.57,30.98,16.03-21.88,6.81,4.91-16.79,23.14-13.59-9.91,3.6-32.65ZM31.62,33.12l28.33,12.98-15.83-22.06,6.82-4.91,16.79,23.08-13.61,9.92-29.9-13.51,7.4-5.5ZM24.42,82.22l21.23-23.06-25.9,8.28-2.63-7.97,27.17-8.81,5.18,15.99-22.09,24.25-2.96-8.68ZM68.91,104.19l-15.35-27.39-.1,27.29-8.49.04v-28.57s16.89-.04,16.89-.04l16.22,28.51-9.17.16ZM103.46,68.68l-30.49,6.14,25.61,8.48-2.51,8.04-27.14-8.8,5.19-16.02,32.08-6.63-2.74,8.79Z"

const LETTER_COLORS = [
  { bg: '#EEF2FF', text: '#4338CA' },
  { bg: '#F0FDF4', text: '#166534' },
  { bg: '#FFF7ED', text: '#C2410C' },
  { bg: '#FDF2F8', text: '#BE185D' },
  { bg: '#F0F9FF', text: '#0369A1' },
  { bg: '#FEF3C7', text: '#B45309' },
  { bg: '#F5F3FF', text: '#7C3AED' },
  { bg: '#ECFDF5', text: '#047857' },
  { bg: '#FFF1F2', text: '#BE123C' },
  { bg: '#E0F2FE', text: '#0C4A6E' },
]

function nameToColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return LETTER_COLORS[Math.abs(hash) % LETTER_COLORS.length]
}

async function fetchService(slug: string) {
  const url = `${SUPABASE_URL}/rest/v1/services?slug=eq.${encodeURIComponent(slug)}&select=name,composite_score,status,category,description,logo_url,github_repo,publisher:publishers!services_publisher_id_fkey(name)&limit=1`
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

async function fetchRank(score: number): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/services?select=id&status=neq.pending&or=(npm_package.not.is.null,github_repo.not.is.null,endpoint_url.not.is.null,pypi_package.not.is.null,homepage_url.not.is.null)&composite_score=gt.${score}`
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'count=exact',
    },
  })
  const range = res.headers.get('content-range') ?? ''
  const total = parseInt(range.split('/')[1] ?? '0', 10)
  return (isNaN(total) ? 0 : total) + 1
}

function getLogoUrl(service: { logo_url?: string; github_repo?: string }): string | null {
  if (service.logo_url) return service.logo_url
  if (service.github_repo) {
    const owner = service.github_repo.split('/')[0]
    if (owner) return `https://github.com/${owner}.png?size=160`
  }
  return null
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
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', color: '#a0a09c', fontSize: 24, fontFamily: 'sans-serif' }}>
          Service not found
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  const score = service.composite_score ?? 0
  const status = service.status ?? 'pending'
  const scoreColor = COLOR_HEX[getScoreColor(score)]
  const pub = service.publisher
  const publisherName: string = Array.isArray(pub) ? (pub[0]?.name ?? '') : (pub?.name ?? '')
  const description = (service.description ?? '').slice(0, 160)
  const category = (service.category ?? 'infra').replace(/-/g, ' ')
  const logoUrl = getLogoUrl(service)

  const rank = await fetchRank(score)

  // Build rating boxes
  const full = Math.floor(score)
  const frac = score - full
  const boxSize = 88
  const boxGap = 12

  const ratingBoxes = []
  for (let i = 1; i <= 5; i++) {
    let fillPct = 0
    if (i <= full) fillPct = 100
    else if (i === full + 1) fillPct = Math.round(frac * 100)

    ratingBoxes.push(
      <div key={i} style={{ display: 'flex', position: 'relative', width: boxSize, height: boxSize, flexShrink: 0 }}>
        {/* Gray background */}
        <svg viewBox="0 0 123.32 123.32" width={boxSize} height={boxSize} style={{ position: 'absolute', top: 0, left: 0 }}>
          <path d={RATING_PATH} fill="#e6e6e6" />
        </svg>
        {/* Colored fill */}
        {fillPct > 0 && (
          <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: `${fillPct}%`, height: '100%', overflow: 'hidden' }}>
            <svg viewBox="0 0 123.32 123.32" width={boxSize} height={boxSize} style={{ flexShrink: 0 }}>
              <path d={RATING_PATH} fill={scoreColor} />
            </svg>
          </div>
        )}
      </div>
    )
  }

  // Logo element
  const logoElement = logoUrl ? (
    <img
      src={logoUrl}
      width={160}
      height={160}
      style={{
        borderRadius: 40,
        border: '1px solid #e8e8e6',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  ) : (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 160,
      height: 160,
      borderRadius: 40,
      backgroundColor: nameToColor(service.name).bg,
      color: nameToColor(service.name).text,
      fontSize: 64,
      fontWeight: 600,
      flexShrink: 0,
      border: `1px solid ${nameToColor(service.name).text}20`,
    }}>
      {service.name.replace(/^@/, '').charAt(0).toUpperCase()}
    </div>
  )

  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: '48px 56px',
      }}>
        {/* Header: Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>
          {logoElement}
          <div style={{
            display: 'flex',
            fontSize: 80,
            fontWeight: 700,
            color: '#0a0a0a',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            flex: 1,
            minWidth: 0,
          }}>
            {service.name.length > 20 ? service.name.slice(0, 18) + '...' : service.name}
          </div>
        </div>

        {/* Rank + Category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            fontSize: 32,
            fontWeight: 600,
            color: scoreColor,
          }}>
            #{rank}
          </div>
          <div style={{
            display: 'flex',
            fontSize: 13,
            fontWeight: 500,
            color: '#c8c8c4',
            border: '1px solid #e8e8e6',
            borderRadius: 20,
            padding: '4px 14px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {category}
          </div>
        </div>

        {/* Description */}
        <div style={{
          display: 'flex',
          fontSize: 22,
          lineHeight: 1.5,
          color: '#58584f',
        }}>
          {description || 'No description available.'}
        </div>

        {/* Bottom section — pushed to bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          {/* Rating boxes + Score + Beta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: boxGap }}>
            {ratingBoxes}
            <div style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 700,
              color: scoreColor,
              marginLeft: 16,
              letterSpacing: '-0.02em',
            }}>
              {score.toFixed(2)}
            </div>
            <div style={{
              display: 'flex',
              fontSize: 30,
              fontWeight: 600,
              color: '#a0a09c',
              border: '1px solid #e8e8e6',
              borderRadius: 8,
              padding: '4px 14px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginLeft: 'auto',
            }}>
              Beta
            </div>
          </div>
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
