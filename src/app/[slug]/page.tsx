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
  const ogTitle = `${service.name} Trust Score: ${service.score.toFixed(2)}/5.00 — Is It Safe?`
  const ogDescription = `${service.name} scored ${service.score.toFixed(2)}/5.00 on Fabric Layer's trust index. See the full breakdown across 6 safety signals.`
  return {
    title: `${service.name} Trust Score: ${service.score.toFixed(2)}/5.00 — Safety Rating | Fabric Layer`,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://trust.fabriclayer.ai/${slug}`,
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: `https://trust.fabriclayer.ai/${slug}`,
      siteName: 'Fabric Layer',
      type: 'article',
      images: [
        {
          url: `https://trust.fabriclayer.ai/api/og/${slug}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@fabriclayer',
      title: `${service.name} Trust Score: ${service.score.toFixed(2)}/5.00`,
      description: ogDescription,
      images: [`https://trust.fabriclayer.ai/api/og/${slug}`],
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = await loadService(slug)
  if (!service) notFound()

  // Fetch detail data and rank in parallel
  const { getServiceRank } = await import('@/lib/services')
  const [detailData, rank] = await Promise.all([
    service.id ? loadDetailData(service.id) : Promise.resolve(null),
    getServiceRank(service.score),
  ])
  if (rank) service.rank = rank

  const statusLabel = service.status === 'trusted' ? 'Trusted' : service.status === 'caution' ? 'Caution' : 'Blocked'
  // signals is number[] in order: [vulnerability, operational, maintenance, adoption, transparency, publisher_trust]
  const s = service.signals ?? []
  const vulnScore = s[0]?.toFixed(2) ?? 'N/A'
  const opsScore = s[1]?.toFixed(2) ?? 'N/A'
  const maintScore = s[2]?.toFixed(2) ?? 'N/A'
  const adoptScore = s[3]?.toFixed(2) ?? 'N/A'
  const transScore = s[4]?.toFixed(2) ?? 'N/A'
  const pubScore = s[5]?.toFixed(2) ?? 'N/A'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: service.name,
    description: service.description,
    url: `https://trust.fabriclayer.ai/${slug}`,
    applicationCategory: 'DeveloperApplication',
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
      ratingCount: 6,
      reviewCount: 1,
    },
    review: {
      '@type': 'Review',
      author: { '@type': 'Organization', name: 'Fabric Layer' },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: service.score.toFixed(2),
        bestRating: '5',
        worstRating: '0',
      },
      reviewBody: `Fabric Layer trust score for ${service.name}: ${service.score.toFixed(2)}/5.00. Vulnerability & Safety: ${vulnScore}, Operational Health: ${opsScore}, Maintenance: ${maintScore}, Adoption: ${adoptScore}, Transparency: ${transScore}, Publisher Trust: ${pubScore}.`,
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
