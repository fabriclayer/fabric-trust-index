import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runCollectors, runAllCollectors } from '@/lib/collectors/runner'
import { logCronRun } from '@/lib/cron-log'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .neq('discovered_from', 'clawhub')
      .order('composite_score', { ascending: false })

    if (!services) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    let processed = 0
    let rescored = 0
    for (const service of services) {
      try {
        const oldVulnScore = service.signal_vulnerability
        await runCollectors(service, ['vulnerability'])
        processed++

        // If vulnerability score dropped significantly, check for critical/high CVEs and full-rescore
        const { data: updated } = await supabase
          .from('services')
          .select('signal_vulnerability')
          .eq('id', service.id)
          .single()

        const newVulnScore = updated?.signal_vulnerability ?? oldVulnScore
        if (newVulnScore < oldVulnScore - 0.5) {
          console.log(`[collect-cve] Significant vuln score drop for ${service.name} (${oldVulnScore} → ${newVulnScore}), triggering full rescore`)
          await runAllCollectors(service, { skipSupplyChain: true })
          rescored++
        }
      } catch (err) {
        console.error(`CVE collection failed for ${service.name}:`, err)
      }
    }

    const result = { processed, rescored, total: services.length }
    await logCronRun('collect-cve', result)

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('CVE collection failed:', err)
    await logCronRun('collect-cve', {}, 'failed', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json(
      { error: 'Collection failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
