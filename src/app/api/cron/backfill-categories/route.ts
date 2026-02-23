import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { classifyCategory } from '@/lib/discovery/pipeline'

export const maxDuration = 300

/**
 * One-time backfill: recategorize all existing services using the updated
 * classification logic (framework category, priority order, overrides).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data: services } = await supabase
    .from('services')
    .select('id, name, category, tags, npm_package, pypi_package')

  if (!services) {
    return NextResponse.json({ ok: true, message: 'No services found', changed: 0 })
  }

  let changed = 0
  const changes: Array<{ name: string; old: string; new: string }> = []

  const ICON_MAP: Record<string, string> = {
    'image-generation': '◆',
    'llm': '◇',
    'web-search': '⊕',
    'code': '⟨⟩',
    'speech': '♫',
    'data-api': '◈',
    'embedding': '⊡',
    'vision': '◉',
    'agent': '⚡',
    'infra': '△',
    'framework': '⬡',
  }

  for (const service of services) {
    const packageName = service.npm_package || service.pypi_package || service.name
    const tags = (service.tags as string[]) ?? []
    const newCategory = classifyCategory(tags, packageName)

    if (newCategory !== service.category) {
      await supabase
        .from('services')
        .update({
          category: newCategory,
          icon: ICON_MAP[newCategory] ?? '◇',
        })
        .eq('id', service.id)

      changes.push({ name: service.name, old: service.category, new: newCategory })
      changed++
    }
  }

  return NextResponse.json({
    ok: true,
    total: services.length,
    changed,
    changes,
    timestamp: new Date().toISOString(),
  })
}
