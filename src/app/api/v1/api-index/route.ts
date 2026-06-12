export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    name: 'Fabric Trust Index API',
    version: '1.0.0',
    docs: 'https://api.fabriclayer.ai/openapi.json',
    endpoints: {
      lookup: 'GET /lookup?slug=<slug>',
      service: 'GET /services/<slug>',
      batch: 'POST /batch',
      alerts: 'GET /alerts?slug=<slug>&days=30',
      usage: 'GET /usage',
      signup: 'POST /signup',
      public_lookup: 'GET /public-lookup?slug=<slug>',
    },
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
