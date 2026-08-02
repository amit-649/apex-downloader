import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pinterest Video Downloader: Save Videos, Pins & GIFs (100% Free)',
  description: 'Download Pinterest Video Pins in Full HD 1080p, HD Image Pins, and animated GIFs instantly. ⚡ Fast, free, and no login required.',
  openGraph: {
    title: 'Pinterest Video Downloader: Save Videos, Pins & GIFs (100% Free)',
    description: 'Download Pinterest Video Pins in Full HD 1080p, HD Image Pins, and animated GIFs instantly. ⚡ Fast, free, and no login required.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pinterest Video Downloader: Save Videos, Pins & GIFs (100% Free)',
    description: 'Download Pinterest Video Pins in Full HD 1080p, HD Image Pins, and animated GIFs instantly. ⚡ Fast, free, and no login required.',
  },
};

export default function PinterestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
