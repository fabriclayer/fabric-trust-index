import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 60

/**
 * Manually set github_repo for known services that can't be auto-resolved.
 * Also updates publisher.github_org to match.
 * Idempotent — safe to re-run.
 */

const MANUAL_REPOS: Record<string, string> = {
  'spacy': 'explosion/spaCy',
  'instructor': 'jxnl/instructor',
  'chromadb': 'chroma-core/chroma',
  'replicate': 'replicate/replicate-python',
  'litellm': 'BerriAI/litellm',
  'vllm': 'vllm-project/vllm',
  'ollama': 'ollama/ollama',
  'groq': 'groq/groq-python',
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const results: Array<{ slug: string; repo: string; status: string }> = []

  for (const [slug, repo] of Object.entries(MANUAL_REPOS)) {
    // Find the service
    const { data: service } = await supabase
      .from('services')
      .select('id, publisher_id, github_repo')
      .eq('slug', slug)
      .single()

    if (!service) {
      results.push({ slug, repo, status: 'not_found' })
      continue
    }

    if (service.github_repo === repo) {
      results.push({ slug, repo, status: 'already_set' })
      continue
    }

    // Update service github_repo
    const { error: svcErr } = await supabase
      .from('services')
      .update({ github_repo: repo })
      .eq('id', service.id)

    if (svcErr) {
      results.push({ slug, repo, status: `error: ${svcErr.message}` })
      continue
    }

    // Update publisher github_org
    const owner = repo.split('/')[0]
    const { data: pub } = await supabase
      .from('publishers')
      .select('id, github_org')
      .eq('id', service.publisher_id)
      .single()

    if (pub && !pub.github_org) {
      await supabase
        .from('publishers')
        .update({ github_org: owner })
        .eq('id', pub.id)
    }

    results.push({ slug, repo, status: 'updated' })
  }

  return NextResponse.json({
    ok: true,
    results,
    timestamp: new Date().toISOString(),
  })
}
