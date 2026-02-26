import type { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/services'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllSlugs()

  const servicePages: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `https://trust.fabriclayer.ai/${slug}`,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [
    {
      url: 'https://trust.fabriclayer.ai',
      changeFrequency: 'hourly',
      priority: 1,
    },
    ...servicePages,
  ]
}
