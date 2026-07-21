const YOUTUBE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
] as const;

const PINTEREST_HOSTS = ['pinterest.com', 'pin.it'] as const;

const MEDIA_HOSTS = [
  'googlevideo.com',
  'ytimg.com',
  'cdninstagram.com',
  'fbcdn.net',
  'pinimg.com',
  'pinterest.com',
] as const;

function matchesHost(hostname: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function parseHttpsUrl(value: string, label: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }

  return parsed;
}

export function assertYoutubeUrl(value: string): URL {
  const parsed = parseHttpsUrl(value, 'YouTube URL');
  if (!matchesHost(parsed.hostname, YOUTUBE_HOSTS)) {
    throw new Error('Please provide a YouTube or youtu.be link.');
  }
  return parsed;
}

export function assertInstagramUrl(value: string): URL {
  const parsed = parseHttpsUrl(value, 'Instagram URL');
  if (!matchesHost(parsed.hostname, ['instagram.com'])) {
    throw new Error('Please provide an instagram.com link.');
  }
  return parsed;
}

export function assertPinterestUrl(value: string): URL {
  const parsed = parseHttpsUrl(value, 'Pinterest URL');
  if (!matchesHost(parsed.hostname, PINTEREST_HOSTS)) {
    throw new Error('Please provide a pinterest.com or pin.it link.');
  }
  return parsed;
}

export function assertMediaUrl(value: string): URL {
  const parsed = parseHttpsUrl(value, 'Media URL');
  if (!matchesHost(parsed.hostname, MEDIA_HOSTS)) {
    throw new Error('This media host is not supported.');
  }
  return parsed;
}
