import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://trust.fabriclayer.ai'),
  title: 'Trust Index — Fabric',
  description: 'Discover and verify trust scores for AI services, models, and MCP tools. The trust layer for the agent economy.',
  alternates: {
    canonical: '/',
  },
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
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-H8SQL9NJCY"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-H8SQL9NJCY');
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}
