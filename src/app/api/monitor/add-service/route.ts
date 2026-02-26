import { NextRequest, NextResponse } from 'next/server'
import { addDiscoveredService, classifyCategory, deriveCapabilities } from '@/lib/discovery/pipeline'
import { resolveServiceMetadata } from '@/lib/discovery/enrich'

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, github_repo, homepage_url } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Derive slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Derive publisher from github org or name
  const githubOrg = github_repo ? github_repo.split('/')[0] : undefined
  const publisher = githubOrg || name

  // Auto-detect category from any available info
  const category = classifyCategory([], slug)

  // Run enrichment to find npm/pypi packages
  const enriched = await resolveServiceMetadata({
    slug,
    name,
    github_org: githubOrg,
    github_repo: github_repo || undefined,
  })

  const finalSlug = slug

  const result = await addDiscoveredService({
    name,
    slug: finalSlug,
    publisher,
    description: '',
    category,
    npm_package: enriched.npm_package,
    pypi_package: enriched.pypi_package,
    github_repo: github_repo || enriched.github_repo || undefined,
    github_org: githubOrg,
    source: 'monitor:manual',
    capabilities: deriveCapabilities([]),
    tags: [],
    homepage_url: homepage_url || undefined,
  })

  if (result === true) {
    return NextResponse.json({ ok: true, slug: finalSlug })
  }

  return NextResponse.json({ error: `Failed to add service: ${result}` }, { status: 500 })
}
