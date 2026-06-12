#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = process.env.FABRIC_API_URL ?? 'https://trust.fabriclayer.ai'
const API_KEY = process.env.FABRIC_API_KEY

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`
  return h
}

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { ...init, headers: { ...headers(), ...init?.headers } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

const server = new McpServer({
  name: 'fabric-trust',
  version: '0.1.0',
})

// Tool: check_trust
server.tool(
  'check_trust',
  'Look up the Fabric Trust score for an AI service or package. Returns trust status, composite score, signal breakdown, and confidence level.',
  { slug: z.string().describe('Service slug, e.g. "openai", "stripe", "langchain"') },
  async ({ slug }) => {
    const endpoint = API_KEY ? '/api/v1/lookup' : '/api/v1/public-lookup'
    const data = await apiFetch(`${endpoint}?slug=${encodeURIComponent(slug)}`)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// Tool: check_batch
server.tool(
  'check_batch',
  'Check trust scores for multiple services at once. Requires an API key (set FABRIC_API_KEY). Max 50 slugs per request.',
  { slugs: z.array(z.string()).describe('Array of service slugs to check') },
  async ({ slugs }) => {
    if (!API_KEY) {
      return {
        content: [{ type: 'text' as const, text: 'Batch lookups require an API key. Set FABRIC_API_KEY or get a free key at https://trust.fabriclayer.ai/api-access' }],
        isError: true,
      }
    }
    const data = await apiFetch('/api/v1/batch', {
      method: 'POST',
      body: JSON.stringify({ slugs: slugs.slice(0, 50) }),
    })
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// Tool: get_alerts
server.tool(
  'get_alerts',
  'Get recent incidents and CVE alerts for a service. Requires an API key.',
  { slug: z.string().describe('Service slug to get alerts for') },
  async ({ slug }) => {
    if (!API_KEY) {
      return {
        content: [{ type: 'text' as const, text: 'Alerts require an API key. Set FABRIC_API_KEY or get a free key at https://trust.fabriclayer.ai/api-access' }],
        isError: true,
      }
    }
    const data = await apiFetch(`/api/v1/alerts?slug=${encodeURIComponent(slug)}`)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
