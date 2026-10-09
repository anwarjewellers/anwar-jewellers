// Website settings editable by the owner in Admin → Settings (stored in the `settings` table).

export const DEFAULT_SETTINGS = {
  shop_name: 'Anwar Jewellers',
  tagline: 'Silver & Imitation Jewellery',
  logo_key: '',
  contact_phone: '+91 81424 39288',
  contact_email: 'info@anwarjewellers.com',
  support_email: 'support@anwarjewellers.com',
  sales_email: 'sales@anwarjewellers.com',
  whatsapp_number: '918142439288',
  shop_address: '17-3A-40, SRT Colony, Yakutpura, Hyderabad, Telangana – 500023',
  store_hours: 'Mon–Sun · 11 AM – 9 PM',
  store_map_query: '', // optional: exact pin for the map, e.g. "17.3539,78.4925" (empty = use the shop address)
  facebook_url: '',
  instagram_url: '',
  youtube_url: '',
  hero_title: 'Elegant Jewellery for Every Occasion',
  hero_subtitle: 'Handpicked earrings, necklaces, bangles and bridal sets at prices you will love.',
  hero_image_key: '',
  low_stock_threshold: '5',

  // Delivery (Borzo, Hyderabad only)
  delivery_pricing: 'flat', // flat = fixed charge; live = Borzo's real price for the address
  delivery_flat_charge: '80',
  free_delivery_above: '0', // 0 = never free
  delivery_pincodes: '500', // allowed pincode starts, comma separated
  delivery_area_name: 'Hyderabad',
  delivery_auto_book: '1', // book a Borzo rider automatically after payment
  pickup_contact_name: 'Anwar Jewellers',
  pickup_phone: '8142439288',

  about_us: 'Anwar Jewellers, SRT Colony, Yakutpura, Hyderabad, specialises in silver and imitation jewellery. Every piece is handpicked for quality and style.',
  privacy_policy: 'We collect only the details needed to deliver your order (name, mobile, email and address). We never sell your data. Online payments are processed by our payment partner; we never see or store your card, UPI PIN or bank details.',
  terms_conditions: 'Prices are in Indian Rupees and include applicable taxes. Product colours may vary slightly from photos. Orders are confirmed only after successful payment.',
  return_policy: 'If you receive a damaged or wrong item, contact us within 48 hours of delivery with photos. We will replace it or refund you. Earrings cannot be returned for hygiene reasons unless damaged.',
  shipping_info: 'We offer instant delivery across Hyderabad through our delivery partner Borzo. Once your payment is confirmed, a rider picks up your parcel from our shop and brings it straight to you, usually within a few hours. You will get an email with a live tracking link when your order is on the way. The delivery charge is shown before you pay. At present we deliver only within Hyderabad.',
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

/** All settings (defaults merged with saved values). Cached for the life of one request. */
export async function getSettings(c) {
  if (c.get('settings')) return c.get('settings');
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all();
  const values = { ...DEFAULT_SETTINGS };
  for (const row of results) if (row.value !== null && row.value !== undefined) values[row.key] = row.value;
  c.set('settings', values);
  return values;
}

export async function saveSettings(c, values) {
  const stmt = c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const batch = Object.entries(values).map(([k, v]) => stmt.bind(k, v === null || v === undefined ? '' : String(v)));
  if (batch.length) await c.env.DB.batch(batch);
  c.set('settings', null);
}
