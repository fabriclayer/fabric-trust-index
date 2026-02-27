import { createServerClient } from '@/lib/supabase/server'
import { enrichService } from '@/lib/enrichment'
import { logApiUsage } from '@/lib/api-usage'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOKENS = 300

const SYSTEM_PROMPT = `You are the Fabric Trust Index scoring engine. Write a concise 2-paragraph trust assessment (80-100 words total) for the given service based on its signal data, metadata, and README.

Paragraph 1: Summarize what the service does and its overall trust posture — mention the composite score context and key strengths or concerns.

Paragraph 2: Highlight specific findings from the signal data — mention notable scores, any red flags, maintenance activity, adoption indicators, or transparency gaps.

Rules:
- Be factual and neutral. Never say "safe" or "dangerous" — use "low risk detected" or "not recommended".
- Do not use marketing language. Write like infrastructure documentation.
- Reference specific data points (scores, CVE counts, uptime, download counts) when available.
- If data is limited, say so honestly.
- Do not include headings, bullet points, or markdown formatting — just two plain paragraphs.`

interface SignalScore {
  name: string
  score: number
  metadata?: Record<string, unknown>
}

export async function generateAssessment(serviceId: string): Promise<void> {
  const supabase = createServerClient()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set')
  }

  // Fetch service
  const { data: service } = await supabase
    .from('services')
    .select('*, publisher:publishers(name)')
    .eq('id', serviceId)
    .single()

  if (!service) {
    console.error(`Service ${serviceId} not found`)
    return
  }

  // Run enrichment if needed
  if (!service.readme_excerpt) {
    try {
      await enrichService({
        id: service.id,
        slug: service.slug,
        name: service.name,
        discovered_from: service.discovered_from,
        npm_package: service.npm_package,
        pypi_package: service.pypi_package,
        github_repo: service.github_repo,
        readme_excerpt: service.readme_excerpt,
      })
      // Re-fetch to get updated fields
      const { data: refreshed } = await supabase
        .from('services')
        .select('readme_excerpt, license, dependency_count, dependencies_raw')
        .eq('id', serviceId)
        .single()
      if (refreshed) {
        service.readme_excerpt = refreshed.readme_excerpt
        service.license = refreshed.license
        service.dependency_count = refreshed.dependency_count
        service.dependencies_raw = refreshed.dependencies_raw
      }
    } catch (err) {
      console.error(`Enrichment failed for ${service.slug}:`, err)
    }
  }

  // Fetch signal metadata
  const signalNames = service.discovered_from === 'clawhub'
    ? ['virustotal_scan', 'content_safety', 'publisher_reputation', 'adoption', 'freshness', 'transparency']
    : ['vulnerability', 'operational', 'maintenance', 'adoption', 'transparency', 'publisher_trust']

  const signals: SignalScore[] = []
  for (const name of signalNames) {
    const { data } = await supabase
      .from('signal_history')
      .select('score, metadata')
      .eq('service_id', serviceId)
      .eq('signal_name', name)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      signals.push({ name, score: data.score, metadata: data.metadata })
    }
  }

  // Build user message
  const publisherName = service.publisher?.name ?? 'Unknown'
  const signalSummary = signals.map(s => {
    const meta = s.metadata ? summarizeMetadata(s.name, s.metadata) : ''
    return `- ${s.name}: ${s.score.toFixed(2)}/5.00${meta ? ` (${meta})` : ''}`
  }).join('\n')

  const userMessage = [
    `Service: ${service.name}`,
    `Category: ${service.category}`,
    `Publisher: ${publisherName}`,
    `Source: ${service.discovered_from ?? 'unknown'}`,
    `License: ${service.license ?? 'unknown'}`,
    `Description: ${service.description ?? 'none'}`,
    `Composite Score: ${service.composite_score?.toFixed(2) ?? 'N/A'}/5.00`,
    `Status: ${service.status}`,
    service.dependency_count != null ? `Dependencies: ${service.dependency_count}` : null,
    service.dependencies_raw ? `Dependency list: ${service.dependencies_raw.slice(0, 300)}` : null,
    '',
    'Signal Scores:',
    signalSummary,
    '',
    service.readme_excerpt ? `README excerpt:\n${service.readme_excerpt.slice(0, 600)}` : 'No README available.',
  ].filter(Boolean).join('\n')

  // Strip lone surrogates and control chars that break JSON serialization
  const cleanMessage = userMessage.replace(/[\uD800-\uDFFF]|[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  // Call Claude API
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: cleanMessage }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errText}`)
    }

    const result = await res.json()
    const assessment = result.content?.[0]?.text?.trim()

    if (!assessment) {
      throw new Error(`Empty assessment response for ${service.slug}`)
    }

    // Store assessment
    const { error: updateError } = await supabase
      .from('services')
      .update({
        ai_assessment: assessment,
        ai_assessment_updated_at: new Date().toISOString(),
      })
      .eq('id', serviceId)

    if (updateError) {
      throw new Error(`DB update failed for ${service.slug}: ${updateError.message}`)
    }

    // Log cost
    const inputTokens = result.usage?.input_tokens ?? 0
    const outputTokens = result.usage?.output_tokens ?? 0
    console.log(`[assessment] ${service.slug}: ${inputTokens} in / ${outputTokens} out (${MODEL})`)

    // Track API costs
    logApiUsage({ caller: 'assessment-generator', model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens, service_slug: service.slug }).catch(() => {})

  } catch (err) {
    console.error(`Assessment generation failed for ${service.slug}:`, err)
    throw err
  }
}

function summarizeMetadata(signalName: string, meta: Record<string, unknown>): string {
  const parts: string[] = []

  switch (signalName) {
    case 'vulnerability':
    case 'virustotal_scan':
      if (meta.total_cves != null) parts.push(`${meta.total_cves} CVEs`)
      if (meta.malicious_count != null) parts.push(`${meta.malicious_count} malicious detections`)
      if (meta.suspicious_count != null && (meta.suspicious_count as number) > 0) parts.push(`${meta.suspicious_count} suspicious`)
      if (meta.isMalwareBlocked) parts.push('malware blocked')
      if (meta.has_critical_unpatched) parts.push('critical unpatched')
      break

    case 'operational':
      if (meta.uptime_percent != null) parts.push(`${(meta.uptime_percent as number).toFixed(1)}% uptime`)
      if (meta.p50_ms != null) parts.push(`p50: ${meta.p50_ms}ms`)
      break

    case 'maintenance':
    case 'freshness':
      if (meta.days_since_release != null) parts.push(`${meta.days_since_release}d since release`)
      if (meta.days_since_commit != null) parts.push(`${meta.days_since_commit}d since commit`)
      if (meta.version_count != null) parts.push(`${meta.version_count} versions`)
      break

    case 'adoption':
      if (meta.weekly_downloads != null) parts.push(`${formatNumber(meta.weekly_downloads as number)} weekly downloads`)
      if (meta.stars != null) parts.push(`${formatNumber(meta.stars as number)} stars`)
      if (meta.installs_all_time != null) parts.push(`${formatNumber(meta.installs_all_time as number)} installs`)
      break

    case 'transparency':
      if (meta.has_readme != null) parts.push(meta.has_readme ? 'has README' : 'no README')
      if (meta.has_license != null) parts.push(meta.has_license ? 'licensed' : 'no license')
      if (meta.has_description != null) parts.push(meta.has_description ? 'described' : 'no description')
      break

    case 'publisher_trust':
    case 'publisher_reputation':
      if (meta.account_age_days != null) parts.push(`${meta.account_age_days}d old account`)
      if (meta.total_skills != null) parts.push(`${meta.total_skills} skills`)
      if (meta.npm_maintainers) parts.push(`${(meta.npm_maintainers as string[]).length} maintainers`)
      break

    case 'content_safety':
      if (meta.issues_found != null) parts.push(`${meta.issues_found} issues`)
      if (meta.has_secrets) parts.push('potential secrets')
      if (meta.has_dangerous_commands) parts.push('dangerous commands')
      break
  }

  return parts.join(', ')
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
