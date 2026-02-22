import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  extractLinksFromNpm,
  extractLinksFromPyPI,
  extractLinksFromGitHub,
  mergeLinks,
  type ExtractedLinks,
} from '@/lib/discovery/links'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batch = parseInt(request.nextUrl.searchParams.get('batch') ?? '25')
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0')

  const supabase = createServerClient()

  // Fetch services that have at least one data source
  const { data: services, error } = await supabase
    .from('services')
    .select('id, name, npm_package, pypi_package, github_repo, homepage_url, docs_url, x_url, discord_url, status_page_url')
    .or('npm_package.not.is.null,pypi_package.not.is.null,github_repo.not.is.null')
    .order('composite_score', { ascending: false })
    .range(offset, offset + batch - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!services || services.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No more services' })
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  for (const service of services) {
    try {
      const sources: ExtractedLinks[] = []

      // Priority order: PyPI > npm > GitHub
      if (service.pypi_package) {
        sources.push(await extractLinksFromPyPI(service.pypi_package))
      }
      if (service.npm_package) {
        sources.push(await extractLinksFromNpm(service.npm_package))
      }
      if (service.github_repo) {
        sources.push(await extractLinksFromGitHub(service.github_repo))
      }

      const merged = mergeLinks(...sources)

      // Only update fields that are currently null on the service
      const updates: Record<string, string> = {}
      if (!service.homepage_url && merged.homepage_url) updates.homepage_url = merged.homepage_url
      if (!service.docs_url && merged.docs_url) updates.docs_url = merged.docs_url
      if (!service.x_url && merged.x_url) updates.x_url = merged.x_url
      if (!service.discord_url && merged.discord_url) updates.discord_url = merged.discord_url
      if (!service.status_page_url && merged.status_page_url) updates.status_page_url = merged.status_page_url

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('services')
          .update(updates)
          .eq('id', service.id)
        updated++
      } else {
        skipped++
      }
    } catch (err) {
      failed++
      if (errors.length < 5) {
        errors.push(`${service.name}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed: services.length,
    updated,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    offset,
    batch,
  })
}
