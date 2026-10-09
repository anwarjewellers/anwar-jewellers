// /sitemap.xml for Google.
export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  const [cats, products] = await Promise.all([
    env.DB.prepare("SELECT slug, updated_at FROM categories WHERE status='active'").all(),
    env.DB.prepare("SELECT p.slug, p.updated_at FROM products p JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND c.status='active' ORDER BY p.id DESC LIMIT 5000").all(),
  ]);
  const urls = [
    `${origin}/`, `${origin}/products`, `${origin}/categories`, `${origin}/store`,
    ...['about', 'contact', 'privacy', 'terms', 'returns', 'shipping'].map((p) => `${origin}/pages/${p}`),
  ].map((loc) => `<url><loc>${esc(loc)}</loc></url>`);
  for (const c of cats.results) urls.push(`<url><loc>${esc(`${origin}/category/${c.slug}`)}</loc><lastmod>${c.updated_at.slice(0, 10)}</lastmod></url>`);
  for (const p of products.results) urls.push(`<url><loc>${esc(`${origin}/products/${p.slug}`)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' } });
}
