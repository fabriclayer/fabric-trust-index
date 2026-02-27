import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ProductPageClient from './ProductPageClient'

export const revalidate = 300 // ISR: revalidate every 5 minutes
export const dynamicParams = true // Allow ISR for services added after build

// Don't pre-render any pages at build time — with 1000+ services, SSG
// times out on Vercel. Pages are generated on-demand via ISR instead.
export async function generateStaticParams() {
  return []
}

// cache() dedupes across generateMetadata + page render within the same request
const loadService = cache(async (slug: string) => {
  const { getServiceBySlug } = await import('@/lib/services')
  return await getServiceBySlug(slug)
})

async function loadDetailData(serviceId: string) {
  try {
    const {
      getServiceIncidents,
      getSignalHistory,
      getServiceVersions,
      getServiceSupplyChain,
      getAllSignalMetas,
    } = await import('@/lib/services')

    const [incidents, signalHistory, versions, supplyChain, signalMetas] = await Promise.all([
      getServiceIncidents(serviceId),
      getSignalHistory(serviceId, 'composite'),
      getServiceVersions(serviceId),
      getServiceSupplyChain(serviceId),
      getAllSignalMetas(serviceId),
    ])

    return {
      incidents,
      signalHistory,
      versions,
      supplyChain,
      transparencyMeta: signalMetas['transparency'] ?? null,
      adoptionMeta: signalMetas['adoption'] ?? null,
      maintenanceMeta: signalMetas['maintenance'] ?? null,
      signalMetas,
    }
  } catch (err) {
    console.error('Failed to load detail data:', err)
    return null
  }
}

// Dynamic metadata
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const service = await loadService(slug)
  if (!service) return { title: 'Not Found — Fabric Trust Index' }
  const statusLabel = service.status === 'trusted' ? 'Trusted' : service.status === 'caution' ? 'Caution' : 'Blocked'
  const description = `Trust score and safety analysis for ${service.name} by ${service.publisher}. Score: ${service.score.toFixed(2)}/5.00 — ${statusLabel}.`
  return {
    title: `${service.name} Trust Score — Fabric Trust Index`,
    description,
    alternates: {
      canonical: `/${slug}`,
    },
    openGraph: {
      title: `${service.name} Trust Score — Fabric Trust Index`,
      description,
      url: `https://trust.fabriclayer.ai/${slug}`,
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
      title: `${service.name} Trust Score — Fabric Trust Index`,
      description,
      images: ['https://trust.fabriclayer.ai/og-home.png'],
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = await loadService(slug)
  if (!service) notFound()

  // Pass service.id directly — no extra getServiceId query needed
  const detailData = service.id ? await loadDetailData(service.id) : null

  const statusLabel = service.status === 'trusted' ? 'Trusted' : service.status === 'caution' ? 'Caution' : 'Blocked'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: service.name,
    description: service.description,
    url: `https://trust.fabriclayer.ai/${slug}`,
    applicationCategory: 'AI Service',
    author: {
      '@type': 'Organization',
      name: service.publisher,
      ...(service.publisher_url ? { url: service.publisher_url } : {}),
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: service.score.toFixed(2),
      bestRating: '5',
      worstRating: '0',
      ratingCount: 1,
      reviewCount: 1,
    },
    additionalProperty: {
      '@type': 'PropertyValue',
      name: 'Trust Status',
      value: statusLabel,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPageClient
        service={service}
        incidents={detailData?.incidents ?? []}
        signalHistory={detailData?.signalHistory ?? []}
        versions={detailData?.versions ?? []}
        supplyChain={detailData?.supplyChain ?? []}
        transparencyMeta={detailData?.transparencyMeta ?? null}
        adoptionMeta={detailData?.adoptionMeta ?? null}
        maintenanceMeta={detailData?.maintenanceMeta ?? null}
        signalMetas={detailData?.signalMetas ?? {}}
      />
    </>
  )
}
