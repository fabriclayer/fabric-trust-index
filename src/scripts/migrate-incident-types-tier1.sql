-- Tier 1 External Source Alert Types Migration
-- Run this in Supabase SQL Editor after deploying the code changes.
--
-- Adds 6 new incident types for external source alerts:
--   npm_deprecated, npm_owner_changed, pypi_yanked,
--   repo_archived, repo_transferred, smithery_scan_failed
--
-- The incidents table uses a TEXT column for `type`, so no enum alter is needed.
-- This migration adds a CHECK constraint to validate allowed values.

-- Drop existing constraint if present (idempotent)
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_type_check;

-- Add updated CHECK constraint with all incident types
ALTER TABLE incidents ADD CONSTRAINT incidents_type_check CHECK (
  type IN (
    'score_change',
    'version_release',
    'cve_patched',
    'cve_found',
    'uptime_drop',
    'uptime_restored',
    'initial_index',
    'npm_deprecated',
    'npm_owner_changed',
    'pypi_yanked',
    'repo_archived',
    'repo_transferred',
    'smithery_scan_failed'
  )
);
