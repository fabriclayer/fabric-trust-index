import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 120

/**
 * Bulk enrich publishers by copying github_repo owner → publisher.github_org.
 * Finds publishers with github_org = NULL whose services have github_repo set.
 * Paginates to handle large datasets. Idempotent — safe to re-run.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Paginate through all services with github_repo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allServices: any[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('services')
      .select('publisher_id, github_repo')
      .not('github_repo', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) break
    if (!data || data.length === 0) break
    allServices.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  if (allServices.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: 'No services with github_repo found' })
  }

  // Build publisher → owner mapping from services
  const pubOwnerMap = new Map<string, string>()
  for (const svc of allServices) {
    if (svc.github_repo) {
      const owner = svc.github_repo.split('/')[0]
      if (owner && !pubOwnerMap.has(svc.publisher_id)) {
        pubOwnerMap.set(svc.publisher_id, owner)
      }
    }
  }

  // Get publishers missing github_org (paginate in batches of IDs)
  const allPubIds = [...pubOwnerMap.keys()]
  const pubsWithoutOrg = new Set<string>()
  for (let i = 0; i < allPubIds.length; i += 500) {
    const batch = allPubIds.slice(i, i + 500)
    const { data } = await supabase
      .from('publishers')
      .select('id')
      .in('id', batch)
      .is('github_org', null)
    if (data) {
      for (const p of data) pubsWithoutOrg.add(p.id)
    }
  }

  if (pubsWithoutOrg.size === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: 'All publishers already have github_org' })
  }

  let updated = 0
  const errors: string[] = []

  for (const [publisherId, owner] of pubOwnerMap) {
    if (!pubsWithoutOrg.has(publisherId)) continue

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
    total_services_with_repo: allServices.length,
    total_publishers_without_org: pubsWithoutOrg.size,
    updated,
    errors: errors.slice(0, 10),
    timestamp: new Date().toISOString(),
  })
}
