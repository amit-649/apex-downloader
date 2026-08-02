import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-outfit",
});

const DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || "https://downloader.amitcodes.in";

export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: "ApexDownloader — Free Instagram Reels, Stories & Pinterest Media Downloader",
  description: "Free online downloader for Instagram (Reels, Stories, Carousels, Profile Pictures) and Pinterest (Video & Image Pins). Save high-quality media instantly.",
  keywords: [
    "instagram downloader",
    "download instagram reels",
    "save instagram stories",
    "instagram carousel downloader",
    "instagram profile picture downloader",
    "pinterest video downloader",
    "download pinterest images",
    "free video downloader online",
    "pinterest pin saver",
  ],
  alternates: {
    canonical: DOMAIN,
  },
  openGraph: {
    title: "ApexDownloader — Free Instagram Reels, Stories & Pinterest Media Downloader",
    description: "Free online downloader for Instagram (Reels, Stories, Carousels) and Pinterest Pins. Save high-quality media instantly.",
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
    title: "ApexDownloader — Free Instagram Reels, Stories & Pinterest Media Downloader",
    description: "Free online downloader for Instagram (Reels, Stories, Carousels) and Pinterest Pins. Save high-quality media instantly.",
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
    <html lang="en" className={outfit.variable}>
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
