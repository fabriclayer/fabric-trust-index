import { createServerClient } from '@/lib/supabase/server'
import { githubGet } from '@/lib/collectors/github'

interface DbService {
  id: string
  slug: string
  name: string
  discovered_from?: string
  npm_package?: string
  pypi_package?: string
  github_repo?: string
  readme_excerpt?: string | null
  license?: string | null
  dependency_count?: number | null
  dependencies_raw?: string | null
}

export async function enrichService(service: DbService): Promise<void> {
  // Skip if already enriched
  if (service.readme_excerpt) return

  const updates: Record<string, unknown> = {}

  const source = service.discovered_from ?? ''

  if (source === 'npm' && service.npm_package) {
    await enrichFromNpm(service.npm_package, updates)
  } else if (source === 'pypi' && service.pypi_package) {
    await enrichFromPypi(service.pypi_package, updates)
  } else if (source === 'clawhub') {
    await enrichFromClawHub(service.slug, updates)
  }

  // GitHub fallback: if we still have no readme_excerpt and have a github_repo
  if (!updates.readme_excerpt && service.github_repo) {
    await enrichFromGitHub(service.github_repo, updates)
  }

  // Only update if we got something
  if (Object.keys(updates).length > 0) {
    const supabase = createServerClient()
    await supabase.from('services').update(updates).eq('id', service.id)
  }
}

async function enrichFromNpm(packageName: string, updates: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return
    const data = await res.json()

    // README excerpt (first 1000 chars)
    if (data.readme && data.readme !== 'ERROR: No README data found!') {
      updates.readme_excerpt = data.readme.slice(0, 1000)
    }

    // License
    if (data.license) {
      updates.license = typeof data.license === 'string' ? data.license : data.license?.type ?? null
    }

    // Dependencies from latest version
    const latest = data['dist-tags']?.latest
    const latestVersion = latest ? data.versions?.[latest] : null
    if (latestVersion?.dependencies) {
      const deps = Object.keys(latestVersion.dependencies)
      updates.dependency_count = deps.length
      updates.dependencies_raw = deps.join(', ')
    }
  } catch (err) {
    console.error(`npm enrichment failed for ${packageName}:`, err)
  }
}

async function enrichFromPypi(packageName: string, updates: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!res.ok) return
    const data = await res.json()

    // Description excerpt (first 1000 chars)
    if (data.info?.description) {
      updates.readme_excerpt = data.info.description.slice(0, 1000)
    } else if (data.info?.summary) {
      updates.readme_excerpt = data.info.summary.slice(0, 1000)
    }

    // License
    if (data.info?.license) {
      updates.license = data.info.license.slice(0, 200)
    }

    // Dependencies
    if (data.info?.requires_dist) {
      const deps = data.info.requires_dist.map((d: string) => d.split(/[;><=!\s]/)[0].trim())
      updates.dependency_count = deps.length
      updates.dependencies_raw = deps.join(', ')
    }
  } catch (err) {
    console.error(`PyPI enrichment failed for ${packageName}:`, err)
  }
}

async function enrichFromClawHub(slug: string, updates: Record<string, unknown>): Promise<void> {
  try {
    // Fetch the skill data from ClawHub API to get owner handle
    const apiRes = await fetch(`https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': 'FabricTrustIndex/1.0' },
    })
    if (!apiRes.ok) return
    const apiData = await apiRes.json()
    const ownerHandle = apiData?.owner?.handle
    if (!ownerHandle) return

    // Fetch SKILL.md
    const mdUrl = `https://raw.githubusercontent.com/openclaw/skills/main/skills/${ownerHandle}/${slug}/SKILL.md`
    const mdRes = await fetch(mdUrl, { headers: { 'User-Agent': 'FabricTrustIndex/1.0' } })
    if (mdRes.ok) {
      const content = await mdRes.text()
      updates.readme_excerpt = content.slice(0, 1000)

      // Extract env vars from frontmatter as "dependencies"
      const envMatches = content.match(/env:\s*\n([\s\S]*?)(?:\n---|\n\n)/i)
      if (envMatches) {
        const envVars = envMatches[1].match(/- \w+/g)?.map(e => e.replace('- ', '')) ?? []
        if (envVars.length > 0) {
          updates.dependency_count = envVars.length
          updates.dependencies_raw = envVars.join(', ')
        }
      }
    }

    // Use summary as fallback
    if (!updates.readme_excerpt && apiData.skill?.summary) {
      updates.readme_excerpt = apiData.skill.summary.slice(0, 1000)
    }
  } catch (err) {
    console.error(`ClawHub enrichment failed for ${slug}:`, err)
  }
}

async function enrichFromGitHub(repo: string, updates: Record<string, unknown>): Promise<void> {
  try {
    // Fetch README
    const readmeData = await githubGet(`/repos/${repo}/readme`) as { content?: string; encoding?: string } | null
    if (readmeData?.content && readmeData.encoding === 'base64') {
      const decoded = Buffer.from(readmeData.content, 'base64').toString('utf-8')
      updates.readme_excerpt = decoded.slice(0, 1000)
    }

    // Fetch repo info for license
    const repoData = await githubGet(`/repos/${repo}`) as { license?: { spdx_id?: string }; description?: string } | null
    if (repoData?.license?.spdx_id) {
      updates.license = repoData.license.spdx_id
    }

    // Use repo description as fallback readme
    if (!updates.readme_excerpt && repoData?.description) {
      updates.readme_excerpt = repoData.description.slice(0, 1000)
    }
  } catch (err) {
    console.error(`GitHub enrichment failed for ${repo}:`, err)
  }
}
