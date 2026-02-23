import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { CI_BOT_NAMES } from '@/lib/discovery/bot-filter'

export const maxDuration = 300

/**
 * One-time backfill: re-resolve publisher for services where the current
 * publisher name matches a known CI bot name.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const botNames = Array.from(CI_BOT_NAMES)

  // Find publishers with bot names
  const { data: botPublishers } = await supabase
    .from('publishers')
    .select('id, name, slug')
    .in('name', botNames)

  if (!botPublishers || botPublishers.length === 0) {
    return NextResponse.json({ ok: true, message: 'No bot publishers found', fixed: 0 })
  }

  let fixed = 0
  const results: Array<{ service: string; old_publisher: string; new_publisher: string }> = []

  for (const botPub of botPublishers) {
    // Find services using this bot publisher
    const { data: services } = await supabase
      .from('services')
      .select('id, name, npm_package, pypi_package, github_repo')
      .eq('publisher_id', botPub.id)

    if (!services) continue

    for (const service of services) {
      let newPublisher: string | null = null

      // Re-resolve from npm
      if (service.npm_package) {
        // Check if scoped package
        if (service.npm_package.startsWith('@')) {
          newPublisher = service.npm_package.split('/')[0].slice(1)
        } else {
          // Fetch from npm registry
          try {
            const res = await fetch(`https://registry.npmjs.org/${service.npm_package}`)
            if (res.ok) {
              const data = await res.json()
              const author = data.author?.name
              if (author && !CI_BOT_NAMES.has(author.toLowerCase())) {
                newPublisher = author
              }
            }
          } catch { /* ignore */ }
        }
      }

      // Re-resolve from GitHub repo owner
      if (!newPublisher && service.github_repo) {
        newPublisher = service.github_repo.split('/')[0]
      }

      // Re-resolve from PyPI
      if (!newPublisher && service.pypi_package) {
        try {
          const res = await fetch(`https://pypi.org/pypi/${service.pypi_package}/json`)
          if (res.ok) {
            const data = await res.json()
            const author = data.info?.author
            if (author && !CI_BOT_NAMES.has(author.toLowerCase())) {
              newPublisher = author
            }
          }
        } catch { /* ignore */ }
      }

      if (newPublisher && newPublisher !== botPub.name) {
        // Create or find the new publisher
        const newSlug = newPublisher.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        await supabase
          .from('publishers')
          .upsert({ name: newPublisher, slug: newSlug }, { onConflict: 'slug' })

        const { data: newPub } = await supabase
          .from('publishers')
          .select('id')
          .eq('slug', newSlug)
          .single()

        if (newPub) {
          await supabase
            .from('services')
            .update({ publisher_id: newPub.id })
            .eq('id', service.id)

          results.push({
            service: service.name,
            old_publisher: botPub.name,
            new_publisher: newPublisher,
          })
          fixed++
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fixed,
    results,
    timestamp: new Date().toISOString(),
  })
}
