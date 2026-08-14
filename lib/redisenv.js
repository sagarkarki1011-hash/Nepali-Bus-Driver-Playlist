/**
 * Finds the Upstash REST credentials in the environment.
 *
 * Vercel lets you put a prefix on the variables a storage integration injects,
 * so the same store can arrive as KV_REST_API_URL, UPSTASH_REDIS_REST_URL, or
 * something like nepalibusdriver_KV_REST_API_URL. Rather than pin one spelling,
 * match on the suffix and pair the token with the URL that shares its prefix —
 * so two stores in one project cannot be crossed with each other.
 *
 * Only the REST pair is usable: the client speaks HTTP, so a bare redis:// URL
 * (KV_URL, REDIS_URL) is deliberately ignored.
 */

const URL_SUFFIXES = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'];
const TOKEN_FOR = {
  KV_REST_API_URL: 'KV_REST_API_TOKEN',
  UPSTASH_REDIS_REST_URL: 'UPSTASH_REDIS_REST_TOKEN'
};

/** Matches the suffix either whole or after an underscore, never mid-word. */
function endsWithVar(key, suffix) {
  return key === suffix || key.endsWith(`_${suffix}`);
}

export function redisCreds(env = process.env) {
  for (const suffix of URL_SUFFIXES) {
    for (const key of Object.keys(env)) {
      if (!endsWithVar(key, suffix) || !env[key]) continue;

      const prefix = key.slice(0, key.length - suffix.length);
      const token = env[prefix + TOKEN_FOR[suffix]];
      // A read-only token cannot write the config, so it is not a candidate.
      if (token) return { url: env[key], token };
    }
  }
  return null;
}
