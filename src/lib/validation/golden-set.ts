/**
 * Golden Set Validation
 *
 * Curated list of services with expected scoring boundaries.
 * If any of these fail validation, there's a data quality or scoring issue.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { FALLBACK_REASONS } from '@/lib/validation/constants'

export interface GoldenService {
  slug: string
  name: string
  expected_status: 'trusted' | 'caution' | 'blocked'
  min_composite: number
  max_composite: number
  required_signals: string[]
  notes: string
}

export interface GoldenSetFailure {
  slug: string
  name: string
  issues: string[]
  expected: {
    status: string
    min_composite: number
    max_composite: number
  }
  actual: {
    composite_score: number
    status: string
    signals: Array<{ name: string; score: number; is_fallback: boolean }>
  }
}

export interface GoldenSetResult {
  ok: boolean
  total: number
  passed: number
  failed: number
  missing: number
  failures: GoldenSetFailure[]
  missing_slugs: string[]
}

const REGISTRY_SIGNALS = ['transparency', 'maintenance', 'publisher_trust']

export const GOLDEN_SET: GoldenService[] = [
  // ═══ MUST BE TRUSTED (min 3.50) ═══
  { slug: 'stripe', name: 'Stripe', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Massive adoption, zero CVEs, well-maintained' },
  { slug: 'supabase', name: 'Supabase', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Open source, active maintenance, strong publisher' },
  { slug: 'anthropic', name: 'Anthropic', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Major AI company, clean security' },
  { slug: 'openai', name: 'OpenAI', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Major AI company, high adoption' },
  { slug: 'sentence-transformers', name: 'sentence-transformers', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Widely used embeddings library' },
  { slug: 'xgboost', name: 'xgboost', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Established ML library' },
  { slug: 'crewai', name: 'CrewAI', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Growing agent framework' },
  { slug: 'pinecone', name: 'Pinecone', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Established vector DB' },
  { slug: 'transformers', name: 'Transformers', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'HuggingFace flagship, massive adoption' },
  { slug: 'cohere', name: 'Cohere', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Established AI company' },
  { slug: 'vercel-ai', name: 'Vercel AI SDK', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Well-maintained framework' },
  { slug: 'keras', name: 'keras', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Major ML framework' },
  { slug: 'langchain', name: 'LangChain', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Patched CVEs, high adoption' },
  { slug: 'torch', name: 'torch', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'PyTorch, massive ML framework' },
  { slug: 'datasets', name: 'datasets', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'HuggingFace datasets' },
  { slug: 'diffusers', name: 'Diffusers', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'HuggingFace diffusion models' },
  { slug: 'accelerate', name: 'accelerate', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'HuggingFace training toolkit' },
  { slug: 'dspy-ai', name: 'dspy-ai', expected_status: 'trusted', min_composite: 3.50, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Stanford NLP framework' },

  // ═══ SHOULD BE TRUSTED (min 3.00) ═══
  { slug: 'spacy', name: 'spaCy', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Established NLP library' },
  { slug: 'instructor', name: 'Instructor', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Popular structured output library' },
  { slug: 'langchain-core', name: '@langchain/core', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'LangChain core package' },
  { slug: 'chromadb', name: 'ChromaDB', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Popular vector DB' },
  { slug: 'modelcontextprotocol-sdk', name: '@modelcontextprotocol/sdk', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Anthropic MCP SDK' },
  { slug: 'replicate', name: 'Replicate', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Established inference provider' },

  // ═══ SHOULD NOT BE BLOCKED — popular packages currently miscoring ═══
  { slug: 'tensorflow', name: 'tensorflow', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Google ML framework — currently 0.99 blocked (scoring bug)' },
  { slug: 'gradio', name: 'Gradio', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'HuggingFace demo framework — currently 0.99 blocked' },
  { slug: 'mlflow', name: 'MLflow', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Databricks MLOps — currently 0.99 blocked' },
  { slug: 'pillow', name: 'Pillow', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Python imaging — currently 0.99 blocked' },
  { slug: 'opencv-python', name: 'opencv-python', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Computer vision library' },
  { slug: 'fastapi', name: 'FastAPI', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Popular web framework' },
  { slug: 'scikit-learn', name: 'scikit-learn', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Foundational ML library' },
  { slug: 'nltk', name: 'nltk', expected_status: 'caution', min_composite: 2.50, max_composite: 5.0, required_signals: ['transparency', 'maintenance'], notes: 'Classic NLP toolkit — has critical unpatched CVEs, legitimately capped' },
  { slug: 'wandb', name: 'Weights & Biases', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Popular ML tracking' },
  { slug: 'streamlit', name: 'Streamlit', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'Snowflake data app framework' },
  { slug: 'ollama', name: 'Ollama', expected_status: 'trusted', min_composite: 2.50, max_composite: 5.0, required_signals: [], notes: 'Local LLM runner' },
  { slug: 'litellm', name: 'LiteLLM', expected_status: 'trusted', min_composite: 3.00, max_composite: 5.0, required_signals: REGISTRY_SIGNALS, notes: 'LLM proxy/gateway' },
  { slug: 'groq', name: 'Groq', expected_status: 'trusted', min_composite: 2.50, max_composite: 5.0, required_signals: [], notes: 'Fast inference provider' },
  { slug: 'vllm', name: 'vLLM', expected_status: 'blocked', min_composite: 0.0, max_composite: 5.0, required_signals: ['transparency', 'maintenance'], notes: 'Popular inference engine — has critical unpatched CVEs, legitimately blocked' },
]

const SIGNAL_ORDER = [
  'vulnerability', 'operational', 'maintenance',
  'adoption', 'transparency', 'publisher_trust',
]

export async function runGoldenSetValidation(
  supabase: SupabaseClient
): Promise<GoldenSetResult> {
  const failures: GoldenSetFailure[] = []
  const missing_slugs: string[] = []

  for (const golden of GOLDEN_SET) {
    // Fetch service
    const { data: service } = await supabase
      .from('services')
      .select('id, slug, name, composite_score, status, signal_vulnerability, signal_operational, signal_maintenance, signal_adoption, signal_transparency, signal_publisher_trust')
      .eq('slug', golden.slug)
      .single()

    if (!service) {
      missing_slugs.push(golden.slug)
      continue
    }

    const issues: string[] = []

    // Check composite score bounds
    if (service.composite_score < golden.min_composite) {
      issues.push(`composite ${service.composite_score.toFixed(2)} below min ${golden.min_composite}`)
    }
    if (service.composite_score > golden.max_composite) {
      issues.push(`composite ${service.composite_score.toFixed(2)} above max ${golden.max_composite}`)
    }

    // Check status
    if (service.status !== golden.expected_status) {
      issues.push(`status "${service.status}" expected "${golden.expected_status}"`)
    }

    // Check required signals for fallback
    const signalScores: Array<{ name: string; score: number; is_fallback: boolean }> = []

    for (const signalName of SIGNAL_ORDER) {
      const score = service[`signal_${signalName}` as keyof typeof service] as number
      let is_fallback = false

      if (golden.required_signals.includes(signalName)) {
        // Check latest signal_history for fallback reason
        const { data: latest } = await supabase
          .from('signal_history')
          .select('metadata')
          .eq('service_id', service.id)
          .eq('signal_name', signalName)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single()

        const reason = latest?.metadata?.reason as string | undefined
        if (reason && FALLBACK_REASONS.has(reason)) {
          is_fallback = true
          issues.push(`${signalName} is fallback (${reason})`)
        }
      }

      signalScores.push({ name: signalName, score, is_fallback })
    }

    if (issues.length > 0) {
      failures.push({
        slug: golden.slug,
        name: golden.name,
        issues,
        expected: {
          status: golden.expected_status,
          min_composite: golden.min_composite,
          max_composite: golden.max_composite,
        },
        actual: {
          composite_score: service.composite_score,
          status: service.status,
          signals: signalScores,
        },
      })
    }
  }

  const total = GOLDEN_SET.length
  const missing = missing_slugs.length
  const failed = failures.length
  const passed = total - failed - missing

  return {
    ok: failed === 0 && missing === 0,
    total,
    passed,
    failed,
    missing,
    failures,
    missing_slugs,
  }
}
