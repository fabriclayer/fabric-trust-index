import { Suspense } from 'react'
import TrustIndexClient from '@/components/TrustIndexClient'
import type { Service } from '@/data/services'

async function loadServices() {
  const { getServices } = await import('@/lib/services')
  const full = await getServices()
  // Strip fields not needed for directory cards to reduce RSC payload (~11MB → ~2MB)
  return full.map((s): Service => ({
    name: s.name,
    slug: s.slug,
    publisher: s.publisher,
    publisher_url: s.publisher_url,
    category: s.category,
    tag: s.tag,
    description: s.description,
    score: s.score,
    status: s.status,
    icon: s.icon,
    logo_url: s.logo_url,
    domain: s.domain,
    github_repo: s.github_repo,
    updated: s.updated,
    updated_at: s.updated_at,
    created_at: s.created_at,
    signals: [],
  }))
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
