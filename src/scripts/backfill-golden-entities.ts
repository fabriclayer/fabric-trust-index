/**
 * Golden Entity Mapping
 *
 * Prints proposed SQL to map canonical SDK surfaces for golden set services
 * that are missing registry references. Never writes to the database.
 *
 * Usage: npx tsx src/scripts/backfill-golden-entities.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Canonical SDK surfaces for golden set companies
const ENTITY_MAP: Array<{
  slug: string
  github_repo: string
  npm_package: string | null
  pypi_package: string | null
}> = [
  { slug: 'openai', github_repo: 'openai/openai-python', npm_package: 'openai', pypi_package: 'openai' },
  { slug: 'anthropic', github_repo: 'anthropics/anthropic-sdk-python', npm_package: '@anthropic-ai/sdk', pypi_package: 'anthropic' },
  { slug: 'cohere', github_repo: 'cohere-ai/cohere-python', npm_package: 'cohere-ai', pypi_package: 'cohere' },
  { slug: 'pinecone', github_repo: 'pinecone-io/pinecone-python-client', npm_package: '@pinecone-database/pinecone', pypi_package: 'pinecone' },
  { slug: 'stripe', github_repo: 'stripe/stripe-python', npm_package: 'stripe', pypi_package: 'stripe' },
]

async function main() {
  console.log('-- Golden Entity Mapping SQL')
  console.log('-- Only sets columns that are currently NULL. Run diagnose-golden.ts first to verify.')
  console.log()

  for (const entity of ENTITY_MAP) {
    const { data: service } = await supabase
      .from('services')
      .select('id, slug, github_repo, npm_package, pypi_package')
      .eq('slug', entity.slug)
      .single()

    if (!service) {
      console.log(`-- SKIP: ${entity.slug} not found in database`)
      continue
    }

    const updates: string[] = []
    if (!service.github_repo && entity.github_repo) {
      updates.push(`github_repo = '${entity.github_repo}'`)
    }
    if (!service.npm_package && entity.npm_package) {
      updates.push(`npm_package = '${entity.npm_package}'`)
    }
    if (!service.pypi_package && entity.pypi_package) {
      updates.push(`pypi_package = '${entity.pypi_package}'`)
    }

    if (updates.length === 0) {
      console.log(`-- SKIP: ${entity.slug} already has all registry refs populated`)
    } else {
      console.log(`UPDATE services SET ${updates.join(', ')} WHERE slug = '${entity.slug}';`)
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
