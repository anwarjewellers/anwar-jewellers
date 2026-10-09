# Going live: Cloudflare (free) + GoDaddy domain & email

Total running cost: **₹0/month on Cloudflare** for a small shop. You only pay GoDaddy for the domain and the email mailbox.

> **R2 note:** Cloudflare asks for a card (or PayPal) once to switch on R2 photo storage, even on the free plan. Nothing is charged while you stay under 10 GB of photos and the free request limits; you can also set a billing alert.

---

## Step 1 – Cloudflare account and project (one time)

1. Sign up free at **https://dash.cloudflare.com/sign-up**.
2. On your PC, in the project folder:

```bash
npm install
npx wrangler login                                   (opens the browser – click Allow)
npx wrangler d1 create jewellery-shop-db             (copy the database_id it prints)
```

3. Open `wrangler.toml` and paste the id in place of `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
4. In the Cloudflare dashboard → **R2** → enable R2 (adds the payment method), then:

```bash
npx wrangler r2 bucket create jewellery-shop-images
npm run db:migrate                                   (creates the tables online)
npm run deploy                                       (first time it asks for a project name: press Enter)
```

You now have a live test address like **https://jewellery-shop.pages.dev**.

## Step 2 – Secret keys

Dashboard → **Workers & Pages** → `jewellery-shop` → **Settings → Variables and Secrets** → add each as type **Secret** (Production), then run `npm run deploy` again:

| Name | Value |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your first admin login (choose a strong password). Created on first login. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Account & Settings → **API Keys** (use **test** keys first, `rzp_test_…`; switch to live keys after KYC) |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you choose when adding the webhook (Step 6) |
| `BORZO_API_TOKEN`, `BORZO_CALLBACK_SECRET` | Borzo business account → Integration |
| `BORZO_MODE` | `test` or `live` |
| `RESEND_API_KEY` | Step 5 below |
| `MAIL_FROM` | e.g. `Anwar Jewellers <orders@anwarjewellers.com>` |

(Or from the PC: `npx wrangler pages secret put RAZORPAY_KEY_ID` and so on.)

Then open `https://jewellery-shop.pages.dev/admin/login`, log in, and fill in **Settings** (shop name, logo, address, delivery charge…).

## Step 3 – Connect your GoDaddy domain

Cloudflare Pages needs Cloudflare to manage the domain's DNS (it stays registered and paid at GoDaddy).

1. **Before changing anything**, in GoDaddy → **My Products → Domain → DNS**, take a screenshot of every record (especially the **MX**, **TXT** and **CNAME** records that GoDaddy email created).
2. Cloudflare dashboard → **Add a domain** → type `anwarjewellers.com` → choose the **Free** plan. Cloudflare copies the existing records – compare them with your screenshot and add anything missing.
3. Cloudflare shows two nameservers (like `xxx.ns.cloudflare.com`). In GoDaddy → Domain → **Nameservers → Change → "I'll use my own nameservers"** → paste both → Save. It takes from a few minutes up to 24 hours; Cloudflare emails you when the domain is active.
4. Workers & Pages → `jewellery-shop` → **Custom domains → Set up a custom domain** → add `anwarjewellers.com`, then again for `www.anwarjewellers.com`. HTTPS certificates are automatic.

## Step 4 – GoDaddy email keeps working

GoDaddy email (Professional Email / Webmail, or Microsoft 365) only depends on DNS records. After moving the nameservers, make sure these exist in **Cloudflare → DNS** exactly as they were at GoDaddy (set them to **DNS only / grey cloud**):

- **MX** `@` → `smtp.secureserver.net` (priority 0) and `mailstore1.secureserver.net` (priority 10) – GoDaddy email
- **CNAME** `email` → `email.secureserver.net`
- **CNAME** `secureserver1._domainkey` / `secureserver2._domainkey` → the `…onsecureserver.net` DKIM values
- **TXT** `@` → `v=spf1 include:secureserver.net -all` (keep **one** SPF record only)
- **TXT** `_dmarc` → the `v=DMARC1; …` value
- **SRV** `_autodiscover._tcp` → `0 0 443 autodiscover.secureserver.net`
- **TXT** `@` → `google-site-verification=…` (Google Search Console)
- any other **TXT** verification records GoDaddy added

Send a test email to and from the mailbox after the switch. If you buy the email *after* moving to Cloudflare, GoDaddy will show the records to add – add them in Cloudflare instead.

## Step 5 – Order emails from the website (Resend, free)

The website cannot send through the GoDaddy mailbox, so it uses Resend (3,000 emails/month free):

1. Sign up at **https://resend.com** → **Domains → Add domain** → `anwarjewellers.com`.
2. Resend shows DKIM/SPF records for a `send.` sub-domain – add them in Cloudflare DNS (they don't clash with GoDaddy email). Click **Verify**.
3. **API Keys → Create** → put it in `RESEND_API_KEY`, and set `MAIL_FROM` to an address on your domain. Replies go to the shop email in Settings (your GoDaddy mailbox).

## Step 6 – Razorpay and Borzo webhooks

- **Razorpay**: Dashboard → **Account & Settings → Webhooks → Add New Webhook**. URL `https://anwarjewellers.com/api/payment/webhook`, type a strong secret (save it as `RAZORPAY_WEBHOOK_SECRET`), tick **payment.captured**, **payment.failed** and **order.paid**. Also make sure **Payment Capture** is set to *Automatic* (the shop also captures by itself if needed).
- **Borzo**: Integration → Callback URL: `https://anwarjewellers.com/api/delivery/borzo/webhook`.

Do a full test with Razorpay **test** keys (test card `4111 1111 1111 1111`, any future date, any CVV; or UPI `success@razorpay`). When Razorpay approves your KYC, replace both keys with the **live** keys and run `npm run deploy`.

## Updating the website later

```bash
npm run deploy                     (builds and uploads – takes about a minute)
```

If you later add a new file to `migrations/`, run `npm run db:migrate` before deploying.

**Automatic deploys (optional):** push this folder to a private GitHub repository, then in Cloudflare → Workers & Pages → Create → Pages → *Connect to Git*. Build command `npm run build`, output folder `dist`. Every push then goes live automatically.

## Backups

D1 keeps 7 days of point-in-time history on the free plan (Time Travel). For your own copy:

```bash
npx wrangler d1 export jewellery-shop-db --remote --output=backup.sql
```

## Free plan limits (plenty for a small shop)

| | Free limit |
|---|---|
| Visitors / bandwidth | Unlimited |
| API requests | 100,000 per day |
| Database | 5 GB, 5 million reads + 100,000 writes per day |
| Photos (R2) | 10 GB storage, 1 million uploads + 10 million views per month |
| Deploys | 500 per month |
