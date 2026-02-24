import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 300

const BATCH_SIZE = 50
const MAX_DESC_LENGTH = 300

// ---------- Source-specific fetchers ----------

async function fetchNpmDescription(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`)
    if (!res.ok) return null
    const data = await res.json()
    return (data.description as string) || null
  } catch {
    return null
  }
}

async function fetchPyPIDescription(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`)
    if (!res.ok) return null
    const data = await res.json()
    return (data.info?.summary as string) || null
  } catch {
    return null
  }
}

async function fetchGitHubDescription(repoFullName: string): Promise<string | null> {
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
    return (repo.description as string) || null
  } catch {
    return null
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen - 1)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '…'
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

    // Fetch services with null or empty description, ordered by score desc
    const { data: services, error } = await supabase
      .from('services')
      .select('id, slug, name, description, npm_package, pypi_package, github_repo')
      .or('description.is.null,description.eq.')
      .order('composite_score', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      return NextResponse.json({ error: 'Query failed', message: error.message }, { status: 500 })
    }

    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, offset, processed: 0, updated: 0, skipped: 0, hasMore: false })
    }

    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const svc of services) {
      let description: string | null = null

      try {
        // Priority: npm → PyPI → GitHub
        if (svc.npm_package) {
          description = await fetchNpmDescription(svc.npm_package)
        }
        if (!description && svc.pypi_package) {
          description = await fetchPyPIDescription(svc.pypi_package)
        }
        if (!description && svc.github_repo) {
          description = await fetchGitHubDescription(svc.github_repo)
        }

        if (description) {
          const truncated = truncate(description.trim(), MAX_DESC_LENGTH)

          const { error: updateErr } = await supabase
            .from('services')
            .update({ description: truncated })
            .eq('id', svc.id)

          if (updateErr) {
            skipped++
            if (errors.length < 5) errors.push(`${svc.slug}: update failed — ${updateErr.message}`)
          } else {
            updated++
          }
        } else {
          skipped++
          if (errors.length < 5) errors.push(`${svc.slug}: no description found`)
        }
      } catch (err) {
        skipped++
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
      skipped,
      hasMore,
      nextOffset: hasMore ? offset + BATCH_SIZE : null,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Backfill descriptions failed:', err)
    return NextResponse.json(
      { error: 'Backfill failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
