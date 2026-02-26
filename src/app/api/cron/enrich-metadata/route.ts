import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { resolveServiceMetadata } from '@/lib/discovery/enrich'

export const maxDuration = 300

/**
 * Backfill enrichment for services missing github_repo, npm_package, or pypi_package.
 * Finds services with a publisher github_org but no github_repo, or services
 * missing both npm_package and pypi_package.
 *
 * GET /api/cron/enrich-metadata?limit=50
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10),
    100,
  )

  try {
    const supabase = createServerClient()

    // Find services needing enrichment:
    // 1. github_repo IS NULL but publisher has github_org
    // 2. npm_package IS NULL AND pypi_package IS NULL (and has github_repo or publisher github_org)
    const { data: services } = await supabase
      .from('services')
      .select('id, slug, name, github_repo, npm_package, pypi_package, publisher_id')
      .or('github_repo.is.null,and(npm_package.is.null,pypi_package.is.null)')
      .limit(limit)

    if (!services || services.length === 0) {
      return NextResponse.json({ ok: true, message: 'No services need enrichment', processed: 0 })
    }

    // Fetch publisher github_orgs for these services
    const publisherIds = [...new Set(services.map(s => s.publisher_id).filter(Boolean))]
    const { data: publishers } = await supabase
      .from('publishers')
      .select('id, github_org')
      .in('id', publisherIds)

    const pubOrgMap = new Map<string, string>()
    for (const p of publishers ?? []) {
      if (p.github_org) pubOrgMap.set(p.id, p.github_org)
    }

    let enriched = 0
    let unchanged = 0
    let errors = 0
    const details: string[] = []

    for (const svc of services) {
      const githubOrg = pubOrgMap.get(svc.publisher_id) ?? null

      // Skip if no github_org and no github_repo — nothing to resolve from
      if (!githubOrg && !svc.github_repo) {
        unchanged++
        continue
      }

      try {
        const result = await resolveServiceMetadata({
          slug: svc.slug,
          name: svc.name,
          github_org: githubOrg,
          github_repo: svc.github_repo,
          npm_package: svc.npm_package,
          pypi_package: svc.pypi_package,
        })

        const updates: Record<string, string> = {}
        if (result.github_repo) updates.github_repo = result.github_repo
        if (result.npm_package) updates.npm_package = result.npm_package
        if (result.pypi_package) updates.pypi_package = result.pypi_package

        if (Object.keys(updates).length > 0) {
          await supabase.from('services').update(updates).eq('id', svc.id)
          enriched++
          details.push(`${svc.slug}: ${Object.keys(updates).join(', ')}`)
        } else {
          unchanged++
        }
      } catch (err) {
        errors++
        if (details.length < 20) {
          details.push(`${svc.slug}: error - ${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: services.length,
      enriched,
      unchanged,
      errors,
      details: details.length > 0 ? details : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Metadata enrichment failed:', err)
    return NextResponse.json(
      { error: 'Enrichment failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  }
}
