import type { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/services'

// ISR: revalidate every hour — Supabase data refreshed on schedule
export const revalidate = 3600

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
