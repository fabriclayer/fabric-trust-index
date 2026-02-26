/**
 * Email Alerts via Resend
 *
 * Sends transactional emails (discovery digests, alerts).
 * Requires RESEND_API_KEY env var.
 * Silent no-op if not configured.
 */

import { Resend } from 'resend'

const DISCOVERY_RECIPIENT = process.env.DISCOVERY_EMAIL ?? 'kenny@block9.co'
const FROM_ADDRESS = 'Fabric Trust Index <noreply@fabriclayer.ai>'

export async function sendDiscoveryDigest(candidates: Array<{
  name: string
  slug: string
  description: string
  source: string
  homepage_url: string
  publisher: string
  tags: string[]
}>): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || candidates.length === 0) return false

  // Group by source
  const bySource = new Map<string, typeof candidates>()
  for (const c of candidates) {
    const list = bySource.get(c.source) ?? []
    list.push(c)
    bySource.set(c.source, list)
  }

  const sourceLabels: Record<string, string> = {
    'github-trending': 'GitHub Trending',
    'hackernews': 'Hacker News (Show HN)',
    'producthunt': 'Product Hunt',
    'yc-launches': 'YC Launches',
  }

  // Build HTML email
  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a16;">
      <h2 style="margin: 0 0 4px 0; font-size: 18px;">AI Service Candidates</h2>
      <p style="margin: 0 0 20px 0; color: #787874; font-size: 13px;">${candidates.length} new candidates found — ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  `

  for (const [source, items] of bySource) {
    const label = sourceLabels[source] ?? source
    html += `
      <h3 style="margin: 20px 0 8px 0; font-size: 14px; color: #58584f; border-bottom: 1px solid #e2e2df; padding-bottom: 4px;">${label} (${items.length})</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    `
    for (const c of items) {
      html += `
        <tr style="border-bottom: 1px solid #f0f0ee;">
          <td style="padding: 6px 8px 6px 0; vertical-align: top; width: 30%;">
            <a href="${escapeHtml(c.homepage_url)}" style="color: #068cff; text-decoration: none; font-weight: 600;">${escapeHtml(c.name)}</a>
            <div style="color: #a0a09c; font-size: 11px;">${escapeHtml(c.publisher)}</div>
          </td>
          <td style="padding: 6px 0; color: #58584f; vertical-align: top;">${escapeHtml(c.description.slice(0, 100))}</td>
        </tr>
      `
    }
    html += '</table>'
  }

  html += `
      <p style="margin: 24px 0 0 0; color: #a0a09c; font-size: 11px; font-family: ui-monospace, monospace;">
        Review and approve in Claude Code. Candidates are stored in discovery_queue with status pending_review.
      </p>
    </div>
  `

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: DISCOVERY_RECIPIENT,
      subject: `[Fabric Trust] ${candidates.length} new AI service candidates`,
      html,
    })

    if (error) {
      console.error('Email send failed:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('Email send error:', err)
    return false
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
