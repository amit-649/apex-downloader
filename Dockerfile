FROM node:20-slim

WORKDIR /app

# Install system dependencies (ffmpeg, chromium for puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=10000
ENV HOSTNAME="0.0.0.0"

# Install all dependencies (ensuring devDependencies like TypeScript are included for next build)
COPY package*.json ./
RUN npm install --include=dev

# Copy application source code
COPY . .

# Build Next.js application using webpack
RUN npm run build

ENV NODE_ENV=production

EXPOSE 10000

CMD ["npm", "start"]
