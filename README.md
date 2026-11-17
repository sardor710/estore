# Electronics Store

An online electronics shop for Uzbekistan, built with Next.js 16, Prisma and SQLite. The storefront is available in Uzbek (default), Russian and English, with a cart, checkout, order management, an importer for Anker products, AI translation and an admin panel.

## Requirements

- Node.js 24 (Windows, macOS and Linux are fine)
- npm

## Setup

```
npm install
copy .env.example .env      (Linux/macOS: cp .env.example .env)
# edit .env and fill in the variables below
npm run db:deploy           # creates the SQLite database and applies prisma/migrations
npm run seed                # base data: categories, labels, UI strings, settings
npm run seed:demo           # optional: demo products
```

Database schema changes go through Prisma migrations (`prisma/migrations`):

- `npm run db:deploy` applies pending migrations (`prisma migrate deploy`); use it on first setup and on every deploy.
- `npm run db:migrate` creates a new migration after you edit `prisma/schema.prisma` (development only, `prisma migrate dev`).
- `npm run db:push` is only used by the test setup for a throwaway database.
- A database created earlier with `db:push` that already matches the schema can be baselined once with `npx prisma migrate resolve --applied 20261117000000_init`.

Demo products are for local development only. They never appear in the sitemap, and in production (`NODE_ENV=production`, i.e. `npm start`) they are hidden from the whole storefront (home, categories, search, sale, related, product pages) and cannot be ordered. Set `SHOW_DEMO=1` to show them in a production build anyway (e.g. a staging demo). The admin still lists them, marked Demo.

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Prisma connection string, e.g. `file:./dev.db` for SQLite. |
| `ADMIN_USER` | Bootstrap only: login of the first full admin. Once any staff account exists it is ignored (accounts are managed in the admin, see Roles). |
| `ADMIN_PASSWORD` | Bootstrap only: password of the first full admin, at least 10 characters. Example values such as `change-me` are rejected and the admin stays locked ("Admin not configured") while no staff account exists. |
| `SESSION_SECRET` | Secret used to sign admin sessions. At least 32 random characters; example values are rejected. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ANTHROPIC_API_KEY` | Used to translate products. Create a key at https://console.anthropic.com (Settings, API keys). Translation uses the model `claude-haiku-5-5`. Without it, translation is unavailable. |
| `SITE_URL` | Public origin of the shop, e.g. `https://shop.example.uz`. Must be the production origin: it is used for canonical URLs, hreflang and the sitemap. |
| `SHOW_DEMO` | Optional. `1` shows demo products in a production build (they are hidden there by default). |
| `TRUST_PROXY` | Set to `1` only when running behind a reverse proxy that overwrites `X-Forwarded-For`. It is used by the admin login and order throttles (5 orders per 10 minutes per client IP). Leave empty otherwise; then all clients share one order bucket of 30 per 10 minutes. It also decides how visitors are told apart in analytics, see Analytics. |
| `UPLOADS_DIR` | Optional. Folder for uploaded images (blog, products). Defaults to `uploads/` in the project directory. |

## Running

- `npm run dev` - development server on http://localhost:3000
- `npm run build && npm start` - production build and server
- `npm test` - unit and API tests
- `npm run smoke` - smoke checks against a running server: `npm run smoke -- http://localhost:3000`

## Admin guide

Log in at `/admin`. On a fresh database, signing in with `ADMIN_USER` / `ADMIN_PASSWORD` creates the first full admin (role ADMIN). From then on the `.env` credentials are not used again; create and manage the other staff accounts under Users.

### Roles

| Role | Can do |
|---|---|
| ADMIN | Everything: dashboard and analytics, orders, clients, promotions, products and catalog, homepage banners, blog, translations, business and integration settings (Telegram, etc.), users and the activity log. |
| PRODUCT_MANAGER | Dashboard, orders, clients, promotions, catalog (products, brands, categories), homepage banners, blog, translations and business settings. No access to users, the activity log or integration settings. |
| BLOG_EDITOR | The blog only (posts and their images). Signs in straight to `/admin/blog`. |

Lost access to the last admin account? Run `npm run admin:reset -- <email>` on the server (optionally `--name "Full Name"`). It creates the account as a full admin, or resets an existing one (role ADMIN, active, new password asked at the prompt) and signs out all of its sessions. There is deliberately no web-based recovery.

Adding a product from Anker:

1. Import: paste an anker.com product link.
2. Review the imported data (images, specs, description).
3. Set the price in UZS and the stock quantity.
4. Click Translate to generate Uzbek and Russian texts (English comes from the source).
5. Mark the translations as reviewed.
6. Publish.

Notes:

- Publishing is blocked while the price is zero.
- Refresh from Anker updates source data but keeps your prices, stock and translations.
- Soundcore-branded Anker pages may lack specifications; fill them in by hand. Links on soundcore.com are not supported.
- Variant names come from all of Anker's options, e.g. "Space Black / Power Bank + Charger" for a color + bundle choice. Translate them to Uzbek and Russian with the Translate button like other texts.

Product images and variants:

- In the Images tab, drag several images onto the drop area (or press Choose files) to upload them at once. Up to 3 upload in parallel; a file that is too big or not an image shows its own error without stopping the others. The first image is the cover.
- Each variant has a name per language, an optional color and a picture chosen from the product's images (Change picture). The product list shows every variant by picture, color dot and name, with the SKU underneath. Reordering or removing images keeps each variant on the same picture.

### Homepage banners

Content → Banners (full admins and product managers) manages the slides at the top of the homepage:

- Image (about 1920×720) and an optional mobile image (about 800×1000, used on phones).
- Title, text and button text in uz/ru/en, all optional; a missing language falls back to Uzbek. With no text the slide is image-only.
- Link: a site path like `/c/chargers` (the visitor's language is added) or a full `https://` URL. Without button text the whole banner is clickable.
- On/off switch and optional start/end times (Tashkent time). Slides show in list order (arrows to reorder).

When no banner is live, the homepage shows the built-in slides.

## Customer accounts

Shoppers sign in with the shop's Telegram bot (the same bot whose token is set in Settings for order alerts). No SMS, email or passwords.

- **First sign-in:** "Sign in with Telegram" on `/{lang}/login` opens the bot (QR code on desktop). The shopper shares their phone number with Telegram's own button (only their own contact, Uzbek numbers only), then taps the 4-digit code that the website shows (6 choices; a wrong tap cancels and blocks new attempts for a minute). The website signs in by itself. After every sign-in the bot sends a "New sign-in — not you?" message with a "Sign out everywhere" button.
- **Next time:** the same button, or enter the phone on the website and type the 6-digit code the bot sends.
- **Account:** orders (every order placed with that phone, also older ones), order details with a status timeline and "Buy again", saved addresses (used at checkout), favorites, name/language/notification settings, sign out everywhere, delete account (removes the login, addresses and favorites; orders stay with the shop). When staff change an order's status, the customer gets a Telegram message.
- **Admin:** clients with an account show an "Account" badge.

Setup:

1. Set the bot token in Settings (full admin) and `SITE_URL` to the public `https://` address.
2. Press **Connect bot to website** in Settings. This registers the webhook `/api/telegram/webhook` (protected by a random secret).
3. Local development (no public HTTPS): run `npm run bot:poll` next to `npm run dev`. It removes the webhook and reads bot messages by polling; press Connect again on the live site afterwards.

Stored per account: phone, name, Telegram user and chat id, language and notification choice, addresses and favorites. Sign-in requests and codes are stored hashed and cleaned up automatically.

## Telegram Mini App

The whole shop also runs **inside Telegram** as a Mini App: the same pages, database, cart, checkout, orders and account as the website, with Telegram's look (bottom tab bar Home · Catalog · Cart · Orders · Profile, Telegram's Back button and big bottom button).

- **Opening it:** the bot's menu button **🛍 Shop**, the **Open shop** button after `/start`, or any button in the bot's order messages. Every entry goes through `/tg?next=…`, which checks Telegram's signed launch data (`initData`, accepted for 1 hour) with the bot token and signs the shopper in automatically when their Telegram account is linked.
- **First order:** checkout asks for one tap on **Share phone number** (Telegram's own contact sharing). The bot links the phone to the account; the Mini App then continues signed in. Only the shopper's own Uzbek number is accepted.
- **Location:** "📍 Share my location" at checkout and in saved addresses (Telegram's location API, or the browser's). Sending a location to the bot in chat offers to attach it to a saved address or start a new address with it. The typed address stays required.
- **Bot messages to the customer:** order received (items, total, pay on delivery), confirmed, out for delivery, delivered, cancelled — each with a button that opens the order inside the Mini App. Customers can turn them off in Profile. Bot commands: `/start`, `/orders` (last 5 orders), `/help`.

Setup (production):

1. `SITE_URL` must be the public **https** address (Telegram opens Mini Apps only over HTTPS).
2. Admin → Settings → **Connect bot to website**. Besides the webhook, this sets the bot's menu button (opens `${SITE_URL}/tg`) and its command list in uz/ru/en. Press it again whenever `SITE_URL` changes.
3. Optional: in @BotFather, `/newapp` creates a direct link like `t.me/<bot>/shop` with URL `${SITE_URL}/tg`.

Testing inside Telegram from a local machine: start an HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:3000`, put the tunnel URL into `SITE_URL`, restart `npm run dev`, and press Connect bot (this replaces the production webhook — press Connect on the live site afterwards). Opening `/tg` in a normal browser only shows "open this from the Telegram bot": there is no fake sign-in for local browsers.

Known limits: in Telegram **Web** (browser version) the Mini App runs in an iframe; browsers that block third-party cookies may not keep the session there (mobile and desktop apps are not affected). Cookies set by the Mini App are `SameSite=None; Secure; Partitioned` on https, so `/api/orders` and `/api/tg/session` accept only same-origin JSON requests.

## Uploads

Images uploaded in the admin are stored on disk in `uploads/` (or `UPLOADS_DIR`) and served from `/uploads/...`. The folder is not in git and is not part of the database: back it up together with the `.db` file, and keep it on persistent storage when you deploy.

## Blog editor

The blog editor is CKEditor 5, used under its GPL license (`licenseKey: 'GPL'`). If you distribute a modified version of this application, the GPL applies to it. A commercial CKEditor license can be bought instead if that does not fit.

## Analytics

Visitor analytics are first-party: the shop records its own page views, with no third-party scripts or cookies.

- Raw page views are kept for 180 days. Older data is rolled up into daily aggregates, which are kept forever.
- Visitors are counted from a hash of IP address and browser plus a random salt that changes every day (Tashkent time). Salts of finished days are deleted, so old hashes cannot be recomputed and a person cannot be followed across days.
- `TRUST_PROXY=1` lets the app read the client IP from `X-Forwarded-For`. Without it all clients have the same IP, visitors are told apart by browser only, so Visitors is undercounted and Conversion overstated (the dashboard shows a warning). Set it only if your reverse proxy overwrites `X-Forwarded-For` with the real client address instead of passing the client's own header through; otherwise visitors can fake their IP and bypass the throttles.

## Orders

Customers check out without an account. Each order has a status: NEW, CONFIRMED, SHIPPING ("Out for delivery", optional), DELIVERED or CANCELLED. A confirmed order can go to Out for delivery and then Delivered, or straight to Delivered (pickup, same-day). Stock is decremented when you Confirm an order, and restored if a confirmed or out-for-delivery order is Cancelled. Cancelling an order that was never confirmed does not change stock. Orders can carry an optional map pin (shared location); the order page in admin then shows Yandex/Google map links and the staff Telegram alert includes a map link. Payment is on delivery (no online payment yet).

### Telegram notifications

1. Open Telegram, talk to @BotFather, send `/newbot` and copy the bot token.
2. Start a chat with your bot (or add it to a group) and find the chat id, for example via the `getUpdates` method of the Bot API.
3. In the admin Settings, paste the token and chat id, then press Send test message.

## Languages and SEO

Uzbek is the default language. URLs are `/uz`, `/ru` and `/en`; a path without a prefix redirects to `/uz`. Pages carry hreflang links, the sitemap is at `/sitemap.xml` and `robots.txt` blocks `/admin` and `/api`. Cart and checkout pages are `noindex`.

## Deployment notes

- Simplest setup: one VPS with Node and the SQLite file, run with `npm run db:deploy && npm run build && npm start` under a process manager (systemd, pm2), behind nginx or Caddy with HTTPS. Set `TRUST_PROXY=1` and `SITE_URL`.
- Back up the `.db` file and the `uploads/` folder regularly (copy the database while the server is idle, or use `sqlite3 .backup`).
- For several instances, switch the Prisma datasource to PostgreSQL.
- The Telegram order notification runs after the response (Next.js `after()`); a long-running Node server is still the simplest host.
- The admin login and order throttles are kept in memory, per process.

## Known limitations

- No online payments yet. The order model has a `paymentStatus` field so Payme / Click can be added later.
- If Anker changes its page format the importer can break. It fails with `PARSE_FAILED` instead of importing bad data; the product can then be created or completed by hand.
