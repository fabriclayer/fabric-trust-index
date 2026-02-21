import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const maxDuration = 300

// Hand-curated capabilities and pricing for seed services
const SEED_DATA: Record<string, { capabilities: string[]; pricing: { model: string }; tags?: string[] }> = {
  // ── Image Generation ──
  'flux-pro': { capabilities: ['Image generation', 'Text-to-image', 'Photorealistic output', 'Prompt adherence'], pricing: { model: 'pay-per-use' }, tags: ['image-generation', 'text-to-image', 'diffusion'] },
  'stable-diffusion-xl': { capabilities: ['Image generation', 'Text-to-image', 'Fine-tuning support', 'Inpainting', 'ControlNet'], pricing: { model: 'open-weight' }, tags: ['image-generation', 'text-to-image', 'diffusion', 'open-source'] },
  'dall-e-3': { capabilities: ['Image generation', 'Text-to-image', 'Safety filtering', 'Natural language prompts'], pricing: { model: 'pay-per-use' }, tags: ['image-generation', 'text-to-image'] },
  'midjourney-api': { capabilities: ['Image generation', 'Artistic styling', 'Text-to-image', 'Upscaling'], pricing: { model: 'subscription' }, tags: ['image-generation', 'text-to-image', 'art'] },
  'ideogram-v2': { capabilities: ['Image generation', 'Typography rendering', 'Text-to-image', 'Logo design'], pricing: { model: 'pay-per-use' }, tags: ['image-generation', 'text-to-image', 'typography'] },
  'recraft-v3': { capabilities: ['Image generation', 'Vector output', 'Brand consistency', 'Design-focused'], pricing: { model: 'pay-per-use' }, tags: ['image-generation', 'vector', 'design'] },
  'playground-v3': { capabilities: ['Image generation', 'Artistic output', 'Creative styling'], pricing: { model: 'freemium' }, tags: ['image-generation', 'text-to-image', 'creative'] },
  'stability-video': { capabilities: ['Video generation', 'Text-to-video', 'Image-to-video'], pricing: { model: 'pay-per-use' }, tags: ['video-generation', 'text-to-video', 'diffusion'] },

  // ── LLMs ──
  'gpt-4o': { capabilities: ['Text generation', 'Vision', 'Tool use', 'Code generation', 'Multilingual'], pricing: { model: 'pay-per-token' }, tags: ['llm', 'multimodal', 'vision', 'tool-use', 'code'] },
  'claude-4-sonnet': { capabilities: ['Text generation', 'Reasoning', 'Tool use', 'Code generation', 'Constitutional AI'], pricing: { model: 'pay-per-token' }, tags: ['llm', 'reasoning', 'tool-use', 'code', 'safety'] },
  'gemini-2-0-flash': { capabilities: ['Text generation', 'Vision', 'Tool use', 'Code execution', 'Grounding'], pricing: { model: 'pay-per-token' }, tags: ['llm', 'multimodal', 'tool-use', 'code', 'grounding'] },
  'llama-3-3-70b': { capabilities: ['Text generation', 'Reasoning', 'Multilingual', 'Code generation'], pricing: { model: 'open-weight' }, tags: ['llm', 'open-source', 'reasoning', 'multilingual'] },
  'mistral-large': { capabilities: ['Text generation', 'Multilingual', 'Function calling', 'Code generation'], pricing: { model: 'pay-per-token' }, tags: ['llm', 'multilingual', 'function-calling', 'code'] },
  'qwen-2-5-72b': { capabilities: ['Text generation', 'Multilingual', 'Code generation', 'Mathematical reasoning'], pricing: { model: 'open-weight' }, tags: ['llm', 'multilingual', 'code', 'math'] },
  'deepseek-v3': { capabilities: ['Text generation', 'Code generation', 'Reasoning', 'Mixture-of-experts'], pricing: { model: 'open-weight' }, tags: ['llm', 'open-source', 'code', 'reasoning', 'moe'] },
  'command-r-plus': { capabilities: ['Text generation', 'RAG', 'Tool use', 'Enterprise focus'], pricing: { model: 'pay-per-token' }, tags: ['llm', 'rag', 'tool-use', 'enterprise'] },
  'fake-gpt-wrapper': { capabilities: ['Text generation'], pricing: { model: 'unknown' }, tags: ['llm', 'unofficial'] },

  // ── Web Search ──
  'brave-search': { capabilities: ['Web search', 'Privacy-focused', 'Independent index', 'Structured results'], pricing: { model: 'pay-per-use' }, tags: ['search', 'web-search', 'privacy', 'api'] },
  'tavily-ai': { capabilities: ['Web search', 'AI-optimized', 'LLM consumption', 'RAG'], pricing: { model: 'pay-per-use' }, tags: ['search', 'web-search', 'ai', 'rag'] },
  'serper-api': { capabilities: ['Web search', 'Google results', 'Structured output', 'SERP data'], pricing: { model: 'pay-per-use' }, tags: ['search', 'web-search', 'google', 'serp'] },
  'exa-search': { capabilities: ['Semantic search', 'Neural search', 'Content retrieval'], pricing: { model: 'pay-per-use' }, tags: ['search', 'semantic-search', 'neural'] },
  'firecrawl': { capabilities: ['Web scraping', 'URL to markdown', 'Crawling', 'LLM-ready output'], pricing: { model: 'pay-per-use' }, tags: ['scraping', 'crawling', 'markdown', 'llm'] },
  'perplexity-api': { capabilities: ['Web search', 'AI synthesis', 'Citations', 'Answer engine'], pricing: { model: 'pay-per-use' }, tags: ['search', 'ai', 'citations', 'answer-engine'] },
  'jina-reader': { capabilities: ['URL to markdown', 'Web reading', 'LLM-ready output'], pricing: { model: 'freemium' }, tags: ['reader', 'markdown', 'web', 'llm'] },

  // ── Code ──
  'cursor-mcp': { capabilities: ['Code completion', 'AI chat', 'Context protocol', 'Smart completions'], pricing: { model: 'subscription' }, tags: ['code', 'ide', 'mcp', 'completions'] },
  'github-copilot-ext': { capabilities: ['Code completion', 'AI chat', 'Workspace understanding', 'Multi-language'], pricing: { model: 'subscription' }, tags: ['code', 'copilot', 'completions', 'chat'] },
  'codeium-api': { capabilities: ['Code completion', 'AI chat', 'Multi-language', 'Free tier'], pricing: { model: 'freemium' }, tags: ['code', 'completions', 'chat', 'free'] },
  'sourcegraph-cody': { capabilities: ['Code completion', 'Codebase-aware context', 'Multi-repo', 'AI chat'], pricing: { model: 'freemium' }, tags: ['code', 'search', 'context', 'multi-repo'] },
  'tabnine-pro': { capabilities: ['Code completion', 'Privacy-first', 'Permissive training', 'Multi-language'], pricing: { model: 'subscription' }, tags: ['code', 'completions', 'privacy'] },
  'e2b-sandbox': { capabilities: ['Code execution', 'Cloud sandboxes', 'Full OS access', 'AI-safe'], pricing: { model: 'pay-per-use' }, tags: ['code', 'sandbox', 'execution', 'cloud'] },
  'snyk-api': { capabilities: ['Vulnerability scanning', 'Dependency analysis', 'Security fixes', 'CI/CD integration'], pricing: { model: 'freemium' }, tags: ['security', 'vulnerabilities', 'dependencies', 'devsecops'] },

  // ── Speech ──
  'deepgram-nova': { capabilities: ['Speech-to-text', 'Real-time streaming', 'Speaker diarization', 'Multi-language'], pricing: { model: 'pay-per-use' }, tags: ['speech', 'stt', 'transcription', 'real-time'] },
  'elevenlabs-v3': { capabilities: ['Text-to-speech', 'Voice cloning', 'Emotional expression', 'Multi-language'], pricing: { model: 'pay-per-use' }, tags: ['speech', 'tts', 'voice-cloning', 'audio'] },
  'whisper-large-v3': { capabilities: ['Speech recognition', 'Transcription', 'Translation', 'Multilingual'], pricing: { model: 'open-weight' }, tags: ['speech', 'stt', 'transcription', 'open-source', 'multilingual'] },
  'assemblyai': { capabilities: ['Speech-to-text', 'Summarization', 'Content moderation', 'Speaker diarization'], pricing: { model: 'pay-per-use' }, tags: ['speech', 'stt', 'transcription', 'summarization'] },
  'suno-v4': { capabilities: ['Music generation', 'Vocal synthesis', 'Song composition', 'Instrumental'], pricing: { model: 'subscription' }, tags: ['music', 'audio', 'generation', 'vocals'] },
  'cartesia-sonic': { capabilities: ['Text-to-speech', 'Low latency', 'Emotional control', 'Real-time'], pricing: { model: 'pay-per-use' }, tags: ['speech', 'tts', 'real-time', 'low-latency'] },
  'bark-tts': { capabilities: ['Text-to-speech', 'Music generation', 'Sound effects'], pricing: { model: 'open-source' }, tags: ['speech', 'tts', 'music', 'open-source'] },

  // ── Data APIs ──
  'coingecko-api': { capabilities: ['Crypto prices', 'Market data', 'Historical data', 'Portfolio tracking'], pricing: { model: 'freemium' }, tags: ['crypto', 'market-data', 'prices', 'api'] },
  'sendgrid': { capabilities: ['Email delivery', 'Templates', 'Analytics', 'Deliverability'], pricing: { model: 'pay-per-use' }, tags: ['email', 'delivery', 'templates', 'api'] },
  'stripe-api': { capabilities: ['Payment processing', 'Subscription billing', 'Invoicing', 'Webhooks'], pricing: { model: 'pay-per-use' }, tags: ['payments', 'billing', 'subscriptions', 'fintech'] },
  'twilio-api': { capabilities: ['SMS', 'Voice calls', 'Video', 'Authentication'], pricing: { model: 'pay-per-use' }, tags: ['sms', 'voice', 'communications', 'api'] },
  'weather-api': { capabilities: ['Weather data', 'Forecasts', 'Historical data', 'Astronomy'], pricing: { model: 'freemium' }, tags: ['weather', 'forecast', 'data', 'api'] },
  'newsapi': { capabilities: ['News search', 'Headlines', 'Multi-source', 'Filtering'], pricing: { model: 'freemium' }, tags: ['news', 'search', 'headlines', 'api'] },
  'wolfram-alpha-api': { capabilities: ['Computational knowledge', 'Math', 'Science', 'Data queries'], pricing: { model: 'pay-per-use' }, tags: ['math', 'computation', 'knowledge', 'science'] },
  'polygon-io': { capabilities: ['Stock data', 'Options data', 'Crypto data', 'Real-time quotes'], pricing: { model: 'pay-per-use' }, tags: ['finance', 'stocks', 'market-data', 'real-time'] },
  'clearbit-api': { capabilities: ['Company enrichment', 'Contact enrichment', 'Lead scoring'], pricing: { model: 'pay-per-use' }, tags: ['enrichment', 'business-intelligence', 'leads'] },
  'resend': { capabilities: ['Email delivery', 'React Email', 'Templates', 'Deliverability'], pricing: { model: 'freemium' }, tags: ['email', 'delivery', 'react', 'developer'] },
  'malicious-scraper-x': { capabilities: ['Web scraping'], pricing: { model: 'unknown' }, tags: ['scraping', 'flagged'] },

  // ── Embedding ──
  'openai-embeddings': { capabilities: ['Embeddings', 'Semantic search', 'Clustering', 'Classification'], pricing: { model: 'pay-per-token' }, tags: ['embedding', 'semantic-search', 'clustering'] },
  'cohere-embed-v4': { capabilities: ['Embeddings', 'Multilingual', 'Compression', 'Search optimization'], pricing: { model: 'pay-per-token' }, tags: ['embedding', 'multilingual', 'compression'] },
  'voyage-3': { capabilities: ['Embeddings', 'Domain-specialized', 'Code embedding', 'Legal embedding'], pricing: { model: 'pay-per-token' }, tags: ['embedding', 'domain-specific', 'code', 'legal'] },
  'jina-embeddings-v3': { capabilities: ['Embeddings', 'Multilingual', 'Late interaction', 'Open source'], pricing: { model: 'open-source' }, tags: ['embedding', 'multilingual', 'open-source'] },

  // ── Vision ──
  'gpt-4-vision': { capabilities: ['Image understanding', 'OCR', 'Visual QA', 'Document analysis'], pricing: { model: 'pay-per-token' }, tags: ['vision', 'ocr', 'multimodal', 'document'] },
  'claude-vision': { capabilities: ['Image understanding', 'Document analysis', 'Visual reasoning', 'OCR'], pricing: { model: 'pay-per-token' }, tags: ['vision', 'document', 'reasoning', 'ocr'] },
  'llava-next': { capabilities: ['Visual reasoning', 'Image understanding', 'Multimodal'], pricing: { model: 'open-weight' }, tags: ['vision', 'multimodal', 'open-source', 'reasoning'] },
  'moondream-v2': { capabilities: ['Vision', 'Edge deployment', 'Lightweight', 'Image understanding'], pricing: { model: 'open-weight' }, tags: ['vision', 'edge', 'lightweight', 'open-source'] },
  'sam-2': { capabilities: ['Image segmentation', 'Video segmentation', 'Zero-shot', 'Object tracking'], pricing: { model: 'open-weight' }, tags: ['vision', 'segmentation', 'zero-shot', 'open-source'] },

  // ── Agents ──
  'crewai-mcp': { capabilities: ['Multi-agent orchestration', 'Role-based agents', 'Task delegation', 'Tool use'], pricing: { model: 'open-source' }, tags: ['agent', 'multi-agent', 'orchestration', 'mcp'] },
  'langchain-tools': { capabilities: ['Tool integration', 'Memory management', 'Chain composition', 'Agent framework'], pricing: { model: 'open-source' }, tags: ['agent', 'tools', 'langchain', 'framework'] },
  'autogen-studio': { capabilities: ['Multi-agent conversations', 'Code execution', 'Human-in-the-loop'], pricing: { model: 'open-source' }, tags: ['agent', 'multi-agent', 'code-execution', 'microsoft'] },
  'openai-assistants': { capabilities: ['Tool use', 'File search', 'Code interpreter', 'Persistent threads'], pricing: { model: 'pay-per-use' }, tags: ['agent', 'assistants', 'tool-use', 'code'] },
  'phidata': { capabilities: ['AI assistants', 'Memory', 'Knowledge base', 'Tool use'], pricing: { model: 'open-source' }, tags: ['agent', 'assistants', 'memory', 'tools'] },
  'prompt-inject-tool': { capabilities: ['Prompt injection'], pricing: { model: 'unknown' }, tags: ['agent', 'flagged', 'malicious'] },
  'crypto-drain-agent': { capabilities: ['Wallet access'], pricing: { model: 'unknown' }, tags: ['agent', 'flagged', 'malicious'] },

  // ── Infrastructure ──
  'replicate': { capabilities: ['Model hosting', 'Fine-tuning', 'Serverless inference', 'Pay-per-second'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'inference', 'fine-tuning', 'serverless'] },
  'huggingface-inference': { capabilities: ['Serverless inference', 'Model hosting', 'Auto-scaling', '200k+ models'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'inference', 'serverless', 'huggingface'] },
  'modal-serverless': { capabilities: ['GPU containers', 'Serverless', 'Job scheduling', 'Web endpoints'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'gpu', 'serverless', 'containers'] },
  'together-ai': { capabilities: ['Model hosting', 'Fine-tuning', 'Open-source models', 'Inference'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'inference', 'fine-tuning', 'open-source'] },
  'runpod': { capabilities: ['GPU cloud', 'Serverless endpoints', 'AI training', 'Inference'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'gpu', 'cloud', 'serverless'] },
  'groq-api': { capabilities: ['Ultra-fast inference', 'LPU hardware', 'Low latency', 'LLM serving'], pricing: { model: 'pay-per-token' }, tags: ['infra', 'inference', 'low-latency', 'lpu'] },
  'cerebras-inference': { capabilities: ['Wafer-scale inference', 'High throughput', 'LLM serving'], pricing: { model: 'pay-per-token' }, tags: ['infra', 'inference', 'throughput', 'wafer-scale'] },
  'qdrant-cloud': { capabilities: ['Vector database', 'Similarity search', 'Filtering', 'Cloud managed'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'vector-database', 'search', 'cloud'] },
  'pinecone': { capabilities: ['Vector database', 'Similarity search', 'Serverless', 'High-scale'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'vector-database', 'serverless'] },
  'weaviate-cloud': { capabilities: ['Vector database', 'Hybrid search', 'Built-in vectorization', 'Open source'], pricing: { model: 'freemium' }, tags: ['infra', 'vector-database', 'hybrid-search', 'open-source'] },
  'neon-db': { capabilities: ['Serverless Postgres', 'Branching', 'Auto-scaling', 'Bottomless storage'], pricing: { model: 'freemium' }, tags: ['infra', 'database', 'postgres', 'serverless'] },
  'upstash': { capabilities: ['Serverless Redis', 'Serverless Kafka', 'Global replication', 'Per-request pricing'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'redis', 'kafka', 'serverless'] },
  'octoai': { capabilities: ['Model optimization', 'Serverless inference', 'Efficient deployment'], pricing: { model: 'pay-per-use' }, tags: ['infra', 'inference', 'optimization', 'serverless'] },
  'fixie-ai': { capabilities: ['Natural language agents', 'Custom tools', 'Knowledge base'], pricing: { model: 'pay-per-use' }, tags: ['agent', 'natural-language', 'tools'] },
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const slugs = Object.keys(SEED_DATA)

    let updated = 0
    let notFound = 0
    let failed = 0
    const errors: string[] = []

    for (const slug of slugs) {
      const data = SEED_DATA[slug]

      const { error: updateErr, count } = await supabase
        .from('services')
        .update({
          capabilities: data.capabilities,
          pricing: data.pricing,
          tags: data.tags ?? [],
        })
        .eq('slug', slug)

      if (updateErr) {
        failed++
        if (errors.length < 10) errors.push(`${slug}: ${updateErr.message}`)
      } else if (count === 0) {
        // Service might not exist in Supabase (only in static data)
        notFound++
      } else {
        updated++
      }
    }

    return NextResponse.json({
      ok: true,
      total: slugs.length,
      updated,
      notFound,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Seed backfill failed:', err)
    return NextResponse.json(
      { error: 'Seed backfill failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
