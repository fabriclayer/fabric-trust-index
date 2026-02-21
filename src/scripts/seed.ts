import { createClient } from '@supabase/supabase-js'
import { SERVICES } from '../data/services'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function seed() {
  console.log('Seeding database...')
  console.log(`Found ${SERVICES.length} services to seed.\n`)

  // 1. Extract unique publishers with their domains
  const publisherMap = new Map<string, string | undefined>()
  for (const svc of SERVICES) {
    if (!publisherMap.has(svc.publisher)) {
      publisherMap.set(svc.publisher, svc.domain ? `https://${svc.domain}` : undefined)
    }
  }
  console.log(`Upserting ${publisherMap.size} publishers...`)

  // 2. Upsert publishers
  for (const [name, website_url] of publisherMap) {
    const slug = toSlug(name)
    const row: Record<string, string> = { name, slug }
    if (website_url) row.website_url = website_url
    const { error } = await supabase
      .from('publishers')
      .upsert(row, { onConflict: 'slug' })
    if (error) console.error(`  Publisher "${name}":`, error.message)
  }
  console.log(`  Done.\n`)

  // 3. Fetch publisher IDs to build a lookup map
  const { data: publishers, error: pubFetchError } = await supabase
    .from('publishers')
    .select('id, name')
  if (pubFetchError) {
    console.error('Failed to fetch publishers:', pubFetchError.message)
    process.exit(1)
  }
  const pubMap = new Map(publishers?.map(p => [p.name, p.id]) ?? [])

  // 4. Upsert services
  console.log(`Upserting ${SERVICES.length} services...`)
  let successCount = 0
  let errorCount = 0

  for (const svc of SERVICES) {
    const publisher_id = pubMap.get(svc.publisher)
    if (!publisher_id) {
      console.error(`  No publisher found for service "${svc.name}" (publisher: "${svc.publisher}")`)
      errorCount++
      continue
    }

    const { error } = await supabase.from('services').upsert(
      {
        name: svc.name,
        slug: svc.slug,
        publisher_id,
        category: svc.category,
        description: svc.description,
        icon: svc.icon,
        signal_vulnerability: svc.signals[0],
        signal_operational: svc.signals[1],
        signal_maintenance: svc.signals[2],
        signal_adoption: svc.signals[3],
        signal_transparency: svc.signals[4],
        signal_publisher_trust: svc.signals[5],
        composite_score: svc.score,
        status: svc.status,
        discovered_from: 'manual',
      },
      { onConflict: 'slug' }
    )

    if (error) {
      console.error(`  Service "${svc.name}":`, error.message)
      errorCount++
    } else {
      successCount++
    }
  }

  console.log(`  Done.\n`)
  console.log('--- Seed Summary ---')
  console.log(`Publishers: ${publisherMap.size} upserted`)
  console.log(`Services:  ${successCount} upserted, ${errorCount} errors`)
  console.log(`Total:     ${SERVICES.length} processed`)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
