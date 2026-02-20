import { notFound } from 'next/navigation'
import { SERVICES, getServiceBySlug } from '@/data/services'
import type { Metadata } from 'next'
import ProductPageClient from './ProductPageClient'

// Generate static params for all services
export function generateStaticParams() {
  return SERVICES.map(s => ({ slug: s.slug }))
}

// Dynamic metadata
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const service = getServiceBySlug(slug)
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
  const service = getServiceBySlug(slug)
  if (!service) notFound()

  return <ProductPageClient service={service} />
}
