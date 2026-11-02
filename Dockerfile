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
ENV NODE_ENV=production
ENV PORT=10000
ENV HOSTNAME="0.0.0.0"

# Install dependencies (including devDependencies needed for next build)
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build Next.js application
RUN npm run build

EXPOSE 10000

CMD ["npm", "start"]
