-- Jewellery shop database (Cloudflare D1 / SQLite).
-- Money is stored in rupees as REAL with 2 decimals, rounded in code.
-- Times are ISO-8601 UTC strings, e.g. 2026-10-05T10:30:00.000Z

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mobile        TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'CUSTOMER',   -- CUSTOMER | ADMIN
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                     -- SHA-256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key       TEXT PRIMARY KEY,
  hits      INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL
);

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  image_key     TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',     -- active | inactive
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE products (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  meta_description TEXT,
  price            REAL NOT NULL,
  original_price   REAL,
  stock_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  material         TEXT,
  colour           TEXT,
  size             TEXT,
  weight           TEXT,
  status           TEXT NOT NULL DEFAULT 'active',  -- active | inactive
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_products_status_created ON products(status, created_at);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price);

CREATE TABLE product_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_key     TEXT NOT NULL,
  thumb_key     TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_product_images_product ON product_images(product_id, display_order);

CREATE TABLE wishlists (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  mobile     TEXT NOT NULL,
  house      TEXT NOT NULL,
  street     TEXT,
  area       TEXT,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  pincode    TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_addresses_user ON addresses(user_id);

CREATE TABLE orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number           TEXT UNIQUE,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  address_id             INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
  shipping_name          TEXT NOT NULL,
  shipping_mobile        TEXT NOT NULL,
  shipping_address       TEXT NOT NULL,
  shipping_city          TEXT NOT NULL,
  shipping_state         TEXT NOT NULL,
  shipping_pincode       TEXT NOT NULL,
  subtotal               REAL NOT NULL,
  discount               REAL NOT NULL DEFAULT 0,
  delivery_charge        REAL NOT NULL DEFAULT 0,
  total_amount           REAL NOT NULL,
  payment_status         TEXT NOT NULL DEFAULT 'pending',          -- pending | paid | failed | refunded
  order_status           TEXT NOT NULL DEFAULT 'payment_pending',  -- see server/constants.js
  stock_deducted         INTEGER NOT NULL DEFAULT 0,
  delivery_provider      TEXT,
  delivery_order_id      TEXT,
  delivery_status        TEXT,
  delivery_tracking_url  TEXT,
  delivery_courier_name  TEXT,
  delivery_courier_phone TEXT,
  delivery_cost          REAL,
  admin_note             TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_payment ON orders(payment_status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_delivery ON orders(delivery_order_id);

CREATE TABLE order_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,
  price          REAL NOT NULL,
  original_price REAL,
  quantity       INTEGER NOT NULL,
  total          REAL NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE payments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway            TEXT NOT NULL,
  transaction_id     TEXT NOT NULL UNIQUE,
  gateway_payment_id TEXT,
  amount             REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed
  method             TEXT,
  response           TEXT,
  paid_at            TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
