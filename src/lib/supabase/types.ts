export interface Database {
  public: {
    Tables: {
      publishers: {
        Row: DbPublisher
        Insert: Omit<DbPublisher, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbPublisher, 'id'>>
      }
      services: {
        Row: DbService
        Insert: Omit<DbService, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbService, 'id'>>
      }
      signal_history: {
        Row: DbSignalHistory
        Insert: Omit<DbSignalHistory, 'id' | 'recorded_at'>
        Update: Partial<Omit<DbSignalHistory, 'id'>>
      }
      incidents: {
        Row: DbIncident
        Insert: Omit<DbIncident, 'id' | 'created_at'>
        Update: Partial<Omit<DbIncident, 'id'>>
      }
      versions: {
        Row: DbVersion
        Insert: Omit<DbVersion, 'id' | 'created_at'>
        Update: Partial<Omit<DbVersion, 'id'>>
      }
      health_checks: {
        Row: DbHealthCheck
        Insert: Omit<DbHealthCheck, 'id' | 'checked_at'>
        Update: Partial<Omit<DbHealthCheck, 'id'>>
      }
      supply_chain: {
        Row: DbSupplyChain
        Insert: Omit<DbSupplyChain, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DbSupplyChain, 'id'>>
      }
      cve_records: {
        Row: DbCveRecord
        Insert: Omit<DbCveRecord, 'id' | 'discovered_at'>
        Update: Partial<Omit<DbCveRecord, 'id'>>
      }
      feedback: {
        Row: DbFeedback
        Insert: Omit<DbFeedback, 'id' | 'created_at'>
        Update: Partial<Omit<DbFeedback, 'id'>>
      }
      api_keys: {
        Row: DbApiKey
        Insert: Omit<DbApiKey, 'id' | 'created_at'>
        Update: Partial<Omit<DbApiKey, 'id'>>
      }
      discovery_queue: {
        Row: DbDiscoveryQueue
        Insert: Omit<DbDiscoveryQueue, 'id' | 'created_at'>
        Update: Partial<Omit<DbDiscoveryQueue, 'id'>>
      }
    }
  }
}

// ─── Table Row Types ───

export interface DbPublisher {
  id: string
  name: string
  slug: string
  github_org: string | null
  npm_org: string | null
  pypi_org: string | null
  website_url: string | null
  verified_domain: boolean
  verified_email: boolean
  account_created_at: string | null
  maintained_package_count: number
  security_incident_count: number
  identity_consistency_score: number
  created_at: string
  updated_at: string
}

export interface DbService {
  id: string
  name: string
  slug: string
  publisher_id: string
  category: string
  description: string | null
  icon: string

  // Registry references
  npm_package: string | null
  pypi_package: string | null
  github_repo: string | null
  endpoint_url: string | null

  // Signal scores (0-5)
  signal_vulnerability: number
  signal_operational: number
  signal_maintenance: number
  signal_adoption: number
  signal_transparency: number
  signal_publisher_trust: number

  // Composite
  composite_score: number
  status: 'trusted' | 'caution' | 'blocked'

  // Modifiers
  transaction_count: number
  last_activity_at: string
  active_modifiers: string[]

  // Cached operational metrics
  uptime_30d: number
  avg_latency_ms: number
  p50_latency_ms: number
  p99_latency_ms: number

  // Discovery
  discovered_from: string | null
  discovery_query: string | null

  created_at: string
  updated_at: string

  // Joined fields (from queries with select joins)
  publisher?: DbPublisher
}

export interface DbSignalHistory {
  id: string
  service_id: string
  signal_name: string
  score: number
  metadata: Record<string, unknown>
  recorded_at: string
}

export interface DbIncident {
  id: string
  service_id: string
  type: 'score_change' | 'version_release' | 'cve_patched' | 'cve_found' | 'uptime_drop' | 'uptime_restored' | 'initial_index'
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string | null
  score_at_time: number | null
  resolved_at: string | null
  created_at: string
}

export interface DbVersion {
  id: string
  service_id: string
  tag: string
  released_at: string
  score_at_release: number | null
  score_delta: number | null
  source: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface DbHealthCheck {
  id: string
  service_id: string
  status_code: number | null
  latency_ms: number | null
  is_up: boolean
  behavioral_hash: string | null
  error_message: string | null
  checked_at: string
}

export interface DbSupplyChain {
  id: string
  service_id: string
  dependency_name: string
  dependency_type: string
  dependency_version: string | null
  has_known_cves: boolean
  cve_count: number
  trust_score: number | null
  created_at: string
  updated_at: string
}

export interface DbCveRecord {
  id: string
  service_id: string
  cve_id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cvss_score: number | null
  affected_package: string | null
  affected_version: string | null
  patched_version: string | null
  is_patched: boolean
  source: string
  discovered_at: string
  patched_at: string | null
}

export interface DbFeedback {
  id: string
  service_id: string
  score: number
  tags: string[]
  comment: string | null
  source_ip: string | null
  api_key_prefix: string | null
  created_at: string
}

export interface DbApiKey {
  id: string
  key_hash: string
  key_prefix: string
  name: string | null
  rate_limit: number
  active: boolean
  created_at: string
  last_used_at: string | null
}

export interface DbDiscoveryQueue {
  id: string
  source: string
  query: string
  package_name: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  processed_at: string | null
}
