export function send(res, status, payload, headers = {}) {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(payload));
}

export function fail(res, err, fallbackStatus = 500) {
  const status = err?.statusCode || fallbackStatus;
  // Deliberate statuses are already explained to the caller; only log surprises.
  if (!err?.statusCode) console.error(err);
  send(res, status, { error: err?.message || 'Something went wrong.' });
}

/** Vercel may or may not have parsed the body already, so cope with both. */
export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    const err = new Error('Body was not valid JSON.');
    err.statusCode = 400;
    throw err;
  }
}
