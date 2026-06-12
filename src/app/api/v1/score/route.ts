import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Legacy score endpoint — 308 redirect to /api/v1/lookup
 */
export async function GET(request: NextRequest) {
  const url = new URL('/api/v1/lookup', request.url)
  url.search = request.nextUrl.search
  return NextResponse.redirect(url, 308)
}
