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

function dbToService(db: any): Service {
  return {
    name: db.name,
    slug: db.slug,
    publisher: db.publisher?.name ?? 'Unknown',
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
    status: db.status,
    icon: db.icon,
    updated: formatUpdatedAt(db.updated_at),
  }
}

export async function getServices(): Promise<Service[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('services')
    .select('*, publisher:publishers(name)')
    .order('composite_score', { ascending: false })
  if (error) throw error
  return (data ?? []).map(dbToService)
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('services')
    .select('*, publisher:publishers(name)')
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
