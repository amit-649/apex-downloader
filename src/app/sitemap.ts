import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: 'https://downloader.amitcodes.in',
      lastModified,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: 'https://apexdown.vercel.app',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];
}
