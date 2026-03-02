import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'

export const revalidate = 3600 // Revalidate every hour

export async function GET() {
  const supabase = createAnonClient()

  const { data: services } = await supabase
    .from('services')
    .select('slug, name, composite_score, status, category, updated_at, publisher:publishers!services_publisher_id_fkey(name)')
    .neq('status', 'pending')
    .not('composite_score', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50)

  const items = (services ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = s.publisher as any
    const publisherName: string = Array.isArray(pub) ? (pub[0]?.name ?? '') : (pub?.name ?? '')
    const statusLabel = s.status === 'trusted' ? 'Trusted' : s.status === 'caution' ? 'Caution' : 'Not Recommended'
    return `    <item>
      <title>${escapeXml(s.name)} — ${s.composite_score.toFixed(2)}/5.00 ${statusLabel}</title>
      <link>https://trust.fabriclayer.ai/${s.slug}</link>
      <guid isPermaLink="true">https://trust.fabriclayer.ai/${s.slug}</guid>
      <description>Trust score for ${escapeXml(s.name)}${publisherName ? ` by ${escapeXml(publisherName)}` : ''}: ${s.composite_score.toFixed(2)}/5.00 — ${statusLabel}.</description>
      <category>${escapeXml((s.category ?? '').replace(/-/g, ' '))}</category>
      <pubDate>${new Date(s.updated_at).toUTCString()}</pubDate>
    </item>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Fabric Trust Index — Latest Scores</title>
    <link>https://trust.fabriclayer.ai</link>
    <description>Recently updated trust scores for AI tools, agents, and MCP servers.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://trust.fabriclayer.ai/feed.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
