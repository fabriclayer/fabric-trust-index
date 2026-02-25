import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 120

/**
 * Bulk enrich publishers by copying github_repo owner → publisher.github_org.
 * Finds publishers with github_org = NULL whose services have github_repo set.
 * Idempotent — safe to re-run.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Find services with github_repo that have publishers missing github_org
  const { data: services } = await supabase
    .from('services')
    .select('publisher_id, github_repo')
    .not('github_repo', 'is', null)

  if (!services || services.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: 'No services with github_repo found' })
  }

  // Get publishers missing github_org
  const publisherIds = [...new Set(services.map(s => s.publisher_id))]
  const { data: publishers } = await supabase
    .from('publishers')
    .select('id')
    .in('id', publisherIds)
    .is('github_org', null)

  if (!publishers || publishers.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: 'All publishers already have github_org' })
  }

  const pubIdSet = new Set(publishers.map(p => p.id))
  let updated = 0
  const errors: string[] = []

  // Build publisher → owner mapping from services
  const pubOwnerMap = new Map<string, string>()
  for (const svc of services) {
    if (pubIdSet.has(svc.publisher_id) && svc.github_repo) {
      const owner = svc.github_repo.split('/')[0]
      if (owner && !pubOwnerMap.has(svc.publisher_id)) {
        pubOwnerMap.set(svc.publisher_id, owner)
      }
    }
  }

  // Update publishers in batches
  for (const [publisherId, owner] of pubOwnerMap) {
    try {
      const { error } = await supabase
        .from('publishers')
        .update({ github_org: owner })
        .eq('id', publisherId)

      if (error) {
        errors.push(`${publisherId}: ${error.message}`)
      } else {
        updated++
      }
    } catch (err) {
      errors.push(`${publisherId}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    total_publishers_without_org: publishers.length,
    updated,
    errors: errors.slice(0, 10),
    timestamp: new Date().toISOString(),
  })
}
