import { readConfig, writeConfig, withDefaults, backend } from '../lib/store.js';
import { sanitizeConfig } from '../lib/validate.js';
import { isAuthed } from '../lib/auth.js';
import { send, fail, readJsonBody } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const stored = await readConfig();
      // The ride polls this, so keep it uncached but let the CDN serve a stale copy on a blip.
      return send(res, 200, withDefaults(stored), {
        'Cache-Control': 'no-store, max-age=0',
        'X-Config-Source': stored ? backend() : 'defaults'
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      if (!isAuthed(req)) return send(res, 401, { error: 'Sign in to the garage first.' });

      const body = await readJsonBody(req);
      const config = sanitizeConfig(body);
      await writeConfig(config);
      return send(res, 200, config, { 'Cache-Control': 'no-store' });
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    return send(res, 405, { error: `${req.method} is not allowed here.` });
  } catch (err) {
    return fail(res, err);
  }
}
