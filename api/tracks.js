import { send, fail, readJsonBody } from '../lib/http.js';
import { redisCreds } from '../lib/redisenv.js';

/**
 * Titles for a playlist.
 *
 * The IFrame API hands the browser a list of video ids and the title of the one
 * currently playing — nothing about the rest. YouTube's oEmbed endpoint fills
 * that gap without an API key, but it is not reachable from a page on another
 * origin, so the lookup happens here instead.
 *
 * Titles effectively never change, so anything found is kept in Redis for a
 * month: the first visitor pays for the lookups and everyone after reads cache.
 * Without a store it still works, just repeated on each cold start.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_IDS = 50; // the client pages through a long playlist in chunks
const CACHE_TTL = 60 * 60 * 24 * 30;
const LOOKUP_TIMEOUT_MS = 4000;
const CONCURRENCY = 8;

let client = null;
async function redis() {
  const creds = redisCreds();
  if (!creds) return null;
  if (!client) {
    const { Redis } = await import('@upstash/redis');
    client = new Redis(creds);
  }
  return client;
}

const key = (id) => `nbdp:track:${id}`;

async function lookup(id) {
  const target = `https://www.youtube.com/watch?v=${id}`;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;

  const stop = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const res = await fetch(url, { signal: stop, headers: { Accept: 'application/json' } });
  // 401/404 means private, deleted or region-blocked. That is an answer, not a
  // failure — cache it so we do not ask again for every visitor.
  if (!res.ok) return { title: '', author: '' };

  const body = await res.json();
  return {
    title: String(body.title || '').slice(0, 200),
    author: String(body.author_name || '').slice(0, 120)
  };
}

/** Runs the lookups a few at a time rather than firing all of them at once. */
async function lookupAll(ids) {
  const found = new Map();
  const queue = [...ids];

  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        found.set(id, await lookup(id));
      } catch {
        // Network trouble or a timeout: leave it out so it is retried later
        // rather than cached as a blank.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return found;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: `${req.method} is not allowed here.` });
    }

    const { ids } = await readJsonBody(req);
    if (!Array.isArray(ids)) return send(res, 400, { error: 'Expected a list of ids.' });

    const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && VIDEO_ID.test(id)))];
    if (!wanted.length) return send(res, 200, { tracks: {} }, { 'Cache-Control': 'no-store' });
    if (wanted.length > MAX_IDS) {
      return send(res, 400, { error: `At most ${MAX_IDS} ids per request.` });
    }

    const db = await redis();
    const tracks = {};
    let missing = wanted;

    if (db) {
      const cached = await db.mget(...wanted.map(key));
      missing = [];
      wanted.forEach((id, i) => {
        const hit = cached[i];
        if (hit) tracks[id] = typeof hit === 'string' ? JSON.parse(hit) : hit;
        else missing.push(id);
      });
    }

    if (missing.length) {
      const found = await lookupAll(missing);
      for (const [id, track] of found) tracks[id] = track;

      if (db && found.size) {
        const writes = [...found].map(([id, track]) =>
          db.set(key(id), JSON.stringify(track), { ex: CACHE_TTL })
        );
        // A cache write failing is not worth failing the request over.
        await Promise.allSettled(writes);
      }
    }

    return send(res, 200, { tracks }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return fail(res, err);
  }
}
