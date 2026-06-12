const core = require('@actions/core')
const fs = require('fs')
const path = require('path')

// Known AI service package → slug mappings
const PACKAGE_MAP = {
  // npm
  'openai': 'openai',
  '@anthropic-ai/sdk': 'anthropic',
  'cohere-ai': 'cohere',
  '@google/generative-ai': 'google-gemini',
  'langchain': 'langchain',
  '@langchain/core': 'langchain',
  '@pinecone-database/pinecone': 'pinecone',
  'stripe': 'stripe',
  '@huggingface/inference': 'huggingface',
  'replicate': 'replicate',
  'ai': 'vercel-ai-sdk',
  '@ai-sdk/openai': 'openai',
  '@ai-sdk/anthropic': 'anthropic',
  '@ai-sdk/google': 'google-gemini',
  'llamaindex': 'llamaindex',
  'chromadb': 'chromadb',
  'weaviate-client': 'weaviate',
  '@qdrant/js-client-rest': 'qdrant',
  'together-ai': 'together-ai',
  'groq-sdk': 'groq',
  '@mistralai/mistralai': 'mistral',
  // pypi
  'anthropic': 'anthropic',
  'google-generativeai': 'google-gemini',
  'pinecone-client': 'pinecone',
  'huggingface-hub': 'huggingface',
  'transformers': 'huggingface',
  'chromadb-client': 'chromadb',
  'qdrant-client': 'qdrant',
  'mistralai': 'mistral',
  'together': 'together-ai',
  'fireworks-ai': 'fireworks',
  'cohere': 'cohere',
}

function detectFromPackageJson() {
  const slugs = new Set()
  const pkgPath = path.join(process.env.GITHUB_WORKSPACE || '.', 'package.json')
  if (!fs.existsSync(pkgPath)) return slugs

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const dep of Object.keys(allDeps)) {
      if (PACKAGE_MAP[dep]) slugs.add(PACKAGE_MAP[dep])
    }
  } catch {}
  return slugs
}

function detectFromRequirementsTxt() {
  const slugs = new Set()
  const reqPath = path.join(process.env.GITHUB_WORKSPACE || '.', 'requirements.txt')
  if (!fs.existsSync(reqPath)) return slugs

  try {
    const lines = fs.readFileSync(reqPath, 'utf8').split('\n')
    for (const line of lines) {
      const pkg = line.trim().split(/[>=<!\[;#]/)[0].trim().toLowerCase()
      if (pkg && PACKAGE_MAP[pkg]) slugs.add(PACKAGE_MAP[pkg])
    }
  } catch {}
  return slugs
}

function detectFromPyprojectToml() {
  const slugs = new Set()
  const tomlPath = path.join(process.env.GITHUB_WORKSPACE || '.', 'pyproject.toml')
  if (!fs.existsSync(tomlPath)) return slugs

  try {
    const content = fs.readFileSync(tomlPath, 'utf8')
    for (const [pkg, slug] of Object.entries(PACKAGE_MAP)) {
      if (content.includes(`"${pkg}`) || content.includes(`'${pkg}`)) {
        slugs.add(slug)
      }
    }
  } catch {}
  return slugs
}

async function fetchTrust(apiUrl, apiKey, slugs) {
  if (slugs.length === 0) return []

  // Use batch endpoint if key available and multiple slugs, otherwise individual lookups
  if (apiKey && slugs.length > 1) {
    const res = await fetch(`${apiUrl}/api/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ slugs }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.results || []
    }
  }

  // Fall back to individual lookups
  const results = []
  for (const slug of slugs) {
    const endpoint = apiKey ? '/api/v1/lookup' : '/api/v1/public-lookup'
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    try {
      const res = await fetch(`${apiUrl}${endpoint}?slug=${encodeURIComponent(slug)}`, { headers })
      if (res.ok) {
        results.push(await res.json())
      } else {
        results.push({ slug, error: `HTTP ${res.status}` })
      }
    } catch (err) {
      results.push({ slug, error: err.message })
    }
  }
  return results
}

function statusEmoji(status) {
  switch (status) {
    case 'trusted': return '✅'
    case 'caution': return '⚠️'
    case 'blocked': return '🚫'
    case 'pending': return '❓'
    default: return '❔'
  }
}

function writeSummary(results) {
  const lines = [
    '## Fabric Trust Check',
    '',
    '| Service | Status | Score | Confidence | Signals |',
    '|---------|--------|-------|------------|---------|',
  ]

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.slug || 'unknown'} | Error | - | - | ${r.error} |`)
      continue
    }
    const emoji = statusEmoji(r.status)
    const score = r.score != null ? r.score.toFixed(2) : 'N/A'
    const confidence = r.confidence || r.score_confidence || '-'
    const signalsEval = r.signals_with_data != null ? `${r.signals_with_data}/6` : '-'
    lines.push(`| ${r.name || r.slug} | ${emoji} ${r.status} | ${score} | ${confidence} | ${signalsEval} |`)
  }

  lines.push('')
  lines.push('*Powered by [Fabric Trust Index](https://trust.fabriclayer.ai)*')

  return lines.join('\n')
}

async function run() {
  try {
    const apiKey = core.getInput('api-key') || ''
    const slugsInput = core.getInput('slugs') || ''
    const failOnBlocked = core.getInput('fail-on-blocked') === 'true'
    const failOnUnverified = core.getInput('fail-on-unverified') === 'true'
    const apiUrl = core.getInput('api-url')

    // Determine slugs
    let slugs
    if (slugsInput) {
      slugs = slugsInput.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      const detected = new Set([
        ...detectFromPackageJson(),
        ...detectFromRequirementsTxt(),
        ...detectFromPyprojectToml(),
      ])
      slugs = Array.from(detected)
      if (slugs.length > 0) {
        core.info(`Auto-detected ${slugs.length} AI dependencies: ${slugs.join(', ')}`)
      } else {
        core.info('No AI dependencies detected. Specify slugs manually or add AI packages to your project.')
        return
      }
    }

    core.info(`Checking trust scores for: ${slugs.join(', ')}`)

    const results = await fetchTrust(apiUrl, apiKey, slugs)

    // Set outputs
    core.setOutput('results', JSON.stringify(results))
    const blockedCount = results.filter(r => r.status === 'blocked').length
    const cautionCount = results.filter(r => r.status === 'caution').length
    core.setOutput('blocked-count', blockedCount.toString())
    core.setOutput('caution-count', cautionCount.toString())

    // Write step summary
    const summary = writeSummary(results)
    await core.summary.addRaw(summary).write()

    // Log individual results
    for (const r of results) {
      if (r.error) {
        core.warning(`${r.slug}: ${r.error}`)
      } else {
        const line = `${r.name || r.slug}: ${r.status} (${r.score != null ? r.score.toFixed(2) : 'N/A'})`
        if (r.status === 'blocked') core.error(line)
        else if (r.status === 'caution') core.warning(line)
        else core.info(line)
      }
    }

    // Fail checks
    const unverifiedCount = results.filter(r => r.status === 'pending' || r.status === 'unverified').length
    if (failOnBlocked && blockedCount > 0) {
      core.setFailed(`${blockedCount} blocked dependencies found`)
    }
    if (failOnUnverified && unverifiedCount > 0) {
      core.setFailed(`${unverifiedCount} unverified dependencies found`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
