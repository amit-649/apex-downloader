import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || "https://downloader.amitcodes.in";

export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: "ApexDownloader — Free YouTube, Instagram & Pinterest Video Downloader",
  description: "Free online downloader for YouTube (1080p/4K), Instagram (Reels/Stories), and Pinterest. Download high-quality videos, audio, and images instantly.",
  keywords: [
    "youtube video downloader",
    "download youtube 1080p 4k",
    "instagram downloader",
    "download instagram reels",
    "save instagram stories",
    "pinterest video downloader",
    "download pinterest images",
    "free video downloader online",
    "youtube to mp4",
    "instagram carousel downloader",
  ],
  alternates: {
    canonical: DOMAIN,
  },
  openGraph: {
    title: "ApexDownloader — Free YouTube, Instagram & Pinterest Video Downloader",
    description: "Free online downloader for YouTube (1080p/4K), Instagram (Reels/Stories), and Pinterest. Download high-quality videos, audio, and images instantly.",
    url: DOMAIN,
    siteName: "ApexDownloader",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ApexDownloader Preview Banner",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ApexDownloader — Free YouTube, Instagram & Pinterest Video Downloader",
    description: "Free online downloader for YouTube (1080p/4K), Instagram (Reels/Stories), and Pinterest. Download high-quality videos, audio, and images instantly.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "ApexDownloader",
              "alternateName": "Apex Downloader",
              "url": DOMAIN,
            }),
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
