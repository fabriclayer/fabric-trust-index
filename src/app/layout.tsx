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
  title: 'AI Trust Index — Search Safety Scores for 5,800+ AI Tools & MCP Servers | Fabric Layer',
  description: 'Search trust scores for any AI tool, agent, or MCP server. Free safety ratings from 0–5 across vulnerability, uptime, maintenance, adoption, transparency, and publisher trust.',
  keywords: 'AI trust score, MCP server safety, AI tool safety rating, AI agent security, MCP security check, AI risk assessment, trust scoring, fabric layer',
  authors: [{ name: 'Fabric Layer Technologies LTD' }],
  alternates: {
    canonical: 'https://trust.fabriclayer.ai/',
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AI Trust Index — Safety Scores for 5,800+ AI Tools & MCP Servers',
    description: 'Search trust scores for any AI tool, agent, or MCP server. Free safety ratings powered by Fabric Layer.',
    url: 'https://trust.fabriclayer.ai',
    siteName: 'Fabric Layer',
    type: 'website',
    locale: 'en_US',
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
    site: '@fabriclayer',
    title: 'AI Trust Index — Safety Scores for 5,800+ AI Tools & MCP Servers',
    description: 'Search trust scores for any AI tool, agent, or MCP server. Free safety ratings powered by Fabric Layer.',
    images: ['https://trust.fabriclayer.ai/og-home.png'],
  },
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large' as const,
    'max-snippet': -1,
    'max-video-preview': -1,
  },
  other: {
    'theme-color': '#000000',
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
