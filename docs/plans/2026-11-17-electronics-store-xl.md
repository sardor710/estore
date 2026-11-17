# Electronics Store (Next.js, uz/ru/en, Admin, Anker Import) — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 5 | 9/9 tasks | 2026-11-17 | Owner: add ANTHROPIC_API_KEY + Telegram bot, verify live translation/notification |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Intent and why
The owner is launching a **real consumer-electronics shop in Uzbekistan**, focused on Anker-type gear. Today's project (`D:\projects\estore`) is a browser-only Vite + React 19 + Tailwind 4 demo cloned from Nomad: ~8 hard-coded products in `src/data/products.js`, no router, no server, no database, no admin, not a git repo. The shop must sell (order requests now, online payment later), be found on search engines in Uzbek and Russian, and be cheap to stock: paste an anker.com product link → get a full product page.

### Decisions made with the owner
| Topic | Decision |
|---|---|
| Purpose | Real shop; payment gateways (Payme/Click) connected **later** |
| Checkout now | **Order request**: customer enters name, phone, address; order saved to DB; listed in admin with status `new → confirmed → delivered / cancelled`; optional Telegram notification to owner; owner confirms by phone, cash/card on delivery. Order model must be ready for a later payment link. |
| Languages | **Uzbek (default), Russian, English**. Each has its own URL prefix `/uz`, `/ru`, `/en` with localized titles/meta, `hreflang`, sitemap. (Proposed by me, not objected to.) |
| Translation | **Machine translation + admin review**: on import (and on demand), server translates English text into uz/ru via an API; owner edits any field per language in admin. Browser-widget translation is rejected (not indexable). |
| Anker import | Admin pastes an anker.com product URL; server fetches page, parses embedded structured data (`__NEXT_DATA__` JSON + JSON-LD `Product`, verified present on a live product page 2026-11-17), creates a **draft** product with title, images, description, highlights, specs, variants/colors. Owner reviews, sets price, publishes. |
| Pricing | **Set manually in UZS** by owner before publishing; imported USD price stored only for reference. |
| Stack | **Approach 1: rebuild on Next.js** (see Approaches). |
| Variants | **Each variant has its own UZS price, SKU and stock count.** Out-of-stock variants show "Out of stock" and cannot be ordered. Stock decrements when the owner **confirms** an order (not on submit); cancelling a confirmed order restores stock. Order lines snapshot variant SKU, name and price. |
| Delivery | **Minimum order amount** set in admin; checkout blocked below it with a clear message. All orders at/above minimum ship **free nationwide**. Checkout asks for region (Tashkent city + 13 regions, list in uz/ru/en) and address. Shipping handled by the owner; no carrier integration. Order total = items (no delivery fee field now; model leaves room for one). |
| Existing Nomad products | Kept as **demo-only seed data** (`npm run seed:demo`), never part of the real catalog; production starts empty. |
| Specs translation (my call) | Spec group names and labels come from a **shared spec dictionary** translated once (uz/ru/en); values ("65W", "USB-C") stored untranslated; free-text values may be overridden per locale. |
| Ratings (my call) | **Not shown** until the shop has its own reviews; no `aggregateRating` in JSON-LD. Anker ratings are not imported. |
| Re-import (my call) | Importing a URL already imported does not duplicate: admin offers "Refresh from Anker" which updates images, specs and EN source text only; never overwrites price, stock, or translations marked reviewed. |

### Approaches considered
1. **Next.js full-stack rebuild — chosen.** App Router, server-rendered locale routes, admin + API + importer + translation in one app, Prisma ORM with SQLite (switchable to PostgreSQL). Existing components/Tailwind look ported. Trade-off: migration rather than add-on.
2. Keep Vite SPA + separate Node API + pre-rendering — rejected: two apps, hand-built i18n routing/SEO/admin, more fragile.
3. Hosted platform (Shopify/WooCommerce/Medusa) — rejected: discards current design, importer and uz/ru auto-translation become plugins, weak Payme/Click support, monthly fees.

### Storefront design (my proposals, owner may correct)
- **Top menu categories** (replacing Cases/Watch/Charging/Tracking & Wallets): Chargers · Power Banks · Audio (Earbuds, Headphones, Speakers) · Wearables (Smartwatches) · Cameras & Smart Home · Cables & Hubs · Cases & Accessories · Sale. Categories are DB records editable in admin (name per language, parent, order, page template).
- **Two product page templates**, chosen per category (overridable per product):
  - **Simple** (cases, cables, bands, accessories): today's `ProductPage.jsx` layout — gallery, colors, features + specs accordions.
  - **Detailed** (chargers, power banks, earbuds, headphones, speakers, watches, cameras, other devices): gallery + variant selector + price/stock + buy box; key-highlights strip (icons + short stats); long description in rich sections (heading, text, image); full specs table **grouped** (e.g. Battery, Charging, Audio, Connectivity, Physical); "What's in the box"; FAQ (optional); related products.
- **Product cards** on listings: image, name, short spec line (e.g. "65W · 3 ports · GaN"), price in UZS ("from" lowest variant price) with compare-at, badge, stock state, quick add (default variant).
- Cart drawer kept; checkout page added (order request form with region + address, min-order check, "free delivery" note). Prices formatted as UZS (e.g. `1 290 000 so'm`).

### Admin panel
- `/admin`, single owner login (credentials from env vars, hashed session cookie). Multi-user roles out of scope.
- Sections: Products (list, create, edit per-language fields, variants with price/SKU/stock, specs groups, images, template, publish/draft), Import from Anker, Categories, Orders (status changes drive stock), Translations (UI strings, spec dictionary, "missing translation" list), Settings (minimum order amount, Telegram bot token/chat id, translation API key status).
- Every translatable field has uz/ru/en tabs with a "machine-translate from EN" button and a "reviewed" flag.

### Indexing (SEO)
Server-rendered HTML per locale; `<html lang>`; localized `<title>`, meta description, Open Graph; `hreflang` alternates + `x-default`; `/sitemap.xml` listing all locale URLs; `robots.txt` (admin/api disallowed); Product JSON-LD with UZS price; localized slugs not required (one slug shared across locales).

- **Goal:** Turn the demo into a production-ready Next.js electronics shop with uz/ru/en indexable pages, detailed device pages, order-request checkout, an admin panel, machine translation with review, and a one-link Anker product importer — running locally and ready to deploy.
- **Deliverables:** Next.js app in this repo (replacing Vite app); Prisma schema + migrations + seed (categories, spec dictionary, settings) + separate demo seed (existing Nomad products); storefront (home, category, search, product simple/detailed, cart, checkout, thank-you); admin panel; Anker importer; translation service; Telegram notifier; sitemap/robots/hreflang; tests; README with run/deploy steps and env vars.
- **Constraints:** Windows dev machine, Node 24. Keep the current visual style (Tailwind, neutral palette). Secrets only in `.env` (never committed). Importer runs server-side only. Must run with `npm run dev` on localhost without paid services (translation and Telegram degrade gracefully when keys absent — shown clearly in admin, never silently faked).
- **Non-goals:** Online payments (later); customer accounts/login; multi-admin roles; inventory sync with Anker; importing from sites other than anker.com; production hosting setup (README covers it, not done); localized URL slugs.
- **Anti-goals:** English-only HTML with client-side translation; scraper that fakes success when parsing fails; admin reachable without login.
- **Assumptions:** Owner is entitled to reuse Anker content (reseller). Product images are hot-linked from Anker CDN initially (option to download later). One currency (UZS).
- **Open questions:** Translation provider (default proposal: Claude API — handles Uzbek well; provider behind an interface so Google/DeepL can be swapped). Hosting target (affects SQLite vs Postgres at deploy time only).

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | App builds and type/lint checks pass | auto | `npm run build` |
| A2 | Unit/integration tests pass (cart, pricing format, i18n fallback, importer parser on saved Anker fixture, order creation) | auto | `npm test` |
| A3 | `/uz`, `/ru`, `/en` home, category and product pages return server-rendered HTML containing localized title, `lang`, and `hreflang` links | auto | `curl` checks in test script |
| A4 | `/sitemap.xml` lists every published product × 3 locales; `robots.txt` disallows `/admin` and `/api` | auto | `curl` |
| A5 | Device categories render the detailed template (grouped specs, highlights, in-the-box); accessories render the simple template | manual | browser |
| A6 | Pasting a live anker.com product URL in admin creates a draft with title, ≥3 images, description, grouped specs, variants; parse failure shows explicit error | manual + auto (fixture) | admin UI + test |
| A7 | With translation key set, import produces uz/ru text; without key, admin shows "translation not configured" and fields stay EN-fallback | manual | admin UI |
| A8 | Checkout creates an order visible in admin; status can be changed; Telegram message sent when configured | manual + auto | browser + test |
| A9 | `/admin` and admin APIs reject unauthenticated requests | auto | `curl` → 401/redirect |
| A10 | Language switcher keeps the current page; UZS prices formatted | manual | browser |
| A11 | Cart below minimum order amount cannot be submitted (UI and API); at/above it shows free delivery | auto | test |
| A12 | Confirming an order decrements variant stock; cancelling a confirmed order restores it; out-of-stock variant cannot be added/ordered | auto | test |
| A13 | Demo products load only via `npm run seed:demo`; a fresh DB has an empty catalog | auto | test |

Manual spot checks: mobile width (375px) home + product page; Uzbek text with `oʻ`/`gʻ` renders correctly; import a power bank, a pair of earbuds and a charger.

## 3. Anti-drift
- **Primary objective:** an owner can stock and sell real products in uz/ru that search engines can index, with device pages rich enough to sell electronics.
- **Proxy signals (not success by themselves):** build passes; importer works on one saved fixture only; pages look right in English only; translation "works" because EN fallback shows.
- **Intended scope:** this repo; storefront, admin, importer, i18n, orders. Not payments, not hosting.
- **Completion target:** full delivery, running on localhost.

---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite demo with a Next.js full-stack shop: uz/ru/en SSR storefront, simple/detailed product templates, order-request checkout with variant stock, admin panel, Claude-based translation with review, and an anker.com importer.

**Architecture:** One Next.js App Router app. Storefront under `src/app/[locale]` (next-intl routing, `uz` default); admin under `src/app/admin` (English UI, my call for v1) protected by middleware + signed cookie; domain logic in plain TS modules under `src/lib` (unit-tested with Vitest against a test SQLite DB); Prisma + SQLite. Translatable fields are JSON `{uz,ru,en}` columns.

**Tech Stack:** Next.js (latest stable at install, App Router, TypeScript), React 19, Tailwind 4 (`@tailwindcss/postcss`), next-intl, Prisma + SQLite, jose (session JWT), cheerio (importer), `@anthropic-ai/sdk` (model `claude-haiku-5-5`), Vitest, lucide-react.

**Spec:** sections 1–3 above.

## Global Constraints
- Locales exactly `uz` (default), `ru`, `en`; every public URL is prefixed; `/` redirects to `/uz`.
- Money is integer UZS everywhere (no floats); USD only in `Product.sourcePriceUsd` for reference.
- Price shown to customers / used in orders always comes from the DB variant, never from the client.
- Secrets only in `.env` (gitignored); `.env.example` lists `DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `SITE_URL`.
- Missing optional service (translation key, Telegram) → explicit "not configured" state, never a fake success.
- Visual style: keep current neutral Tailwind look (fonts, `rounded-full` pills, neutral-900 accents) from the Vite app.
- Windows-compatible npm scripts (no `rm -rf`, no `&&`-dependent env vars; use `cross-env` if needed).
- Git: `git init` + baseline commit of the current Vite app in Task 1 (local only, never pushed) so every wave can be rolled back; one local commit per task.

## Review Focus
1. Pasted URL variants: `https://www.anker.com/products/x?variant=1`, `anker.com/uk/products/x`, `https://uk.anker.com/...`, a collection URL, a 404 → only `anker.com`/`www.anker.com` + `/products/<handle>` accepted (query stripped); everything else → explicit `ImportError` code. (Task 5 test)
2. Tampered/stale cart: client sends wrong price, qty ≤ 0, or a deleted/unpublished variant → server re-prices from DB and rejects with `INVALID`/`OUT_OF_STOCK`. (Task 6 test)
3. Two orders confirmed for the last unit → second confirm fails `INSUFFICIENT_STOCK`, stock never negative. (Task 6 test)
4. Locale missing for a field → fallback order requested locale → `en` → `uz` → first non-empty; never empty title or "undefined". (Task 1 test)
5. Phone input `+998 90 123-45-67`, `901234567`, `998901234567` → normalized `+998901234567`; anything else rejected. (Task 6 test)

## File structure
```
prisma/schema.prisma, prisma/seed.ts, prisma/seed-demo.ts, prisma/demo-data.ts
src/middleware.ts                      next-intl routing + admin guard
src/i18n/{routing.ts,request.ts}       next-intl config; messages merged with DB UiString overrides
messages/{uz,ru,en}.json               UI strings
src/lib/db.ts  money.ts  localized.ts  settings.ts  phone.ts
src/lib/catalog.ts                     storefront queries + template resolution
src/lib/cart/{cart.ts,useCart.ts}      pure cart ops + client hook
src/lib/orders.ts  telegram.ts  auth.ts  seo.ts
src/lib/translate/{index.ts,claude.ts,apply.ts}
src/lib/importer/{anker-parse.ts,anker.ts}
src/components/store/*                 Navbar, ProductCard, Gallery, SimpleProduct, DetailedProduct, SpecTable, CartDrawer, LangSwitcher, Footer
src/components/admin/*                 L10nField, VariantEditor, SpecEditor, ...
src/app/[locale]/{layout,page}.tsx, c/[slug], p/[slug], search, sale, checkout, order/[number]
src/app/admin/{login,products,products/[id],import,categories,orders,orders/[id],translations,settings}
src/app/api/orders/route.ts, src/app/api/admin/**    (JSON endpoints used by admin + tests)
src/app/{sitemap.ts,robots.ts}
tests/**  (vitest; tests/setup.ts pushes schema to file:./test.db and truncates per test)
tests/fixtures/anker-a120f.html        saved live page (2026-11-17)
scripts/smoke.mjs                      HTTP checks for A3, A4, A9 against a running server
```

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Foundation | Next.js app boots, DB schema, i18n routing, core libs | lead direct + `superpowers:test-driven-development` (owner) | root config, `prisma/`, `src/lib/{db,money,localized,settings}.ts`, `src/i18n`, `messages/`, `src/middleware.ts` | – |
| M2 Storefront | Home, category, search, sale, product pages (simple + detailed), nav, lang switch | `frontend-developer` (owner) | `src/app/[locale]/` (except checkout/order), `src/components/store/`, `src/lib/catalog.ts` | M1 |
| M5 Importer + translation | Anker parser/importer, translator, apply-translations | `backend-architect` (owner), `claude-api` (support), TDD | `src/lib/importer/`, `src/lib/translate/`, `tests/fixtures/` | M1 |
| M3 Cart, checkout, orders | Cart, checkout, order creation, stock on status change, Telegram | `backend-architect` (owner), TDD | `src/lib/{cart,orders,telegram,phone}*`, `src/app/[locale]/{checkout,order}`, `src/app/api/orders`, `CartDrawer` | M2 |
| M6 SEO | Metadata, hreflang, sitemap, robots, JSON-LD | lead direct (owner), `seo-specialist` (verifier) | `src/lib/seo.ts`, `src/app/{sitemap,robots}.ts`, `generateMetadata` in M2 pages | M2 |
| M4 Admin | Auth + all admin sections wired to M3/M5 | `frontend-developer` (owner), TDD for auth | `src/lib/auth.ts`, `src/app/admin/`, `src/app/api/admin/`, `src/components/admin/` | M3, M5 |
| M7 QA + cleanup | Smoke script, browser QA, review, remove Vite leftovers, README | `evidence-collector` + `code-reviewer` (verifiers), `superpowers:verification-before-completion` | `scripts/`, `README.md`, deletions of old Vite files | all |

Gaps: none. Known risk: Anker can change its page format at any time; importer fails loudly with `PARSE_FAILED` and the fixture test pins today's format.

Waves (≤2 parallel, disjoint write scopes):
- Wave 1: M1
- Wave 2: M2 ‖ M5
- Wave 3: M3 ‖ M6, then M5b (translation, Task 6)
- Wave 4: M4
- Wave 5: M7

## 5. Tasks

### Task 1 — M1 Foundation (wave 1)
**Files:** create `package.json` (rewrite), `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/{db,money,localized,settings}.ts`, `src/i18n/{routing,request}.ts`, `messages/*.json`, `src/middleware.ts`, `src/app/[locale]/layout.tsx` (placeholder page), `src/app/globals.css` (from `src/index.css`); move old app to `legacy/` (deleted in Task 9). Tests: `tests/lib/{money,localized,settings}.test.ts`, `tests/setup.ts`.

**Interfaces – Produces:**
- `prisma` client singleton from `src/lib/db.ts`.
- `locales = ['uz','ru','en'] as const`, `type Locale`, `defaultLocale = 'uz'` in `src/i18n/routing.ts`.
- `type L10n = Partial<Record<Locale,string>>`; `t(field: L10n | null | undefined, locale: Locale): string` (fallback per Review Focus 4, returns `''` only if all empty).
- `formatUzs(amount: number, locale: Locale): string` → uz `1 290 000 soʻm`, ru `1 290 000 сум`, en `1,290,000 UZS` (uz/ru group separator U+00A0).
- `getSettings(): Promise<{minOrderUzs:number; telegramBotToken:string|null; telegramChatId:string|null}>`, `updateSettings(patch)`; defaults `minOrderUzs: 0`.
- Prisma models: `Category{id, slug@unique, parentId?, template: SIMPLE|DETAILED, sortOrder, name Json}`, `Product{id, slug@unique, categoryId, templateOverride?, status: DRAFT|PUBLISHED, brand, sourceUrl?@unique, sourcePriceUsd Float?, title, subtitle, shortSpec, descriptionHtml, sections, highlights, inTheBox, faq, specs, images, badge?, reviewed Json, isDemo Bool, timestamps}`, `Variant{id, productId, sku@unique, name Json, colorHex?, imageIndex Int?, priceUzs Int, compareAtUzs Int?, stock Int, sortOrder}`, `SpecLabel{key@unique, label Json}`, `Order{id, number Int@unique, status: NEW|CONFIRMED|DELIVERED|CANCELLED, name, phone, region, address, comment?, locale, totalUzs Int, paymentStatus default "UNPAID", paymentProvider?, createdAt}`, `OrderLine{id, orderId, variantId, sku, productTitle, variantName, priceUzs, qty}`, `Setting{key@id, value}`, `UiString{key@id, value Json}`. Enums as strings (SQLite).
  - `Product.specs` JSON shape: `[{group: string /*SpecLabel key*/, items: [{label: string /*SpecLabel key*/, value: string, valueL10n?: L10n}]}]`; `sections`: `[{heading: L10n, body: L10n, image?: string}]`; `highlights`: `[{icon?: string, title: L10n, value?: string}]`; `inTheBox`: `L10n[]`; `images`: `string[]`; `reviewed`: `{uz:boolean, ru:boolean}`.
- `prisma/seed.ts` seeds categories (slug → template): `chargers`D, `power-banks`D, `audio`(parent) with `earbuds`D `headphones`D `speakers`D, `wearables`(parent) with `smartwatches`D, `cameras-smart-home`D, `cables-hubs`S, `cases-accessories`S; names in uz/ru/en; settings defaults; no products.
- npm scripts: `dev`, `build`, `start`, `test` (vitest run), `db:push`, `seed`, `seed:demo`.

- [x] (done by lead: 3e70ede, branch feature/electronics-store) `git init`, add `.gitignore` (node_modules, .next, *.db, .env, outputs/, .vibeskills/), baseline commit of current tree — verify: `git log --oneline` shows 1 commit
- [x] Move `src/`, `index.html`, `vite.config.js` to `legacy/`; install Next.js stack; scaffold files above — verify: `npm run dev` → `curl -sI localhost:3000/` shows `307` to `/uz`, `/uz` → 200
- [x] Write failing tests: `formatUzs(1290000,'uz') === '1 290 000 soʻm'`, en `'1,290,000 UZS'`, `formatUzs(0,'ru') === '0 сум'`; `t({en:'A'},'uz')==='A'`, `t({uz:'',ru:'R'},'uz')==='R'`, `t(null,'ru')===''`; settings default `minOrderUzs===0`, update persists — verify: `npm test` FAIL
- [x] Implement libs + schema + seed — verify: `npm run db:push && npm run seed && npm test` PASS
- [x] Commit "feat: next.js foundation" — evidence: 219706a + fix 710a507 (matcher escaping); 20/20 tests, build OK, `/`→307 /uz, `/products`→307 /uz/products; review approved

### Task 2 — M2 Storefront (wave 2)
**Files:** `src/lib/catalog.ts`, `src/components/store/*`, `src/app/[locale]/{page,c/[slug]/page,p/[slug]/page,search/page,sale/page}.tsx`, `messages/*.json` (store keys); test `tests/lib/catalog.test.ts`.
**Interfaces – Consumes:** Task 1 libs. **Produces:**
- `getNavCategories(): Promise<CategoryNode[]>` (tree, sorted); `getCategoryPage(slug, {sort?: 'new'|'price-asc'|'price-desc'})`; `getProductBySlug(slug, {includeDraft?:boolean})` (published only by default); `searchProducts(q: string, locale: Locale)` (matches title/shortSpec in any locale + SKU, case-insensitive); `getSaleProducts()` (any variant with `compareAtUzs > priceUzs`); `getRelated(productId, limit=4)`.
- `resolveTemplate(p: {templateOverride: string|null}, c: {template: string}): 'SIMPLE'|'DETAILED'`.
- `ProductCard` props `{product: CardProduct, locale}`; card shows "from" min variant price, compare-at, badge, `shortSpec`, out-of-stock state; quick-add uses the first in-stock variant via `useCart().add(variantId, 1)`. Task 2 creates `src/lib/cart/useCart.ts` as a stub with exactly Task 4's `useCart()` signature; Task 4 replaces its body.
- `DetailedProduct`: gallery, variant selector (color swatches / name chips), price + stock + add-to-cart, highlights strip, sections, `SpecTable` (groups with labels via `SpecLabel` dictionary + `t()`), in-the-box list, FAQ accordion, related. `SimpleProduct`: port of `legacy/src/pages/ProductPage.jsx` layout using the same data.
- Navbar: top level = root categories + "Sale"; parents show a dropdown of children; `LangSwitcher` links to the same path in other locales.
- [x] Failing tests: `resolveTemplate({templateOverride:null},{template:'DETAILED'})==='DETAILED'`, override `'SIMPLE'` wins; `getProductBySlug` hides DRAFT unless `includeDraft`; `searchProducts('B120FJZ1','uz')` finds by SKU; `searchProducts('zaryad','uz')` finds uz title; sale returns only discounted — verify: FAIL
- [x] Implement catalog + components + pages (port styles from `legacy/src/components`) — verify: `npm test` PASS; `npm run seed:demo` (stub OK here: demo seed written in this task from `legacy/src/data/products.js`, prices ×12 800 rounded to 1 000 UZS, `isDemo: true`, cases→`cases-accessories`, others→fitting category); browser: `/uz`, `/ru/c/chargers`, `/en/p/stand-one-max-4th-gen-silver` render, detailed vs simple correct (A5)
- [x] Commit "feat: storefront" — evidence: 79f8352 + fix 3c8df1b (sanitize-html allowlist, 13 sanitizer tests); 47/47 tests, build OK; curl /uz, /ru/c/chargers, /en/c/cases-accessories 200; Stand One Max detailed, case simple; review approved

### Task 3 — M5a Anker importer (wave 2, parallel with Task 2)
**Files:** `src/lib/importer/{anker-parse.ts,anker.ts}`, `tests/fixtures/anker-a120f.html` (copy of live `https://www.anker.com/products/a120f-100w-usb-c-gan-charger-battery-care` saved 2026-11-17), `tests/lib/importer.test.ts`.
**Interfaces – Produces:**
- `type ImportedProduct = {sourceUrl, handle, title, descriptionHtml, images: string[], highlights: {title:string; body:string}[], inTheBox: string[], specGroups: {group:string; items:{label:string; value:string}[]}[], variants: {sku:string; name:string; priceUsd:number; imageUrl?:string; available:boolean}[]}`
- `class ImportError extends Error { code: 'BAD_URL'|'FETCH_FAILED'|'NOT_FOUND'|'PARSE_FAILED' }`
- `normalizeAnkerUrl(input: string): string` (Review Focus 1; returns `https://www.anker.com/products/<handle>`).
- `parseAnkerHtml(html: string, url: string): ImportedProduct` — source paths verified on the fixture: `__NEXT_DATA__.props.pageProps.product` (`title`, `handle`, `descriptionHtml`, `images`, `variants[].{sku,price,image,availableForSale,options[0].values[0].label}`); highlights from `product.metafields.productInfos.key_features.list[] {key,value}` excluding keys in `pageProps.metafields.infos.key_features_hideKey` ("What You Get" → `inTheBox` split by line/`·`); spec groups from the rendered Specs section HTML (cheerio; implementer derives selectors from fixture); JSON-LD `Product.image` as image fallback. Throws `PARSE_FAILED` if title or variants missing.
- `importAnkerProduct(url): Promise<{productId: string; created: boolean}>` — fetch with browser UA, 15 s timeout; existing `sourceUrl` → `{created:false}` without changes; new → DRAFT product, category = `null`-safe default `chargers` unless admin picks (param `categoryId?`), variants with `priceUzs: 0`, `stock: 0`, slug = handle; upsert `SpecLabel` keys `slugify(label)` with `{en}`.
- `refreshAnkerProduct(productId): Promise<void>` — updates images, specs, highlights/sections EN text, adds new variants (price 0); never touches `priceUzs`, `stock`, or uz/ru text where `reviewed[locale]`.
- [x] Failing tests on fixture: title `'Anker Laptop Charger Pro'`, `variants.length===2`, `variants[0].sku==='B120FJZ1'`, `variants[0].priceUsd===59.99`, `images.length>=3`, `highlights.length>=3` and first title starts `'Extend Your Laptop Battery Lifespan'`, `specGroups` has ≥1 group with ≥3 items; `parseAnkerHtml('<html></html>',u)` throws `PARSE_FAILED`; URL cases from Review Focus 1; import twice → second `created:false`; refresh keeps `priceUzs` — verify: FAIL
- [x] Implement — verify: `npm test` PASS; live run `npx tsx scripts/try-import.ts <3 urls: a charger, a power bank, earbuds>` prints titles/variant counts (A6 live part)
- [x] Commit "feat: anker importer" — evidence: 80af7cf + fix 449886d (refresh keeps uz/ru); 65/65 tests, build OK; live imports: A120F charger, Prime 26K power bank, AeroClip earbuds (soundcore page has no specs/highlights → manual); 404→NOT_FOUND, collection→BAD_URL; review approved

### Task 4 — M3 Cart, checkout, orders (wave 3)
**Files:** `src/lib/cart/{cart.ts,useCart.ts}` (replace stub), `src/lib/{orders,telegram,phone}.ts`, `src/components/store/CartDrawer.tsx`, `src/app/[locale]/{checkout/page.tsx,order/[number]/page.tsx}`, `src/app/api/orders/route.ts`, `src/lib/regions.ts` (14 regions, L10n names); tests `tests/lib/{cart,orders,phone}.test.ts`.
**Interfaces – Produces:**
- `type CartLine = {variantId: string; qty: number}`; pure `addItem(lines, variantId, qty)`, `setQty(lines, variantId, qty)` (qty ≤ 0 removes), `removeItem(lines, variantId)`; `useCart(): {lines, add, setQty, remove, clear, count}` persisted in localStorage `estore.cart.v1`; drawer fetches current prices from `POST /api/cart/quote` (`{lines}` → `{items:[{variantId,title,variantName,image,priceUzs,stock}], totalUzs, minOrderUzs}`).
- `normalizeUzPhone(input: string): string | null` (Review Focus 5).
- `createOrder(input: {lines: CartLine[]; name; phone; region; address; comment?; locale}): Promise<{ok:true; number:number} | {ok:false; error:'INVALID'|'OUT_OF_STOCK'|'BELOW_MIN'}>` — re-prices from DB, rejects unpublished/missing variants and qty > stock, checks `total >= minOrderUzs`, snapshots lines, `number` = max+1 starting 1001; then `notifyNewOrder` (fire-and-forget).
- `setOrderStatus(orderId, to): Promise<{ok:true}|{ok:false; error:'INSUFFICIENT_STOCK'|'BAD_TRANSITION'}>` — allowed: NEW→CONFIRMED|CANCELLED, CONFIRMED→DELIVERED|CANCELLED; NEW→CONFIRMED decrements stock in one transaction with conditional update (`stock >= qty`), CONFIRMED→CANCELLED restores.
- `notifyNewOrder(order): Promise<'sent'|'skipped'|'failed'>` (skipped when token/chat id unset; never throws).
- `POST /api/orders` → 201 `{number}` | 400 `{error}`; `POST /api/cart/quote`.
- [x] Failing tests: cart ops; phone cases; createOrder: below min → `BELOW_MIN` (A11), tampered price ignored (total from DB), qty>stock → `OUT_OF_STOCK`, unpublished variant → `INVALID`; status: confirm decrements, cancel restores, double confirm on last unit → `INSUFFICIENT_STOCK` (A12), DELIVERED→NEW → `BAD_TRANSITION`; telegram skipped without config — verify: FAIL
- [x] Implement libs, API, drawer, checkout (form, region select, min-order banner, "Free delivery across Uzbekistan"), thank-you page with order number — verify: `npm test` PASS; browser: place order on `/uz/checkout` → redirected to `/uz/order/1001` (A8 part)
- [x] Commit "feat: cart, checkout, orders" — evidence: 8e7127b; 109/109 tests, build OK; live: BELOW_MIN 400, order 201 #1001, OOS/INVALID 400, checkout + thank-you 200, browser submit → /uz/order/1002; review approved (7 minors deferred)

### Task 5 — M6 SEO (wave 3, parallel with Task 4)
**Files:** `src/lib/seo.ts`, `src/app/{sitemap,robots}.ts`, `generateMetadata` in `src/app/[locale]/{page,c/[slug]/page,p/[slug]/page}.tsx`; test `tests/lib/seo.test.ts`.
**Interfaces – Produces:** `alternatesFor(path: string): {canonical: string; languages: Record<'uz'|'ru'|'en'|'x-default', string>}` (absolute with `SITE_URL`, `x-default` → uz); `productJsonLd(product, variant, locale)` (Product + Offer, `priceCurrency:'UZS'`, availability from stock, no aggregateRating); sitemap = home + every category + every PUBLISHED non-demo product × 3 locales; robots disallows `/admin`, `/api`.
- [x] Failing tests: `alternatesFor('/p/x').languages.ru === SITE_URL+'/ru/p/x'`; JSON-LD has `priceCurrency 'UZS'` and no `aggregateRating`; sitemap excludes DRAFT and `isDemo` — verify: FAIL
- [x] Implement; `<html lang>` from locale — verify: `npm test` PASS; `curl -s localhost:3000/ru/c/chargers | grep -c hreflang` ≥ 4 (A3), `curl -s localhost:3000/sitemap.xml` (A4)
- [x] Commit "feat: seo" — evidence: 2185e7d + fix dae68b4 (metadataBase, absolute JSON-LD images, no empty offers); 119/119 tests, build OK; curl /ru/c/chargers hreflang uz/ru/en/x-default + canonical; sitemap with alternates; robots disallows /admin /api /*/checkout /*/order/; review approved

### Task 6 — M5b Translation (wave 3, after Task 3)
**Files:** `src/lib/translate/{index.ts,claude.ts,apply.ts}`; test `tests/lib/translate.test.ts`.
**Interfaces – Produces:**
- `interface Translator { translate(texts: string[], to: 'uz'|'ru'): Promise<string[]> }`; `getTranslator(): Translator | null` (null when `ANTHROPIC_API_KEY` unset); `ClaudeTranslator` uses `claude-haiku-5-5`, batches ≤ 40 strings per call, asks for a JSON array of equal length, keeps HTML tags, units, model numbers; Uzbek in Latin script with `ʻ` (U+02BB).
- `translateProduct(productId, opts?: {force?: boolean}): Promise<{status:'done'|'not_configured'; translated:number}>` fills uz/ru for title, subtitle, shortSpec, descriptionHtml, sections, highlights, inTheBox, faq, variant names, and missing `SpecLabel` uz/ru; skips a locale where `reviewed[locale]` unless `force`.
- `translateUiMissing(): Promise<...>` for empty `UiString` uz/ru.
- Import action (Task 7) calls `translateProduct` after `importAnkerProduct`.
- [x] Failing tests with a fake `Translator` (prefixes `[uz]`): fills uz/ru, leaves en; reviewed uz untouched; length-mismatch response → throws, nothing written; no key → `not_configured` (A7) — verify: FAIL
- [x] Implement (read `claude-api` skill first) — evidence: live run NOT done (no ANTHROPIC_API_KEY; script printed NOT CONFIGURED) — — verify: `npm test` PASS; with real key: `npx tsx scripts/try-translate.ts <productId>` prints uz/ru title
- [x] Commit "feat: translation" — evidence: 4293cb2 + fix a0fbb57 (ICU placeholder validation); 142/142 tests, build OK; review approved

Note on waves: Task 6 shares no files with Tasks 4/5 but depends on Task 3; run it in wave 3 after Task 4 when executing serially.

### Task 7 — M4 Admin (wave 4)
**Files:** `src/lib/auth.ts`, `src/middleware.ts` (add guard), `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/*`; tests `tests/lib/auth.test.ts`, `tests/api/admin-guard.test.ts`.
**Interfaces – Produces:** `createSession(user): Promise<string>` (jose HS256, 7 d, cookie `admin_session`, httpOnly, sameSite lax, secure in prod); `verifySession(token): Promise<boolean>`; `checkCredentials(user, pass)` (constant-time compare vs env); middleware: `/admin/*` (except `/admin/login`) → redirect to login, `/api/admin/*` → 401 JSON.
- Pages: **Orders** (list newest first, filter by status; detail with lines, customer, status buttons calling `setOrderStatus`, error shown on `INSUFFICIENT_STOCK`); **Products** (list with status, demo flag, missing-translation badges; editor with `L10nField` uz/ru/en tabs + "Translate from EN" + "Reviewed" toggle per locale, `VariantEditor` price/compare-at/SKU/stock/color, `SpecEditor` groups/items, images list (URLs, reorder), template override, category, Publish/Unpublish — publish blocked if any variant `priceUzs <= 0`); **Import** (URL box + category select → import → translate → redirect to editor; shows `ImportError` code text; existing URL → link to product + "Refresh from Anker"); **Categories** (names per locale, parent, order, template); **Translations** (UI strings table uz/ru/en editable, spec dictionary table, "Translate missing"); **Settings** (min order UZS, Telegram token/chat id + "Send test message", translation status "Configured / Not configured").
- [x] Failing tests: wrong password → no session; tampered token → false; `GET /api/admin/orders` without cookie → 401; publish with zero-price variant rejected — verify: FAIL
- [x] Implement — verify: `npm test` PASS; browser: login, import live Anker URL, edit uz text, set prices, publish, product visible on `/uz/p/<handle>`; confirm order from Task 4 → stock decremented (A6, A8, A12)
- [x] Commit "feat: admin panel" — evidence: f26529d + fix 16d08d6 (publish gate on edit, throttle hardening); 206/206 tests, build OK; browser walkthrough: login → live import → prices → uz edit → reviewed → publish → storefront order → confirm (stock 5→3) → cancel (→5); review (opus) approved

### Task 8 — M7 QA (wave 5)
**Files:** `scripts/smoke.mjs`, `README.md`.
- [x] `scripts/smoke.mjs BASE_URL` checks: `/`→307 `/uz`; `/uz`,`/ru`,`/en` 200 with `lang="uz|ru|en"` and 4 `hreflang` links; `/sitemap.xml` 200 contains `/ru/`; `/robots.txt` disallows `/admin`; `/admin` → redirect to login; `/api/admin/orders` → 401 — verify: `npm run build && npm start` then `node scripts/smoke.mjs http://localhost:3000` all PASS (A1, A3, A4, A9)
- [x] Browser QA (`evidence-collector`): 375 px home + detailed product, Uzbek `oʻ/gʻ`, language switch keeps path, UZS formatting, import 3 product types (charger, power bank, earbuds) — screenshots noted in Result (A5, A6, A10)
- [x] `code-reviewer` + `superpowers:requesting-code-review` on full diff; fix confirmed issues (one repair pass)
- [x] README: setup, env vars, `db:push`/`seed`/`seed:demo`, admin login, adding Anthropic key + Telegram, deploy notes (SQLite on VPS vs Postgres)
- [x] Commit "docs: readme, smoke tests" — evidence: 4c38dae; smoke 10/10. Browser QA (evidence-collector): 8/8 PASS. Final whole-branch review (opus): 6 must-fix + 6 QA/owner items fixed in ba3b9a3..08a2f37, re-review approved

### Task 9 — Cleanup (wave 5)
- [x] Delete `legacy/`, `dist/`, `.vite/`, `src/compiled.css` leftovers (only these paths) after confirming nothing imports them — verify: `npm run build && npm test` PASS
- [x] Fill Result + Handoff; commit "chore: remove vite app" — evidence: 3f7552a (legacy/, .vite/ removed)

## 6. Verification
- `npm test` (Vitest, all suites)
- `npm run build`
- `node scripts/smoke.mjs http://localhost:3000` against `npm start`
- Manual: acceptance A5, A6 (live import ×3), A7 (with and without key), A8 (Telegram if configured), A10; spot checks list in section 2

## 7. Rollback
Baseline commit (Task 1) holds the original Vite app; each task is one commit — `git revert <task commit>` or `git reset --hard <baseline>` (only with owner OK). DB is a local SQLite file (`prisma/dev.db`), recreate with `npm run db:push && npm run seed`. Pre-existing `outputs/`, `.vibeskills/`, `docs/requirements`, `docs/plans/2026-10-10-*` are not ours: never modified or deleted.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-17: requirement (sections 1–3) approved by owner.
- 2026-11-17: plan approved; execution = subagent-driven. Git baseline 3e70ede on main, work on branch feature/electronics-store.

## Result
Delivered: Next.js 16 shop on branch feature/electronics-store (3e70ede..08a2f37, 23 commits): uz/ru/en SSR storefront with new category menu, simple + detailed product pages (grouped specs, highlights, in-the-box), cart + order-request checkout (min order, free delivery, 14 regions), variant price/SKU/stock with stock on confirm, Telegram alerts, anker.com importer, Claude translation with reviewed flags, SEO (hreflang, sitemap, robots, JSON-LD), admin panel (orders, products, import, categories, translations, settings), Prisma migrations, README, smoke script.
Checks run (2026-11-17, by lead): npm test → 21 files / 233 tests passed; npm run build → OK; npm start + npm run smoke → 10/10 PASS. Browser QA 8/8 PASS (375px + desktop, oʻ/gʻ, lang switch, UZS format, cart/checkout, admin confirm/cancel stock, import, auth). Live imports verified: A120F charger, Prime 26K power bank, AeroClip earbuds, A1695 power bank.
Gaps: A7 live translation NOT verified (no ANTHROPIC_API_KEY; only "not configured" path exercised). A8 Telegram live send NOT verified (no bot configured; mocked in tests). Soundcore-branded pages import without specs/highlights. Demo products have English-only text.
Follow-ups (deferred, see rulings): spec-label error makes next save stale; translation retry budget; streaming body-size cap; editor typing during save; quote endpoint unthrottled; online payments (Payme/Click); AGENTS.md (Next-generated, untracked) — owner decides.

### Rulings made during execution
- Ruling: work on branch feature/electronics-store in the main checkout, no separate worktree — repo was created this session by the approved plan (Task 1 git step), only one implementer runs at a time — cost if wrong: none, branch is local.
- Ruling: T2 adds the `seed:demo` script and `prisma/seed-demo.ts`; T1 omits it — avoids a broken script — cost: none
- Ruling: T1 creates a minimal `src/app/[locale]/page.tsx`; T2 replaces it
- Ruling: vitest `fileParallelism: false` so DB tests don't collide — cost: slower tests
- Ruling: T2 Navbar shows cart count + button that opens nothing yet; T4 adds `CartDrawer` and wires it
- Ruling: signature `importAnkerProduct(url: string, opts?: {categoryId?: string})`
- Ruling: accept Prisma 7.10.1 pin (npm latest was 8.0 RC) — stable over RC — cost if wrong: later upgrade.
- Ruling: keep src/middleware.ts though Next 16 prefers proxy.ts — brief mandated, still works; Task 7 may rename — cost: deprecation warning.
- Ruling: global-setup deletes test.db + db push instead of --force-reset — equivalent effect — none.
- Ruling: leave Next-generated AGENTS.md untracked for now; decide at cleanup.
- Ruling: run Tasks 2 and 3 serially, not in parallel — same checkout and shared test.db would collide; SDD forbids parallel implementers — cost: longer wall-clock.
- Ruling: regex sanitizeHtml is not acceptable for imported HTML — Task 3 will add a vetted sanitizer (sanitize-html) applied on import, storefront render keeps sanitizing via that lib — cost: one dep.
- Ruling: plain <img> accepted (remote CDN hosts vary) — cost: no Next image optimization.
- Ruling: buy-box trust copy kept; flag to owner at delivery.
- Ruling: sanitizer fix moves into Task 2 now (supersedes earlier "Task 3 adds sanitizer" ruling); Task 3 must call the same sanitizeHtml on import.
- Ruling: ids are Int (Task 1 schema) — importAnkerProduct returns productId:number, categoryId?:number; Tasks 6/7 use numbers — cost: none.
- Ruling: refresh updates EN only; uz/ru refresh is Task 6's translateProduct (skips reviewed) — consistent with spec.
- Ruling: soundcore-branded pages lacking specs import partially — acceptable, tell owner; soundcore.com out of scope.
- Ruling: Task 6 translateProduct overwrites ALL uz/ru text for unreviewed locales (not only empty fields) so stale translations kept by refresh get replaced — cost: re-translation API calls.
- Ruling: Task 4 uses numeric ids (variantId: number) since schema ids are Int; Task 2's useCart stub signature types change from string to number accordingly.
- Task 5 report: DONE_WITH_CONCERNS (2185e7d). Ruling: hrefLang camelCase fine (HTML case-insensitive); smoke script greps case-insensitively.
- Ruling: Task 7 implements UiString override merge in src/i18n/request.ts (Task 1 left file-only loading) — otherwise admin Translations page edits would have no effect.
- Ruling: Task 8's code-review step = the SDD final whole-branch review (opus) run after Task 9; Task 8 smoke+README and Task 9 cleanup dispatched to one implementer; browser QA by a separate evidence-collector verifier — cost: none, same coverage, fewer dispatches.
- Ruling: final fix wave also includes 3 cheap owner-facing extras: hide isDemo products from storefront when NODE_ENV=production (spec: demo never in real catalog); checkout "Edit cart" opens drawer; Telegram notify via next/server after() — cost: small scope growth.
- Ruling: fix wave includes importer image scoping, gallery onError hide, duplicate publish message, login input labels.
- Ruling: accept order throttle 30/10min shared bucket without TRUST_PROXY (5/10min per IP behind proxy) — prevents one spammer from blocking all customers vs. a shared low cap — cost if wrong: more spam possible without proxy.
- Final: parked — spec-label failure after product commit makes next save STALE — Ruling: real, deferred; admin reloads; fix = validate labels before updateProduct — cost: lost unsaved edits in rare label-error case.
- Final: parked — translation split retries have no total call budget — Ruling: real, deferred; depth-capped; add a budget later — cost: possible API spend on systematic failure.
- Final: parked — body cap checked after full read — Ruling: deferred; reverse proxy body limit in deploy — cost: memory on huge chunked bodies.
- Final: parked — typing during save overwritten; order limiter global list unused — Ruling: deferred polish.

## Handoff
All 9 tasks done and reviewed; final review fixes merged on branch feature/electronics-store (HEAD 08a2f37); main still holds the original Vite app (3e70ede). Nothing pushed. Next: owner adds ANTHROPIC_API_KEY and a Telegram bot in .env/admin Settings and verifies A7/A8 live, then decides merge to main. Dev: npm run dev → http://localhost:3000 (admin at /admin, credentials in gitignored .env). Production: npm run db:deploy && npm run build && npm start; set SITE_URL, TRUST_PROXY=1 behind a proxy.
