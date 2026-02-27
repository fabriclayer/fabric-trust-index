import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { addDiscoveredService, classifyCategory, deriveCapabilities } from '@/lib/discovery/pipeline'
import { runAllCollectors } from '@/lib/collectors/runner'

export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { action } = await request.json()
  const supabase = createServerClient()

  if (action === 'dismiss') {
    await supabase.from('discovery_queue').update({ status: 'skipped' }).eq('id', id)
    return NextResponse.json({ ok: true, action: 'dismissed' })
  }

  if (action === 'approve') {
    const { data: item } = await supabase.from('discovery_queue').select('*').eq('id', id).single()
    if (!item || !item.result) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const r = item.result as Record<string, any>
    const category = r.category || classifyCategory(r.tags ?? [], r.slug)

    const result = await addDiscoveredService({
      name: r.name,
      slug: r.slug,
      publisher: r.publisher ?? 'Unknown',
      description: r.description ?? '',
      category,
      npm_package: r.npm_package,
      pypi_package: r.pypi_package,
      github_repo: r.github_repo,
      github_org: r.github_org,
      source: `monitor:approved`,
      capabilities: deriveCapabilities(r.tags ?? []),
      tags: r.tags ?? [],
      homepage_url: r.homepage_url,
    })

    if (result === true) {
      await supabase.from('discovery_queue').update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      }).eq('id', id)

      // Also update logo if available
      if (r.logo_url) {
        await supabase.from('services').update({ logo_url: r.logo_url }).eq('slug', r.slug)
      }

      // Score immediately after adding
      let scoring = { success: [] as string[], failed: [] as string[] }
      const { data: service } = await supabase.from('services').select('*').eq('slug', r.slug).single()
      if (service) {
        try {
          scoring = await runAllCollectors(service)
        } catch (err) {
          console.error(`Scoring failed for ${r.slug}:`, err)
        }
      }

      return NextResponse.json({ ok: true, action: 'approved', slug: r.slug, scoring })
    } else {
      return NextResponse.json({ error: `Failed to add service: ${result}` }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
