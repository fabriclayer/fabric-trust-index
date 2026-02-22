/**
 * Backfill github_repo for all services that have npm_package set.
 * Fetches repository info from the npm registry API.
 *
 * Usage: npx tsx src/scripts/backfill-github-repo.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envFile.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function extractGitHubRepo(repoUrl: string): string | null {
  // Handle various npm repository URL formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git+https://github.com/owner/repo.git
  // git://github.com/owner/repo.git
  // git+ssh://git@github.com/owner/repo.git
  // github:owner/repo
  const match = repoUrl.match(
    /(?:github\.com[/:])([^/]+\/[^/.#]+)/i
  )
  return match ? match[1] : null
}

async function getGitHubRepoFromNpm(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()

    // Check repository field
    if (data.repository) {
      const repoUrl =
        typeof data.repository === 'string'
          ? data.repository
          : data.repository.url || ''
      const repo = extractGitHubRepo(repoUrl)
      if (repo) return repo
    }

    // Fallback: check homepage
    if (data.homepage && data.homepage.includes('github.com')) {
      const repo = extractGitHubRepo(data.homepage)
      if (repo) return repo
    }

    // Fallback: check bugs.url
    if (data.bugs?.url && data.bugs.url.includes('github.com')) {
      const repo = extractGitHubRepo(data.bugs.url)
      if (repo) return repo
    }

    return null
  } catch {
    return null
  }
}

async function main() {
  // Fetch all services with npm_package but no github_repo
  const { data: services, error } = await supabase
    .from('services')
    .select('id, name, npm_package, github_repo')
    .not('npm_package', 'is', null)
    .order('name')

  if (error) {
    console.error('Failed to fetch services:', error)
    process.exit(1)
  }

  const toBackfill = services!.filter(s => !s.github_repo)
  console.log(`Found ${services!.length} services with npm_package, ${toBackfill.length} need github_repo backfill\n`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const service of toBackfill) {
    const repo = await getGitHubRepoFromNpm(service.npm_package!)

    if (repo) {
      const { error: updateError } = await supabase
        .from('services')
        .update({ github_repo: repo })
        .eq('id', service.id)

      if (updateError) {
        console.error(`  ✗ ${service.name}: update failed — ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ ${service.name} → ${repo}`)
        updated++
      }
    } else {
      console.log(`  – ${service.name}: no GitHub repo found in npm registry`)
      skipped++
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no repo), ${failed} failed`)
}

main()
