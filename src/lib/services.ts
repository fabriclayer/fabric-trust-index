import { createAnonClient } from '@/lib/supabase/server'
import type { Service } from '@/data/services'
import { TAG_CLASSES } from '@/lib/utils'

// Format relative time from ISO timestamp
function formatUpdatedAt(isoDate: string): string {
  const d = new Date(isoDate)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} at ${time}`
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
    id: db.id,
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
    signal_scores: db.signal_scores || null,
    created_at: db.created_at || undefined,
    updated_at: db.updated_at || undefined,
  }
}

export async function getAllSlugs(): Promise<{ slug: string; updated_at: string | null }[]> {
  const supabase = createAnonClient()
  const all: { slug: string; updated_at: string | null }[] = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('services')
      .select('slug, updated_at, status, npm_package, github_repo, endpoint_url, pypi_package, homepage_url')
      .neq('status', 'pending')
      .order('slug')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    // Match getServices() visibility filter
    for (const d of data) {
      if (d.npm_package || d.github_repo || d.endpoint_url || d.pypi_package || d.homepage_url) {
        all.push({ slug: d.slug, updated_at: d.updated_at })
      }
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

/** Lean query for directory listing — selects only card-relevant columns and filters at the DB level */
export async function getServicesForDirectory(): Promise<Service[]> {
  const supabase = createAnonClient()
  const COLUMNS = 'name, slug, description, category, composite_score, status, icon, logo_url, updated_at, created_at, github_repo, publisher:publishers(name, website_url)'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('services')
      .select(COLUMNS)
      .neq('status', 'pending')
      .or('npm_package.not.is.null,github_repo.not.is.null,endpoint_url.not.is.null,pypi_package.not.is.null,homepage_url.not.is.null')
      .order('composite_score', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all.map((db, i) => ({
    name: db.name,
    slug: db.slug,
    publisher: db.publisher?.name ?? 'Unknown',
    publisher_url: db.publisher?.website_url || undefined,
    category: db.category,
    tag: TAG_CLASSES[db.category] || '',
    description: db.description ?? '',
    signals: [],
    score: db.composite_score,
    status: db.status,
    icon: db.icon,
    logo_url: db.logo_url || (db.icon?.startsWith('http') ? db.icon : undefined),
    updated: formatUpdatedAt(db.updated_at),
    domain: extractDomain(db.publisher?.website_url),
    github_repo: db.github_repo || undefined,
    created_at: db.created_at || undefined,
    updated_at: db.updated_at || undefined,
    rank: i + 1,
  }))
}

export async function getServices(): Promise<Service[]> {
  const supabase = createAnonClient()
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
  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('services')
    .select('*, publisher:publishers(name, website_url)')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return dbToService(data)
}

/** Global rank: count visible services with a higher composite_score + 1 */
export async function getServiceRank(slug: string): Promise<number | null> {
  const supabase = createAnonClient()
  const { data: svc } = await supabase
    .from('services')
    .select('composite_score')
    .eq('slug', slug)
    .single()
  if (!svc) return null

  const { count, error } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'pending')
    .or('npm_package.not.is.null,github_repo.not.is.null,endpoint_url.not.is.null,pypi_package.not.is.null,homepage_url.not.is.null')
    .gt('composite_score', svc.composite_score)

  if (error || count === null) return null
  return count + 1
}

// Additional helpers for product page data
export async function getServiceId(slug: string): Promise<string | null> {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('services')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id ?? null
}

export async function getServiceIncidents(serviceId: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('incidents')
    .select('*')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function getServiceVersions(serviceId: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('versions')
    .select('*')
    .eq('service_id', serviceId)
    .order('released_at', { ascending: false })
    .limit(10)
  return data ?? []
}

export async function getServiceSupplyChain(serviceId: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('supply_chain')
    .select('*')
    .eq('service_id', serviceId)
    .order('dependency_name')
  return data ?? []
}

export async function getServiceHealthSummary(serviceId: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('health_checks')
    .select('*')
    .eq('service_id', serviceId)
    .order('checked_at', { ascending: false })
    .limit(100)
  return data ?? []
}

export async function getServiceCves(serviceId: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('cve_records')
    .select('*')
    .eq('service_id', serviceId)
    .order('discovered_at', { ascending: false })
  return data ?? []
}

export async function getSignalHistory(serviceId: string, signalName?: string) {
  const supabase = createAnonClient()
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
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('incidents')
    .select('*, service:services(name, slug, status)')
    .neq('type', 'initial_index')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getLatestSignalMeta(serviceId: string, signalName: string): Promise<Record<string, any> | null> {
  const supabase = createAnonClient()
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
  const supabase = createAnonClient()
  const signals = [
    'virustotal_scan', 'content_safety', 'publisher_reputation', 'adoption', 'freshness', 'transparency',
    'vulnerability', 'operational', 'maintenance', 'publisher_trust',
  ]

  // Single query fetching recent rows for all signals, ordered newest-first
  const { data } = await supabase
    .from('signal_history')
    .select('signal_name, metadata, recorded_at')
    .eq('service_id', serviceId)
    .in('signal_name', signals)
    .order('recorded_at', { ascending: false })
    .limit(signals.length * 3) // headroom for multiple rows per signal

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, Record<string, any>> = {}
  if (data) {
    // Keep only the first (most recent) row per signal_name
    for (const row of data) {
      if (!out[row.signal_name] && row.metadata) {
        out[row.signal_name] = row.metadata as Record<string, any>
      }
    }
  }
  return out
}
