import type { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/services'

// Force dynamic — query Supabase at request time, not build time
export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Cache for 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllSlugs()

  return [
    {
      url: 'https://trust.fabriclayer.ai',
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    ...slugs.map((s) => ({
      url: `https://trust.fabriclayer.ai/${s.slug}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
