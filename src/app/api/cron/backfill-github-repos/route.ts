import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { resolveGitHubRepo, validateGitHubRepo } from '@/lib/discovery/github-resolver'
import { runCollectors } from '@/lib/collectors/runner'

export const maxDuration = 300

/**
 * Backfill github_repo for services that have npm/PyPI packages but no GitHub URL.
 * Resolves from registry metadata, validates with GitHub API, and optionally rescores.
 *
 * GET ?batch=25&offset=0&rescore=1
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batch = parseInt(request.nextUrl.searchParams.get('batch') ?? '25')
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0')
  const rescore = request.nextUrl.searchParams.get('rescore') !== '0'

  const supabase = createServerClient()

  // Fetch services with no github_repo but with npm or pypi package
  const { data: services, error } = await supabase
    .from('services')
    .select('id, name, slug, npm_package, pypi_package, github_repo, publisher_id')
    .is('github_repo', null)
    .or('npm_package.not.is.null,pypi_package.not.is.null')
    .order('composite_score', { ascending: false })
    .range(offset, offset + batch - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!services || services.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No more services to resolve' })
  }

  let resolved = 0
  let skipped = 0
  let invalid = 0
  let failed = 0
  let rescored = 0
  const errors: string[] = []
  const resolvedServices: string[] = []

  for (const service of services) {
    try {
      const repo = await resolveGitHubRepo({
        npm_package: service.npm_package,
        pypi_package: service.pypi_package,
      })

      if (!repo) {
        skipped++
        continue
      }

      // Validate the resolved repo exists on GitHub
      const valid = await validateGitHubRepo(repo)
      if (!valid) {
        invalid++
        continue
      }

      // Update service with resolved github_repo
      await supabase
        .from('services')
        .update({ github_repo: repo })
        .eq('id', service.id)

      // Update publisher github_org if currently null
      if (service.publisher_id) {
        const owner = repo.split('/')[0]
        const { data: pub } = await supabase
          .from('publishers')
          .select('id, github_org')
          .eq('id', service.publisher_id)
          .single()

        if (pub && !pub.github_org) {
          await supabase
            .from('publishers')
            .update({ github_org: owner })
            .eq('id', pub.id)
        }
      }

      resolved++
      resolvedServices.push(`${service.name} → ${repo}`)

      // Partial rescore: run transparency, maintenance, publisher_trust
      if (rescore) {
        try {
          const { data: freshService } = await supabase
            .from('services')
            .select('*')
            .eq('id', service.id)
            .single()

          if (freshService) {
            await runCollectors(freshService, ['transparency', 'maintenance', 'publisher_trust'])
            rescored++
          }
        } catch (err) {
          if (errors.length < 5) {
            errors.push(`rescore ${service.name}: ${err instanceof Error ? err.message : 'Unknown'}`)
          }
        }
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
    resolved,
    skipped,
    invalid,
    failed,
    rescored,
    offset,
    batch,
    nextOffset: offset + batch,
    resolved_services: resolvedServices.slice(0, 20),
    errors: errors.length > 0 ? errors : undefined,
  })
}
