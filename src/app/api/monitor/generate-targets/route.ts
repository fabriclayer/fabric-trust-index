import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BIG_CORP_ORGS = new Set([
  'openai',
  'google',
  'microsoft',
  'anthropics',
  'meta',
  'pytorch',
  'apple',
  'amazon',
  'aws',
  'azure',
])

interface Target {
  name: string
  slug: string
  composite_score: number
  github_repo: string
  github_org: string | null
  homepage_url: string | null
  category: string | null
  publisher_name: string | null
}

export async function GET(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Query high-value services with publisher info
  const { data: candidates, error: queryError } = await supabase
    .from('services')
    .select('name, slug, composite_score, github_repo, homepage_url, category, publisher_id, publishers(name, github_org)')
    .gte('composite_score', 4.0)
    .eq('status', 'trusted')
    .not('github_repo', 'is', null)
    .order('composite_score', { ascending: false })
    .limit(60)

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ targets: [] })
  }

  // Get existing networking slugs to skip
  const { data: existingNetworking } = await supabase
    .from('marketing_networking')
    .select('trust_page_slug')
    .not('trust_page_slug', 'is', null)

  const existingSlugs = new Set(
    (existingNetworking ?? []).map((row: { trust_page_slug: string }) => row.trust_page_slug)
  )

  // Filter and deduplicate
  const seenRepos = new Map<string, Target>()
  const targets: Target[] = []

  for (const row of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publisher = row.publishers as any
    const githubOrg = publisher?.github_org?.toLowerCase() ?? null
    const publisherName = publisher?.name ?? null

    // Skip big corporations
    if (githubOrg && BIG_CORP_ORGS.has(githubOrg)) continue

    // Skip already-in-networking
    if (existingSlugs.has(row.slug)) continue

    // Deduplicate by github_repo — keep highest scored (already sorted DESC)
    const repo = row.github_repo as string
    if (seenRepos.has(repo)) continue

    const target: Target = {
      name: row.name,
      slug: row.slug,
      composite_score: row.composite_score,
      github_repo: repo,
      github_org: publisher?.github_org ?? null,
      homepage_url: row.homepage_url ?? null,
      category: row.category ?? null,
      publisher_name: publisherName,
    }

    seenRepos.set(repo, target)
    targets.push(target)
  }

  return NextResponse.json({ targets })
}

interface PostTarget {
  name: string
  slug: string
  github_org: string | null
  composite_score: number
  category: string | null
  homepage_url: string | null
}

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { targets } = body as { targets: PostTarget[] }

  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ error: 'targets must be a non-empty array' }, { status: 400 })
  }

  const supabase = createServerClient()

  const rows = targets.map((t) => ({
    project_name: t.name,
    handle: t.github_org ?? null,
    platform: 'github',
    trust_page_slug: t.slug,
    website_url: t.homepage_url ?? null,
    stage: 'identified',
    engagement_count: 0,
    notes: `Scored ${t.composite_score.toFixed(2)}/5 trusted. Outreach angle: congratulate on trust score, offer README badge, invite to check their page at trust.fabriclayer.ai/${t.slug}`,
  }))

  const { error, count } = await supabase
    .from('marketing_networking')
    .insert(rows, { count: 'exact' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: count ?? rows.length })
}
