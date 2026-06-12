import { OPENAPI_SPEC } from '@/lib/api/openapi'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(OPENAPI_SPEC, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
