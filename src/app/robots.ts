import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: [
      'https://downloader.amitcodes.in/sitemap.xml',
      'https://apexdown.vercel.app/sitemap.xml',
    ],
  };
}
