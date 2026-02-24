import { Suspense } from 'react'
import TrustIndexClient from '@/components/TrustIndexClient'

async function loadServices() {
  const { getServices } = await import('@/lib/services')
  return await getServices()
}

async function loadIncidents() {
  const { getRecentIncidents } = await import('@/lib/services')
  return await getRecentIncidents(50)
}

export const revalidate = 300 // ISR: revalidate every 5 minutes

export default async function TrustIndexPage() {
  const [services, incidents] = await Promise.all([loadServices(), loadIncidents()])
  return (
    <Suspense>
      <TrustIndexClient services={services} incidents={incidents} />
    </Suspense>
  )
}
