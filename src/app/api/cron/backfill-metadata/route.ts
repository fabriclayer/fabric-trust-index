import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { deriveCapabilities } from '@/lib/discovery/pipeline'
import { getPyPIPackageInfo } from '@/lib/discovery/pypi'

export const maxDuration = 300

const BATCH_SIZE = 50

// ---------- Source-specific fetchers ----------

async function fetchNpmMeta(packageName: string) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`)
    if (!res.ok) return null
    const data = await res.json()
    const keywords: string[] = data.keywords ?? []
    return {
      capabilities: deriveCapabilities(keywords),
      pricing: { model: 'open-source' },
      tags: keywords,
      language: null as string | null,
      homepage_url: null as string | null,
    }
  } catch {
    return null
  }
}

async function fetchPyPIMeta(packageName: string) {
  try {
    const info = await getPyPIPackageInfo(packageName)
    if (!info) return null
    return {
      capabilities: deriveCapabilities(info.keywords),
      pricing: { model: 'open-source' },
      tags: info.keywords,
      language: null as string | null,
      homepage_url: info.projectUrl !== `https://pypi.org/project/${packageName}` ? info.projectUrl : null,
    }
  } catch {
    return null
  }
}

async function fetchGitHubMeta(repoFullName: string) {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'FabricTrustIndex/1.0',
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }
    const res = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers })
    if (!res.ok) return null
    const repo = await res.json()
    const topics: string[] = repo.topics ?? []
    return {
      capabilities: deriveCapabilities(topics),
      pricing: null as { model: string } | null,
      tags: topics,
      language: (repo.language as string) ?? null,
      homepage_url: (repo.homepage as string) ?? null,
    }
  } catch {
    return null
  }
}

async function fetchHuggingFaceMeta(publisherSlug: string, serviceName: string) {
  // Reconstruct the HF model ID: publisher/name
  const modelId = `${publisherSlug}/${serviceName}`
  try {
    const headers: Record<string, string> = { 'User-Agent': 'FabricTrustIndex/1.0' }
    if (process.env.HF_TOKEN) {
      headers.Authorization = `Bearer ${process.env.HF_TOKEN}`
    }
    const res = await fetch(`https://huggingface.co/api/models/${modelId}`, { headers })
    if (!res.ok) return null
    const model = await res.json()
    const tags: string[] = model.tags ?? []
    const pipelineTag: string | null = model.pipeline_tag ?? null
    return {
      capabilities: deriveCapabilities(tags, pipelineTag),
      pricing: { model: 'open-weight' },
      tags,
      language: null as string | null,
      homepage_url: null as string | null,
    }
  } catch {
    return null
  }
}

// ---------- Route handler ----------

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)

  try {
    const supabase = createServerClient()

    // Fetch services needing backfill
    const { data: services, error } = await supabase
      .from('services')
      .select('id, slug, name, discovered_from, npm_package, pypi_package, github_repo, capabilities, publisher:publishers(slug)')
      .not('discovered_from', 'is', null)
      .or('capabilities.is.null,capabilities.eq.{}')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      return NextResponse.json({ error: 'Query failed', message: error.message }, { status: 500 })
    }

    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, updated: 0, failed: 0, hasMore: false, offset })
    }

    let updated = 0
    let failed = 0
    const errors: string[] = []

    for (const svc of services) {
      let meta: {
        capabilities: string[]
        pricing: { model: string } | null
        tags: string[]
        language: string | null
        homepage_url: string | null
      } | null = null

      try {
        const source = svc.discovered_from as string

        if (source === 'npm' && svc.npm_package) {
          meta = await fetchNpmMeta(svc.npm_package)
        } else if (source === 'pypi' && svc.pypi_package) {
          meta = await fetchPyPIMeta(svc.pypi_package)
        } else if (source === 'github' && svc.github_repo) {
          meta = await fetchGitHubMeta(svc.github_repo)
        } else if (source === 'huggingface') {
          const publisherSlug = (svc.publisher as any)?.slug ?? svc.slug.split('-')[0]
          meta = await fetchHuggingFaceMeta(publisherSlug, svc.name)
        }

        if (meta) {
          const updatePayload: Record<string, unknown> = {
            capabilities: meta.capabilities.length > 0 ? meta.capabilities : [],
            tags: meta.tags.length > 0 ? meta.tags : [],
          }
          if (meta.pricing) updatePayload.pricing = meta.pricing
          if (meta.language) updatePayload.language = meta.language
          if (meta.homepage_url) updatePayload.homepage_url = meta.homepage_url

          const { error: updateErr } = await supabase
            .from('services')
            .update(updatePayload)
            .eq('id', svc.id)

          if (updateErr) {
            failed++
            if (errors.length < 5) errors.push(`${svc.slug}: update failed — ${updateErr.message}`)
          } else {
            updated++
          }
        } else {
          // No metadata fetched — set empty capabilities so we don't re-process
          await supabase
            .from('services')
            .update({ capabilities: ['uncategorized'] })
            .eq('id', svc.id)
          failed++
          if (errors.length < 5) errors.push(`${svc.slug}: no metadata from ${svc.discovered_from}`)
        }
      } catch (err) {
        failed++
        if (errors.length < 5) errors.push(`${svc.slug}: ${err instanceof Error ? err.message : 'unknown'}`)
      }

      // Small delay between API calls to respect rate limits
      await new Promise(r => setTimeout(r, 50))
    }

    const hasMore = services.length === BATCH_SIZE

    return NextResponse.json({
      ok: true,
      offset,
      processed: services.length,
      updated,
      failed,
      hasMore,
      nextOffset: hasMore ? offset + BATCH_SIZE : null,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Backfill failed:', err)
    return NextResponse.json(
      { error: 'Backfill failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
