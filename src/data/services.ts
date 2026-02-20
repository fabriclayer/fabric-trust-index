import { computeScore, getStatus, toSlug, randomUpdated, TAG_CLASSES } from '@/lib/utils'

export interface Service {
  name: string
  slug: string
  publisher: string
  category: string
  tag: string
  description: string
  signals: number[]
  score: number
  status: 'trusted' | 'caution' | 'blocked'
  icon: string
  updated: string
}

const RAW = [
  { n: 'flux-pro', pub: 'Black Forest Labs', cat: 'image-generation', desc: 'State-of-the-art text-to-image model with exceptional prompt adherence and photorealistic output quality.', s: [4.8,4.5,3.4,4.2,3.7,4.3], icon: '◆' },
  { n: 'stable-diffusion-xl', pub: 'Stability AI', cat: 'image-generation', desc: 'Open-weight image generation model with extensive community ecosystem and fine-tuning support.', s: [4.6,4.2,4.1,4.8,4.9,4.0], icon: '◆' },
  { n: 'dall-e-3', pub: 'OpenAI', cat: 'image-generation', desc: 'Advanced text-to-image system with built-in safety features and natural language understanding.', s: [4.9,4.7,3.8,4.5,2.1,4.8], icon: '◆' },
  { n: 'midjourney-api', pub: 'Midjourney Inc', cat: 'image-generation', desc: 'Artistic image generation known for aesthetic quality and creative interpretation of prompts.', s: [4.7,4.3,3.2,4.9,1.5,4.5], icon: '◆' },
  { n: 'ideogram-v2', pub: 'Ideogram AI', cat: 'image-generation', desc: 'Text rendering specialist with strong typography capabilities in generated images.', s: [4.5,4.0,4.2,3.1,3.5,3.8], icon: '◆' },
  { n: 'gpt-4o', pub: 'OpenAI', cat: 'llm', desc: 'Multimodal large language model with vision, audio, and text capabilities in a single model.', s: [4.9,4.8,4.5,5.0,2.0,5.0], icon: '◇' },
  { n: 'claude-4-sonnet', pub: 'Anthropic', cat: 'llm', desc: 'Constitutional AI model optimized for helpfulness, harmlessness, and honesty with strong reasoning.', s: [4.9,4.7,4.8,4.8,3.2,4.9], icon: '◇' },
  { n: 'gemini-2.0-flash', pub: 'Google DeepMind', cat: 'llm', desc: 'Fast multimodal model with native tool use, code execution, and grounding capabilities.', s: [4.8,4.6,4.5,4.7,2.5,5.0], icon: '◇' },
  { n: 'llama-3.3-70b', pub: 'Meta AI', cat: 'llm', desc: 'Open-weight large language model with strong reasoning and multilingual support.', s: [4.7,4.1,4.2,4.9,5.0,4.8], icon: '◇' },
  { n: 'mistral-large', pub: 'Mistral AI', cat: 'llm', desc: 'European frontier model with strong multilingual capabilities and function calling.', s: [4.6,4.3,4.4,4.2,4.8,4.2], icon: '◇' },
  { n: 'qwen-2.5-72b', pub: 'Alibaba Cloud', cat: 'llm', desc: 'Multilingual model with strong coding and mathematical reasoning capabilities.', s: [4.4,3.9,4.6,4.0,4.7,3.8], icon: '◇' },
  { n: 'deepseek-v3', pub: 'DeepSeek', cat: 'llm', desc: 'Efficient mixture-of-experts model with strong coding and reasoning at low cost.', s: [4.3,3.5,4.8,4.6,5.0,3.2], icon: '◇' },
  { n: 'command-r-plus', pub: 'Cohere', cat: 'llm', desc: 'Enterprise-focused model optimized for RAG, tool use, and business applications.', s: [4.5,4.4,3.9,3.5,4.0,4.5], icon: '◇' },
  { n: 'brave-search', pub: 'Brave Software', cat: 'web-search', desc: 'Privacy-focused web search API with independent index and no tracking.', s: [4.8,4.9,4.2,4.0,4.5,4.7], icon: '⊕' },
  { n: 'tavily-ai', pub: 'Tavily', cat: 'web-search', desc: 'AI-optimized search API designed specifically for LLM and agent consumption.', s: [4.5,4.3,4.6,3.2,4.0,3.5], icon: '⊕' },
  { n: 'serper-api', pub: 'Serper', cat: 'web-search', desc: 'Google Search results API with structured output for programmatic consumption.', s: [4.2,4.5,3.8,3.8,3.0,3.2], icon: '⊕' },
  { n: 'exa-search', pub: 'Exa AI', cat: 'web-search', desc: 'Neural search engine that understands meaning, not just keywords.', s: [4.4,4.0,4.5,2.8,4.2,3.0], icon: '⊕' },
  { n: 'firecrawl', pub: 'Mendable', cat: 'web-search', desc: 'Web scraping and crawling API that converts any URL to clean markdown for LLMs.', s: [4.3,4.1,4.8,3.5,4.5,3.2], icon: '⊕' },
  { n: 'cursor-mcp', pub: 'Anysphere', cat: 'code', desc: 'Context protocol integration for the Cursor AI code editor with smart completions.', s: [4.6,4.2,4.8,4.7,3.8,4.0], icon: '⟨⟩' },
  { n: 'github-copilot-ext', pub: 'GitHub', cat: 'code', desc: 'AI pair programmer extensions with code completion, chat, and workspace understanding.', s: [4.8,4.7,4.3,5.0,3.5,5.0], icon: '⟨⟩' },
  { n: 'codeium-api', pub: 'Exafunction', cat: 'code', desc: 'Free AI code completion and chat with support for 70+ programming languages.', s: [4.3,4.0,4.5,4.2,4.0,3.5], icon: '⟨⟩' },
  { n: 'sourcegraph-cody', pub: 'Sourcegraph', cat: 'code', desc: 'AI coding assistant with codebase-aware context and multi-repo understanding.', s: [4.4,4.1,4.2,3.5,4.5,4.2], icon: '⟨⟩' },
  { n: 'tabnine-pro', pub: 'Tabnine', cat: 'code', desc: 'AI code assistant trained on permissively licensed code with privacy-first approach.', s: [4.2,3.8,3.5,3.0,3.8,3.8], icon: '⟨⟩' },
  { n: 'deepgram-nova', pub: 'Deepgram', cat: 'speech', desc: 'Fast and accurate speech-to-text with real-time streaming and speaker diarization.', s: [4.7,4.8,4.3,4.0,4.2,4.5], icon: '♫' },
  { n: 'elevenlabs-v3', pub: 'ElevenLabs', cat: 'speech', desc: 'Ultra-realistic text-to-speech with voice cloning and emotional expression.', s: [4.8,4.5,4.6,4.8,3.5,4.3], icon: '♫' },
  { n: 'whisper-large-v3', pub: 'OpenAI', cat: 'speech', desc: 'Open-weight speech recognition model with multilingual transcription and translation.', s: [4.6,4.1,3.2,4.9,5.0,4.8], icon: '♫' },
  { n: 'assemblyai', pub: 'AssemblyAI', cat: 'speech', desc: 'Speech AI platform with transcription, summarization, and content moderation.', s: [4.5,4.6,4.1,3.8,3.5,4.2], icon: '♫' },
  { n: 'coingecko-api', pub: 'CoinGecko', cat: 'data-api', desc: 'Comprehensive cryptocurrency data API with prices, volume, and market cap for 10,000+ coins.', s: [4.3,4.7,3.8,4.5,4.0,4.5], icon: '◈' },
  { n: 'sendgrid', pub: 'Twilio', cat: 'data-api', desc: 'Cloud-based email delivery service with analytics, templates, and deliverability tools.', s: [4.5,4.8,3.5,4.8,3.8,5.0], icon: '◈' },
  { n: 'stripe-api', pub: 'Stripe', cat: 'data-api', desc: 'Payment processing platform with subscription billing, invoicing, and financial reporting.', s: [4.9,4.9,4.5,5.0,4.2,5.0], icon: '◈' },
  { n: 'twilio-api', pub: 'Twilio', cat: 'data-api', desc: 'Cloud communications platform for SMS, voice, video, and authentication.', s: [4.6,4.7,3.8,4.8,3.5,5.0], icon: '◈' },
  { n: 'weather-api', pub: 'WeatherAPI', cat: 'data-api', desc: 'Real-time weather data, forecasts, astronomy, and historical weather for any location.', s: [4.0,4.5,3.2,3.8,3.5,3.5], icon: '◈' },
  { n: 'newsapi', pub: 'NewsAPI.org', cat: 'data-api', desc: 'Search worldwide news articles and headlines from 150,000+ sources.', s: [3.8,4.0,2.5,3.5,3.2,3.0], icon: '◈' },
  { n: 'openai-embeddings', pub: 'OpenAI', cat: 'embedding', desc: 'Text embedding model for semantic search, clustering, and classification tasks.', s: [4.8,4.7,4.0,5.0,2.2,5.0], icon: '⊡' },
  { n: 'cohere-embed-v4', pub: 'Cohere', cat: 'embedding', desc: 'Multilingual embedding model with compression and search optimization features.', s: [4.6,4.3,4.5,3.8,4.0,4.5], icon: '⊡' },
  { n: 'voyage-3', pub: 'Voyage AI', cat: 'embedding', desc: 'Domain-specialized embedding models for code, legal, finance, and multilingual text.', s: [4.5,4.2,4.6,2.5,3.8,3.2], icon: '⊡' },
  { n: 'jina-embeddings-v3', pub: 'Jina AI', cat: 'embedding', desc: 'Open-source multilingual embeddings with late interaction for precise retrieval.', s: [4.3,3.8,4.7,3.5,5.0,3.5], icon: '⊡' },
  { n: 'gpt-4-vision', pub: 'OpenAI', cat: 'vision', desc: 'Multimodal vision model for image understanding, OCR, and visual question answering.', s: [4.9,4.7,4.2,5.0,2.0,5.0], icon: '◉' },
  { n: 'claude-vision', pub: 'Anthropic', cat: 'vision', desc: 'Vision capabilities in Claude models for document analysis and image understanding.', s: [4.8,4.6,4.7,4.8,3.0,4.9], icon: '◉' },
  { n: 'llava-next', pub: 'ByteDance', cat: 'vision', desc: 'Open-source large multimodal model with strong visual reasoning capabilities.', s: [4.2,3.5,4.4,4.0,5.0,3.2], icon: '◉' },
  { n: 'moondream-v2', pub: 'Vikhyat', cat: 'vision', desc: 'Tiny but capable vision-language model optimized for edge deployment.', s: [3.8,3.2,4.3,3.0,5.0,2.5], icon: '◉' },
  { n: 'crewai-mcp', pub: 'CrewAI', cat: 'agent', desc: 'Multi-agent orchestration framework with role-based collaboration and task delegation.', s: [4.3,3.8,4.7,4.2,4.8,3.5], icon: '⚡' },
  { n: 'langchain-tools', pub: 'LangChain', cat: 'agent', desc: 'Agent framework with tool integration, memory management, and chain composition.', s: [4.1,3.6,4.5,4.9,5.0,4.0], icon: '⚡' },
  { n: 'autogen-studio', pub: 'Microsoft', cat: 'agent', desc: 'Multi-agent conversation framework with code execution and human-in-the-loop support.', s: [4.2,3.5,4.3,4.0,4.8,5.0], icon: '⚡' },
  { n: 'openai-assistants', pub: 'OpenAI', cat: 'agent', desc: 'Managed agent API with tool use, file search, code interpreter, and persistent threads.', s: [4.7,4.6,4.2,4.8,2.5,5.0], icon: '⚡' },
  { n: 'phidata', pub: 'Phidata', cat: 'agent', desc: 'Framework for building AI assistants with memory, knowledge, and tools.', s: [4.0,3.5,4.6,3.2,4.8,2.8], icon: '⚡' },
  { n: 'replicate', pub: 'Replicate Inc', cat: 'infra', desc: 'Run and fine-tune open-source ML models with a cloud API. Pay per second.', s: [4.5,4.4,4.3,4.5,4.0,4.5], icon: '△' },
  { n: 'huggingface-inference', pub: 'Hugging Face', cat: 'infra', desc: 'Serverless inference API for 200k+ models with automatic scaling.', s: [4.3,4.0,4.5,5.0,5.0,4.8], icon: '△' },
  { n: 'modal-serverless', pub: 'Modal Labs', cat: 'infra', desc: 'Serverless cloud for ML with GPU containers, job scheduling, and web endpoints.', s: [4.6,4.5,4.8,3.5,4.2,3.5], icon: '△' },
  { n: 'together-ai', pub: 'Together AI', cat: 'infra', desc: 'Cloud platform for running and fine-tuning open-source models at scale.', s: [4.4,4.3,4.5,3.8,4.0,3.8], icon: '△' },
  { n: 'runpod', pub: 'RunPod Inc', cat: 'infra', desc: 'GPU cloud computing for AI inference and training with serverless endpoints.', s: [4.2,4.0,4.1,3.5,3.5,3.2], icon: '△' },
  { n: 'groq-api', pub: 'Groq Inc', cat: 'infra', desc: 'Ultra-fast LLM inference on custom LPU hardware with sub-100ms latency.', s: [4.5,4.9,4.3,4.0,3.2,3.8], icon: '△' },
  { n: 'cerebras-inference', pub: 'Cerebras', cat: 'infra', desc: 'Wafer-scale inference engine for LLMs with industry-leading throughput.', s: [4.4,4.8,4.0,2.8,3.0,3.5], icon: '△' },
  { n: 'recraft-v3', pub: 'Recraft AI', cat: 'image-generation', desc: 'Design-focused image generation with vector output and brand consistency.', s: [4.3,3.8,4.5,2.5,3.8,3.0], icon: '◆' },
  { n: 'playground-v3', pub: 'Playground AI', cat: 'image-generation', desc: 'Creative image generation model optimized for artistic and design applications.', s: [4.1,3.5,3.8,3.0,3.5,3.2], icon: '◆' },
  { n: 'perplexity-api', pub: 'Perplexity AI', cat: 'web-search', desc: 'Answer engine API that combines search with AI-powered synthesis and citations.', s: [4.6,4.4,4.7,4.2,2.8,4.0], icon: '⊕' },
  { n: 'jina-reader', pub: 'Jina AI', cat: 'web-search', desc: 'Convert any URL to LLM-ready markdown with a simple prefix API.', s: [4.2,3.9,4.8,3.0,5.0,3.5], icon: '⊕' },
  { n: 'suno-v4', pub: 'Suno AI', cat: 'speech', desc: 'AI music generation with vocals, instruments, and full song composition.', s: [4.4,4.0,4.5,4.5,2.5,3.5], icon: '♫' },
  { n: 'cartesia-sonic', pub: 'Cartesia', cat: 'speech', desc: 'Real-time text-to-speech with sub-100ms latency and emotional control.', s: [4.5,4.6,4.7,2.2,3.8,2.8], icon: '♫' },
  { n: 'e2b-sandbox', pub: 'E2B Dev', cat: 'code', desc: 'Secure cloud sandboxes for AI-generated code execution with full OS access.', s: [4.5,4.3,4.8,3.2,4.8,3.0], icon: '⟨⟩' },
  { n: 'snyk-api', pub: 'Snyk', cat: 'code', desc: 'Developer security platform for finding and fixing vulnerabilities in dependencies.', s: [4.8,4.6,4.0,4.2,3.5,4.8], icon: '⟨⟩' },
  { n: 'wolfram-alpha-api', pub: 'Wolfram Research', cat: 'data-api', desc: 'Computational knowledge engine for math, science, and real-world data queries.', s: [4.7,4.5,2.8,4.0,3.0,5.0], icon: '◈' },
  { n: 'polygon-io', pub: 'Polygon.io', cat: 'data-api', desc: 'Real-time and historical market data for stocks, options, crypto, and forex.', s: [4.5,4.7,4.0,3.8,3.5,4.2], icon: '◈' },
  { n: 'clearbit-api', pub: 'HubSpot', cat: 'data-api', desc: 'Business intelligence data API for company and contact enrichment.', s: [4.2,4.4,3.0,3.5,3.0,4.5], icon: '◈' },
  { n: 'malicious-scraper-x', pub: 'anon_user_847', cat: 'data-api', desc: 'Web scraping tool with credential harvesting capabilities flagged by security researchers.', s: [0.5,1.2,0.8,0.3,0.2,0.1], icon: '◈' },
  { n: 'fake-gpt-wrapper', pub: 'unknown_dev', cat: 'llm', desc: 'Unofficial GPT wrapper service with no authentication and data logging concerns.', s: [1.0,0.8,0.5,0.5,0.0,0.2], icon: '◇' },
  { n: 'prompt-inject-tool', pub: 'deleted_account', cat: 'agent', desc: 'MCP skill flagged by ClawHavoc for prompt injection and credential exfiltration attempts.', s: [0.3,0.5,0.2,0.2,0.0,0.0], icon: '⚡' },
  { n: 'crypto-drain-agent', pub: 'anon_1337', cat: 'agent', desc: 'Agent service flagged for unauthorized wallet access and fund redirection patterns.', s: [0.2,0.3,0.1,0.1,0.0,0.0], icon: '⚡' },
  { n: 'qdrant-cloud', pub: 'Qdrant', cat: 'infra', desc: 'High-performance vector database for similarity search and AI applications.', s: [4.5,4.4,4.6,3.8,4.8,3.5], icon: '△' },
  { n: 'pinecone', pub: 'Pinecone', cat: 'infra', desc: 'Managed vector database for high-scale machine learning applications.', s: [4.4,4.5,3.8,4.2,3.2,4.2], icon: '△' },
  { n: 'weaviate-cloud', pub: 'Weaviate', cat: 'infra', desc: 'Open-source vector database with built-in vectorization and hybrid search.', s: [4.3,4.1,4.7,3.5,5.0,3.5], icon: '△' },
  { n: 'bark-tts', pub: 'Suno AI', cat: 'speech', desc: 'Open-source text-to-audio model supporting speech, music, and sound effects.', s: [3.8,2.8,2.5,3.5,5.0,3.5], icon: '♫' },
  { n: 'resend', pub: 'Resend Inc', cat: 'data-api', desc: 'Email API built for developers with React Email templates and deliverability.', s: [4.4,4.5,4.8,3.0,4.5,3.2], icon: '◈' },
  { n: 'neon-db', pub: 'Neon Inc', cat: 'infra', desc: 'Serverless Postgres with branching, autoscaling, and bottomless storage.', s: [4.5,4.3,4.8,3.8,4.5,3.5], icon: '△' },
  { n: 'upstash', pub: 'Upstash', cat: 'infra', desc: 'Serverless Redis and Kafka with per-request pricing and global replication.', s: [4.3,4.5,4.5,3.5,4.2,3.2], icon: '△' },
  { n: 'stability-video', pub: 'Stability AI', cat: 'image-generation', desc: 'Video generation model for creating short clips from text or image prompts.', s: [4.0,3.2,3.8,3.5,4.5,4.0], icon: '◆' },
  { n: 'sam-2', pub: 'Meta AI', cat: 'vision', desc: 'Segment Anything Model 2 for zero-shot image and video segmentation.', s: [4.5,3.8,3.5,4.5,5.0,4.8], icon: '◉' },
  { n: 'octoai', pub: 'OctoML', cat: 'infra', desc: 'Efficient AI inference platform with model optimization and serverless deployment.', s: [4.2,4.3,4.0,2.8,3.5,3.2], icon: '△' },
  { n: 'fixie-ai', pub: 'Fixie AI', cat: 'agent', desc: 'Platform for building natural language agents with custom tools and knowledge.', s: [3.5,3.0,3.2,2.0,3.8,2.5], icon: '⚡' },
]

export const SERVICES: Service[] = RAW.map(r => {
  const score = computeScore(r.s)
  return {
    name: r.n,
    slug: toSlug(r.n),
    publisher: r.pub,
    category: r.cat,
    tag: TAG_CLASSES[r.cat] || '',
    description: r.desc,
    signals: r.s,
    score,
    status: getStatus(score),
    icon: r.icon,
    updated: randomUpdated(),
  }
})

export function getServiceBySlug(slug: string): Service | undefined {
  return SERVICES.find(s => s.slug === slug)
}
