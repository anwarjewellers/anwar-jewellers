// Serves product / category / logo images from the R2 bucket bound as IMAGES.
export async function onRequestGet({ request, env, params }) {
  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!env.IMAGES || !/^[a-z]+\/[A-Za-z0-9/_-]+\.(jpg|png|webp)$/.test(key)) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const object = await env.IMAGES.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  const response = new Response(object.body, { headers });
  await cache.put(request, response.clone());
  return response;
}
