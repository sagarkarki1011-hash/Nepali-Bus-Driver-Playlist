import { isAuthed } from '../lib/auth.js';
import { send, fail, readRawBody } from '../lib/http.js';

// Vercel caps a serverless request body at 4.5 MB. The garage downscales images in
// the browser before sending, so this only trips on very large files or raw video.
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm']
]);

function slugify(name) {
  return (name || 'frame')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'frame';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: `${req.method} is not allowed here.` });
    }

    if (!isAuthed(req)) return send(res, 401, { error: 'Sign in to the garage first.' });

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return send(res, 501, {
        error:
          'Uploads need a Blob store. In Vercel: Storage → Create → Blob, connect it to this project, then redeploy. You can paste image URLs in the meantime.'
      });
    }

    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED.get(contentType);
    if (!ext) {
      return send(res, 415, {
        error: `Unsupported file type "${contentType || 'unknown'}". Use JPEG, PNG, WebP, AVIF, GIF, MP4 or WebM.`
      });
    }

    const body = await readRawBody(req);
    if (!body.length) return send(res, 400, { error: 'The upload was empty.' });
    if (body.length > MAX_BYTES) {
      return send(res, 413, {
        error: `That file is ${(body.length / 1024 / 1024).toFixed(1)} MB — the ceiling is 4 MB. Host it elsewhere and paste the URL instead.`
      });
    }

    const name = slugify(req.query?.name);
    const { put } = await import('@vercel/blob');
    const blob = await put(`frames/${name}.${ext}`, body, {
      access: 'public',
      contentType,
      addRandomSuffix: true
    });

    return send(res, 200, { url: blob.url, size: body.length }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return fail(res, err);
  }
}
