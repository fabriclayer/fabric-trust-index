import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Embeddable SVG Trust Score Badge
 *
 * GET /api/badge/{slug}          → flat shields.io-style badge
 * GET /api/badge/{slug}?style=detailed → larger badge with score bar
 *
 * Color: green >= 3.25, amber >= 2.0, red < 2.0
 * Cache: public, 1 hour
 * CORS: open (embeddable anywhere)
 */

function getColor(score: number): string {
  if (score >= 3.25) return '#0dc956'
  if (score >= 2.0) return '#f7931e'
  return '#d03a3d'
}

function getStatus(score: number): string {
  if (score >= 3.5) return 'Trusted'
  if (score >= 2.5) return 'Caution'
  return 'Blocked'
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function flatBadge(score: number): string {
  const color = getColor(score)
  const scoreText = score.toFixed(2)
  const labelWidth = 90
  const valueWidth = 50
  const totalWidth = labelWidth + valueWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="Fabric Trust: ${scoreText}">
  <title>Fabric Trust: ${scoreText}/5.00</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">Fabric Trust</text>
    <text x="${labelWidth / 2}" y="13">Fabric Trust</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${scoreText}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${scoreText}</text>
  </g>
</svg>`
}

function detailedBadge(name: string, score: number): string {
  const color = getColor(score)
  const status = getStatus(score)
  const scoreText = score.toFixed(2)
  const safeName = escapeXml(name.length > 28 ? name.slice(0, 26) + '...' : name)
  const barWidth = Math.round((score / 5) * 120)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="64" role="img" aria-label="${escapeXml(name)} Trust Score: ${scoreText}">
  <title>${escapeXml(name)} — ${scoreText}/5.00 (${status})</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f8f8f6"/>
    </linearGradient>
  </defs>
  <rect width="200" height="64" rx="6" fill="url(#bg)" stroke="#e2e2df" stroke-width="1"/>
  <text x="12" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" fill="#1a1a16">${safeName}</text>
  <text x="12" y="32" font-family="ui-monospace,monospace" font-size="9" fill="#787874" text-transform="uppercase" letter-spacing="0.5">${status}</text>
  <rect x="12" y="40" width="120" height="8" rx="4" fill="#e2e2df"/>
  <rect x="12" y="40" width="${barWidth}" height="8" rx="4" fill="${color}"/>
  <text x="142" y="48" font-family="ui-monospace,monospace" font-size="14" font-weight="600" fill="${color}">${scoreText}</text>
  <text x="12" y="58" font-family="ui-monospace,monospace" font-size="7" fill="#a0a09c">fabriclayer.ai/trust</text>
</svg>`
}

function notFoundBadge(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20" role="img" aria-label="Fabric Trust: not found">
  <title>Fabric Trust: not found</title>
  <clipPath id="r"><rect width="140" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="90" height="20" fill="#555"/>
    <rect x="90" width="50" height="20" fill="#9f9f9f"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="45" y="14" fill="#010101" fill-opacity=".3">Fabric Trust</text>
    <text x="45" y="13">Fabric Trust</text>
    <text x="115" y="14" fill="#010101" fill-opacity=".3">N/A</text>
    <text x="115" y="13">N/A</text>
  </g>
</svg>`
}

function errorBadge(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20" role="img" aria-label="Fabric Trust: error">
  <title>Fabric Trust: error</title>
  <clipPath id="r"><rect width="140" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="90" height="20" fill="#555"/>
    <rect x="90" width="50" height="20" fill="#d03a3d"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="45" y="14" fill="#010101" fill-opacity=".3">Fabric Trust</text>
    <text x="45" y="13">Fabric Trust</text>
    <text x="115" y="14" fill="#010101" fill-opacity=".3">error</text>
    <text x="115" y="13">error</text>
  </g>
</svg>`
}

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  'Access-Control-Allow-Origin': '*',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const style = _request.nextUrl.searchParams.get('style')

  try {
    const supabase = createServerClient()
    const { data: service } = await supabase
      .from('services')
      .select('name, composite_score, status')
      .eq('slug', slug)
      .single()

    if (!service) {
      return new NextResponse(notFoundBadge(), { status: 404, headers: SVG_HEADERS })
    }

    const svg = style === 'detailed'
      ? detailedBadge(service.name, service.composite_score)
      : flatBadge(service.composite_score)

    return new NextResponse(svg, { status: 200, headers: SVG_HEADERS })
  } catch {
    return new NextResponse(errorBadge(), { status: 500, headers: SVG_HEADERS })
  }
}
