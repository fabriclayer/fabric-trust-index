import { NextRequest, NextResponse } from 'next/server'
import { addDiscoveredService, classifyCategory, deriveCapabilities } from '@/lib/discovery/pipeline'

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, slug, publisher, description, category, github_repo, npm_package, pypi_package, homepage_url, tags } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
  }

  const finalCategory = category || classifyCategory(tags ?? [], slug)

  const result = await addDiscoveredService({
    name,
    slug,
    publisher: publisher || 'Unknown',
    description: description || '',
    category: finalCategory,
    npm_package: npm_package || undefined,
    pypi_package: pypi_package || undefined,
    github_repo: github_repo || undefined,
    github_org: github_repo ? github_repo.split('/')[0] : undefined,
    source: 'monitor:manual',
    capabilities: deriveCapabilities(tags ?? []),
    tags: tags ?? [],
    homepage_url: homepage_url || undefined,
  })

  if (result === true) {
    return NextResponse.json({ ok: true, slug })
  }

  return NextResponse.json({ error: `Failed to add service: ${result}` }, { status: 500 })
}
