# Advanced Admin Panel (Dashboard, Promotions, Clients, Users & Roles, Blog, CKEditor, Product Tools) — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Draft – plan | – | 0/9 tasks | 2026-11-17 | Await plan approval, then Wave 1 (M1) on branch `feature/advanced-admin` |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Intent and why
The shop (see `2026-11-17-electronics-store-xl.md`) now has a basic admin with **one owner login from `.env`**. The owner wants to run the business from the admin with a small team: see how the shop performs, run discounts, know their customers, publish a blog, and manage the catalog faster. Three kinds of staff will log in: **full admins**, **product managers** (everything except managing admin users), and **blog editors** (blog only).

### What exists today (recon, 2026-11-17)
- Next.js 16 App Router, Prisma 7 + SQLite, next-intl (uz default, ru, en), Tailwind 4, lucide icons, jose JWT session cookie, sanitize-html.
- Admin at `src/app/admin/(panel)/*`: Orders, Products (+ edit), Import (Anker), Categories, Translations, Settings. Auth: `src/lib/auth.ts` (single `ADMIN_USER`/`ADMIN_PASSWORD`), `requireAdmin()` in `src/lib/admin/session.ts`.
- No customer accounts, no visit tracking, no blog, no file uploads (product images are remote URLs). `Product.brand` is a plain string. Prices: `Variant.priceUzs` + `compareAtUzs`; order lines snapshot price.

### Decisions made with the owner
| Topic | Decision |
|---|---|
| Roles | **Full admin** (everything incl. users + settings) · **Product manager** (everything except admin-user management) · **Blog editor** (blog only + own password). |
| Promo targets | A promotion targets **products, categories, or brands**; discount **percent or fixed UZS amount**. |
| Promo schedule | Each promo has **start/end dates** (auto on/off) **and a manual on/off switch**. Active = switch on AND now within dates. |
| Editor | **CKEditor 5** for blog content and product descriptions. |
| Everything else | Owner: "manage how it will be" — the rows below marked *(my call)* are mine. |

### My calls (owner may correct)
| Topic | Decision |
|---|---|
| Overlapping promos *(my call)* | **Best discount for the customer wins; promos never stack.** Discount is computed per variant; price never goes below 1 000 so'm and a fixed amount never exceeds the price. Variant's own `compareAtUzs` is ignored while a promo applies (promo shows original price struck through). |
| Promo pricing mechanics *(my call)* | Effective price is **computed at read time** by one pure function used by storefront listings, product page, cart, and the order API (server re-computes; client price never trusted). Order lines additionally snapshot original price, discount and promo id. Variant prices in DB are never rewritten. |
| Brands *(my call)* | New **Brand** table (name, slug, optional logo URL, sort); existing `Product.brand` strings migrated into it; product edit uses a brand picker. Needed for brand promos and filters. Storefront brand pages are out of scope. |
| Logins *(my call)* | Each staff member logs in with **email + password** (scrypt hash, min 10 chars). Session JWT carries user id + role; role re-checked from DB on every request (disabled user is logged out immediately). The current `.env` credentials **bootstrap the first full admin** if no users exist. Only full admins create/disable users, change roles, reset passwords; the last active full admin cannot be disabled or demoted. Login rate-limited. |
| Settings & log access *(my call)* | Product managers can edit **business settings** (minimum order, VIP threshold, low-stock threshold) but **not integration secrets** (Telegram token/chat id, API key status) — those, plus Users and the Activity log, are full-admin only. |
| Lock-out recovery *(my call)* | `.env` credentials only bootstrap when no users exist (login identifier may be an email or plain username). Recovery: CLI `npm run admin:reset -- <email>` creates or resets a full admin from the server shell. No web backdoor. |
| Permissions *(my call)* | Enforced **server-side** on every admin page, server action and API route (menu hiding is cosmetic only). Unauthorized → 403 page. |
| Activity log *(my call)* | Records who created/changed/deleted products, promos, posts, users, order statuses, settings; full admins can browse it with filters. |
| Visits *(my call)* | **First-party tracking, no third-party scripts**: storefront sends a tiny beacon per page view → stored with day, path, locale, referrer host, device type, anonymous daily visitor hash (IP+UA+daily salt, not reversible, no cookie). Bots/admin/api excluded. Raw rows kept 180 days, daily aggregates kept forever. |
| Dashboard *(my call)* | Date range (today, 7d, 30d, 90d, custom) with change vs previous period. KPIs: revenue, orders, average order value, visitors, page views, conversion (orders ÷ visitors). Charts: revenue & orders over time, visitors over time. Lists: orders by status, recent orders, top products (units/revenue), top categories, sales by region, top pages, traffic sources, device split, low-stock & out-of-stock variants, catalog health (drafts, missing price/images/translations), active & upcoming promos. **Revenue = orders with status CONFIRMED or DELIVERED** (NEW counted separately as "pending", CANCELLED excluded). |
| Dashboard visibility *(my call)* | Full admins and product managers see the dashboard; blog editors land on the blog list. |
| Clients *(my call)* | **Customer** record per normalized phone number, created/updated automatically on each order and backfilled from existing orders. Admin list: search, sort, filter by segment; shows name, phone, region, orders count, total spent, last order. Segments auto: New (1 order), Returning (2+), VIP (total spent ≥ threshold in Settings), Inactive (no order in 180 days). Detail page: order history, editable notes, tags, "blocked" flag (blocked phones cannot place orders — clear message). CSV export. No customer login on the storefront. |
| Blog *(my call)* | Posts with per-locale (uz/ru/en) title, excerpt, content (CKEditor HTML), SEO title/description; slug, cover image, tags, status Draft/Published/Scheduled (publish date), author. Machine-translate from EN button reused from products. Public pages `/{locale}/blog` (paginated list, tag filter) and `/{locale}/blog/{slug}` with hreflang, Article JSON-LD, in sitemap; link in header/footer. Blog editors can edit all posts. |
| CKEditor *(my call)* | Self-hosted npm `ckeditor5` + `@ckeditor/ckeditor5-react` under the free **GPL** license key (no premium plugins, no cloud). Toolbar: headings, bold/italic/underline, links, lists, block quote, tables, images (upload + alt text), media embed (YouTube), alignment, source view. Output **sanitized server-side** on save with an allowlist matching the toolbar. Loaded client-only in admin. For products, CKEditor replaces only the per-locale `descriptionHtml` editor; structured fields (sections, highlights, FAQ, in-the-box) keep their current editors. General HTML Support is enabled for the markup the current sanitizer already allows, so imported Anker descriptions survive open-and-save unchanged (verified by a round-trip test on an imported product). |
| Uploads *(my call)* | New image upload endpoint (staff only): jpg/png/webp/gif, ≤ 5 MB, content-type sniffed, random filenames, stored under `uploads/YYYY/MM/` outside `public/` and served by a route handler (because `next start` does not serve files added to `public/` after build). Used by CKEditor, blog covers, product images and brand logos (alongside existing URLs). |
| Product tools *(my call)* | List: search (title/SKU), filters (category, brand, status, stock state, price range, has promo, incomplete), sorting, pagination, column for completeness score; **bulk actions** (publish, unpublish, delete, change category/brand, add to promo, export CSV); **inline edit** of price and stock per variant; low-stock threshold in Settings with badges. Edit page: CKEditor for description, tabbed layout (General · Content · Variants & stock · Images · Specs · SEO · Promotions), per-locale SEO title/description, **completeness checklist** (price, images, translations reviewed, specs), **duplicate product**, **storefront preview** of drafts (staff only), sticky save bar with unsaved-changes warning. |
| Admin navigation *(my call)* | Grouped sidebar: Dashboard · Sales (Orders, Clients, Promotions) · Catalog (Products, Categories, Brands, Import) · Content (Blog, Translations) · System (Users, Activity log, Settings). Items filtered by role. Admin UI stays English. |

### Approaches considered
1. **Extend the existing Next.js admin in place — chosen.** Same app, Prisma models + migrations, server actions, current Tailwind admin UI kit (`components/admin/ui.tsx`). Charts with a small React chart lib in admin only. Everything shares the catalog/pricing code, so promos stay consistent between admin and storefront.
2. Plug in an off-the-shelf admin framework (React-Admin, Refine, Payload) — rejected: second data layer and auth model beside existing code, fights the per-locale JSON fields, big bundle.
3. External services for parts (Google Analytics for visits, headless CMS for blog) — rejected: third-party tracking/consent, data split across tools, monthly cost, blog not in the same uz/ru/en SEO pipeline.

- **Goal:** A role-based admin where full admins, product managers and blog editors run the shop: real dashboard (sales, visits, catalog health), scheduled promotions that change real storefront and checkout prices, client management, staff user management, a multilingual blog, CKEditor rich text, and a faster product workspace.
- **Deliverables:** Prisma schema changes + migration (AdminUser, ActivityLog, PageView/daily aggregates, Brand, Promotion + targets, Customer, BlogPost, order-line discount fields); role/permission layer; visit beacon; pricing engine with promos wired into storefront, cart and order API; admin pages: Dashboard, Promotions, Clients, Users, Activity log, Brands, Blog, upgraded Products; CKEditor component + upload endpoint + sanitizer allowlist; public blog pages + sitemap; tests; README updates.
- **Constraints:** Windows dev, Node 24, existing stack only plus: `ckeditor5`, `@ckeditor/ckeditor5-react`, one chart library. Read the Next 16 docs in `node_modules/next/dist/docs/` before writing code (AGENTS.md). Additive migrations; existing data (products, orders, translations) preserved. No paid services. Secrets only in `.env`. Storefront performance not degraded (beacon async, promo computation in the same queries).
- **Non-goals:** Customer accounts/login on storefront; promo codes/coupons; buy-X-get-Y or tiered discounts; email/SMS marketing to clients; storefront brand pages; blog comments; CKEditor premium/cloud features; online payments; third-party analytics; 2FA.
- **Anti-goals:** Promo shown on the site but not applied at checkout (or vice versa); permissions only hidden in the menu; dashboard numbers that are fabricated or demo-padded; unsanitized HTML from the editor reaching the storefront; a migration that loses existing products/orders or locks the owner out.
- **Assumptions:** Order totals are trusted only when recomputed server-side (already the case — re-verified in plan stage). SQLite is fine for analytics volume of a single shop. UZS amounts are whole numbers.
- **Open questions:** none. CKEditor license: owner chose **free GPL** (2026-11-17). All *(my call)* rows can be corrected.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Unit tests cover: promo selection (best wins, % vs fixed, dates, switch, floor), permission matrix per role, password hashing/verify, customer phone normalization & segments, visitor hash, sanitizer allowlist | auto | `npm test` |
| A2 | Type-check and production build pass | auto | `npm run build` |
| A3 | Migration applies on a copy of current `dev.db` with all products/orders intact; `.env` admin becomes the first full admin | auto+manual | `npm run db:deploy` on copy + row counts |
| A4 | Blog editor gets 403 on `/admin/products`, product server actions and admin APIs; product manager gets 403 on `/admin/users`; disabled user's session stops working on next request | auto | permission integration test / smoke script |
| A5 | An active promo on a category changes the price on listing, product page, cart, and the created order's total/lines; a disabled or expired promo does not; client-supplied price is ignored | auto+manual | test + browser check |
| A6 | Dashboard KPIs match direct DB queries for a seeded date range (revenue, orders, AOV, visitors, conversion) | auto | test against seeded data |
| A7 | Visiting storefront pages records page views; admin/api/bot UA do not | auto | smoke + DB count |
| A8 | Placing an order creates/updates the Customer; blocked phone cannot order; CSV export downloads | auto+manual | test + browser |
| A9 | Blog post created in CKEditor (with uploaded image, table, YouTube embed) publishes to `/uz/blog/{slug}`, `/ru/...`, `/en/...`; appears in sitemap with hreflang; `<script>`/`onerror` stripped | auto+manual | smoke + browser |
| A10 | Product list filters, bulk publish/unpublish, inline price/stock edit, duplicate, preview of draft work | manual | browser |
| A11 | Activity log shows actor + action for product edit, promo change, user change | manual | browser |

Manual spot checks: dashboard in light browser at desktop and phone width; CKEditor toolbar and image upload; role menus for each role; promo strike-through display in uz/ru/en.

## 3. Anti-drift
- **Primary objective:** The owner and staff can actually run sales, discounts, clients, content and catalog from the admin, with correct prices reaching customers and correct access per role.
- **Proxy signals (not success by themselves):** build passes; pages render; charts draw; tests pass with mocked data only; CKEditor appears on screen.
- **Intended scope:** admin panel, auth/roles, pricing engine, visit tracking, public blog pages, upload endpoint. Storefront changes limited to promo price display, beacon, blog pages and blog nav link.
- **Completion target:** full delivery of all deliverables above.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Schema | All new tables/columns + settings keys in one additive migration; existing data intact | `backend-architect` (owner) · `superpowers:test-driven-development` (support) | `prisma/schema.prisma`, `prisma/migrations/2026111701_admin_foundation/`, `src/lib/settings.ts`, `tests/setup.ts`, `tests/lib/settings.test.ts` | – |
| M2 Staff auth & roles | Per-user logins, 3 roles enforced server-side, users admin, activity log, recovery CLI, grouped role-filtered nav, settings split | `identity-access-engineer` (owner) · TDD (support) · `code-reviewer` (verifier) | `src/lib/auth.ts`, `src/lib/password.ts`, `src/lib/permissions.ts`, `src/lib/admin/{session,login,api,users,activity,settings}.ts`, `src/proxy.ts`, `next.config.ts`, `src/app/admin/**` (login, users, activity, forbidden, existing actions guard swap), `src/app/api/admin/{login,logout}/`, `src/components/admin/{AdminNav,LoginForm,SettingsForm,UsersEditor}.tsx`, `scripts/admin-reset.ts`, `package.json` scripts, `tests/**` auth files | M1 |
| M3 Pricing, promos, brands | One pricing function drives listings, product page, cart, order; promo admin; Brand table switchover | `backend-architect` (owner) · TDD (support) · `code-reviewer` (verifier) | `src/lib/pricing.ts`, `src/lib/promotions.ts`, `src/lib/catalog.ts`, `src/lib/orders.ts`, `src/lib/admin/{promotions,brands,products,product-view,import}.ts`, `src/lib/importer/`, `prisma/` (migration 2026111702), `src/app/admin/(panel)/{promotions,brands}/`, `src/app/admin/actions/{promotions,brands}.ts`, `src/components/admin/{PromotionEditor,TargetPicker,BrandsEditor}.tsx`, brand select in `ProductEditor.tsx`, `tests/lib/{pricing,promotions,orders,catalog}.test.ts` | M2 |
| M6 Uploads & CKEditor | Safe image uploads + reusable rich text editor + hardened sanitizer | `frontend-developer` (owner) · TDD (support) | `src/lib/uploads.ts`, `src/lib/sanitize.ts`, `src/app/api/admin/uploads/`, `src/app/uploads/[...path]/`, `src/components/admin/{RichTextEditor,L10nRichField}.tsx`, `package.json`(+lock: ckeditor), `.gitignore`, `tests/lib/{sanitize,uploads}.test.ts` | M2 |
| M4 Visits & dashboard | First-party page views + dashboard with KPIs, charts, lists matching DB | `data-visualization-engineer` (owner) · `dataviz` skill (support) · TDD (support) | `src/lib/analytics/`, `src/lib/admin/dashboard.ts`, `src/app/api/track/`, `src/components/TrackPageView.tsx`, `src/app/[locale]/layout.tsx` (one line), `src/app/admin/(panel)/page.tsx`, `src/components/admin/dashboard/`, `package.json`(+lock: recharts), `tests/lib/{analytics,dashboard}.test.ts`, `tests/api/track.test.ts` | M3 |
| M5 Clients | Customer records from orders, segments, notes/tags/blocked, CSV | `backend-architect` (owner) · TDD (support) | `src/lib/customers.ts`, `src/lib/orders.ts` (upsert + blocked), `src/app/api/orders/route.ts`, `prisma/` (migration 2026111703 backfill), `src/app/admin/(panel)/clients/`, `src/app/admin/actions/clients.ts`, `src/app/api/admin/clients/export/`, `src/components/admin/ClientEditor.tsx`, checkout error copy in `messages/*.json` + checkout component, `tests/lib/customers.test.ts` | M3 |
| M7 Blog | Multilingual blog admin + public pages + SEO + sitemap | `frontend-developer` (owner) · TDD (support) | `src/lib/blog.ts`, `src/lib/admin/blog.ts`, `src/lib/translate/` (blog), `src/lib/seo.ts` (articleJsonLd), `src/app/sitemap.ts`, `src/app/[locale]/blog/`, `src/app/admin/(panel)/blog/`, `src/app/admin/actions/blog.ts`, `src/components/admin/BlogEditor.tsx`, header/footer link components, `messages/*.json` (blog keys), `tests/lib/blog.test.ts` | M6 |
| M8 Product workspace | Filters, bulk, inline edit, duplicate, completeness, tabs, SEO, preview, CSV | `frontend-developer` (owner) · TDD (support) | `src/lib/admin/{product-list,products,products-shared,product-view}.ts`, `src/app/admin/(panel)/products/**`, `src/app/admin/actions/products.ts`, `src/app/api/admin/products/export/`, `src/components/admin/{ProductEditor,ProductTable,BulkBar,InlineVariantCell}.tsx`, `tests/lib/{product-list,admin-products}.test.ts` | M3, M6 |
| M9 Verification & delivery | Smoke extended, migration rehearsal, review, browser evidence per role, README | `superpowers:verification-before-completion` (owner) · `code-reviewer` + `superpowers:requesting-code-review` (verifier) · `evidence-collector` (verifier) | `scripts/smoke.mjs`, `README.md`, this plan file | all |

Gaps (no fitting skill): none. (`cms-developer` was considered for the blog and rejected: it targets Drupal/WordPress.)

Waves (at most 2 parallel units, disjoint write scopes; parallel agents use their own worktrees, each with its own copied `.env` and `npx prisma migrate deploy` on a fresh `dev.db`; lead merges at wave end and resolves `package-lock.json` by re-running `npm install`):
- Wave 1: M1
- Wave 2: M2
- Wave 3: M3 ‖ M6
- Wave 4: M4 ‖ M5 (both read `orders.ts`; only M5 writes it)
- Wave 5: M7 ‖ M8 (only M7 writes `messages/*.json`; M8 only reads storefront product components for preview)
- Wave 6: M9

## 5. Tasks

**Goal:** Deliver the role-based advanced admin described in sections 1–3.
**Architecture:** Extend the existing Next 16 App Router app. Prisma models + additive migrations; pure, unit-tested domain functions in `src/lib/**`; server actions split per feature in `src/app/admin/actions/*.ts`, each starting with `requirePermission()`; admin UI built on `src/components/admin/ui.tsx`.
**Tech stack:** Next 16, React 19, Prisma 7/SQLite, next-intl, jose, node:crypto scrypt, sanitize-html, `ckeditor5@49.1.0` + `@ckeditor/ckeditor5-react@12.0.0` (GPL key), `recharts@3.10.1`, Vitest.
**Spec:** sections 1–3 of this file.

### Global constraints
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md); `forbidden()` needs `experimental.authInterrupts: true`.
- Work on branch `feature/advanced-admin` cut from `main`; never touch `AGENTS.md` beyond committing it as-is.
- Roles exactly: `ADMIN`, `PRODUCT_MANAGER`, `BLOG_EDITOR`. Admin UI copy in English; storefront copy in uz/ru/en via `messages/*.json`.
- Money is whole UZS `Int`. Promo floor: effective price ≥ 1 000 so'm. Best single promo wins, never stacked.
- "Day" for analytics and dashboard = calendar day in `Asia/Tashkent` (UTC+5, no DST).
- Revenue = orders with status `CONFIRMED` or `DELIVERED`; `NEW` = pending; `CANCELLED` excluded.
- Raw page views kept 180 days; daily aggregates kept forever. No cookies or third-party scripts for tracking.
- Uploads: jpg/png/webp/gif only (sniffed magic bytes), ≤ 5 MB, stored in `uploads/YYYY/MM/<random>.<ext>` (gitignored), served at `/uploads/...`.
- Every mutating admin action writes an ActivityLog row.
- Every test file runs against `test.db` via existing `tests/global-setup.ts`; add new tables to `tests/setup.ts` cleanup.

### Review focus
1. Fixed-amount promo larger than the price (or 99%) → price clamps to 1 000 so'm, never ≤ 0. Test in M3.
2. Promo ends or is switched off between cart quote and order submit → the order uses rules at submit time. Test in M3.
3. Full admin disables/demotes themselves or the last active admin → refused with a clear error. Test in M2.
4. Upload of an HTML/SVG file renamed `.jpg` → rejected. Test in M6.
5. Order at 20:30 UTC on 1 Dec counts on 2 Dec (Tashkent) in the dashboard. Test in M4.

---

### Task M1: Schema foundation (wave 1)
**Files:** Modify `prisma/schema.prisma`, `src/lib/settings.ts`, `tests/setup.ts`, `tests/lib/settings.test.ts`. Create migration `prisma/migrations/2026111701_admin_foundation/migration.sql` via `npx prisma migrate dev --name admin_foundation --create-only`, then review the SQL.
**Interfaces — Produces (Prisma models):**
- `AdminUser { id Int @id @default(autoincrement()); email String @unique; name String; role String; passwordHash String; active Boolean @default(true); sessionVersion Int @default(0); lastLoginAt DateTime?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt }`
- `ActivityLog { id; userId Int?; userEmail String; action String /* create|update|delete|status|login */; entity String; entityId String?; summary String; createdAt @default(now()); @@index([createdAt]) }`
- `PageView { id; day String /* YYYY-MM-DD Tashkent */; path String; locale String; referrerHost String?; device String /* mobile|tablet|desktop */; visitorHash String; createdAt @default(now()); @@index([day]) }`
- `DailyTraffic { day String @id; views Int; visitors Int }`
- `Brand { id; name String @unique; slug String @unique; logoUrl String?; sortOrder Int @default(0); products Product[] }` and `Product.brandId Int?` + relation (legacy `Product.brand` string kept until M3).
- `Promotion { id; name String; kind String /* PERCENT|AMOUNT */; value Int; targetType String /* PRODUCT|CATEGORY|BRAND */; targetIds Json; enabled Boolean @default(true); startsAt DateTime?; endsAt DateTime?; createdAt; updatedAt }`
- `Customer { id; phone String @unique; name String; region String; notes String @default(""); tags Json; blocked Boolean @default(false); createdAt; updatedAt }`
- `BlogPost { id; slug String @unique; status String @default("DRAFT"); publishedAt DateTime?; title Json; excerpt Json; contentHtml Json; seoTitle Json; seoDescription Json; coverImage String?; tags Json; reviewed Json; authorId Int?; createdAt; updatedAt; @@index([status, publishedAt]) }`
- `Product.seoTitle Json?`, `Product.seoDescription Json?`; `OrderLine.originalPriceUzs Int?`, `OrderLine.discountUzs Int @default(0)`, `OrderLine.promotionId Int?`; `Order @@index([phone])`, `Order @@index([createdAt])`.
- `Settings` gains `vipThresholdUzs: number` (default 10 000 000) and `lowStockThreshold: number` (default 3).
- [ ] Step 1: Extend `tests/lib/settings.test.ts`: `expect((await getSettings()).vipThresholdUzs).toBe(10_000_000)`, `lowStockThreshold` `3`, and round-trip via `updateSettings`. Run `npx vitest run tests/lib/settings.test.ts` → FAIL.
- [ ] Step 2: Edit schema, create migration, add cleanup of new tables (children first) to `tests/setup.ts`, extend `Settings`. Run `npm test` → all PASS.
- [ ] Step 3: Rehearse on a copy: `cp dev.db scratchpad/dev-copy.db`, `DATABASE_URL=file:<copy> npx prisma migrate deploy`, compare `SELECT count(*)` of Product/Variant/Order/OrderLine before/after → equal.
- [ ] Step 4: Commit `feat(db): admin foundation schema`.

### Task M2: Staff auth, roles, users, activity (wave 2)
**Files:** Create `src/lib/password.ts`, `src/lib/permissions.ts`, `src/lib/admin/users.ts`, `src/lib/admin/activity.ts`, `src/app/admin/(panel)/users/page.tsx`, `src/app/admin/(panel)/activity/page.tsx`, `src/app/admin/forbidden.tsx`, `src/app/admin/actions/users.ts`, `src/components/admin/UsersEditor.tsx`, `scripts/admin-reset.ts`, `tests/lib/{password,permissions,users,activity}.test.ts`. Modify `src/lib/auth.ts`, `src/lib/admin/{session,login,api,settings}.ts`, `src/proxy.ts`, `next.config.ts`, `src/app/admin/actions.ts` (every `requireAdmin()` → `requirePermission(...)` + `logActivity`), all `(panel)` pages, `src/app/api/admin/**`, `src/components/admin/{AdminNav,LoginForm,SettingsForm}.tsx`, `package.json` (`"admin:reset": "tsx scripts/admin-reset.ts"`), `tests/lib/auth.test.ts`, `tests/api/admin-guard.test.ts`, `tests/middleware-matcher.test.ts`.
**Interfaces — Produces:**
- `src/lib/permissions.ts` (edge-safe, no DB): `type Role = 'ADMIN'|'PRODUCT_MANAGER'|'BLOG_EDITOR'`; `type Permission = 'dashboard'|'orders'|'clients'|'promotions'|'catalog'|'blog'|'translations'|'settings.business'|'settings.integrations'|'users'|'activity'`; `can(role: Role, p: Permission): boolean`; `permissionForPath(pathname: string): Permission | null` (`/admin/users*`→users, `/admin/blog*`→blog, `/admin/products*|categories|brands|import`→catalog, …; `/admin` → dashboard); `homeFor(role): string` (`BLOG_EDITOR` → `/admin/blog`, others `/admin`). Matrix: ADMIN all; PRODUCT_MANAGER all except `users`, `activity`, `settings.integrations`; BLOG_EDITOR only `blog`.
- `src/lib/password.ts`: `hashPassword(pw: string): Promise<string>` (`scrypt$N$r$p$saltB64$hashB64`), `verifyPassword(pw: string, stored: string): Promise<boolean>` (timingSafeEqual).
- `src/lib/auth.ts`: `type SessionClaims = { uid: number; role: Role; sv: number }`; `createSession(c: SessionClaims): Promise<string>`; `readSession(token?: string|null): Promise<SessionClaims|null>`; only `SESSION_SECRET` required; `bootstrapCredentials(): {user, password} | null` from env with existing placeholder/length checks.
- `src/lib/admin/session.ts`: `type Staff = { id: number; email: string; name: string; role: Role }`; `getStaff(): Promise<Staff|null>` (reads cookie, re-loads user, requires `active` and `sessionVersion === sv`); `requireStaff(): Promise<Staff>` (redirect `/admin/login`); `requirePermission(p: Permission): Promise<Staff>` (calls `forbidden()` when `!can`).
- `src/lib/admin/api.ts`: `adminApi<C>(perm: Permission | Permission[] /* any of */, handler: (req, ctx, staff: Staff) => Response|Promise<Response>)` → 401/403 JSON.
- `src/lib/admin/users.ts`: `ensureBootstrapAdmin(user, password): Promise<AdminUser|null>` (only when `AdminUser` count is 0); `createUser({email,name,role,password}, actor)`, `updateUser(id, {name?, role?, active?}, actor)`, `resetPassword(id, password, actor)` (bumps `sessionVersion`); all return `{ok:true}|{ok:false,error:string}`; refuse demoting/disabling the last active `ADMIN` with `'At least one active full admin is required.'`.
- `src/lib/admin/activity.ts`: `logActivity(actor: Staff, action: string, entity: string, entityId: string|number|null, summary: string): Promise<void>`; `listActivity({userId?, entity?, from?, to?, page}): Promise<{rows, total}>` (50/page).
- `attemptLogin({email, password, ip})` keeps existing throttle; on success updates `lastLoginAt` and logs `login`.
- `scripts/admin-reset.ts <email> [--name X]`: prompts for password twice (≥ 10 chars), creates or resets an `ADMIN`, sets `active=true`, bumps `sessionVersion`.
- Nav groups per section 1 table "Admin navigation", filtered by `can()`.
- [ ] Step 1: Tests `permissions.test.ts`: `can('BLOG_EDITOR','catalog')===false`, `can('BLOG_EDITOR','blog')===true`, `can('PRODUCT_MANAGER','users')===false`, `can('PRODUCT_MANAGER','settings.business')===true`, `can('PRODUCT_MANAGER','settings.integrations')===false`, `permissionForPath('/admin/products/5')==='catalog'`, `permissionForPath('/admin')==='dashboard'`. `password.test.ts`: verify true for right pw, false for wrong, two hashes of same pw differ. Run → FAIL.
- [ ] Step 2: Implement `permissions.ts`, `password.ts`. Run → PASS.
- [ ] Step 3: Tests `users.test.ts`: bootstrap creates ADMIN only when table empty; second call returns null; `updateUser(lastAdmin.id,{active:false})` → `{ok:false}`; `{role:'BLOG_EDITOR'}` on last admin → `{ok:false}`; `resetPassword` increments `sessionVersion`; duplicate email → `{ok:false}`. `auth.test.ts`: `readSession(await createSession({uid:1,role:'ADMIN',sv:0}))` round-trips; tampered token → null. Run → FAIL; implement auth/users/session/activity → PASS.
- [ ] Step 4: Update `tests/api/admin-guard.test.ts`: with a BLOG_EDITOR session, `adminApi('orders', h)` → 403 and `h` not called; disabled user → 401; PRODUCT_MANAGER → orders 200. Swap every action/page/route guard; add `authInterrupts`; `forbidden.tsx` page with link to `homeFor(role)`. Run `npm test` → PASS.
- [ ] Step 5: Users page (list, create, role, disable, reset pw), Activity page (filters), Settings form hides integration fields unless `settings.integrations`, server action for settings re-checks per field. `npm run build` → success.
- [ ] Step 6: Manual: login with `.env` creds on empty table → becomes ADMIN; create PM + blog editor; each sees only its menu; blog editor typing `/admin/products` gets 403 page. Commit `feat(admin): staff accounts and roles`.

### Task M3: Pricing engine, promotions, brands (wave 3, parallel with M6)
**Files:** Create `src/lib/pricing.ts`, `src/lib/promotions.ts`, `src/lib/admin/{promotions,brands}.ts`, `src/app/admin/(panel)/promotions/{page,new/page,[id]/page}.tsx`, `src/app/admin/(panel)/brands/page.tsx`, `src/app/admin/actions/{promotions,brands}.ts`, `src/components/admin/{PromotionEditor,TargetPicker,BrandsEditor}.tsx`, migration `2026111702_brands_switch` (SQL: insert distinct `trim(brand)` case-insensitively into Brand with slugified slug, set `brandId`, then drop `Product.brand`), `tests/lib/{pricing,promotions}.test.ts`. Modify `src/lib/catalog.ts`, `src/lib/orders.ts`, `src/lib/importer/anker.ts` + `src/lib/admin/import.ts` (brand → `Brand` upsert), `src/lib/admin/{products,product-view}.ts` + `ProductEditor.tsx` (brand select), `tests/lib/{orders,catalog,importer,admin-products}.test.ts`.
**Interfaces — Produces:**
- `src/lib/pricing.ts` (pure): `type PromoRule = { id: number; kind: 'PERCENT'|'AMOUNT'; value: number; targetType: 'PRODUCT'|'CATEGORY'|'BRAND'; targetIds: number[]; enabled: boolean; startsAt: Date|null; endsAt: Date|null }`; `type PriceTarget = { priceUzs: number; productId: number; categoryIds: number[] /* own + ancestors */; brandId: number|null }`; `type PriceResult = { priceUzs: number; originalUzs: number; discountUzs: number; promotionId: number|null }`; `isActive(r: PromoRule, now: Date): boolean` (enabled && (!startsAt || now ≥ startsAt) && (!endsAt || now < endsAt)); `bestPrice(t: PriceTarget, rules: PromoRule[], now: Date): PriceResult` (PERCENT → `round(price*value/100)`; AMOUNT → `value`; result `max(1000, price − d)` but never above price; largest discount wins, ties → lower id). Percent value 1–90, amount ≥ 1 (validated in admin).
- `src/lib/promotions.ts`: `getActiveRules = cache(async (now = new Date()) => PromoRule[])`; `categoryAncestry(): Promise<Map<number, number[]>>`; `priceTargetFor(v: {priceUzs, product: {id, categoryId, brandId}}, ancestry): PriceTarget`.
- `catalog.ts`: `CardProduct.minPriceUzs` and `VariantView.priceUzs` become the **effective** price; `compareAtUzs` = original price when a promo applies (else existing compare-at rule); `getSaleProducts()` also returns products with an active promo. Storefront components unchanged.
- `orders.ts`: `quoteCart` and `createOrder` use `bestPrice` inside the transaction; `OrderLine` gets `priceUzs` (effective), `originalPriceUzs`, `discountUzs`, `promotionId`.
- `src/lib/admin/promotions.ts`: `listPromotions()` (with computed state `active|scheduled|expired|off`), `savePromotion(input, actor)`, `togglePromotion(id, enabled, actor)`, `deletePromotion(id, actor)`; validation `endsAt > startsAt`, non-empty targets.
- `src/lib/admin/brands.ts`: `listBrands()` (with product counts), `saveBrand(input, actor)`, `deleteBrand(id, actor)` (refused while products reference it), `upsertBrandByName(name): Promise<number>`.
- Promotions page: table (name, target summary, discount, dates, state badge, on/off switch); editor: name, kind, value, target type, `TargetPicker` (searchable multi-select of products / categories / brands), start/end datetime (Tashkent), enabled; live example ("1 290 000 → 1 161 000").
- [ ] Step 1: `pricing.test.ts`: 10% of 1 290 000 → 1 161 000; AMOUNT 50 000 vs PERCENT 10% on 300 000 → AMOUNT wins (250 000); AMOUNT 2 000 000 on 1 500 000 → 1 000; disabled rule ignored; `endsAt` in past ignored; `startsAt` in future ignored; CATEGORY rule on parent category applies to child (`categoryIds` includes ancestor); BRAND rule on other brand ignored; no rules → `{priceUzs: p, originalUzs: p, discountUzs: 0, promotionId: null}`. Run → FAIL; implement → PASS.
- [ ] Step 2: `orders.test.ts` additions: active category promo → `createOrder` total uses discounted price and line has `discountUzs>0`, `promotionId`; same promo disabled before submit → full price; `quoteCart` matches. `catalog.test.ts`: card shows effective `minPriceUzs` and `compareAtUzs` = original. Run → FAIL; implement promotions.ts + catalog/orders wiring → PASS.
- [ ] Step 3: Brand migration + `importer.test.ts`/`admin-products.test.ts` updates (brand via `brandId`; " Anker " and "anker" collapse to one Brand). Run `npm test` → PASS.
- [ ] Step 4: Admin promotions + brands pages and actions (`requirePermission('promotions')` / `'catalog'`, `logActivity`); `refreshStorefront()` after promo changes. `npm run build` → success.
- [ ] Step 5: Manual: create −15% promo on a category → listing, product page and cart show struck price; place order → admin order shows discount; switch off → prices revert. Commit `feat: promotions and brands`.

### Task M6: Uploads and CKEditor (wave 3, parallel with M3)
**Files:** Create `src/lib/uploads.ts`, `src/app/api/admin/uploads/route.ts`, `src/app/uploads/[...path]/route.ts`, `src/components/admin/{RichTextEditor,L10nRichField}.tsx`, `tests/lib/uploads.test.ts`. Modify `src/lib/sanitize.ts`, `tests/lib/sanitize.test.ts`, `package.json`/lock (`npm i ckeditor5@49.1.0 @ckeditor/ckeditor5-react@12.0.0`), `.gitignore` (`/uploads/`).
**Interfaces — Produces:**
- `src/lib/uploads.ts`: `sniffImage(bytes: Uint8Array): 'jpg'|'png'|'webp'|'gif'|null`; `saveUpload(file: File, now?: Date): Promise<{ok:true; url:string}|{ok:false; error:string}>` (≤ 5 MB, random 16-byte hex name); `resolveUploadPath(segments: string[]): string|null` (rejects `..`, absolute, non-matching `YYYY/MM/name.ext`).
- `POST /api/admin/uploads` via `adminApi(['catalog', 'blog'], …)`: multipart field `upload`; responds `{ url }` or `{ error: { message } }` (CKEditor Simple Upload Adapter contract).
- `GET /uploads/[...path]`: streams file with correct `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`; 404 otherwise.
- `RichTextEditor` (client, loaded with `next/dynamic` `ssr:false`): props `{ value: string; onChange: (html: string) => void; label: string; minHeight?: number }`; `licenseKey: 'GPL'`; toolbar per section 1 CKEditor row; `SimpleUploadAdapter` → `/api/admin/uploads` (same-origin, CSRF header as existing actions expect); `MediaEmbed` with `previewsInData: true`; General HTML Support allowing elements/classes the sanitizer permits.
- `L10nRichField`: props `{ value: L10n; onChange: (v: L10n) => void; label: string }` with uz/ru/en tabs (mirrors `L10nField`).
- `sanitizeHtml`: adds `figure, figcaption, img[src,alt,width,height]` (src `https:` or `/uploads/`), tables, `iframe` only `https://www.youtube.com/embed/*` / `https://www.youtube-nocookie.com/embed/*` with fixed attrs, alignment via whitelisted `class` (`text-align-*`, `image-style-*`, `table`, `media`); strips everything else.
- [ ] Step 1: `uploads.test.ts`: PNG/JPEG/WEBP/GIF magic bytes detected; `<svg` bytes and `<html` bytes → null; 6 MB file → `{ok:false}`; `resolveUploadPath(['..','x'])` → null; `['2026','11','abc.png']` → path inside `uploads/`. `sanitize.test.ts`: `<img src=x onerror=alert(1)>` loses `onerror` and non-https src; `<script>` removed; `iframe src="https://evil.com"` removed; YouTube embed kept; existing tests still pass; the `tests/fixtures/anker-a120f.html` imported description passes through `sanitizeHtml` twice unchanged (idempotent). Run → FAIL.
- [ ] Step 2: Implement uploads lib, routes, sanitizer. Run → PASS.
- [ ] Step 3: Install CKEditor, build `RichTextEditor` + `L10nRichField`. Verify `npm run build` succeeds and the editor (incl. image upload and YouTube embed) works on a throwaway admin route deleted before commit; real use comes in M7/M8. Commit `feat(admin): uploads and rich text editor`.

### Task M4: Visit tracking and dashboard (wave 4, parallel with M5)
Read `dataviz` skill before chart code.
**Files:** Create `src/lib/analytics/{visitor,record,rollup}.ts`, `src/app/api/track/route.ts`, `src/components/TrackPageView.tsx`, `src/lib/admin/dashboard.ts`, `src/components/admin/dashboard/{KpiTiles,TrendChart,RankList,RangePicker}.tsx`, `tests/lib/{analytics,dashboard}.test.ts`, `tests/api/track.test.ts`. Modify `src/app/[locale]/layout.tsx` (mount `<TrackPageView />`), `src/app/admin/(panel)/page.tsx`, `package.json`/lock (`recharts@3.10.1`).
**Interfaces — Produces:**
- `visitor.ts`: `tashkentDay(d: Date): string`; `isBot(ua: string): boolean` (bot|crawl|spider|slurp|preview|headless|lighthouse, empty UA); `deviceOf(ua): 'mobile'|'tablet'|'desktop'`; `visitorHash(ip, ua, day): Promise<string>` (HMAC-SHA256 of `ip|ua` keyed by HMAC(SESSION_SECRET, day), hex 32).
- `record.ts`: `recordPageView({path, locale, referrer, ip, ua, now}): Promise<boolean>` (false when bot, path not starting with `/uz|/ru|/en`, or referrer host equals own host → stored as null).
- `POST /api/track` body `{ path, locale, referrer }` ≤ 2 KB, rate-limited per IP (reuse `src/lib/rate-limit.ts`, 120/min), always 204.
- `TrackPageView`: client; on pathname change `navigator.sendBeacon('/api/track', JSON)`, skipped when `navigator.webdriver`.
- `rollup.ts`: `rollupAndPrune(now: Date): Promise<void>` — upsert `DailyTraffic` for every day before today with raw rows, delete raw rows older than 180 days.
- `dashboard.ts`: `type RangeKey = 'today'|'7d'|'30d'|'90d'|'custom'`; `resolveRange(key, from?, to?, now): { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: string[] }`; `getDashboard(range): Promise<DashboardData>` with `kpis: { revenueUzs, orders, pendingOrders, aovUzs, visitors, pageViews, conversionPct }` each with `prev`; `series: { day, revenueUzs, orders, visitors }[]`; `ordersByStatus`, `recentOrders(10)`, `topProducts(10, by units & revenue)`, `topCategories(5)`, `salesByRegion`, `topPages(10)`, `sources(10, null → "Direct")`, `devices`, `lowStock` (variants of published products with `0 < stock ≤ lowStockThreshold`), `outOfStock`, `catalogHealth { drafts, noPrice, noImages, unreviewedTranslations }`, `promos { active, upcoming }`. Visitors per day = distinct `visitorHash` per day (sum across days for ranges; documented as "daily unique visitors").
- Dashboard page: range picker (URL param), KPI tiles with delta %, revenue/orders combo trend + visitors trend (recharts, admin-only client components), lists/tables for the rest; empty states say "No data yet" (never placeholder numbers). Calls `rollupAndPrune` first.
- [ ] Step 1: `analytics.test.ts`: `tashkentDay(new Date('2026-12-01T20:30:00Z'))==='2026-12-02'`; Googlebot UA → `isBot` true; iPhone UA → mobile; same ip/ua/day → same hash, next day → different. `track.test.ts`: POST with bot UA → 204 and 0 rows; normal UA `/uz/p/x` → 1 row; path `/admin` → 0 rows. Run → FAIL; implement → PASS.
- [ ] Step 2: `dashboard.test.ts` seed: 3 orders (CONFIRMED 1 000 000 at `2026-12-01T20:30Z`, DELIVERED 500 000 on 2026-12-02, CANCELLED 900 000, NEW 200 000) + page views from 4 visitor hashes on 2026-12-02 → for range 2026-12-02..2026-12-02: `revenueUzs 1_500_000`, `orders 2`, `pendingOrders 1`, `aovUzs 750_000`, `visitors 4`, `conversionPct 50`. `rollupAndPrune` moves day totals into `DailyTraffic` and deletes rows older than 180 days. Run → FAIL; implement → PASS.
- [ ] Step 3: Build page and charts; `npm run build` → success. Manual: browse storefront pages, open dashboard → visitors/page views increment; phone width layout readable. Commit `feat(admin): dashboard and visit tracking`.

### Task M5: Clients (wave 4, parallel with M4)
**Files:** Create `src/lib/customers.ts`, migration `2026111703_customers_backfill` (SQL: insert one Customer per distinct `Order.phone` with latest name/region, `tags '[]'`), `src/app/admin/(panel)/clients/{page,[id]/page}.tsx`, `src/app/admin/actions/clients.ts`, `src/app/api/admin/clients/export/route.ts`, `src/components/admin/ClientEditor.tsx`, `tests/lib/customers.test.ts`. Modify `src/lib/orders.ts` (`createOrder`: blocked check before transaction → `{ok:false, error:'BLOCKED'}`; upsert customer inside transaction), `src/app/api/orders/route.ts` (map BLOCKED → 403 `{error:'BLOCKED'}`), checkout client component + `messages/{uz,ru,en}.json` key `checkout.errors.blocked` ("We can't accept this order online. Please call us." in each language), `tests/lib/orders.test.ts`.
**Interfaces — Produces:**
- `upsertCustomerFromOrder(tx, { phone, name, region }): Promise<number>` (updates name/region to latest).
- `type Segment = 'NEW'|'RETURNING'|'VIP'|'INACTIVE'`; `segmentOf(s: { orders: number; spentUzs: number; lastOrderAt: Date|null }, vipThresholdUzs: number, now: Date): Segment` — precedence INACTIVE (last order > 180 days ago) > VIP (spent ≥ threshold) > RETURNING (orders ≥ 2) > NEW. `orders`/`spentUzs` count only CONFIRMED/DELIVERED; `lastOrderAt` any non-cancelled.
- `listCustomers({ q?, segment?, sort?: 'last'|'spent'|'orders'|'name', page }): Promise<{ rows: CustomerRow[]; total }>` (stats aggregated from `Order` grouped by phone; 50/page); `getCustomer(id)` with orders; `updateCustomer(id, { notes?, tags?, blocked? }, actor)`; `customersCsv(query): Promise<string>` (UTF-8 BOM, `;`-safe quoting).
- [ ] Step 1: `customers.test.ts`: segment precedence cases (1 order → NEW; 2 → RETURNING; spent 12 000 000 with threshold 10 000 000 → VIP; last order 200 days ago → INACTIVE); `createOrder` twice same phone (different formatting `+998 90 123 45 67` / `901234567`) → one Customer; blocked customer → `createOrder` returns `BLOCKED` and no order row; CSV contains header and quoted name with `;`. Run → FAIL; implement → PASS.
- [ ] Step 2: Pages: list with search/segment filter/sort, detail with order history, notes, tags, blocked toggle; export button. `requirePermission('clients')`, `logActivity`. `npm run build` → success. Commit `feat(admin): clients`.

### Task M7: Blog (wave 5, parallel with M8)
**Files:** Create `src/lib/blog.ts`, `src/lib/admin/blog.ts`, `src/app/[locale]/blog/{page,[slug]/page}.tsx`, `src/app/admin/(panel)/blog/{page,new/page,[id]/page}.tsx`, `src/app/admin/actions/blog.ts`, `src/components/admin/BlogEditor.tsx`, `tests/lib/blog.test.ts`. Modify `src/lib/translate/{index,apply}.ts` (add `translateBlogPost(id)` reusing product translation flow and `reviewed` flags), `src/lib/seo.ts` (`articleJsonLd`), `src/app/sitemap.ts`, storefront header + footer components (link "Blog"), `messages/*.json` (`blog.title`, `blog.readMore`, `blog.empty`, `blog.tag`, `nav.blog`), `tests/lib/seo.test.ts`.
**Interfaces — Produces:**
- `blog.ts`: `isPostVisible(p: { status: string; publishedAt: Date|null }, now: Date): boolean` (PUBLISHED && publishedAt ≤ now); `listPublishedPosts({ locale, page, tag? }): Promise<{ posts: PostCard[]; total }>` (12/page, newest first); `getPublishedPost(slug): Promise<PostDetail|null>`; `allTags(): Promise<string[]>`.
- `admin/blog.ts`: `listPosts({q?, status?})`, `savePost(id|null, input: BlogPostInput, actor)` (slug `^[a-z0-9-]{3,80}$` unique; `contentHtml` per locale through `sanitizeHtml`; PUBLISHED without `publishedAt` gets now), `deletePost(id, actor)`. State shown: Draft / Scheduled (future date) / Published.
- `articleJsonLd(post, locale)`: `@type BlogPosting`, headline, image, datePublished, dateModified, inLanguage.
- Public list: cards (cover, title, excerpt, date), tag chips, pagination; post page: cover, title, date, sanitized content with `prose`-like styles, related posts (same tag, 3), hreflang via `metaAlternates`, `pageMetadata` using seo fields with fallbacks to title/excerpt. Locale missing content → falls back via existing `t()` rule.
- [ ] Step 1: `blog.test.ts`: draft hidden; PUBLISHED with future date hidden then visible after date; `savePost` strips `<script>`; duplicate slug rejected; `listPublishedPosts` tag filter. `seo.test.ts`: `articleJsonLd` has `@type 'BlogPosting'` and `inLanguage 'uz'`. Sitemap test: published post yields `/uz/blog/<slug>`, `/ru/...`, `/en/...` and `/uz/blog`. Run → FAIL; implement → PASS.
- [ ] Step 2: Admin blog pages with `L10nRichField`, cover upload, tags, SEO fields, status/date, translate-from-EN button; `requirePermission('blog')`, `logActivity`, `revalidatePath`. Public pages + nav links. `npm run build` → success. Commit `feat: blog`.

### Task M8: Product workspace (wave 5, parallel with M7)
**Files:** Create `src/lib/admin/product-list.ts`, `src/app/admin/actions/products.ts` (move product actions out of `actions.ts`), `src/app/admin/(panel)/products/[id]/preview/page.tsx`, `src/app/api/admin/products/export/route.ts`, `src/components/admin/{ProductTable,BulkBar,InlineVariantCell}.tsx`, `tests/lib/product-list.test.ts`. Modify `src/lib/admin/{products,products-shared,product-view}.ts`, `src/app/admin/(panel)/products/{page,[id]/page}.tsx`, `src/components/admin/ProductEditor.tsx`, `src/app/admin/actions.ts` (remove moved actions), `tests/lib/admin-products.test.ts`.
**Interfaces — Produces:**
- `product-list.ts`: `type ProductListParams = { q?: string; categoryId?: number; brandId?: number; status?: 'DRAFT'|'PUBLISHED'; stock?: 'in'|'low'|'out'; priceMin?: number; priceMax?: number; promo?: boolean; incomplete?: boolean; sort?: 'updated'|'title'|'price'|'stock'|'created'; dir?: 'asc'|'desc'; page?: number }`; `parseListParams(sp: Record<string, string|string[]|undefined>): ProductListParams` (invalid values dropped); `queryProducts(p): Promise<{ rows: ProductRow[]; total: number }>` (25/page; `q` matches title in any locale or SKU; `ProductRow` has min/max price, total stock, lowest-stock flag, completeness score, active promo name).
- `products-shared.ts`: `completeness(p): { score: number /* 0-100 */; missing: string[] }` — checks: every variant price > 0, ≥ 1 image, title+description present in uz/ru/en, translations reviewed, ≥ 1 spec group, SEO description present (each equal weight).
- `products.ts`: `bulkAction(ids: number[], a: { type: 'publish'|'unpublish'|'delete'|'setCategory'|'setBrand'|'addToPromotion'; value?: number }, actor): Promise<{ done: number; skipped: { id: number; reason: string }[] }>` (publish skips with `checkPublishable` reason); `updateVariantInline(variantId, { priceUzs?: number; stock?: number }, actor)` (ints ≥ 0); `duplicateProduct(id, actor): Promise<number>` (DRAFT, slug `<slug>-copy`, `-copy-2`…, SKUs `<sku>-COPY[-n]`, `sourceUrl` null).
- CSV export: same filters as list; columns id, slug, title(en), brand, category, status, SKU, price, stock.
- Editor: tabs General · Content (description via `L10nRichField`; sections/highlights/FAQ/in-the-box unchanged) · Variants & stock · Images (URL or upload) · Specs · SEO (per-locale title ≤ 70, description ≤ 160 with counters) · Promotions (read-only active/upcoming promos affecting this product); side panel completeness checklist; sticky save bar, `beforeunload` warning when dirty; buttons Duplicate, Preview (new tab), Publish/Unpublish.
- Preview page renders the storefront product template for drafts (reuse `src/app/[locale]/p/[slug]` components with a `getProductForPreview(id, locale)` loader), `requirePermission('catalog')`, `noindex`.
- [ ] Step 1: `product-list.test.ts`: filter `stock:'out'` returns only products whose all variants have 0 stock; `q` by SKU; `incomplete:true` excludes 100-score product; `parseListParams({page:'-3', sort:'bogus'})` → `{ }` defaults. `admin-products.test.ts`: `bulkAction` publish skips product with price 0 and reports reason; `duplicateProduct` twice → slugs `x-copy`, `x-copy-2`, DRAFT, unique SKUs; `updateVariantInline` rejects `-1`; `completeness` of fully filled product = 100. Run → FAIL; implement → PASS.
- [ ] Step 2: UI: table with filters bar (URL-synced), sortable headers, select-all + `BulkBar`, inline price/stock cells (save on Enter/blur, error inline), completeness bar, low-stock badge; editor tabs as above; preview; export. `npm run build` → success.
- [ ] Step 3: Manual: open an imported Anker product, save without edits → storefront description unchanged (compare HTML before/after). Commit `feat(admin): product workspace`.

### Task M9: Verification and delivery (wave 6)
**Files:** Modify `scripts/smoke.mjs`, `README.md`, this plan file.
- [ ] Step 1: Extend smoke: `/uz/blog` 200, sitemap contains `/blog`, `POST /api/track` 204, unauthenticated `/api/admin/uploads` 401, `/uploads/../.env` 404. Run `npm run build && npm start` + `node scripts/smoke.mjs http://localhost:3000` → all OK.
- [ ] Step 2: `npm test` and `npm run build` → record counts here.
- [ ] Step 3: Migration rehearsal on a fresh copy of real `dev.db` (all three migrations) → row counts equal; `.env` login bootstraps admin.
- [ ] Step 4: `code-reviewer` on full branch diff via `superpowers:requesting-code-review`; fix Critical/Important (one repair round each).
- [ ] Step 5: `evidence-collector` in the built-in browser: walk A5, A8–A11 and role checks for ADMIN, PRODUCT_MANAGER, BLOG_EDITOR at desktop and 375 px; screenshots referenced here.
- [ ] Step 6: README: roles, `admin:reset`, uploads folder backup note, CKEditor GPL note, analytics retention. Fill Result + Handoff.

## 6. Verification
- `npm test` · `npm run build` · `node scripts/smoke.mjs http://localhost:3000` · manual checks in section 2

## 7. Rollback
Additive migration; keep a copy of `dev.db` before migrating. Work on a feature branch; `main` untouched until owner approves.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-17: requirement drafted.
- 2026-11-17: requirement approved by owner (CKEditor free GPL).

## Result
Delivered: · Checks run: · Gaps: · Follow-ups:

## Handoff
Requirement approved; plan (sections 4–5, 9 tasks in 6 waves) drafted and awaiting owner approval. Next: on approval set Status Executing, cut `feature/advanced-admin` from `main`, run M1 per its steps.
