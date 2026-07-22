import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  outputFileTracingIncludes: {
    '/api/youtube/details': ['./bin/yt-dlp'],
    '/api/youtube/download': ['./bin/yt-dlp'],
  },
  outputFileTracingExcludes: {
    '/api/youtube/details': [
      'youtube_session_data/**/*',
      'temp_chrome_profile/**/*',
      'cookies.txt',
      'youtube-cookies.txt',
    ],
    '/api/youtube/download': [
      'youtube_session_data/**/*',
      'temp_chrome_profile/**/*',
      'cookies.txt',
      'youtube-cookies.txt',
    ],
  },
};

export default nextConfig;
