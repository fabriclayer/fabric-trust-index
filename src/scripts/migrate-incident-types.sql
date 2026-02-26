-- Migration: expand incidents.type CHECK constraint to include all runner-created types
-- Run manually in Supabase SQL editor

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_type_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_type_check CHECK (type IN (
  'score_change', 'version_release', 'cve_patched', 'cve_found',
  'uptime_drop', 'uptime_restored', 'initial_index',
  'npm_deprecated', 'npm_owner_changed', 'pypi_yanked',
  'repo_archived', 'repo_renamed', 'repo_transferred',
  'smithery_scan_failed'
));
