import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trust Index — Fabric',
  description: 'Discover and verify trust scores for AI services, models, and MCP tools. The trust layer for the agent economy.',
  openGraph: {
    title: 'Trust Index — Fabric',
    description: 'Discover and verify trust scores for AI services, models, and MCP tools.',
    url: 'https://trust.fabriclayer.ai',
    siteName: 'Fabric Trust Index',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
