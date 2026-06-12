# @fabriclayer/trust-mcp

MCP server for Fabric Trust Index. Check trust scores for AI services, packages, and APIs directly from your AI assistant.

## Installation

```bash
npx @fabriclayer/trust-mcp
```

Or install globally:

```bash
npm install -g @fabriclayer/trust-mcp
```

## Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fabric-trust": {
      "command": "npx",
      "args": ["-y", "@fabriclayer/trust-mcp"],
      "env": {
        "FABRIC_API_KEY": "fl_live_your_key_here"
      }
    }
  }
}
```

The API key is optional. Without it, `check_trust` uses the free public lookup (50 requests/day). With a key, you get higher limits and access to `check_batch` and `get_alerts`.

Get a free API key at https://trust.fabriclayer.ai/api-access

## Tools

### check_trust

Look up the trust score for a service.

```
check_trust({ slug: "openai" })
```

Returns: trust status, composite score, signal breakdown, confidence level.

### check_batch

Check multiple services at once (requires API key, max 50).

```
check_batch({ slugs: ["openai", "stripe", "langchain"] })
```

### get_alerts

Get recent incidents and CVEs for a service (requires API key).

```
get_alerts({ slug: "openai" })
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `FABRIC_API_KEY` | API key for authenticated access | No |
| `FABRIC_API_URL` | Custom API base URL | No |
