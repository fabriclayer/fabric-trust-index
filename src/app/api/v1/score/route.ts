import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { getConfidenceLevel } from '@/lib/scoring/thresholds'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/score?slug=openai
 *
 * Public JSON API returning the trust score for a service.
 * Cache: public, 5 minutes. CORS: open.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  return NextResponse.json(
    { error: 'The Trust Index API is not yet available. Follow @fabriclayer for updates.' },
    { status: 503, headers: CORS_HEADERS },
  )
}
