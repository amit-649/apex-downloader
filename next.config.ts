import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  outputFileTracingIncludes: {
    '/api/youtube/*': ['bin/yt-dlp'],
  },
  outputFileTracingExcludes: {
    '/*': [
      'youtube_session_data/**/*',
      'temp_chrome_profile/**/*',
      'cookies.txt',
      'youtube-cookies.txt',
    ],
  },
};

export default nextConfig;
