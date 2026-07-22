import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'], // Disallow crawling of api paths to keep them private
    },
    sitemap: 'https://downloader.amitcodes.in/sitemap.xml',
  };
}
