import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'nbdp_session';
const TTL_MS = 12 * 60 * 60 * 1000;

function password() {
  return process.env.GARAGE_PASSWORD || '';
}

/** Falls back to a key derived from the password so a single env var is enough to run. */
function secret() {
  const explicit = process.env.GARAGE_SECRET;
  if (explicit) return explicit;
  return createHash('sha256').update(`nbdp:${password()}`).digest('hex');
}

export function isConfigured() {
  return password().length > 0;
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate) {
  if (!isConfigured() || typeof candidate !== 'string') return false;
  // Compare digests so the check stays constant-time regardless of input length.
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(password()).digest();
  return timingSafeEqual(a, b);
}

export function issueCookie() {
  const expires = Date.now() + TTL_MS;
  const token = `${expires}.${sign(String(expires))}`;
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`
  ];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie() {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

export function isAuthed(req) {
  if (!isConfigured()) return false;
  const header = req.headers?.cookie || '';
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;

  const token = decodeURIComponent(match.slice(COOKIE.length + 1));
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;

  const expires = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(expires))) return false;

  const ms = Number(expires);
  return Number.isFinite(ms) && ms > Date.now();
}
