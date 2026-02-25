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

async function loadService(slug: string) {
  const { getServiceBySlug } = await import('@/lib/services')
  return await getServiceBySlug(slug)
}

async function loadDetailData(slug: string) {

  try {
    const {
      getServiceId,
      getServiceIncidents,
      getSignalHistory,
      getServiceVersions,
      getServiceSupplyChain,
      getLatestSignalMeta,
      getAllSignalMetas,
    } = await import('@/lib/services')

    const serviceId = await getServiceId(slug)
    if (!serviceId) return null

    const [incidents, signalHistory, versions, supplyChain, transparencyMeta, adoptionMeta, maintenanceMeta, signalMetas] = await Promise.all([
      getServiceIncidents(serviceId),
      getSignalHistory(serviceId, 'composite'),
      getServiceVersions(serviceId),
      getServiceSupplyChain(serviceId),
      getLatestSignalMeta(serviceId, 'transparency'),
      getLatestSignalMeta(serviceId, 'adoption'),
      getLatestSignalMeta(serviceId, 'maintenance'),
      getAllSignalMetas(serviceId),
    ])

    return { incidents, signalHistory, versions, supplyChain, transparencyMeta, adoptionMeta, maintenanceMeta, signalMetas }
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
  return {
    title: `${service.name} — Trust Score — Fabric`,
    description: service.description,
    openGraph: {
      title: `${service.name} Trust Score — Fabric`,
      description: service.description,
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = await loadService(slug)
  if (!service) notFound()

  const detailData = await loadDetailData(slug)

  return (
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
  )
}
