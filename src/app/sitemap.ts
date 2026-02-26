import type { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/services'

const URLS_PER_SITEMAP = 5000

export async function generateSitemaps() {
  const slugs = await getAllSlugs()
  const count = Math.ceil((slugs.length + 1) / URLS_PER_SITEMAP) // +1 for homepage
  return Array.from({ length: count }, (_, i) => ({ id: i }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const allSlugs = await getAllSlugs()

  const start = id * URLS_PER_SITEMAP
  const end = start + URLS_PER_SITEMAP

  // First sitemap includes the homepage
  if (id === 0) {
    const batch = allSlugs.slice(0, URLS_PER_SITEMAP - 1)
    return [
      {
        url: 'https://trust.fabriclayer.ai',
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 1,
      },
      ...batch.map((s) => ({
        url: `https://trust.fabriclayer.ai/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
    ]
  }

  // Subsequent sitemaps: offset by 1 to account for homepage in first batch
  const batch = allSlugs.slice(start - 1, end - 1)
  return batch.map((s) => ({
    url: `https://trust.fabriclayer.ai/${s.slug}`,
    lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))
}
