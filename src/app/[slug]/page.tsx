import { notFound } from 'next/navigation'
import { SERVICES, getServiceBySlug as getStaticServiceBySlug } from '@/data/services'
import type { Metadata } from 'next'
import ProductPageClient from './ProductPageClient'

export const revalidate = 300 // ISR: revalidate every 5 minutes
export const dynamicParams = true // Allow ISR for services added after build

// Generate static params — prefer Supabase, fall back to static data
export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getAllSlugs } = await import('@/lib/services')
      const slugs = await getAllSlugs()
      if (slugs.length > 0) {
        return slugs.map(slug => ({ slug }))
      }
    } catch (err) {
      console.error('generateStaticParams: Supabase failed, using static data:', err)
    }
  }
  return SERVICES.map(s => ({ slug: s.slug }))
}

async function loadService(slug: string) {
  // Use Supabase if configured, fall back to static data
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getServiceBySlug } = await import('@/lib/services')
      const service = await getServiceBySlug(slug)
      if (service) return service
    } catch (err) {
      console.error('Failed to load from Supabase:', err)
    }
  }
  return getStaticServiceBySlug(slug) ?? null
}

async function loadDetailData(slug: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }

  try {
    const {
      getServiceId,
      getServiceIncidents,
      getSignalHistory,
      getServiceVersions,
      getServiceSupplyChain,
      getLatestSignalMeta,
    } = await import('@/lib/services')

    const serviceId = await getServiceId(slug)
    if (!serviceId) return null

    const [incidents, signalHistory, versions, supplyChain, transparencyMeta, adoptionMeta, maintenanceMeta] = await Promise.all([
      getServiceIncidents(serviceId),
      getSignalHistory(serviceId, 'composite'),
      getServiceVersions(serviceId),
      getServiceSupplyChain(serviceId),
      getLatestSignalMeta(serviceId, 'transparency'),
      getLatestSignalMeta(serviceId, 'adoption'),
      getLatestSignalMeta(serviceId, 'maintenance'),
    ])

    return { incidents, signalHistory, versions, supplyChain, transparencyMeta, adoptionMeta, maintenanceMeta }
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
    />
  )
}
