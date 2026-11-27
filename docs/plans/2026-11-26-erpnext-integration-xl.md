# ERPNext integration (erp2.zanko.uz) — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 5 | 31/32 | 2026-11-26 | Owner: visual spot check of erp2 item list + zanko admin ERP card |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement
- **Goal:** ERPNext becomes the master of Zanko's stock and prices. Every zanko.uz SKU lives in ERPNext under company **Zanko**; the website shows ERPNext's stock/price; a confirmed website order reduces stock in ERPNext. The ERP is served at **erp2.zanko.uz**.
- **Deliverables:**
  1. ERP re-homed: Frappe site renamed `erp.tigr.uz` → `erp2.zanko.uz` (same server, same containers), edge-nginx vhost + Let's Encrypt cert for erp2.zanko.uz; `erp.tigr.uz` 301-redirects to `https://erp2.zanko.uz` (its cert keeps renewing).
  2. ERP setup for Zanko: company currency USD → **UZS** (Zanko has 0 transactions; verified), UZS enabled, selling price list **"Zanko Retail"** (UZS), item group tree **"Zanko"** with one child group per store category, customer **"zanko.uz Website"**, warehouse **"Stores - Z"** as default, API user `zanko-sync` with an API key/secret (least privilege).
  3. One-time export: all 117 SKUs (46 products) → ERPNext Items (item_code = SKU, name = product title + variant, item group = category, Item Default company Zanko / warehouse Stores - Z), all product photos attached, first photo = item image, price → Zanko Retail, current site stock → opening Stock Reconciliation in Stores - Z. Idempotent: re-running updates, never duplicates.
  4. Live sync (approach A):
     - ERP → site: ERPNext webhooks on Bin (stock) and Item Price changes call a signed store endpoint; store updates `Variant.stock` / `Variant.priceUzs`.
     - Reconciliation: every 5 min the store pulls all Zanko stock + Zanko Retail prices and corrects drift.
     - Site → ERP: order NEW→CONFIRMED creates a submitted **Delivery Note** (customer "zanko.uz Website", order number in remarks, from Stores - Z); CONFIRMED/SHIPPING→CANCELLED creates a return Delivery Note. Pushed via an outbox table with retries, so an ERP outage never blocks confirmation and nothing is lost or doubled.
     - New SKU created in zanko admin → Item auto-created in ERPNext (stock 0).
  5. zanko admin: stock and price fields read-only with "managed in ERP" note for ERP-linked SKUs; an ERP sync status line (last sync, pending/failed outbox items).
- **Constraints:** same server; Garmin company and its 44 items untouched; storefront must not call ERP on page views; connection over 127.0.0.1:8088 (no public hop); secrets only in `.env` / ERP; back up zanko.db and ERP (bench backup) before changes; edge changes via `nginx -t` in a throwaway container first; customers see UZS only.
- **Non-goals:** Sales Invoices / payments / accounting entries in ERPNext; customer records per buyer; moving the ERP to another server; product content (descriptions, specs, SEO, translations) living in ERP — content stays in the store; the Garmin/GRMN store; compare-at (strike-through) prices stay site-managed.
- **Assumptions:** one warehouse (Stores - Z) is the sellable stock; product variants map to plain ERP Items (not ERP item templates/variants); ERP stock reduces at confirmation (matching today's site behaviour); checkout still checks local stock (kept fresh by webhooks).
- **Open questions:** none.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | https://erp2.zanko.uz serves ERPNext login with a valid cert; erp.tigr.uz 301s to it | auto | `curl -sI https://erp2.zanko.uz/login`, `curl -sI https://erp.tigr.uz/app` |
| A2 | Zanko has 117 Items (one per site SKU), each with item group under "Zanko", Item Default company Zanko, image set, all photos attached | auto | count script comparing site SKUs to ERP Items |
| A3 | ERP Zanko Retail price = site priceUzs for every SKU; ERP stock in Stores - Z = site stock for every SKU (54 units / 7 SKUs at export) | auto | diff script, 0 mismatches |
| A4 | Changing stock in ERP (Stock Entry) updates the site's Variant.stock within ~10 s; changing price updates priceUzs | auto | test script: change → poll site DB |
| A5 | Confirming a website order creates a submitted Delivery Note and ERP stock drops by the qty; cancelling creates a return and stock comes back | auto | test order on a test SKU, check ERP |
| A6 | With ERP stopped, confirming an order still works; the push is delivered after ERP returns, exactly once | auto | stop erp-backend, confirm, start, check one DN |
| A7 | Reconciliation fixes drift: manually changing site stock is corrected within 5 min | auto | edit DB, wait, check |
| A8 | Unit tests + build pass; Garmin items/stock unchanged | auto | `npm test`, `npm run build`, Garmin counts before/after |

Manual spot checks: open erp2.zanko.uz → Item list filtered by group Zanko shows photos; product page on zanko.uz shows ERP stock; zanko admin shows read-only stock/price and sync status.

## 3. Anti-drift
- **Primary objective:** stock on zanko.uz equals ERP stock, and website sales move ERP stock — continuously, not just once.
- **Proxy signals (not success by themselves):** the export script ran; webhooks configured; build passes; ERP login page loads.
- **Intended scope:** zanko repo (sync lib, endpoint, outbox, admin read-only), ERP site config/data for company Zanko, edge-nginx/certbot for the domain.
- **Completion target:** full delivery (all deliverables 1–5, A1–A8).

## Plan-stage findings (change the build, not the goal)
- **Site "rename" → re-domain only.** The ERP frontend already forces the site via `FRAPPE_SITE_NAME_HEADER`; renaming the internal site directory adds risk (if `.env` SITE_NAME changes first, the `create-site` service runs `bench new-site` = empty ERP) and no visible benefit. Users only ever see erp2.zanko.uz. Internal site name stays `erp.tigr.uz`.
- **erp.tigr.uz redirect:** browser traffic 301s to erp2.zanko.uz; `/api/` keeps proxying on the old name, so any unknown script using the API (Administrator has an API key) keeps working — a 301 would break its POSTs.
- **Stock webhook on Stock Ledger Entry, not Bin:** ERPNext updates Bin with `frappe.db.set_value` (bin.py:289), which fires no doc events. The webhook only says "item X changed"; the store re-reads the real Bin quantity.
- **Valuation:** Zanko has perpetual inventory ON, which makes opening stock and every Delivery Note post GL entries and need a cost price we don't have. In line with the approved "no accounting" non-goal: turn perpetual inventory OFF for Zanko (0 GL entries exist) and allow zero valuation rate. Can be turned on later when costs are entered.
- **Oversell guard:** site stock = ERP actual qty − units in not-yet-pushed confirmations + units in not-yet-pushed cancellations. Otherwise a webhook or reconcile during an ERP outage would "give back" stock already sold.
- **SKU = link.** No collisions with Garmin item codes (checked: no store SKU matches Garmin's `010-…` codes). Once a SKU is linked to ERP, it is locked in the admin.
- **Storefront pages are `force-dynamic`** (p/[slug], c/[slug], checkout): a DB update shows immediately; no cache revalidation needed. Acceptance still checks the rendered page.
- **Photos:** most images are Shopify CDN URLs (≈20 per product, ≈900 files). They are downloaded and uploaded into ERPNext as real files, not links.
- **Orders confirmed before cutover then cancelled:** no Delivery Note exists to return against → the store pushes a Material Receipt stock entry instead.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 ERP domain | erp2.zanko.uz live with TLS; erp.tigr.uz 301 (except /api/) | `agent_direct` (owner); vps-front-door runbook | `/home/nick/edge/conf.d/`, certbot hook, ERP site_config | – |
| M2 ERP Zanko setup | currency UZS, perpetual off, price list, item group root, customer, custom fields, API user, webhooks (spike-proven) | `agent_direct` (owner) | ERP data only; script `scripts/erp/setup.py` in zanko repo | M1 |
| M3 Store ERP core | schema (outbox, link), ERP client, pure stock/signature logic, unit tests | `superpowers:test-driven-development` (owner) | `prisma/`, `src/lib/erp/`, `tests/lib/erp-*.test.ts` | – |
| M4 Export | idempotent items/groups/brands/photos/prices + opening stock + diff report | `superpowers:test-driven-development` (owner) | `src/lib/erp/items.ts`, `scripts/erp-export.ts` | M2, M3 |
| M5 Live sync | webhook route, outbox in setOrderStatus, drain, reconcile, sync route, systemd timer | `superpowers:test-driven-development` (owner) | `src/lib/erp/{outbox,apply}.ts`, `src/lib/orders.ts`, `src/app/api/erp/`, systemd unit | M3, M4 |
| M6 Admin | stock/price/SKU read-only for linked SKUs (editor, inline edit, importer), sync status + retry | `superpowers:test-driven-development` (owner) | `src/lib/admin/products.ts`, admin components/pages | M3 |
| M7 Cutover + QA | deploy, export, enable sync, A1–A8 with evidence; review | `superpowers:verification-before-completion` (owner), `code-reviewer` (verifier) | none (ops + plan file) | all |

Gaps: none. Execution is native (this session); no parallel agents, so no worktrees.

Waves:
- Wave 1: M1 ‖ M3 (disjoint: server config vs. repo code)
- Wave 2: M2 (includes webhook spike)
- Wave 3: M4
- Wave 4: M5 ‖ M6 (done in sequence by the lead: both touch admin-adjacent code)
- Wave 5: M7

## 5. Tasks

Env keys (in `/home/nick/zanko/.env`): `ERP_ENABLED=1`, `ERP_URL=http://127.0.0.1:8088`, `ERP_HOST=erp2.zanko.uz`, `ERP_API_KEY`, `ERP_API_SECRET`, `ERP_WEBHOOK_SECRET`, `ERP_SYNC_TOKEN`. ERP constants: company `Zanko`, warehouse `Stores - Z`, price list `Zanko Retail`, customer `zanko.uz Website`, root item group `Zanko`.
With `ERP_ENABLED` unset, the store behaves exactly as today (feature flag = instant rollback).

### M1 — ERP domain (wave 1)
- [x] 1.1 Backups: `bench --site erp.tigr.uz backup --with-files` (inside erp-backend), copy out to `/home/nick/ERP/backups/`; copy `/home/nick/edge/conf.d/erp.conf` → `erp.conf.bak-pre-erp2`. — verify: backup files exist with size > 0. ✔ /home/nick/ERP/backups/20261126_225249-* (db 1.2 MB, files 1.9 MB); edge/erp.conf.bak-pre-erp2.
- [x] 1.2 Add an HTTP-only `erp2.conf` vhost (ACME + 301), test with a throwaway nginx container, reload edge; `sudo certbot certonly --webroot -w /var/www/certbot -d erp2.zanko.uz`; add `erp2.zanko.uz` to the deploy-hook name list; run the hook. — verify: `/home/nick/edge/ssl/erp2.zanko.uz.crt` exists. ✔ cert issued, hook list updated (backup edge/reload-nginx.sh.bak-pre-erp2).
- [x] 1.3 Full `erp2.conf` (HTTPS proxy to `erpnext_frontend`, same headers/websocket/body size as erp.conf); change `erp.conf` HTTPS server: `location /api/` → proxy as before, `location /` → `return 301 https://erp2.zanko.uz$request_uri`. `nginx -t` in a throwaway container, reload. — verify: A1 curls; websocket `/socket.io/` 101/200 via erp2. ✔ erp2/login 200; erp.tigr.uz/app 301 → erp2; /api/method/ping pong on both; socket.io polling 200.
- [x] 1.4 `bench --site erp.tigr.uz set-config host_name https://erp2.zanko.uz`; clear cache. — verify: log in at erp2.zanko.uz in the headless browser, desk loads, no mixed/foreign host links. ✔ API login via erp2 OK, /app/home 200 (only internal site name appears in boot data).

### M3 — Store ERP core (wave 1)
- [x] 3.1 Prisma migration `erp_sync`: `Variant.erpLinkedAt DateTime?`; model `ErpOutbox { id Int @id, ref String @unique, kind String /* DELIVER | RETURN | RECEIPT */, orderId Int, lines Json /* [{sku, qty, rateUzs}] */, status String @default("PENDING") /* PENDING | RUNNING | DONE | FAILED */, attempts Int @default(0), nextAttemptAt DateTime @default(now()), lockedUntil DateTime?, lastError String?, erpDoc String?, createdAt, updatedAt; @@index([status, nextAttemptAt]) }`. Sync state in `Setting` keys `erp.lastReconcileAt`, `erp.lastReconcileResult`. — verify: `npx prisma migrate dev` on test DB; `npm test` green. ✔ migration 20261126175730_erp_sync (additive). Work in worktree /home/nick/worktrees/zanko-erp, branch feat/erpnext-sync (own node_modules).
- [x] 3.2 Test first, then `src/lib/erp/client.ts`: `erpRequest<T>(method, path, {query?, body?}) => Promise<T>` with `Authorization: token KEY:SECRET`, `Host: ERP_HOST`, 15 s timeout; throws `ErpError { status: number; transient: boolean; message }` — transient = network error, timeout, 5xx, 429; permanent = other 4xx (message from Frappe `_server_messages`/`exception`). Plus `erpUploadFile(buf, filename, {doctype, docname, isPrivate:0}) => Promise<string /* file_url */>`. Tests with mocked `fetch`: `tests/lib/erp-client.test.ts` (auth header, Host header, 500 → transient, 417 ValidationError → permanent with Frappe message). ✔ 11/11; also `erpEnabled()`, `setErpFetch()` for tests.
- [x] 3.3 Test first, then `src/lib/erp/core.ts` (pure): `siteStock(erpActual: number, pendingOut: number, pendingBack: number): number` = `max(0, floor(erpActual) - pendingOut + pendingBack)`; `verifyErpSignature(rawBody: string, header: string | null, secret: string): boolean` = timing-safe compare with base64(HMAC-SHA256(secret, rawBody)); `pendingBySku(rows: {kind, lines, status}[]) => Map<sku, {out, back}>` counting only PENDING/RUNNING/FAILED rows (DELIVER → out, RETURN/RECEIPT → back). Tests: `tests/lib/erp-core.test.ts` incl. ERP 5 with 2 pending out → 3; ERP 1 with 3 pending out → 0; bad/missing signature → false. ✔ 9/9 (ERP constants in core.ts as `ERP`).
- [x] 3.4 Commit `feat(erp): schema, client and core sync logic`.

### M2 — ERP Zanko setup (wave 2)
`scripts/erp/setup.py` (idempotent, run via `bench --site erp.tigr.uz execute`/console inside erp-backend; copied in with `docker cp`):
- [x] 2.1 Record Garmin baseline (item count, Bin sum, Item Price count) to `/home/nick/zanko-data/erp-garmin-baseline.json`. ✔ 44 items, Bin 539, 53 SLE, 44 prices, 3 SI.
- [x] 2.2 Enable currency UZS (symbol `so'm`, fraction 0 decimals); Company Zanko: `default_currency=UZS`, update Zanko accounts `account_currency` USD→UZS (guard: abort if any GL Entry for Zanko), `enable_perpetual_inventory=0`, `default_warehouse_for_sales_return=Stores - Z`; Stock Settings `allow_negative_stock` unchanged (0). — verify: query shows UZS everywhere for Zanko, 0 USD accounts. ✔ `{currency: UZS, perpetual: 0, usd_accounts: 0}`.
- [x] 2.3 Create: Price List `Zanko Retail` (selling, UZS); Item Group `Zanko` (is_group, under root); Customer `zanko.uz Website` (Individual, group/territory = existing defaults, default_currency UZS); custom field `zanko_order_ref` (Data, unique, read-only, in list) on Delivery Note and Stock Entry; custom field `zanko_url` (Data) on Item. Pick the stock UOM used by the Garmin items (store it in the script output). ✔ UOM = `Кол-во`; territory `Uzbekistan` created; customer group `Частное лицо`.
- [x] 2.4 API user `zanko-sync@zanko.uz` (System User, roles: Stock User, Stock Manager, Sales User, Item Manager), generate key/secret → `.env`. — verify: `curl -H "Host: erp2.zanko.uz" -H "Authorization: token …" http://127.0.0.1:8088/api/method/frappe.auth.get_logged_user` → the user. ✔ returns zanko-sync@zanko.uz; keys in zanko .env (backup zanko-data/env.bak-pre-erp). Ruling: added role Sales Master Manager (Item Price create was PermissionError without it); User Permission limits it to company Zanko for transactions, but it can still read other masters (items/customers) — acceptable for a server-side key.
- [x] 2.5 **Spike (gate):** temporary webhook to a netcat/echo listener on 172.19.0.1; create a throwaway item `ZK-SPIKE` in Zanko, Material Receipt 1 → confirm which event fires on Stock Ledger Entry (after_insert or on_submit), the payload, and the signature header/format (expected `X-Frappe-Webhook-Signature`, base64 HMAC-SHA256). Then cancel/delete the spike docs and item. Record the result here. If neither event fires → fallback: reconcile every 1 min, logged as a revision. ✔ Result: SLE `after_insert` fires (on_submit not allowed: SLE not submittable); Item Price `on_update` fires on insert too; header `X-Frappe-Webhook-Signature` = base64 HMAC-SHA256 of body (verified); Bin readable via API; DN `docstatus:1` with `allow_zero_valuation_rate` works, return DN works, duplicate `zanko_order_ref` → `UniqueValidationError`, oversell → HTTP 417. Spike docs/item/webhooks deleted (0 left, 0 GL entries).
- [x] 2.6 Real webhooks (disabled until cutover): `ZK stock` on Stock Ledger Entry (event from 2.5), condition `doc.company == "Zanko"`, JSON `{"type":"stock","item_code":"{{ doc.item_code }}"}`; `ZK price` on Item Price after_insert/on_update/on_trash, condition `doc.price_list == "Zanko Retail"`, JSON `{"type":"price","item_code":"{{ doc.item_code }}"}`. URL `http://172.19.0.1:3100/api/erp/webhook`, secret = `ERP_WEBHOOK_SECRET`. ✔ created disabled: `ZK stock` (SLE after_insert), `ZK price` (Item Price on_update), `ZK price delete` (on_trash).

### M4 — Export (wave 3)
- [x] 4.1 Test first (mocked client), then `src/lib/erp/items.ts`: `ensureErpItems(opts: { variantIds?: number[]; withImages?: boolean }) => Promise<{ created: number; updated: number; failed: { sku: string; error: string }[] }>`:
  - category tree → Item Groups under `Zanko` (English name; on name clash with a non-Zanko group, suffix ` (Zanko)`); brand → ERP Brand.
  - Item: `item_code = sku`, `item_name` = EN title + EN variant name (≤140 chars), `description` = EN short spec, `item_group`, `brand`, `stock_uom` (from 2.3), `is_stock_item 1`, `item_defaults [{company: Zanko, default_warehouse: Stores - Z, default_price_list: Zanko Retail}]`, `zanko_url = https://zanko.uz/p/<slug>`.
  - Photos (withImages): download every product image (Shopify URL or local `/uploads/…` from disk), upload, attach to the item; first image (variant's `imageIndex` image if set) → `image`. Skip files already attached (match by filename).
  - Item Price in Zanko Retail = `priceUzs` **only when no price exists** (ERP owns price after creation).
  - Set `Variant.erpLinkedAt` on success; failures are collected, not thrown.
  Tests `tests/lib/erp-items.test.ts`: creates group + item + price once; second run creates nothing new; existing ERP price is not overwritten; one failing SKU doesn't stop others. ✔ 6/6 with in-memory fake ERP (tests/lib/erp-fake.ts). Ruling: items are looked up by filters, never by name in the URL — 34 Sony SKUs contain `/`. Ruling: added `all` option (default = unlinked only, used by the sync job; export uses `all`).
- [x] 4.2 `scripts/erp-export.ts` (`tsx`): `ensureErpItems({withImages:true})` for all variants → Stock Reconciliation (`purpose: Stock Reconciliation`, company Zanko, warehouse Stores - Z, `valuation_rate 0`, `allow_zero_valuation_rate 1`, remark `zanko-opening-2026-11-26`) for SKUs with stock > 0, skipped if a submitted reconciliation with that remark exists → prints a diff report (SKU count, price mismatches, stock mismatches). `--dry-run` prints the plan only. ✔ live dry-run vs real ERP: 171 SKUs to create, opening 7 SKUs / 54 units. Ruling: opening doc keyed by unique `zanko_order_ref = ZK-OPENING` (custom field added to Stock Reconciliation) because `remarks` is not filterable via API. Ruling: store now has 57 products / 171 SKUs (Sony, Ray-Ban added today) — A2/A3 apply to all SKUs, not the 117 counted at requirement time.
- [x] 4.3 Commit `feat(erp): item export with photos, prices and opening stock`.

### M5 — Live sync (wave 4)
- [x] 5.1 Test first: `setOrderStatus` (when `ERP_ENABLED`) creates an `ErpOutbox` row **in the same transaction**: NEW→CONFIRMED → `DELIVER` ref `ZK-<orderId>`; CONFIRMED/SHIPPING→CANCELLED → `RETURN` ref `ZK-<orderId>-R` if a DELIVER row exists, else `RECEIPT` ref `ZK-<orderId>-R` (pre-cutover order). Lines from order lines (sku, qty, priceUzs). Flag off → no rows. After commit: `runAfterResponse(drainOutbox)`. Tests in `tests/lib/orders.test.ts`. ✔ 6 new tests RED→GREEN (31/31). Ruling: cancelling an order whose DELIVER never reached ERP (PENDING/FAILED) marks it `SKIPPED` instead of pushing a delivery + return pair.
- [x] 5.2 Test first, then `src/lib/erp/outbox.ts`: `drainOutbox(now = new Date()) => Promise<{ done: number; failed: number; pending: number }>`:
  - claim rows with `status IN (PENDING, RUNNING-with-expired-lock) AND nextAttemptAt <= now` via conditional update (lock 60 s), so concurrent drains never double-push.
  - before creating, look up the ERP doc by `zanko_order_ref = ref` (docstatus 1) → if found, mark DONE with that name (covers "ERP committed but we timed out").
  - DELIVER → Delivery Note `docstatus: 1` (customer, company, `set_warehouse`, `selling_price_list`, currency UZS, items qty/rate, `zanko_order_ref`, remarks `zanko.uz order #<id>`). RETURN → `is_return 1`, `return_against` = DELIVER's erpDoc, negative qty. RECEIPT → Stock Entry `Material Receipt` `docstatus: 1` to Stores - Z, zero valuation allowed.
  - transient error → back to PENDING, `attempts+1`, backoff `min(2^attempts, 60)` min; permanent error (e.g. negative stock) → FAILED with message. `retryOutbox(id)` resets FAILED → PENDING.
  Tests `tests/lib/erp-outbox.test.ts`: success → DONE + erpDoc; existing ref → DONE without POST; 503 → PENDING with backoff; 417 → FAILED; two concurrent drains → one POST. ✔ 9/9 RED→GREEN. RETURN waits (transient) until its DELIVER is DONE; a doc found by ref in ERP but cancelled/draft → FAILED with message.
- [x] 5.3 Test first, then `src/lib/erp/apply.ts`: `refreshFromErp(skus?: string[]) => Promise<{ stockChanged: number; priceChanged: number; missingInErp: string[]; missingPrice: string[] }>` — reads Bin `actual_qty` (warehouse Stores - Z) and `Item Price` (Zanko Retail) for linked variants (all when `skus` omitted, paged), applies `siteStock(actual, pending.out, pending.back)`; price updated only when present (missing price → reported, never zeroed); item absent in ERP → reported, untouched. Writes `erp.lastReconcileAt/Result`. Tests `tests/lib/erp-apply.test.ts`: pending DELIVER keeps the deduction; missing price untouched; no Bin row → stock 0. ✔ 7/7 RED→GREEN; writes are conditional on the stock read (a concurrent confirm wins; next refresh corrects).
- [x] 5.4 Routes: `src/app/api/erp/webhook/route.ts` (POST; raw body; `verifyErpSignature` else 401; `{type, item_code}` → `refreshFromErp([item_code])`; 200 fast). `src/app/api/erp/sync/route.ts` (POST; `Authorization: Bearer ERP_SYNC_TOKEN` else 401; `drainOutbox()`, then `ensureErpItems({withImages:true})` for unlinked variants and `refreshFromErp()` when last reconcile ≥ 5 min ago). Route tests in `tests/api/erp.test.ts` (401s, valid signed webhook updates stock). Check middleware matcher doesn't localize `/api/erp`. ✔ 7/7 (note: route tests written alongside the routes, not watched failing first). proxy.ts matcher excludes `/api` except `/api/admin` ✔. Sync route has an in-process mutex so overlapping timer runs skip.
- [x] 5.5 systemd `zanko-erp-sync.service` (oneshot: `curl -fsS -X POST -H "Authorization: Bearer $ERP_SYNC_TOKEN" http://127.0.0.1:3100/api/erp/sync`, EnvironmentFile=/home/nick/zanko/.env) + `zanko-erp-sync.timer` (`OnCalendar=*:*:00`, every minute). Installed but not enabled until cutover. ✔ files in `scripts/systemd/` (installed at cutover).
- [x] 5.6 Commit `feat(erp): live sync — webhook, outbox, reconcile`.

### M6 — Admin (wave 4, after M5)
- [x] 6.1 Test first: `saveProduct` path in `src/lib/admin/products.ts` with `ERP_ENABLED`: for variants with `erpLinkedAt`, input `stock`, `priceUzs` and `sku` are ignored (DB values kept, no stale-stock check on them); deleting a linked variant is allowed (ERP item stays); new variants get `stock 0` and their price as the initial ERP price. `updateVariantInline` on a linked variant → `{ ok: false, error: 'ERP_MANAGED' }`. Importer (`src/lib/importer/anker.ts`) unchanged except stock 0 (already) — picked up by the next sync. Tests in `tests/lib/admin-products.test.ts`. ✔ 5 new tests (4 RED→GREEN; flag-off case passed before, as expected) 40/40. Linked variants: editor values for SKU/price/stock replaced by DB values before validation, never written; ERP-changed stock no longer makes a save stale.
- [x] 6.2 UI: product editor + products list inline edit — stock/price/SKU inputs disabled for linked variants with note "Managed in ERP (erp2.zanko.uz)" (UI strings via existing admin i18n). Dashboard card "ERP sync": last reconcile time + result, outbox pending/failed counts, failed rows with error, order link and a Retry button (`retryOutbox`). — verify: headless screenshots via `/home/nick/tools/browser/review.mjs`. ✔ code done (VariantEditor disabled inputs + note, ProductTable plain values with ERP tag, dashboard ErpSyncCard + Retry action `retryErpOutboxAction`, permission `orders`); screenshots taken in M7.6 after deploy.
- [x] 6.3 Commit `feat(erp): admin read-only stock/price and sync status`.

### M7 — Cutover + QA (wave 5)
- [x] 7.1 `npm test`, `npm run build` green; `code-reviewer` agent on the branch diff; fix real findings. ✔ build OK (routes /api/erp/sync, /api/erp/webhook); fresh code-reviewer (opus): 3 Critical, 8 Important, 11 Minor. One fix pass (commit 9bb84a6), each with a test watched failing first, suite 1042/1042:
  - C1 cancel skipped deliveries that might be in ERP → skip only if never sent (PENDING, attempts 0); otherwise RETURN, and the drain asks ERP (adopt the note, or skip both). Client: timeout while reading the body is transient; unexpected errors are retried.
  - C2 FAILED return/receipt added phantom stock → only a FAILED DELIVER counts.
  - C3 refresh read ERP before pending pushes → reversed order; drain refreshes SKUs right after each push.
  - I1 one 60 s lock for 50 rows + unconditional writes → rows claimed one by one, 5-min lock used as ownership token, conditional final writes (verified the test fails on the old code).
  - I2 RETURN waiting forever on a FAILED DELIVER → covered by the C1 ERP check.
  - I3 flag off/on → RECEIPT only for orders confirmed before `erp.cutoverAt` (stamped by the export). Ruling: re-enabling after a long off period needs a re-baseline (documented in Rollback).
  - I4 later-linked SKU with site stock was wiped → Material Receipt `ZK-OPEN-<variantId>` when ERP has none.
  - I5 could overwrite a Garmin item with the same code → refused unless the item is in a Zanko group.
  - I6 one failing step stopped the sync → steps isolated; reconcile runs before the slow photo export.
  - I7 export read stock too early → reads it right before the opening reconciliation; cutover is run with the flag off (no unit test: verified in 7.3).
  - I8 one unlinked SKU failed the whole Delivery Note → outbox lines only for linked SKUs.
  - Deferred minors (M1–M11): kept in a private note on the server, not in the public repo.
- [x] 7.2 Window: back up zanko.db (node better-sqlite3 `.backup()`), ERP backup; merge to main; `prisma migrate deploy`; build; set env (`ERP_ENABLED=1` etc.); restart zanko. ✔ backup zanko-data/backups/zanko-pre-erp-2026-11-26.db; merged as 155c274; migrate deploy OK; build OK; restarted (home 307→locale, /api/erp/sync without token 401); sync units copied to /etc/systemd/system (not enabled). Ruling (I7): flag kept OFF during the export; turned on right after the opening reconciliation.
- [x] 7.3 `tsx scripts/erp-export.ts --dry-run`, then real run → diff report must show 117 SKUs, 0 price and 0 stock mismatches (A2, A3). ✔ (flag off) `items: created 171, failed 0`; opening `MAT-RECO-2026-00001` 7 SKUs / 54 units; `erp.cutoverAt 2026-11-26T19:28:29Z`; diff `skus 171, inErp 171, erpUnits 54, missing [], priceMismatch [], stockMismatch []`, exit 0 (log zanko-data/erp-export-2026-11-26.log). ERP: 171 items all with image, 1988 photo files attached, 10 item groups under Zanko. The run outlived the previous session (orphaned process finished on its own).
- [x] 7.4 Enable both webhooks + `zanko-erp-sync.timer`. ✔ ERP_ENABLED=1 in .env (backup zanko-data/env.bak-pre-erp-enable), zanko restarted; webhooks ZK stock / ZK price / ZK price delete enabled; timer enabled (journal: runs every minute, ok). Full sync: outbox 0/0/0, items 0, reconcile 0 changes, 0 missing.
- [x] 7.5 Run A4–A7 on a test SKU `ZK-TEST-1` (unpublished product, created in admin, stock set via ERP Material Receipt); then remove test docs/order/product. A8 Garmin baseline diff = 0. ✔ (temporary scripts/erp-acceptance.ts, removed) PASS A4-stock: ERP receipt +3 → site 3 after 1 s (webhook); PASS A4-price: 1000→2000 → site 2000 after 1 s; PASS A5-confirm: DN created, ERP 3→2, site 2; PASS A5-cancel: return DN, ERP 3, site 3; PASS A6-outage (ERP unreachable for the confirming process): confirm ok, row PENDING attempts 1, site 2 during outage, after recovery exactly 1 DN with the ref, ERP 2; PASS A7: site set to 99 → refresh → 2. A8: Garmin 44 items / Bin 539 / 53 SLE / 3 SI / 44 prices — identical before and after. Cleanup: test DNs/receipt cancelled+deleted (ERP back to 7 bins / 54 units, 0 DN), test product + 2 test orders (negative numbers) deleted; final full sync 0 changes. Ruling: A6 simulated the outage by pointing the confirming process at a closed port instead of stopping erp-backend (same code path, no ERP downtime for staff).
- [~] 7.6 Manual spot checks (screenshots), Result + Handoff, memory update. Done: live product page /en/p/a121d-… shows "Only 5 left" = ERP qty 5; ERP items have photos (API). Not done: logged-in screenshots of erp2 item list and zanko admin (needs the owner's logins) — left for the owner.

## 6. Verification
- `npm test` · `npm run build`
- `tsx scripts/erp-export.ts --dry-run` → 0 mismatches
- A1: `curl -sI https://erp2.zanko.uz/login` → 200; `curl -sI https://erp.tigr.uz/app` → 301 to erp2; `curl -s https://erp.tigr.uz/api/method/ping` → `{"message":"pong"}`
- A4–A7: `scripts/erp-acceptance.ts` (temporary, removed after) asserting on the DB **and** the rendered product page.
- A8: Garmin baseline JSON vs. fresh query → identical.

## 7. Rollback
- Store: set `ERP_ENABLED=` (empty) + restart → old behaviour; disable timer; migration is additive (new table/column). Full: restore `zanko-data/backups/zanko-pre-erp-*.db`. Re-enabling after the flag was off: orders confirmed meanwhile never reached ERP — re-baseline ERP stock from the site (Stock Reconciliation) before turning it back on.
- ERP: disable the two webhooks; ERP data restore from `/home/nick/ERP/backups/` (bench restore) if setup went wrong.
- Edge: restore `erp.conf.bak-pre-erp2`, remove `erp2.conf`, reload.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-26: requirement approved by owner (sync approach A, ERP stock drops at confirmation).
- 2026-11-26 plan approved by owner. Plan-stage changes: no internal site rename; /api/ on erp.tigr.uz keeps proxying; perpetual inventory off for Zanko; stock webhook on Stock Ledger Entry; pre-cutover cancellations → Material Receipt; SKU locked once linked.

## Result
Delivered:
- ERPNext at https://erp2.zanko.uz (TLS, cert auto-renews); erp.tigr.uz 301s to it except /api/ (still proxied).
- Company Zanko in UZS; 171 SKUs as Items (10 groups, brands, all photos, Zanko Retail prices); opening stock 54 units / 7 SKUs.
- Live sync on zanko.uz (ERP_ENABLED=1): ERP stock/price → site in ~1 s via webhooks + full reconcile every 5 min (timer every minute); confirmed order → Delivery Note, cancel → return (or stock receipt for pre-cutover orders); outbox with retries, exactly-once by unique `zanko_order_ref`.
- Admin: stock/price/SKU read-only for ERP items; dashboard "ERP sync" card with failed pushes + Retry; new SKUs auto-created in ERP.
Checks run: 1042/1042 unit tests; production build; fresh code review (3 C + 8 I fixed); live export diff 0 mismatches; live A4–A7 PASS; A8 Garmin unchanged.
Gaps: logged-in screenshots not taken (7.6); deferred minors M1–M11 (listed under 7.1).
Follow-ups: stock is now changed in ERPNext only (Stock Entry / Stock Reconciliation in Stores - Z); turn perpetual inventory back on when cost prices are entered; then the deferred minor fixes (private note).

## Handoff
Live since 2026-11-26 ~20:35 CET (main 155c274 + ERP_ENABLED=1). Rollback: remove ERP_ENABLED from /home/nick/zanko/.env, restart zanko, `systemctl disable --now zanko-erp-sync.timer`, disable the three ZK webhooks (re-baseline before re-enabling). ERP setup is scripts/erp/setup.py (run in erp-backend from sites/). Only open item: owner's visual check of erp2 item list and the admin ERP card.
