import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { discoverClawHubSkills } from '@/lib/discovery/clawhub'
import { queueForReview, toSlug } from '@/lib/discovery/pipeline'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const test = request.nextUrl.searchParams.get('test') === 'true'
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10)

  try {
    const allCandidates = await discoverClawHubSkills()

    // Test mode: return first 20 parsed candidates without inserting
    if (test) {
      return NextResponse.json({
        ok: true,
        test: true,
        totalCandidates: allCandidates.length,
        sample: allCandidates.slice(0, 20),
        timestamp: new Date().toISOString(),
      })
    }

    // Fetch existing slugs for dedup
    const supabase = createServerClient()
    const { data: existingServices } = await supabase
      .from('services')
      .select('slug')

    const existingSlugs = new Set(existingServices?.map(s => s.slug) ?? [])

    // Dedup candidates against existing services
    const toAdd: Array<(typeof allCandidates)[number] & { slug: string }> = []
    for (const c of allCandidates) {
      const slug = toSlug(c.name)
      if (existingSlugs.has(slug) || toAdd.some(a => a.slug === slug)) continue
      toAdd.push({ ...c, slug })
    }

    const totalAfterDedup = toAdd.length
    const batch = toAdd.slice(offset, offset + limit)
    const hasMore = offset + limit < totalAfterDedup

    let added = 0
    let skipped = 0
    const errors: string[] = []

    for (const skill of batch) {
      const result = await queueForReview({
        name: skill.name,
        slug: skill.slug,
        publisher: 'OpenClaw Community',
        description: skill.description,
        category: skill.category,
        source: 'clawhub',
        tags: ['openclaw', 'clawhub', 'agent-skill'],
        homepage_url: skill.homepage,
      })

      if (result === 'queued') {
        added++
        existingSlugs.add(skill.slug)
      } else {
        skipped++
        if (result !== 'duplicate' && errors.length < 10) errors.push(`${skill.slug}: ${result}`)
      }
    }

    return NextResponse.json({
      ok: true,
      source: 'clawhub',
      totalCandidates: allCandidates.length,
      totalAfterDedup,
      offset,
      limit,
      processed: batch.length,
      added,
      skipped,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('ClawHub discovery failed:', err)
    return NextResponse.json(
      {
        error: 'ClawHub discovery failed',
        message: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 500 },
    )
  }
}
