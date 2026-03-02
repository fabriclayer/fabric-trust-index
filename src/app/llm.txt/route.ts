import { NextResponse } from 'next/server'

export async function GET() {
  const content = `# Fabric Layer Trust Index
> Search and browse trust scores for 5,800+ AI tools, agents, and MCP servers.

## What This Does
The Trust Index lets you look up any AI service and see its trust score (0.00 to 5.00) computed across six signals: Vulnerability & Safety, Operational Health, Maintenance Activity, Adoption, Transparency, and Publisher Trust.

## How To Use
Visit https://trust.fabriclayer.ai/ and search for any AI tool, agent, or MCP server by name. Each result shows the overall trust score and per-signal breakdown.

## API Access
Coming soon at https://api.fabriclayer.ai/ — free tier available.

## Parent Site
https://www.fabriclayer.ai/`

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
