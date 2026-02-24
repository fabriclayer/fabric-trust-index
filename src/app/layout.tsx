import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trust Index — Fabric',
  description: 'Discover and verify trust scores for AI services, models, and MCP tools. The trust layer for the agent economy.',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Trust Index — Fabric',
    description: 'Discover and verify trust scores for AI services, models, and MCP tools.',
    url: 'https://trust.fabriclayer.ai',
    siteName: 'Fabric Trust Index',
    type: 'website',
    images: [
      {
        url: 'https://trust.fabriclayer.ai/og-home.png',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trust Index — Fabric',
    description: 'Discover and verify trust scores for AI services, models, and MCP tools.',
    images: ['https://trust.fabriclayer.ai/og-home.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
