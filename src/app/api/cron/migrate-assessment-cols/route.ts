import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg')
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await pool.query(`
      ALTER TABLE services ADD COLUMN IF NOT EXISTS ai_assessment text;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS ai_assessment_updated_at timestamptz;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS readme_excerpt text;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS license text;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS dependency_count integer;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS dependencies_raw text;
    `)

    return NextResponse.json({ ok: true, message: 'Columns added successfully' })
  } catch (err) {
    console.error('Migration failed:', err)
    return NextResponse.json(
      { error: 'Migration failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    )
  } finally {
    await pool.end()
  }
}
