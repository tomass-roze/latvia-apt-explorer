import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  // SITE_URL is set in Vercel project env. Fallback only matters for local dev.
  const base = process.env.SITE_URL ?? 'http://localhost:3000';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
