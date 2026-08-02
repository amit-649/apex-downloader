import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-heading",
});

const DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || "https://downloader.amitcodes.in";

export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: "Instagram Video Downloader: Save Reels, Stories & Photos (100% Free)",
  description: "Download Instagram Reels in 1080p Full HD, Stories, Carousel posts, and HD Profile Pictures. ⚡ Fast, free, no login or app required.",
  keywords: [
    "instagram downloader",
    "download instagram reels",
    "save instagram stories",
    "instagram carousel downloader",
    "instagram profile picture downloader",
    "pinterest video downloader",
    "download pinterest images",
    "free media downloader online",
  ],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: DOMAIN,
  },
  openGraph: {
    title: "Instagram Video Downloader: Save Reels, Stories & Photos (100% Free)",
    description: "Download Instagram Reels in 1080p Full HD, Stories, Carousel posts, and HD Profile Pictures. ⚡ Fast, free, no login or app required.",
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
    title: "Instagram Video Downloader: Save Reels, Stories & Photos (100% Free)",
    description: "Download Instagram Reels in 1080p Full HD, Stories, Carousel posts, and HD Profile Pictures. ⚡ Fast, free, no login required.",
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
    <html lang="en" className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
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
