-- Fabric Trust Index — Supabase SQL Schema
-- A directory of AI tools/services with trust scores

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- 1. Publishers — organizations/individuals who publish services
CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  github_org TEXT,
  npm_org TEXT,
  pypi_org TEXT,
  website_url TEXT,
  verified_domain BOOLEAN DEFAULT FALSE,
  verified_email BOOLEAN DEFAULT FALSE,
  account_created_at TIMESTAMPTZ,
  maintained_package_count INT DEFAULT 0,
  security_incident_count INT DEFAULT 0,
  identity_consistency_score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Services — main table, each service has 6 trust signals
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  publisher_id UUID NOT NULL REFERENCES publishers(id),
  category TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '◇',
  npm_package TEXT,
  pypi_package TEXT,
  github_repo TEXT,
  endpoint_url TEXT,
  signal_vulnerability FLOAT DEFAULT 3.0,
  signal_operational FLOAT DEFAULT 3.0,
  signal_maintenance FLOAT DEFAULT 3.0,
  signal_adoption FLOAT DEFAULT 3.0,
  signal_transparency FLOAT DEFAULT 3.0,
  signal_publisher_trust FLOAT DEFAULT 3.0,
  composite_score FLOAT DEFAULT 3.0,
  status TEXT DEFAULT 'caution' CHECK (status IN ('trusted', 'caution', 'blocked')),
  transaction_count INT DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  active_modifiers TEXT[] DEFAULT '{}',
  discovered_from TEXT,
  discovery_query TEXT,
  uptime_30d FLOAT DEFAULT 0,
  avg_latency_ms INT DEFAULT 0,
  p50_latency_ms INT DEFAULT 0,
  p99_latency_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Signal History — score snapshots over time
CREATE TABLE signal_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  signal_name TEXT NOT NULL,
  score FLOAT NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Incidents — real incidents
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('score_change', 'version_release', 'cve_patched', 'cve_found', 'uptime_drop', 'uptime_restored', 'initial_index')),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  score_at_time FLOAT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Versions — release history
CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  score_at_release FLOAT,
  score_delta FLOAT,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Health Checks — raw ping results
CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status_code INT,
  latency_ms INT,
  is_up BOOLEAN DEFAULT TRUE,
  behavioral_hash TEXT,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Supply Chain — dependencies
CREATE TABLE supply_chain (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  dependency_name TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  dependency_version TEXT,
  has_known_cves BOOLEAN DEFAULT FALSE,
  cve_count INT DEFAULT 0,
  trust_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CVE Records — individual CVEs
CREATE TABLE cve_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  cve_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  cvss_score FLOAT,
  affected_package TEXT,
  affected_version TEXT,
  patched_version TEXT,
  is_patched BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'osv',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  patched_at TIMESTAMPTZ,
  UNIQUE(service_id, cve_id)
);

-- 9. Feedback — community feedback
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 1 AND score <= 5),
  tags TEXT[] DEFAULT '{}',
  comment TEXT,
  source_ip TEXT,
  api_key_prefix TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. API Keys — for rate-limited API access
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT,
  rate_limit INT DEFAULT 100,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- 11. Discovery Queue — auto-discovery pipeline state
CREATE TABLE discovery_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  package_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 12. Service Requests — community-submitted requests for new services
CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL,
  url TEXT,
  email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'indexed', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Services
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_composite_score ON services(composite_score DESC);
CREATE INDEX idx_services_slug ON services(slug);
CREATE INDEX idx_services_publisher_id ON services(publisher_id);

-- Signal History
CREATE INDEX idx_signal_history_service_id ON signal_history(service_id);
CREATE INDEX idx_signal_history_signal_name ON signal_history(signal_name);
CREATE INDEX idx_signal_history_recorded_at ON signal_history(service_id, signal_name, recorded_at DESC);

-- Incidents
CREATE INDEX idx_incidents_service_id ON incidents(service_id, created_at DESC);

-- Versions
CREATE INDEX idx_versions_service_id ON versions(service_id, released_at DESC);

-- Health Checks
CREATE INDEX idx_health_checks_service_id ON health_checks(service_id, checked_at DESC);

-- Supply Chain
CREATE INDEX idx_supply_chain_service_id ON supply_chain(service_id);

-- CVE Records
CREATE INDEX idx_cve_records_service_id ON cve_records(service_id, discovered_at DESC);

-- Feedback
CREATE INDEX idx_feedback_service_id ON feedback(service_id, created_at DESC);

-- Discovery Queue
CREATE INDEX idx_discovery_queue_status ON discovery_queue(status);

-- Service Requests
CREATE INDEX idx_service_requests_status ON service_requests(status);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for tables with updated_at
CREATE TRIGGER set_publishers_updated_at
  BEFORE UPDATE ON publishers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_supply_chain_updated_at
  BEFORE UPDATE ON supply_chain
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE cve_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_queue ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Allow public read access on publishers"
  ON publishers FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on services"
  ON services FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on signal_history"
  ON signal_history FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on incidents"
  ON incidents FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on versions"
  ON versions FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on health_checks"
  ON health_checks FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on supply_chain"
  ON supply_chain FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on cve_records"
  ON cve_records FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on feedback"
  ON feedback FOR SELECT
  USING (true);

-- Service Requests — public insert only (no read)
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on service_requests"
  ON service_requests FOR INSERT
  WITH CHECK (true);

-- api_keys and discovery_queue intentionally have NO public read policies.
-- Access to these tables requires authenticated/service-role credentials.
