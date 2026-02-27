import { Suspense } from 'react'
import TrustIndexClient from '@/components/TrustIndexClient'

async function loadServices() {
  const { getServicesForDirectory } = await import('@/lib/services')
  return await getServicesForDirectory()
}

async function loadIncidents() {
  const { getRecentIncidents } = await import('@/lib/services')
  return await getRecentIncidents(50)
}

export const dynamic = 'force-dynamic'
export const revalidate = 300 // ISR: revalidate every 5 minutes

export default async function TrustIndexPage() {
  try {
    const [services, incidents] = await Promise.all([loadServices(), loadIncidents()])
    return (
      <Suspense>
        <TrustIndexClient services={services} incidents={incidents} />
      </Suspense>
    )
  } catch (err) {
    console.error('Failed to load Trust Index data:', err)
    return (
      <Suspense>
        <TrustIndexClient services={[]} incidents={[]} />
      </Suspense>
    )
  }
}
