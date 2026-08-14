import { send, fail, readJsonBody } from '../lib/http.js';
import { redisCreds } from '../lib/redisenv.js';

const KEY = 'nbdp:live';
const WINDOW_MS = 60_000; // a visitor counts as present for this long after a ping

let client = null;
async function redis() {
  if (!client) {
    const { Redis } = await import('@upstash/redis');
    client = new Redis(redisCreds());
  }
  return client;
}

/**
 * A real "listening now" count: each visitor pings with a random id, ids older
 * than a minute are dropped, and the size of the set is the answer. Without a
 * Redis store there is nothing to count across visitors, so it says so rather
 * than inventing a number.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: `${req.method} is not allowed here.` });
    }

    if (!redisCreds()) {
      return send(res, 200, { count: null, live: false }, { 'Cache-Control': 'no-store' });
    }

    const { id } = await readJsonBody(req);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      return send(res, 400, { error: 'Bad session id.' });
    }

    const now = Date.now();
    const db = await redis();
    await db.zadd(KEY, { score: now, member: id });
    await db.zremrangebyscore(KEY, 0, now - WINDOW_MS);
    const count = await db.zcard(KEY);
    await db.expire(KEY, 300);

    return send(res, 200, { count, live: true }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return fail(res, err);
  }
}
