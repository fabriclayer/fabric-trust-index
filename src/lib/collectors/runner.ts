import { createServerClient } from '@/lib/supabase/server'
import type { DbService } from '@/lib/supabase/types'
import type { CollectorResult } from './types'
import { vulnerabilityCollector } from './vulnerability'
import { operationalHealthCollector } from './operational-health'
import { maintenanceCollector } from './maintenance'
import { adoptionCollector } from './adoption'
import { transparencyCollector } from './transparency'
import { publisherTrustCollector } from './publisher-trust'

const WEIGHTS = [0.25, 0.20, 0.20, 0.15, 0.10, 0.10]
const SIGNAL_KEYS = [
  'vulnerability',
  'operational',
  'maintenance',
  'adoption',
  'transparency',
  'publisher_trust',
] as const

const COLLECTORS = [
  vulnerabilityCollector,
  operationalHealthCollector,
  maintenanceCollector,
  adoptionCollector,
  transparencyCollector,
  publisherTrustCollector,
]

function getStatus(score: number): 'trusted' | 'caution' | 'blocked' {
  if (score >= 3.50) return 'trusted'
  if (score >= 2.50) return 'caution'
  return 'blocked'
}

/**
 * Run all 6 collectors for a single service.
 * Updates the service's signal scores, composite score, and status.
 * Records a signal_history entry for each successful signal.
 */
export async function runAllCollectors(service: DbService): Promise<{
  success: string[]
  failed: string[]
}> {
  const supabase = createServerClient()

  const results = await Promise.allSettled(
    COLLECTORS.map(c => c.collect(service))
  )

  const updates: Record<string, unknown> = {}
  const signals: number[] = []
  const success: string[] = []
  const failed: string[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const signalKey = SIGNAL_KEYS[i]

    if (result.status === 'fulfilled') {
      const cr: CollectorResult = result.value
      updates[`signal_${signalKey}`] = cr.score
      signals.push(cr.score)
      success.push(signalKey)

      // Record signal history
      await supabase.from('signal_history').insert({
        service_id: service.id,
        signal_name: signalKey,
        score: cr.score,
        metadata: cr.metadata,
      })
    } else {
      // Keep existing score on failure
      const existing = service[`signal_${signalKey}` as keyof DbService] as number
      signals.push(existing)
      failed.push(signalKey)
      console.error(`Collector ${signalKey} failed for ${service.name}:`, result.reason)
    }
  }

  // Recompute composite score
  const rawScore = signals.reduce((sum, s, i) => sum + s * WEIGHTS[i], 0)

  // Apply modifiers
  let compositeScore = rawScore
  const modifiers: string[] = []

  if (service.transaction_count < 10) {
    compositeScore *= 0.8
    modifiers.push('new_provider')
  }

  if (service.last_activity_at) {
    const daysSince = (Date.now() - new Date(service.last_activity_at).getTime()) / 86400000
    if (daysSince > 7) {
      compositeScore *= 0.7
      modifiers.push('inactive')
    }
  }

  compositeScore = Math.round(compositeScore * 100) / 100

  updates.composite_score = compositeScore
  updates.status = getStatus(compositeScore)
  updates.active_modifiers = modifiers

  // Update service
  await supabase
    .from('services')
    .update(updates)
    .eq('id', service.id)

  // Record composite history
  await supabase.from('signal_history').insert({
    service_id: service.id,
    signal_name: 'composite',
    score: compositeScore,
    metadata: { modifiers, raw_score: rawScore },
  })

  return { success, failed }
}

/**
 * Run a specific set of collectors for a service.
 */
export async function runCollectors(
  service: DbService,
  collectorNames: string[]
): Promise<void> {
  const supabase = createServerClient()

  for (const name of collectorNames) {
    const collector = COLLECTORS.find(c => c.name === name)
    if (!collector) continue

    try {
      const result = await collector.collect(service)
      const signalKey = SIGNAL_KEYS[COLLECTORS.indexOf(collector)]

      await supabase
        .from('services')
        .update({ [`signal_${signalKey}`]: result.score })
        .eq('id', service.id)

      await supabase.from('signal_history').insert({
        service_id: service.id,
        signal_name: signalKey,
        score: result.score,
        metadata: result.metadata,
      })
    } catch (err) {
      console.error(`Collector ${name} failed for ${service.name}:`, err)
    }
  }
}

/**
 * Run all collectors for all services in the database.
 */
export async function runAllCollectorsForAllServices(): Promise<{
  total: number
  succeeded: number
  failed: number
}> {
  const supabase = createServerClient()
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .order('composite_score', { ascending: false })

  if (!services) return { total: 0, succeeded: 0, failed: 0 }

  let succeeded = 0
  let failedCount = 0

  for (const service of services) {
    try {
      const result = await runAllCollectors(service)
      if (result.failed.length === 0) succeeded++
      else failedCount++
      console.log(`[${service.name}] success: ${result.success.join(', ')} | failed: ${result.failed.join(', ') || 'none'}`)
    } catch (err) {
      failedCount++
      console.error(`[${service.name}] error:`, err)
    }
  }

  return { total: services.length, succeeded, failed: failedCount }
}
