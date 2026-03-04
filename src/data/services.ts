export interface Service {
  id?: string
  name: string
  slug: string
  publisher: string
  publisher_url?: string
  category: string
  tag: string
  description: string
  signals: number[]
  score: number
  raw_composite_score?: number | null
  status: 'trusted' | 'caution' | 'blocked' | 'pending'
  icon: string
  logo_url?: string | null
  updated: string
  domain?: string
  // Operational metrics (from health checks)
  uptime_30d?: number
  avg_latency_ms?: number
  p50_latency_ms?: number
  p99_latency_ms?: number
  // Package/repo references
  github_repo?: string
  npm_package?: string
  pypi_package?: string
  endpoint_url?: string
  // Capabilities, pricing & metadata
  capabilities?: string[]
  pricing?: { model: string; tiers?: { label: string; value: string }[] } | null
  request_schema?: string | null
  response_schema?: string | null
  tags?: string[]
  language?: string | null
  homepage_url?: string | null
  docs_url?: string | null
  x_url?: string | null
  discord_url?: string | null
  status_page_url?: string | null
  active_modifiers?: string[]
  // AI assessment
  ai_assessment?: string | null
  ai_assessment_updated_at?: string | null
  // Score confidence
  score_confidence?: number | null
  signals_with_data?: number | null
  // Sub-signal breakdown (from scoring engine)
  signal_scores?: Record<string, {
    score: number
    sub_signals: Array<{
      name: string
      score: number
      weight: number
      has_data: boolean
      detail?: string
    }>
  }> | null
  // Rank (global position by composite_score DESC)
  rank?: number
  // Timestamps
  created_at?: string
  updated_at?: string
}
