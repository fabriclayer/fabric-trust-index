import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runGoldenSetValidation } from '@/lib/validation/golden-set'
import { sendTelegramAlert } from '@/lib/alerts/telegram'

export const maxDuration = 60

/**
 * Daily golden set validation cron.
 * Runs the golden set validation and alerts on failures.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const result = await runGoldenSetValidation(supabase)

  if (!result.ok) {
    const failureLines = result.failures
      .map(f => `${f.slug}: ${f.issues.join(', ')}`)
      .join('\n')

    const message = [
      '<b>Golden Set Validation Failed</b>',
      '',
      `Passed: ${result.passed}/${result.total}`,
      `Failed: ${result.failed}`,
      `Missing: ${result.missing}`,
      '',
      failureLines,
    ].join('\n')

    await sendTelegramAlert(message)

    // Also try email alert
    try {
      const apiKey = process.env.RESEND_API_KEY
      if (apiKey) {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)
        await resend.emails.send({
          from: 'Fabric Trust Index <noreply@fabriclayer.ai>',
          to: process.env.DISCOVERY_EMAIL ?? 'kenny@block9.co',
          subject: `[Fabric Trust] Golden set validation failed (${result.failed} failures)`,
          text: message.replace(/<[^>]*>/g, ''),
        })
      }
    } catch (err) {
      console.error('Email alert failed:', err)
    }
  }

  return NextResponse.json(result)
}
