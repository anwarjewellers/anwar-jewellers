// Product & category queries for the shop pages.
import { PER_PAGE, PRICE_RANGES } from '../shared/constants.js';
import { int } from './util.js';

const MAIN_IMAGE = `(SELECT image_key FROM product_images i WHERE i.product_id = p.id ORDER BY display_order, id LIMIT 1)`;
const MAIN_THUMB = `(SELECT COALESCE(thumb_key, image_key) FROM product_images i WHERE i.product_id = p.id ORDER BY display_order, id LIMIT 1)`;
const SOLD = `(SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id AND o.payment_status = 'paid' AND o.order_status != 'cancelled')`;

export const CARD_COLUMNS = `p.id, p.name, p.slug, p.price, p.original_price, p.stock_quantity, p.category_id, c.name AS category_name, c.slug AS category_slug, ${MAIN_THUMB} AS thumb_key`;
const VISIBLE = `p.status = 'active' AND c.status = 'active'`;

async function list(env, where = '', binds = [], order = 'p.created_at DESC, p.id DESC', limit = 8) {
  const { results } = await env.DB.prepare(
    `SELECT ${CARD_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id WHERE ${VISIBLE} ${where} ORDER BY ${order} LIMIT ${limit}`,
  ).bind(...binds).all();
  return results;
}

export const newArrivals = (env, limit = 8) => list(env, '', [], 'p.created_at DESC, p.id DESC', limit);
export const offers = (env, limit = 8) => list(env, 'AND p.original_price IS NOT NULL AND p.original_price > p.price', [], 'p.created_at DESC', limit);
export async function bestSellers(env, limit = 8) {
  const { results } = await env.DB.prepare(
    `SELECT ${CARD_COLUMNS}, ${SOLD} AS sold_qty FROM products p JOIN categories c ON c.id = p.category_id WHERE ${VISIBLE} ORDER BY sold_qty DESC, p.id DESC LIMIT ?`,
  ).bind(limit).all();
  return results.filter((p) => p.sold_qty > 0);
}
export const related = (env, product, limit = 4) => list(env, 'AND p.category_id = ? AND p.id != ?', [product.category_id, product.id], 'RANDOM()', limit);

export async function activeCategories(env, withCounts = false) {
  const counts = withCounts ? `, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count` : '';
  const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.slug, c.image_key${counts} FROM categories c WHERE c.status = 'active' ORDER BY c.display_order, c.name`).all();
  return results;
}

/** Singular form of a search word so "necklaces" also finds "necklace". */
function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Listing with search, filters, sorting and pagination. */
export async function browse(env, q) {
  const where = [VISIBLE];
  const binds = [];

  if (q.category) { where.push('c.slug = ?'); binds.push(q.category); }

  const words = String(q.q || '').toLowerCase().trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 5).map(singular);
  for (const w of words) {
    const like = `%${w.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    where.push(`(p.name LIKE ? ESCAPE '\\' OR p.material LIKE ? ESCAPE '\\' OR p.colour LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`);
    binds.push(like, like, like, like, like);
  }

  const range = PRICE_RANGES[q.price];
  if (range) {
    if (range.min !== null) { where.push('p.price >= ?'); binds.push(range.min); }
    if (range.max !== null) { where.push('p.price <= ?'); binds.push(range.max); }
  }
  if (q.availability === 'in') where.push('p.stock_quantity > 0');
  if (q.availability === 'out') where.push('p.stock_quantity = 0');

  const order = {
    price_asc: 'p.price ASC, p.id DESC',
    price_desc: 'p.price DESC, p.id DESC',
    popular: 'sold_qty DESC, p.id DESC',
  }[q.sort] || 'p.created_at DESC, p.id DESC';

  const whereSql = where.join(' AND ');
  const page = Math.max(1, int(q.page, 1));
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`).bind(...binds).first()).n;
  const { results } = await env.DB.prepare(
    `SELECT ${CARD_COLUMNS}${q.sort === 'popular' ? `, ${SOLD} AS sold_qty` : ''} FROM products p JOIN categories c ON c.id = p.category_id
     WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
  ).bind(...binds, PER_PAGE, (page - 1) * PER_PAGE).all();

  return { products: results, page, perPage: PER_PAGE, total, lastPage: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

export async function productBySlug(env, slug) {
  const p = await env.DB.prepare(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND ${VISIBLE}`,
  ).bind(slug).first();
  if (!p) return null;
  const { results: images } = await env.DB.prepare('SELECT id, image_key, thumb_key FROM product_images WHERE product_id = ? ORDER BY display_order, id').bind(p.id).all();
  return { ...p, images };
}

export { MAIN_IMAGE };
