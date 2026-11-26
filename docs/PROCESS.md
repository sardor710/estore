# Zanko — Process Log and Runbook

How zanko.uz is run and changed: the procedures we follow and a log of what was done. Keep this file current after every piece of work. **Never write keys or passwords here** (they live only in `.env` on the server).

---

## 1. Where things are

| What | Where |
|---|---|
| Code (this repo) | GitHub `sardor710/estore`, branch `main`; server checkout `/home/nick/zanko` |
| Live site | https://zanko.uz — systemd unit `zanko.service` (`next start -p 3100`, Node 24 at `/opt/node24/bin`), behind the shared edge nginx |
| Database | SQLite `/home/nick/zanko-data/zanko.db` |
| Uploads, backups | `/home/nick/zanko-data/uploads`, `/home/nick/zanko-data/backups` |
| Secrets | `/home/nick/zanko/.env` (not in git) |
| Plans (one file per feature) | `docs/plans/YYYY-MM-DD-<topic>-xl.md` |
| Import tooling + data (outside git) | `/home/nick/zanko-data/import-2026-11-26/` |

Keys in `.env` (names only): `DATABASE_URL`, `SITE_URL`, Yandex Maps keys, `OPENROUTER_API_KEY` (image translation), `ANTHROPIC_API_KEY` (text translation), `OCTO_SHOP_ID`, `OCTO_SECRET`, `OCTO_TEST`.

---

## 2. Deploy procedure

1. `cd /home/nick/zanko`, then `git status`. Leave files that aren't part of your change alone.
2. Bring in the change: merge the feature branch into `main` (`git merge --no-ff <branch>`). The owner's PC pushes feature branches based on an older `main`, so merge them; don't deploy a branch on its own.
3. **Back up the database** before any migration:
   `node -e "const D=require('better-sqlite3');new D('/home/nick/zanko-data/zanko.db').backup('/home/nick/zanko-data/backups/zanko-pre-<topic>-<date>.db')"`
   (the `sqlite3` CLI is not installed). If `.env` changes, copy it to `backups/` too.
4. Run `npm ci` only if `package-lock.json` changed, and `npm run db:deploy` if `prisma/` changed.
5. `npm run build`.
6. `sudo systemctl restart zanko`, then check that `systemctl is-active zanko` is `active` and that `https://zanko.uz/uz`, `/uz/checkout` and `/admin/login` return 200.
7. Push `main` to GitHub only when the owner asks, after checking the commits contain no keys (`git log -p origin/main..main | grep -c <key prefix>` = 0).

Tests before merging: `npx vitest run` (all) and `npx tsc --noEmit`.

---

## 3. Adding products

### 3.1 From an anker.com (US) product page — built-in importer
- Admin ▸ Import takes a URL like `https://www.anker.com/products/<handle>`. It reads title, gallery, key features, overview banners (including the newer Amazon "A+" image blocks), specs, FAQ, variants and the list price. Products are created as **DRAFT** with price 0 and stock 0, then translated.
- Only US anker.com pages parse. Regional pages (`/uk/`, `/ca/`, `/au/`), soundcore.com, ankersolix.com and eufy.com do not.

### 3.2 Batch import (used 2026-11-26)
Tooling is in `/home/nick/zanko-data/import-2026-11-26/`:
- `run.mts` imports anker.com URLs plus JSON product files (`json/`, or `json-sc/` with `--sc`). Without `--write` it is a dry run.
- `translate.mts` translates the imported products into uz and ru (Claude Haiku 5.5). It reads `imported.json` or `sc-imported.json`.
- `soundcore-brief.md` is the research brief for helper agents that put product JSON together from official pages (soundcore, regional Anker sites, support pages, manuals).

Run everything from `/home/nick/zanko` with the env loaded: `set -a && . ./.env && set +a && npx tsx <script>`.

**Rules used:**
- **Price:** official list price (MSRP, not the sale price) × the Central Bank of Uzbekistan rate for that day (`https://cbu.uz/uz/arkhiv-kursov-valyut/json/`), rounded **up** to the next 1,000 UZS. Use the USD price when there is one; otherwise the regional price in its own currency (GBP, EUR, CAD, AUD).
- **Stock:** 0 for new products.
- **Power stations:** use the 220–240 V (EU/UK) specs, never the US 120 V ones.
- **Facts:** only from official pages. Note uncertain points in the JSON file's `notes`.
- If a product name fits several models, ask the owner before importing.

**After importing:**
1. Translate (`translate.mts`).
2. Refresh the SEO titles from the translated text. Titles generated before translation stay English:
   `autoFillAllSeo({ overwrite: true, ids })` from `src/lib/admin/seo.ts`.
3. The owner publishes (bulk publish in admin).

**Gotchas:**
- From this server, `www.soundcore.com` redirects to its French site. `us.soundcore.com/products/<handle>.js` or the cookie `nf_country=US` gives the US page.
- Anker's stores rate-limit fast scrapers (HTTP 429). Leave about 4 seconds between requests.
- Prisma stores JSON columns as **text**. In raw SQL use `json(...)`, never `jsonb(...)`.

---

## 4. Translation

- **Text** (titles, descriptions, specs, FAQ, variants) uses Claude Haiku 5.5 through `ANTHROPIC_API_KEY`: the "Translate from EN" buttons in admin, the import flow, and `translateProduct()` in `src/lib/translate`.
- **Text inside product images** goes through OpenRouter (Haiku reads the text, an image model redraws it), about $0.024 per image per language. Run it per product with `npx tsx scripts/translate-images.ts <productId>`. It is not run automatically for batch imports.

---

## 5. Online card payments (Octo)

### How it works
1. At checkout the customer picks **Cash on delivery** (the default) or **Pay online by card** (Uzcard, Humo, Visa, Mastercard).
2. Card: the order is created as usual, then the customer is sent to Octo's hosted payment page. Card numbers never touch zanko.uz. The payment is one-step: money is taken at once.
3. Octo sends the customer back to `/<locale>/order/<number>?t=<token>`. The page asks Octo for the real status and shows **Paid**, **Waiting for payment** (with *Pay now*), **Payment failed** (with *Try again*) or **Refunded**.
   - Without the token, the order page shows only what it always did. The token is a secret part of the order link.
4. Octo also calls `POST /api/payments/octo/notify`; the same URL is set in the Octo merchant profile.
5. An order becomes **PAID only after the shop asks Octo for the status itself** and the amount matches. The callback body is never trusted.
6. The shop gets the usual new-order Telegram message ("Payment: card (Octo), awaiting payment"), then "Order #N paid by card …" when paid. There are alerts for an order paid **twice** and for a payment on a **cancelled** order.
7. The admin order page shows a Payment section (status, card, Octo payment id, every attempt, TEST marks) with **Check status** and **Refund** (full amount). The orders list shows a payment badge.

Code: `src/lib/payments/` (`octo.ts` API client, `service.ts` start/settle/refund, `view.ts` order-page data, `live.ts` Telegram wiring); routes `src/app/api/payments/octo/{notify,pay}`, `src/app/api/admin/orders/[id]/{refund,payment-check}`. Database: `Order.payMethod`, `Order.payToken`, table `Payment`.

### Settings (`.env`)
- `OCTO_SHOP_ID=43297`, `OCTO_SECRET=<key from the Octo cabinet>`.
- `OCTO_TEST=1` means test mode: the card option is hidden from customers and appears only on `https://zanko.uz/uz/checkout?octo_test=1`.
- `OCTO_TEST=0` means real payments for everyone.
- **To turn card payments off instantly:** remove `OCTO_SECRET` and restart. Cash keeps working.
- After changing the key, restart and check it with a test `prepare_payment` call.

### Current state (2026-11-26)
Live in **test mode**. Verified on the live site: checkout choice, redirect to Octo's test page, a forged callback ignored, the order-page token rule, Pay now / ORDER_CLOSED, and the card option hidden from real customers. **Not yet verified:** a successful payment, Octo's real callback, and a refund. Octo publishes no test cards.

### Go-live checklist (owner chose: test first)
1. Owner gets **test cards** from Octo support (message draft: `/home/nick/zanko-data/octo-support-message.md`, which also asks for Apple Pay / Google Pay and the callback signature key).
2. On `/uz/checkout?octo_test=1`, pay a test order with a test card and check:
   - the order page shows Paid
   - admin shows Paid with the card details
   - the Telegram "paid by card" message arrives
   - the Octo callback arrives (server log)
3. Refund it from admin and check that it shows Refunded. Try a declined card and check that the order page offers Try again.
4. Set `OCTO_TEST=0`, restart, and check that the normal checkout now shows the card option.
5. Apple Pay / Google Pay appear on Octo's page by themselves once Octo enables them for shop 43297. No code change needed.

### Known small items (deferred, from code review)
- Pending refunds are not re-checked, and the refund id has no attempt suffix.
- Two simultaneous "Pay now" clicks can collide (the second gets an error; nothing is corrupted).
- Transaction ids could collide if another database used the same Octo shop.
- The callback endpoint has no rate limit.
- Slow Octo can delay the order and admin pages (up to 20 s per check).
- An amount mismatch is only logged, with no Telegram alert.
- The product-manager role can refund.
- The Telegram Mini App main button still says "place order" when card is chosen.
- Fiscal receipts via Octo: not needed for now (owner), to be added later.

---

## 6. Change log

### 2026-11-26
- **Deploy:** merged `feat/traffic-dashboard` (admin Traffic section, migration `20261123000000_traffic_split`).
- **Translation:** set `ANTHROPIC_API_KEY`; text translation with Claude Haiku 5.5 works. An earlier key not tied to a workspace was rejected by Anthropic.
- **Importer fix** (`b44de0a`): reads anker.com A+ overview blocks, uses the list price, strips HTML from titles.
- **Anker batch:** 15 products live, uz/ru/en, prices from the CBU rate (11,987.89 UZS/USD), stock 0.
  - New category **Power stations** (SOLIX C300, C800X, 535).
  - The eufy scale went to Cameras & smart home; brands Anker and eufy.
  - The Prime 240 W 1.8 m cable (A88E2612) already existed as product #4.
  - 4 PowerConf items (C302, H700, S3, S330) were held back: no price or photos (Anker rate-limited the lookup).
- **soundcore batch:** 23 products (earbuds, headphones, speakers), translated, SEO refreshed, live. Brand soundcore.
  - R50i and R60i are sold in the US as P20i and P31i NC.
  - "360 sound" = Motion 300 (owner's choice).
  - Boom 2 SE is priced from the UK.
- **Sony batch:** 8 products (#47–54): WF-1000XM5, WF-1000XM6, WH-1000XM5, WH-1000XM6, WH-CH520, WH-CH530, WH-CH720N, WH-CH730N. New brand Sony. Translated, SEO refreshed, published by the owner from admin. Tooling and data in `/home/nick/zanko-data/import-sony-2026-11-26/`; backup `backups/zanko-pre-sony-2026-11-26.db`.
  - Sony's sites (electronics.sony.com, sony.co.uk and others) return 403 to this server and to WebFetch. Prices are Sony's official US launch prices from its press releases, not the current store price. Images come from sony.jp, scene7 and Sony's PR Newswire press photos, at low resolution (about 400–1280 px).
  - "WH-CH720" = WH-CH720N (there is no model without the N). Some colour SKUs are inferred from Sony's colour codes; each JSON file's `notes` field lists which.
  - WH-1000XM6 Sand Pink and Sandstone are 459.99 USD; the other colours are 449.99 USD.
- **Octo card payments** (plan `docs/plans/2026-11-26-octo-payments-xl.md`): built test-first, independent review with fixes, deployed in test mode, live test-mode round trip. Octo key rotated twice by the owner; notification URL set in the Octo profile.
- **GitHub:** server `main` pushed (`709de74`, then `263d4a9` with `scripts/translate-images.ts`).

---

## 7. Open items
- [ ] Owner: get Octo test cards; then run the go-live checklist (section 5).
- [ ] Owner: ask Octo to enable Apple Pay and Google Pay.
- [ ] PowerConf C302 / H700 / S3 / S330: find price and photos, then import.
- [ ] Optional: translate the English text inside new product images (OpenRouter, about $0.024 per image per language).
- [ ] Product #3 "Anker Prime Charger 250W" is in the Cables & hubs category (looks misfiled).
