import { notFound } from 'next/navigation'
import { SERVICES, getServiceBySlug as getStaticServiceBySlug } from '@/data/services'
import type { Metadata } from 'next'
import ProductPageClient from './ProductPageClient'

export const revalidate = 300 // ISR: revalidate every 5 minutes

// Generate static params from static data for build time
export function generateStaticParams() {
  return SERVICES.map(s => ({ slug: s.slug }))
}

async function loadService(slug: string) {
  // Use Supabase if configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getServiceBySlug } = await import('@/lib/services')
      return await getServiceBySlug(slug)
    } catch (err) {
      console.error('Failed to load from Supabase:', err)
    }
  }
  return getStaticServiceBySlug(slug) ?? null
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

  return <ProductPageClient service={service} />
}
