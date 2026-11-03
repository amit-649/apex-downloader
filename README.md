# ⚡ ApexDownloader — High-Speed Multi-Platform Media Engine

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16_App_Router-000000?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=0a0f1d" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black&labelColor=0a0f1d" alt="React" />
  <img src="https://img.shields.io/badge/WebAssembly-FFmpeg_WASM-654ff0?style=flat-square&logo=webassembly&logoColor=white&labelColor=0a0f1d" alt="WebAssembly" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178c6?style=flat-square&logo=typescript&logoColor=white&labelColor=0a0f1d" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Database-Neon_Postgres-00e699?style=flat-square&logo=postgresql&logoColor=black&labelColor=0a0f1d" alt="Neon Postgres" />
  <img src="https://img.shields.io/badge/Hosting-Vercel-000000?style=flat-square&logo=vercel&logoColor=white&labelColor=0a0f1d" alt="Vercel" />
</p>

ApexDownloader is a modern, high-performance web application designed for extracting and compiling high-resolution video and audio from **YouTube**, **Instagram**, and **Pinterest**. Built with **Next.js**, **React 19**, and client-side **FFmpeg WebAssembly**, it offloads resource-heavy media muxing directly into the visitor's browser thread to guarantee zero server transcoding bottlenecks.

---

## 🏗️ Architecture & Pipeline Flow

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                 Client Browser (Visitor UI)                 │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   1. Input Media URL (YouTube/IG/Pinterest)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                Next.js Edge / Serverless API                │
  │     - Session Token & Anti-Bot Cookie Verification          │
  │     - Extract Adaptive Video (up to 4K) & Audio Streams     │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   2. Stream Raw Chunks (Bypass Server Merging)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │         Client-Side WebAssembly (FFmpeg Core .wasm)          │
  │     - Fast In-Browser Demuxing & Audio/Video Muxing         │
  │     - Zero Server Transcode Cost | Infinite Concurrency      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   3. Instant Local Blob Assembly
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │             Direct High-Speed .mp4 / .mp3 Download          │
  └─────────────────────────────────────────────────────────────┘
```

---

## ⚡ Core Capabilities

- **YouTube 4K & High-Res Audio**: Extract up to 4K 60fps video and AAC/MP3 audio. Server-side merging and fast client-side in-browser FFmpeg WebAssembly compilation are supported.
- **Instagram Reels, Stories & Carousels**: Download public posts, Reels, active user stories, carousel galleries, and HD profile pictures. Batch download supported for galleries and stories.
- **Pinterest Video & High-Res Pins**: Download original resolution image pins and MP4 video pins.
- **Clipboard & Quick Controls**: One-click "Paste from Clipboard" and "Clear" input actions.
- **Cancel & History**: Abort active downloads at any time and view recent download history saved locally in your browser.
- **Server Authorization**: Service account cookies remain on the server; visitors never submit personal credentials.
- **Database Telemetry**: Built-in Neon serverless PostgreSQL connection for analytics tracking and download metrics.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.x or later
- **npm** / **pnpm** / **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/amit-649/apex-downloader.git
cd apex-downloader

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
# Platform Cookies
YOUTUBE_COOKIES="SID=...; HSID=...; ..."
INSTAGRAM_COOKIES="sessionid=...; ds_user_id=...; ..."
INSTAGRAM_SESSION_ID="your_instagram_session_id"

# Neon Database (Optional for Metrics)
DATABASE_URL="postgres://user:password@endpoint.neon.tech/neondb"
```

### Automated Cookie Synchronization Tool

The project includes an automated script that opens a native Chrome session to refresh session tokens and sync them with Vercel Production deployments.

```bash
# Launch interactive Cookie Sync Utility
sync.bat

# Or run directly via Node.js
npm run sync -- --both
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

Created by [Amit Kumar Garai](https://amitcodes.in/). Released for personal and educational use.
