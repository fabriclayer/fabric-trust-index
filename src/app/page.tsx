import { Suspense } from 'react'
import TrustIndexClient from '@/components/TrustIndexClient'

async function loadServices() {
  const { getServices } = await import('@/lib/services')
  return await getServices()
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
