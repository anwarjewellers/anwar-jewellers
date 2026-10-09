// Shared by the website (src/) and the API (server/).

export const ORDER_STATUS = {
  payment_pending: { label: 'Payment Pending', badge: 'warning' },
  payment_confirmed: { label: 'Payment Confirmed', badge: 'info' },
  order_confirmed: { label: 'Order Confirmed', badge: 'primary' },
  preparing: { label: 'Preparing', badge: 'info' },
  out_for_delivery: { label: 'Out for Delivery', badge: 'primary' },
  delivered: { label: 'Delivered', badge: 'success' },
  cancelled: { label: 'Cancelled', badge: 'secondary' },
};

/** Statuses the admin may choose for a paid order. */
export const STATUSES_FOR_PAID = ['payment_confirmed', 'order_confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

/** Statuses that count as pending work for the shop owner. */
export const PENDING_WORK = ['payment_confirmed', 'order_confirmed', 'preparing', 'out_for_delivery'];

export const PAYMENT_STATUS = {
  pending: { label: 'Pending', badge: 'warning' },
  paid: { label: 'Paid', badge: 'success' },
  failed: { label: 'Failed', badge: 'danger' },
  refunded: { label: 'Refunded', badge: 'secondary' },
};

export const PER_PAGE = 12;
export const MAX_PER_ITEM = 20;
export const CANCEL_UNPAID_AFTER_HOURS = 48;

export const PRICE_RANGES = {
  'under-500': { label: 'Under ₹500', min: null, max: 499.99 },
  '500-1000': { label: '₹500 – ₹1,000', min: 500, max: 1000 },
  '1000-2000': { label: '₹1,000 – ₹2,000', min: 1000.01, max: 2000 },
  'above-2000': { label: 'Above ₹2,000', min: 2000.01, max: null },
};

export const SORT_OPTIONS = {
  newest: 'Newest',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  popular: 'Popular',
};

export const PAGES = {
  about: { title: 'About Us', setting: 'about_us' },
  contact: { title: 'Contact Us', setting: null },
  privacy: { title: 'Privacy Policy', setting: 'privacy_policy' },
  terms: { title: 'Terms & Conditions', setting: 'terms_conditions' },
  returns: { title: 'Return Policy', setting: 'return_policy' },
  shipping: { title: 'Shipping Information', setting: 'shipping_info' },
};

export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];

/** Settings the public website may read (everything else stays server-side). */
export const PUBLIC_SETTINGS = [
  'shop_name', 'tagline', 'logo_key', 'contact_phone', 'contact_email', 'support_email', 'sales_email', 'whatsapp_number', 'shop_address', 'store_hours', 'store_map_query',
  'facebook_url', 'instagram_url', 'youtube_url', 'hero_title', 'hero_subtitle', 'hero_image_key',
  'about_us', 'privacy_policy', 'terms_conditions', 'return_policy', 'shipping_info', 'delivery_area_name',
];
