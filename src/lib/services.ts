import { createServerClient } from '@/lib/supabase/server'
import type { Service } from '@/data/services'
import { TAG_CLASSES } from '@/lib/utils'

// Format relative time from ISO timestamp
function formatUpdatedAt(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function extractDomain(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function dbToService(db: any): Service {
  return {
    name: db.name,
    slug: db.slug,
    publisher: db.publisher?.name ?? 'Unknown',
    publisher_url: db.publisher?.website_url || undefined,
    category: db.category,
    tag: TAG_CLASSES[db.category] || '',
    description: db.description ?? '',
    signals: [
      db.signal_vulnerability,
      db.signal_operational,
      db.signal_maintenance,
      db.signal_adoption,
      db.signal_transparency,
      db.signal_publisher_trust,
    ],
    score: db.composite_score,
    raw_composite_score: db.raw_composite_score ?? null,
    status: db.status,
    icon: db.icon,
    logo_url: db.logo_url || (db.icon?.startsWith('http') ? db.icon : undefined),
    updated: formatUpdatedAt(db.updated_at),
    domain: extractDomain(db.publisher?.website_url),
    uptime_30d: db.uptime_30d || undefined,
    avg_latency_ms: db.avg_latency_ms || undefined,
    p50_latency_ms: db.p50_latency_ms || undefined,
    p99_latency_ms: db.p99_latency_ms || undefined,
    github_repo: db.github_repo || undefined,
    npm_package: db.npm_package || undefined,
    pypi_package: db.pypi_package || undefined,
    endpoint_url: db.endpoint_url || undefined,
    capabilities: db.capabilities?.length > 0 ? db.capabilities : undefined,
    pricing: db.pricing || undefined,
    request_schema: db.request_schema || undefined,
    response_schema: db.response_schema || undefined,
    tags: db.tags?.length > 0 ? db.tags : undefined,
    language: db.language || undefined,
    homepage_url: db.homepage_url || undefined,
    docs_url: db.docs_url || undefined,
    x_url: db.x_url || undefined,
    discord_url: db.discord_url || undefined,
    status_page_url: db.status_page_url || undefined,
    active_modifiers: db.active_modifiers?.length > 0 ? db.active_modifiers : undefined,
    ai_assessment: db.ai_assessment || null,
    ai_assessment_updated_at: db.ai_assessment_updated_at || null,
    score_confidence: db.score_confidence ?? null,
    signals_with_data: db.signals_with_data ?? null,
    created_at: db.created_at || undefined,
    updated_at: db.updated_at || undefined,
  }
}

export async function getAllSlugs(): Promise<string[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('services')
    .select('slug')
  if (error) throw error
  return (data ?? []).map((d: { slug: string }) => d.slug)
}

export async function getServices(): Promise<Service[]> {
  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('services')
      .select('*, publisher:publishers(name, website_url)')
      .order('composite_score', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // Hide pending services and those with no real data sources
  return all
    .filter(db => db.status !== 'pending' && (db.npm_package || db.github_repo || db.endpoint_url || db.pypi_package || db.homepage_url))
    .map(dbToService)
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('services')
    .select('*, publisher:publishers(name, website_url)')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return dbToService(data)
}

// Additional helpers for product page data
export async function getServiceId(slug: string): Promise<string | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('services')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id ?? null
}

export async function getServiceIncidents(serviceId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('incidents')
    .select('*')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function getServiceVersions(serviceId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('versions')
    .select('*')
    .eq('service_id', serviceId)
    .order('released_at', { ascending: false })
    .limit(10)
  return data ?? []
}

export async function getServiceSupplyChain(serviceId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('supply_chain')
    .select('*')
    .eq('service_id', serviceId)
    .order('dependency_name')
  return data ?? []
}

export async function getServiceHealthSummary(serviceId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('health_checks')
    .select('*')
    .eq('service_id', serviceId)
    .order('checked_at', { ascending: false })
    .limit(100)
  return data ?? []
}

export async function getServiceCves(serviceId: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('cve_records')
    .select('*')
    .eq('service_id', serviceId)
    .order('discovered_at', { ascending: false })
  return data ?? []
}

export async function getSignalHistory(serviceId: string, signalName?: string) {
  const supabase = createServerClient()
  let query = supabase
    .from('signal_history')
    .select('*')
    .eq('service_id', serviceId)
    .order('recorded_at', { ascending: true })
    .limit(90) // ~3 months of daily data
  if (signalName) {
    query = query.eq('signal_name', signalName)
  }
  const { data } = await query
  return data ?? []
}

export async function getRecentIncidents(limit = 200) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('incidents')
    .select('*, service:services(name, slug, status)')
    .neq('type', 'initial_index')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getLatestSignalMeta(serviceId: string, signalName: string): Promise<Record<string, any> | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('signal_history')
    .select('metadata')
    .eq('service_id', serviceId)
    .eq('signal_name', signalName)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()
  return data?.metadata ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAllSignalMetas(serviceId: string): Promise<Record<string, Record<string, any>>> {
  const supabase = createServerClient()
  // Fetch both skill and standard signal metadata
  const signals = [
    // Skill signals
    'virustotal_scan', 'content_safety', 'publisher_reputation', 'adoption', 'freshness', 'transparency',
    // Standard signals
    'vulnerability', 'operational', 'maintenance', 'publisher_trust',
  ]
  const results = await Promise.all(
    signals.map(s => getLatestSignalMeta(serviceId, s).then(meta => [s, meta] as const))
  )
  const out: Record<string, Record<string, any>> = {}
  for (const [name, meta] of results) {
    if (meta) out[name] = meta
  }
  return out
}
