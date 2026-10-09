// Verifies Firebase Authentication ID tokens (Google / email sign-in) without any SDK.
// Docs: https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function googleKeys() {
  const cache = caches.default;
  const req = new Request(JWKS_URL);
  let res = await cache.match(req);
  if (!res) {
    res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error('Could not load Firebase keys');
    const maxAge = Number((res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
    res = new Response(await res.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${maxAge}` } });
    await cache.put(req, res.clone());
  }
  return (await res.json()).keys || [];
}

/**
 * Returns the verified token claims, or null if the token is not a valid,
 * current Firebase ID token for this project.
 */
export async function verifyIdToken(env, token) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header; let payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) return null;
  if (!(payload.exp > now) || !(payload.iat <= now + 300) || !(payload.auth_time <= now + 300)) return null;

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return ok ? payload : null;
}
