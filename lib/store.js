import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_KEY = 'nbdp:config';
const CONFIG_BLOB = 'config/site.json';

function redisCreds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Which storage backend is live. Redis wins when both are configured: writes
 * show up instantly, while Blob reads can sit behind the CDN for a short while.
 */
export function backend() {
  if (redisCreds()) return 'redis';
  if (hasBlob()) return 'blob';
  return 'none';
}

let redisClient = null;
async function redis() {
  if (!redisClient) {
    const creds = redisCreds();
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis(creds);
  }
  return redisClient;
}

export async function readConfig() {
  const kind = backend();
  try {
    if (kind === 'redis') {
      const raw = await (await redis()).get(CONFIG_KEY);
      if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } else if (kind === 'blob') {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: CONFIG_BLOB, limit: 1 });
      if (blobs.length) {
        const res = await fetch(blobs[0].url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      }
    }
  } catch (err) {
    console.error('readConfig failed, serving defaults:', err);
  }
  return null;
}

export async function writeConfig(config) {
  const kind = backend();
  if (kind === 'redis') {
    await (await redis()).set(CONFIG_KEY, JSON.stringify(config));
    return;
  }
  if (kind === 'blob') {
    const { put } = await import('@vercel/blob');
    await put(CONFIG_BLOB, JSON.stringify(config, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0
    });
    return;
  }
  const err = new Error(
    'No storage is configured. Add a Redis (Vercel KV / Upstash) or Blob store to the project so the garage can save.'
  );
  err.statusCode = 501;
  throw err;
}

export function withDefaults(config) {
  const base = structuredClone(DEFAULT_CONFIG);
  if (!config) return base;
  return {
    ...base,
    ...config,
    video: { ...base.video, ...(config.video || {}) },
    motion: { ...base.motion, ...(config.motion || {}) },
    chrome: { ...base.chrome, ...(config.chrome || {}) },
    frames: Array.isArray(config.frames) ? config.frames : base.frames
  };
}
