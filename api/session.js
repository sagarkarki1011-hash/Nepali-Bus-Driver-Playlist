import { checkPassword, issueCookie, clearCookie, isAuthed, isConfigured } from '../lib/auth.js';
import { backend } from '../lib/store.js';
import { send, fail, readJsonBody } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return send(
        res,
        200,
        { authed: isAuthed(req), configured: isConfigured(), storage: backend() },
        { 'Cache-Control': 'no-store' }
      );
    }

    if (req.method === 'DELETE') {
      return send(res, 200, { authed: false }, { 'Set-Cookie': clearCookie() });
    }

    if (req.method === 'POST') {
      if (!isConfigured()) {
        return send(res, 501, {
          error: 'No garage password is set. Add a GARAGE_PASSWORD environment variable in Vercel, then redeploy.'
        });
      }

      const { password } = await readJsonBody(req);
      if (!checkPassword(password)) {
        // Blunt the edge off scripted guessing without needing shared state.
        await new Promise((resolve) => setTimeout(resolve, 600));
        return send(res, 401, { error: 'Wrong password.' });
      }

      return send(res, 200, { authed: true, storage: backend() }, { 'Set-Cookie': issueCookie() });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: `${req.method} is not allowed here.` });
  } catch (err) {
    return fail(res, err);
  }
}
