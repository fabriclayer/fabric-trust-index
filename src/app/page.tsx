import { Suspense } from 'react'
import TrustIndexClient from '@/components/TrustIndexClient'
import { SERVICES } from '@/data/services'

async function loadServices() {
  // Use Supabase if configured, otherwise fall back to static data
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getServices } = await import('@/lib/services')
      return await getServices()
    } catch (err) {
      console.error('Failed to load from Supabase, using static data:', err)
    }
  }
  return SERVICES
}

export const revalidate = 300 // ISR: revalidate every 5 minutes

export default async function TrustIndexPage() {
  const services = await loadServices()
  return (
    <Suspense>
      <TrustIndexClient services={services} />
    </Suspense>
  )
}
