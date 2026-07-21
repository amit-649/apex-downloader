# ApexDownloader — High Speed Multi-Platform Media Downloader

ApexDownloader is a modern, high-performance web application designed for downloading high-resolution video and audio from **YouTube**, **Instagram**, and **Pinterest**.

---

## ⚡ Features

- **YouTube 4K & High-Res Audio**: Extract up to 4K 60fps video and AAC/MP3 audio. Server-side merging and fast client-side in-browser FFmpeg WebAssembly compilation are supported.
- **Instagram Reels, Stories & Carousels**: Download public posts, Reels, active user stories, carousel galleries, and HD profile pictures. Batch download supported for galleries and stories.
- **Pinterest Video & High-Res Pins**: Download original resolution image pins and MP4 video pins.
- **Clipboard & Quick Controls**: One-click "Paste from Clipboard" and "Clear" input actions.
- **Cancel & History**: Abort active downloads at any time and view recent download history saved locally in your browser.
- **Server Authorization**: Service account cookies remain on the server; visitors never submit personal credentials.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.x or later
- **npm** / **pnpm** / **yarn**

### Installation

```bash
# Install dependencies
npm install
```

### Running Locally

```bash
# Start the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Environment Variables & Cookie Synchronization

To bypass platform rate limits and bot verification, high-resolution YouTube extractions and Instagram Story requests rely on server authorization tokens.

### Configuration (`.env.local`)

Create or update `.env.local` in the project root with the following keys:

```env
YOUTUBE_COOKIES="SID=...; HSID=...; ..."
INSTAGRAM_COOKIES="sessionid=...; ds_user_id=...; ..."
INSTAGRAM_SESSION_ID="your_instagram_session_id"
```

### Automated Cookie Synchronization Tool

The project includes an automated script that opens a native Chrome session to refresh session tokens and sync them with Vercel Production deployments.

```bash
# Launch interactive Cookie Sync Utility
sync.bat

# Or run directly via Node.js
node scripts/sync_cookies.js --both
```

---

## 🛠️ Build & Verification Commands

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Run ESLint check
npm run lint

# Build production bundle
npm run build
```

---

## 📄 License

Private / Proprietary project. All rights reserved.
