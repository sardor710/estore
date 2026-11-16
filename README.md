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
npm run db:push             # creates the SQLite database and tables
npm run seed                # base data: categories, labels, UI strings, settings
npm run seed:demo           # optional: demo products
```

Demo products are for local development only. They never appear in the sitemap and should not be used in production.

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Prisma connection string, e.g. `file:./dev.db` for SQLite. |
| `ADMIN_USER` | Admin login name. |
| `ADMIN_PASSWORD` | Admin password. Choose a strong one. |
| `SESSION_SECRET` | Secret used to sign admin sessions. At least 32 random characters. |
| `ANTHROPIC_API_KEY` | Used to translate products. Create a key at https://console.anthropic.com (Settings, API keys). Translation uses the model `claude-haiku-5-5`. Without it, translation is unavailable. |
| `SITE_URL` | Public origin of the shop, e.g. `https://shop.example.uz`. Must be the production origin: it is used for canonical URLs, hreflang and the sitemap. |
| `TRUST_PROXY` | Set to `1` only when running behind a reverse proxy that overwrites `X-Forwarded-For`. It is used by the admin login throttle. Leave empty otherwise. |

## Running

- `npm run dev` - development server on http://localhost:3000
- `npm run build && npm start` - production build and server
- `npm test` - unit and API tests
- `npm run smoke` - smoke checks against a running server: `npm run smoke -- http://localhost:3000`

## Admin guide

Log in at `/admin` with `ADMIN_USER` / `ADMIN_PASSWORD`.

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

## Orders

Customers check out without an account. Each order has a status: NEW, CONFIRMED, DELIVERED or CANCELLED. Stock is decremented when you Confirm an order, and restored if a confirmed order is Cancelled. Cancelling an order that was never confirmed does not change stock.

### Telegram notifications

1. Open Telegram, talk to @BotFather, send `/newbot` and copy the bot token.
2. Start a chat with your bot (or add it to a group) and find the chat id, for example via the `getUpdates` method of the Bot API.
3. In the admin Settings, paste the token and chat id, then press Send test message.

## Languages and SEO

Uzbek is the default language. URLs are `/uz`, `/ru` and `/en`; a path without a prefix redirects to `/uz`. Pages carry hreflang links, the sitemap is at `/sitemap.xml` and `robots.txt` blocks `/admin` and `/api`. Cart and checkout pages are `noindex`.

## Deployment notes

- Simplest setup: one VPS with Node and the SQLite file, run with `npm run build && npm start` under a process manager (systemd, pm2), behind nginx or Caddy with HTTPS. Set `TRUST_PROXY=1` and `SITE_URL`.
- Back up the `.db` file regularly (copy it while the server is idle, or use `sqlite3 .backup`).
- For several instances, switch the Prisma datasource to PostgreSQL.
- The Telegram order notification is fire-and-forget, so prefer a long-running Node server over serverless.
- The admin login throttle is kept in memory, per process.

## Known limitations

- No online payments yet. The order model has a `paymentStatus` field so Payme / Click can be added later.
- If Anker changes its page format the importer can break. It fails with `PARSE_FAILED` instead of importing bad data; the product can then be created or completed by hand.
