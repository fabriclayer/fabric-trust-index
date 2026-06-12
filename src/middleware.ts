import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  if (!host.startsWith('api.')) {
    return NextResponse.next()
  }

  const pathname = request.nextUrl.pathname

  // Root: return API index
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/api/v1/api-index', request.url))
  }

  // Paths already under /api/ pass through
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Rewrite everything else to /api/v1 + path
  return NextResponse.rewrite(new URL(`/api/v1${pathname}`, request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
