import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'API Access | Fabric Trust Index',
  description: 'Get a free API key for the Fabric Trust Index. 1,000 requests per month.',
}

export default function ApiAccessPage() {
  return (
    <main className="min-h-screen bg-white text-[#1a1a16] font-sans">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight mb-2">API Access</h1>
        <p className="text-[#787874] mb-8">
          Get trust scores for AI tools and services programmatically.
          Free tier: 1,000 requests per month. No credit card required.
        </p>

        <div className="bg-[#f8f8f6] border border-[#e2e2df] rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Get Your API Key</h2>
          <ApiKeyForm />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">Quick Start</h2>
            <pre className="bg-[#1a1a16] text-[#e2e2df] p-4 rounded-lg text-sm overflow-x-auto font-mono">
{`curl https://api.fabriclayer.ai/lookup?slug=openai \\
  -H "Authorization: Bearer fl_live_your_key_here"`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Install the MCP Server</h3>
            <pre className="bg-[#1a1a16] text-[#e2e2df] p-4 rounded-lg text-sm overflow-x-auto font-mono">
{`# Claude Code
claude mcp add fabric-trust -- npx @fabriclayer/trust-mcp

# Claude Desktop — add to config:
{
  "mcpServers": {
    "fabric-trust": {
      "command": "npx",
      "args": ["@fabriclayer/trust-mcp"]
    }
  }
}`}
            </pre>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Pricing</h2>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between border-b border-[#e2e2df] pb-2">
                <span className="font-medium">Free</span>
                <span className="text-[#787874]">1,000 requests a month</span>
              </div>
              <div className="flex justify-between border-b border-[#e2e2df] pb-2">
                <span className="font-medium">Pro — $49 a month</span>
                <span className="text-[#787874]">50,000 requests, batch, alerts</span>
              </div>
              <div className="flex justify-between border-b border-[#e2e2df] pb-2">
                <span className="font-medium">Publisher — $19 a month</span>
                <span className="text-[#787874]">Claim, verification, score alerts</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Enterprise — $299 a month</span>
                <span className="text-[#787874]">500,000 requests, dedicated support</span>
              </div>
            </div>
          </div>

          <div>
            <a href="https://api.fabriclayer.ai/openapi.json" className="text-[#068cff] text-sm hover:underline">
              Full API documentation (OpenAPI)
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

function ApiKeyForm() {
  return (
    <form action="/api/v1/signup" method="POST" className="flex gap-3">
      <input
        type="email"
        name="email"
        placeholder="you@company.com"
        required
        className="flex-1 px-3 py-2 border border-[#e2e2df] rounded-lg text-sm bg-white focus:outline-none focus:border-[#068cff]"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-[#1a1a16] text-white rounded-lg text-sm font-medium hover:bg-[#333] transition-colors"
      >
        Get API Key
      </button>
    </form>
  )
}
