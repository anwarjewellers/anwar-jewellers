# Anwar Jewellers — E-Commerce Website

**🌐 Live site: [anwarjewellers.com](https://anwarjewellers.com)**

A live online store for Anwar Jewellers, a silver and imitation jewellery shop in Hyderabad. It is built with React and runs entirely on Cloudflare's free plan, with online payments, same-day delivery and an admin panel for the shop owner.

**Built by:** [Mohammed Zeeshan](https://github.com/mdzeeshan0398)

## Features

- **Customer website**: browse, search and filter products, wishlist, cart, checkout, online payment (Razorpay: UPI, cards, net banking, wallets), order history with live delivery tracking
- **Store page**: Google Map of the showroom, directions and WhatsApp contact
- **Sign-in**: Google and email login with Firebase Authentication
- **Admin panel** (`/admin`, owner only): dashboard with sales chart, products and photos, categories, inventory, orders, customers, sales reports with CSV export, website settings
- **Delivery**: instant delivery across Hyderabad by **Borzo** (fixed or live delivery price, rider booked automatically after payment, status updates by webhook)
- **Emails**: order confirmation, new-order alert for the shop, status updates, password reset (through Resend)

| Part | Technology | Cloudflare free plan |
|---|---|---|
| Website | React 18 + Vite + Bootstrap 5 | Cloudflare Pages (unlimited visitors) |
| API | Pages Functions + Hono (`server/`) | 100,000 requests/day |
| Database | Cloudflare D1 (SQLite) | 5 GB, 5 million reads/day |
| Product photos | Cloudflare R2 | 10 GB |

Read **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** to put the shop live on Cloudflare with your GoDaddy domain and email.

---

## Folder structure

```
src/               React website (customer pages in pages/, admin panel in admin/)
server/            API: app.js (shop), admin.js (admin), orders.js, razorpay.js, delivery.js, mail.js, auth.js
shared/            Constants used by both (order statuses, price ranges, states…)
functions/         Cloudflare routing: /api/*, /images/*, /sitemap.xml
migrations/        Database tables (D1)
public/            Static files (robots.txt, security headers, placeholder image)
wrangler.toml      Cloudflare settings (database + photo bucket)
```

## Run it on your Windows PC

You need **Node.js 20 or newer** (https://nodejs.org → LTS).

```bash
cd "D:\E-Commerce Platform\jewellery-shop"
npm install
copy .dev.vars.example .dev.vars          (then fill in the values you have)
npm run db:migrate:local                  (creates the local test database)
npm run build
npm run dev:api                           (leave this window open)
```

Open **http://localhost:8788**. Admin panel: **http://localhost:8788/admin/login** with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.dev.vars` (the admin account is created the first time you log in).

While changing the design, also run `npm run dev` in a second window and open http://localhost:5173 – the page reloads instantly when you save a file.

Locally, emails are printed in the `dev:api` window instead of being sent (until `RESEND_API_KEY` is set). With Razorpay **test** keys in `.dev.vars` you can try the whole payment locally using Razorpay's test cards / UPI.

## Everyday admin tasks

| Task | Where |
|---|---|
| Add a product with photos | Admin → Products → Add Product (photos are resized automatically) |
| Change stock | Admin → Inventory |
| See new orders | Admin → Dashboard / Orders (you also get an email at the shop email in Settings) |
| Book / track / cancel the Borzo rider | Admin → Orders → open the order |
| Mark "Out for Delivery" / "Delivered" | Open the order → Change order status (customer is emailed) |
| Customer paid but order shows "Payment Pending" | Open the order → **Re-check with Razorpay** |
| Shop name, logo, banner, phone, delivery charge, policies | Admin → Settings |
| Download orders for accounts | Admin → Sales → Export CSV |

Unpaid orders older than 48 hours are cancelled automatically when you open the admin panel.

## Security in short

- Prices, stock and totals are always calculated on the server, never trusted from the browser.
- Payments are verified twice: Razorpay's HMAC signature **and** a server-to-server check with Razorpay's API (amount must match). A payment is applied exactly once, even if the webhook arrives several times; stock never goes below zero.
- Passwords are hashed with PBKDF2-SHA256 (100,000 rounds). Logins use an HttpOnly, Secure, SameSite cookie. Login, sign-up, password-reset and checkout are rate-limited.
- Every change request must carry a header other websites cannot send (CSRF protection). Borzo callbacks are checked with an HMAC signature.
- Card / UPI details never touch this website: customers pay in Razorpay's secure window.
