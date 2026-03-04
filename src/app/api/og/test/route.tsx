import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: 64 }}>
        OG Test
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
