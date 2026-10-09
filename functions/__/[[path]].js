// Serves Firebase's sign-in helper pages from our own domain (anwarjewellers.com/__/auth/...),
// so the Google sign-in window shows our address instead of anwar-jewellers.firebaseapp.com.
// Docs: https://firebase.google.com/docs/auth/web/redirect-best-practices (option 3: proxy)
const FIREBASE_HOST = 'anwar-jewellers.firebaseapp.com';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/__/auth/') && !url.pathname.startsWith('/__/firebase/')) {
    return new Response('Not found', { status: 404 });
  }
  const target = new URL(url.pathname + url.search, `https://${FIREBASE_HOST}`);
  const init = { method: request.method, headers: new Headers(request.headers), redirect: 'manual' };
  init.headers.set('Host', FIREBASE_HOST);
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
  return fetch(target, init);
}
