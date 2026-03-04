import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  const auth = request.cookies.get('fabric_monitor_auth')?.value
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await request.json()
  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  revalidatePath(path)
  return NextResponse.json({ ok: true, revalidated: path })
}
