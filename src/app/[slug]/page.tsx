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
