import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runAllCollectors } from '../src/lib/collectors/runner'

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=["']?(.*?)["']?\s*$/)
  if (match) process.env[match[1]] = match[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npx tsx scripts/rescore-one.ts <slug>')
    process.exit(1)
  }

  const { data: service, error } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !service) {
    console.error('Service not found:', error?.message)
    process.exit(1)
  }

  console.log(`Scoring ${service.name} (skip_zero_cap=${service.skip_zero_cap})...`)
  console.log(`Before: score=${service.composite_score}, status=${service.status}, modifiers=${JSON.stringify(service.active_modifiers)}`)

  await runAllCollectors(service)

  const { data: updated } = await supabase
    .from('services')
    .select('composite_score, raw_composite_score, status, active_modifiers')
    .eq('slug', slug)
    .single()

  console.log(`After:  score=${updated?.composite_score}, raw=${updated?.raw_composite_score}, status=${updated?.status}, modifiers=${JSON.stringify(updated?.active_modifiers)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
