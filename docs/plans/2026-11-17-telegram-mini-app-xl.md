# Telegram Mini App store (same shop inside Telegram) + bot notifications + location — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 6 | 18/18 | 2026-11-17 | Owner: live check inside Telegram over HTTPS (see Handoff) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Owner's request (2026-11-17)
"Build same clone of this website in telegram bot … not just in chat buttons but it should open like browser … all orders, account, payments etc. should be there same with website. Database should be connected. All notifications to user go through telegram bot like order status, delivery etc. Use telegram location sharing to get user's shipping address location."
Owner answers: payments = **pay on delivery for now** (acquiring later). Build approach = **A, my pick** ("your pick").

### Why
Uzbek shoppers live in Telegram; big local companies ship their shop as a Telegram Mini App. The owner wants the full store reachable without leaving Telegram, with the bot as the single channel for order updates.

### What exists today (recon)
- Storefront `src/app/[locale]/*` (uz/ru/en, next-intl), layout wraps everything in `StoreShell` (Navbar + Footer). Cart in `localStorage`, checkout `CheckoutForm.tsx` (name, phone, region select, address, comment; signed-in → saved-address picker, phone fixed to account).
- Customer accounts (previous plan `2026-11-17-customer-account-telegram-xl.md`, Done): `Customer.telegramUserId/telegramChatId`, `customer_session` cookie (jose JWT, SameSite=Lax), account pages `/account/*`, sign-in via bot deep link + contact share.
- Bot: token + username in Settings (both saved). One update handler `src/lib/telegram-bot/handler.ts` used by webhook `/api/telegram/webhook` (prod) and `npm run bot:poll` (dev). Admin Settings "Connect bot" registers the webhook.
- Notifications: `notifyOrderStatus` (`src/lib/account/notify.ts`) messages the customer on staff status changes with a URL button; new orders only alert **staff** (`notifyNewOrder`).
- Order statuses: NEW → CONFIRMED → DELIVERED, CANCELLED from NEW/CONFIRMED (`src/lib/orders.ts` TRANSITIONS, stock decremented on CONFIRMED, restored on CONFIRMED→CANCELLED).
- Payments: `Order.paymentStatus` ("UNPAID") + `paymentProvider` fields only; no provider.
- No coordinates anywhere (Order/CustomerAddress have text `region` + `address`).

### Approaches (picked: A)
- **A) Same website, Telegram-aware (chosen).** The bot opens the existing store pages as a Mini App; in Telegram mode the shell swaps Navbar/Footer for a bottom tab bar, signs the user in from Telegram's signed `initData`, and uses Telegram's BackButton/MainButton/theme. One codebase, the Mini App can never drift from the site.
- B) Separate `/tg/*` pages sharing DB/logic — most "native" freedom, but every site change must be done twice. Rejected: drift.
- C) Standalone SPA project — duplicates everything + extra hosting. Rejected.

### Design

**Entry points into the Mini App**
- Bot menu button ("🛍 Shop", next to the message field) set via `setChatMenuButton` (type `web_app`, URL `${SITE_URL}/tg`), plus bot commands via `setMyCommands`. Both are set by the existing admin Settings "Connect bot" action (same click that registers the webhook).
- `/start` (no payload) → welcome message with an inline **"🛍 Open shop"** `web_app` button. `/orders` → last 5 orders with status, each with an "Open" `web_app` button to its order page. *(my call)*
- Every customer notification carries a `web_app` button that opens that order inside the Mini App (instead of a browser URL).
- Existing `/start login_<token>` website sign-in flow stays unchanged.

**Launch + sign-in** — route `/tg` (outside `[locale]`, noindex). `src/proxy.ts` matcher must exclude `tg` (like `api|admin`), otherwise next-intl redirects it. **Every** Mini App entry URL (menu button, Open shop, `/orders`, notification buttons, bot location button) goes through `/tg?next=<same-site path>`; `next` is validated as a same-origin relative path (open-redirect guard), default `/{locale}`. This re-authenticates on every open, so expired/missing cookies never strand a user.
1. Loads `https://telegram.org/js/telegram-web-app.js`, calls `ready()` + `expand()`, POSTs `Telegram.WebApp.initData` to `POST /api/tg/session`.
2. Server validates initData per Telegram spec: HMAC-SHA256 with key `HMAC("WebAppData", botToken)`, constant-time compare, `auth_date` ≤ 24 h old, `user.id` present. Invalid → 401, the page shows "Open this from the shop's Telegram bot".
3. Valid + `Customer.telegramUserId == user.id` with an account → issue `customer_session` (same JWT/sessionVersion rules) and set `tg_mode=1` cookie; redirect to `/${locale}` (locale = account locale, else Telegram `language_code` if uz/ru/en, else uz).
4. Valid but no linked account → still set `tg_mode=1` and let them browse as guest (no session). A blocked customer is treated like on the site (can sign in, cannot order).
- Cookies set from the Mini App use `SameSite=None; Secure` (Telegram Web embeds the app in an iframe; Desktop/mobile use a native webview; Lax cookies would be dropped there). Mobile apps (iOS/Android webview) are the primary target; Telegram Web is best-effort (browsers that block third-party cookies may not keep the session — documented, not engineered around).

**Phone linking inside the Mini App** (needed so orders show in the account and notifications reach the chat)
- Checkout in Telegram mode requires a linked account. If the user has none, the checkout shows one button **"Share phone number"** → `Telegram.WebApp.requestContact()`. Telegram delivers the contact to the bot as a normal `contact` message. Today `onContact` answers "start on the site first" when no website login is pending, and `linkTelegramContact` is tied to a pending login row — so add a **tokenless link path** (new function in `src/lib/account/login.ts`) with the same checks (own contact, UZ number, not a bot) and the same existing "newest verified contact wins" relink rule (a phone previously linked to another Telegram user moves to this one and that account's `sessionVersion` is bumped, as today). Bot replies "Phone linked ✓". The Mini App then re-calls `/api/tg/session` (short poll, ≤ 10 s) and continues with the session. The unsigned client-side contact payload is never trusted.
- Declined / non-UZ number → clear localized message; browsing still works.

**Telegram mode UI** (decided by the `tg_mode` cookie, read server-side in `StoreShell`, so no layout flash). In Telegram mode `StoreShell` loads `telegram-web-app.js` on **every** store page (Back/MainButton, `requestContact`, `LocationManager`, haptics run there), not only on `/tg`.
- Hide Navbar + Footer; show a fixed **bottom tab bar**: Home · Catalog · Cart (badge with item count) · Orders · Profile. A compact top bar with search + language switcher. *(my call)*
- Catalog tab = a categories page (reuse category tiles). Orders = `/account/orders`; Profile = `/account` (sign-out hidden in TG mode, "sign out everywhere" kept).
- Telegram **BackButton** shown on non-tab pages (uses router back); **MainButton** on cart ("Checkout · {total}") and on checkout ("Place order · {total}") replacing the in-page submit; haptic feedback on add-to-cart. *(my call)*
- Header/background colors set to the store's own palette via `setHeaderColor`/`setBackgroundColor`; store design kept (no full re-theme to Telegram colors). *(my call)*
- Links leaving the site open via `Telegram.WebApp.openLink`; `t.me` links via `openTelegramLink`.
- The website without `tg_mode` is visually unchanged.

**Order statuses + notifications**
- New **optional** status **SHIPPING ("Out for delivery")** (owner, 2026-11-17): CONFIRMED → SHIPPING → DELIVERED, and the direct CONFIRMED → DELIVERED stays allowed (pickup / same-day); SHIPPING → CANCELLED restores stock (same as CONFIRMED → CANCELLED). Admin order page/list/filters/badges, account status badge and timeline, and uz/ru/en labels updated.
- Customer messages through the bot (linked account + notifications on), in the order's locale:
  - **Order placed** (new): "Order #N received — {items count} items, {total} so'm, pay on delivery" + Open order button.
  - **Status changes**: confirmed, out for delivery, delivered, cancelled (existing mechanism, extended with SHIPPING and the `web_app` button).
- Failures never block order placement or status change (existing `runAfterResponse` pattern).

**Location (Telegram location sharing)**
- `Order` and `CustomerAddress` get optional `lat`, `lng` (Float). Validated server-side: both or neither, lat ∈ [-90,90], lng ∈ [-180,180].
- Checkout (Telegram mode **and** website) gets an optional **"📍 Share my location"** button: in Telegram uses `WebApp.LocationManager` (Bot API 8.0+), falling back to `navigator.geolocation`. Once attached: "Location attached ✓ · view on map · remove". The text address stays required (apartment, entrance for the courier). "Save this address" saves the pin with the address. Saved addresses page can attach/replace a pin too.
- **In bot chat:** if the user sends a location (paperclip → Location), the bot replies with inline buttons: one per saved address ("Attach to: Home") + "➕ Use for a new address" (`web_app` button opening the Mini App addresses page with the coordinates prefilled). No account → "Share your phone first" + Open shop button. *(my call)*
- Staff: admin order detail shows **"Open in map"** (Yandex Maps + Google Maps links); the staff Telegram new-order alert includes a map link when a pin exists. No reverse geocoding (region still chosen from the list).

**Payments**
- Unchanged: pay on delivery. Mini App order pages show payment status exactly like the site. Order placement code keeps a single place where a future acquiring step would plug in (no stub provider built).

**Hosting requirement**
- Telegram opens Mini Apps only over public **HTTPS**. Local dev: everything testable in a normal browser via `/tg?dev=1`-style simulation is **not** provided (a fake initData would bypass auth); instead README documents testing through an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) with `SITE_URL` pointed at it, then "Connect bot". Automated tests cover initData validation and the TG-mode rendering with signed test data.

### Requirement summary
- **Goal:** A shopper opens the shop inside Telegram (menu button / Open shop), is signed in automatically, browses, orders (pay on delivery, optional map pin), and follows the order to delivery through bot messages — same database and data as the website.
- **Deliverables:** `/tg` launch route + `/api/tg/session` (initData validation); Telegram-mode shell (tab bar, Back/MainButton, colors, links); contact linking without a pending website login; SHIPPING status end-to-end; order-placed + status bot messages with `web_app` buttons; bot `/start` Open shop, `/orders`, location-message handling; menu button + commands in "Connect bot"; lat/lng on orders and addresses + checkout/address location UI + admin map link + staff alert link; uz/ru/en strings; tests; README section.
- **Constraints:** Next.js 16 — read `node_modules/next/dist/docs/` before code (AGENTS.md); Prisma 7 + SQLite, additive migration only; next-intl; Tailwind 4; no new runtime npm dependency (Telegram JS loaded from telegram.org script tag; HMAC via node `crypto`); Telegram calls injectable/mocked in tests; guest website checkout unchanged; existing website sign-in flow unchanged; the ~80 already-modified files in the working tree are the owner's in-progress work — edit only what this plan needs, never revert; no commits unless asked.
- **Non-goals:** online payment/acquiring (later), Telegram Stars/Payments API, reverse geocoding or map picker widget, courier app/tracking live location, separate Mini App UI (`/tg/*` page copies), admin panel inside Telegram, marketing broadcasts, Telegram Web cookie workarounds beyond SameSite=None.
- **Assumptions:** production has HTTPS `SITE_URL` reachable by Telegram; the saved bot token is valid; customers use recent Telegram apps (Bot API 8.0 for LocationManager, else geolocation fallback; `requestContact` needs 6.9+).
- **Open questions:** none blocking.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | initData validator accepts a correctly signed payload and rejects tampered hash, wrong bot token, missing user, `auth_date` > 24 h | auto | `npx vitest run tests/lib/tg-init-data.test.ts` |
| A2 | `POST /api/tg/session`: linked user → 200 + `customer_session` (SameSite=None; Secure in prod) + `tg_mode`; unknown user → 200 guest + `tg_mode`, no session; bad initData → 401 | auto | `npx vitest run tests/api/tg-session.test.ts` |
| A3 | Bot `contact` message with no pending login links/creates the account for own UZ number; foreign/other-person contact refused | auto | `npx vitest run tests/lib/telegram-bot.test.ts` |
| A4 | SHIPPING transitions: CONFIRMED→SHIPPING→DELIVERED ok; CONFIRMED→DELIVERED still ok; NEW→SHIPPING refused; SHIPPING→CANCELLED restores stock | auto | `npx vitest run tests/lib/orders.test.ts` |
| A5 | Order placed → customer bot message (linked + notify on) with `web_app` button; skipped for guests / notify off; SHIPPING status message text in uz/ru/en | auto | `npx vitest run tests/lib/account-notify.test.ts` |
| A6 | Order and address accept valid lat/lng pairs, reject half pairs / out-of-range; stored and returned | auto | `npx vitest run tests/api/public-orders.test.ts tests/lib/account-domain.test.ts` |
| A7 | Bot location message → buttons for saved addresses; tapping one stores the pin on that address (own address only) | auto | `npx vitest run tests/lib/telegram-bot.test.ts` |
| A8 | "Connect bot" also calls `setChatMenuButton` (web_app → `${SITE_URL}/tg`) and `setMyCommands` | auto | `npx vitest run tests/lib/admin-misc.test.ts` |
| A9 | With `tg_mode` cookie the storefront renders tab bar and no Navbar/Footer; without it the site is unchanged | auto+manual | smoke + browser check |
| A10 | Whole suite, typecheck and production build pass | auto | `npm test`, `npx tsc --noEmit`, `npm run build` |

Manual spot checks (need HTTPS tunnel + real Telegram, owner or me if a tunnel is available):
- Open bot → menu "Shop" → lands signed in on home with tab bar; Back button works on product page.
- New Telegram user: share phone from checkout → order placed → "Order received" message arrives with Open button that opens the order in the Mini App.
- Share location at checkout → admin order shows map link at the right spot.
- Admin moves order Confirmed → Out for delivery → Delivered → two messages arrive.

## 3. Anti-drift
- **Primary objective:** a real shopper can do the whole shop journey inside Telegram (open, auto sign-in, browse, order, track) on the same data as the website, and receives every order update from the bot.
- **Proxy signals (not success by themselves):** tests/build green; pages look right in a desktop browser with a forced `tg_mode` cookie; webhook "connected" in admin.
- **Intended scope:** Telegram-mode presentation of existing pages, Mini App auth, notifications, SHIPPING status, coordinates. Not a redesign of the website.
- **Completion target:** full delivery in code + automated checks; live-Telegram spot checks marked done only if actually run (needs HTTPS), otherwise listed for the owner.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Data & domain | lat/lng columns, coordinate validation, optional SHIPPING status in the domain | `superpowers:test-driven-development` (owner) | `prisma/`, `src/lib/geo.ts`, `src/lib/orders.ts`, `src/lib/admin/orders.ts`, `src/lib/account/addresses.ts`, `src/lib/telegram.ts`, `src/app/api/orders/route.ts`, tests | – |
| M2 Mini App auth | initData check, `/api/tg/session`, `/tg` launch, proxy exclusion, tokenless phone link | `superpowers:test-driven-development` (owner) · `appsec-engineer` (verifier, end of wave) | `src/lib/tg/`, `src/app/tg/`, `src/app/api/tg/`, `src/proxy.ts`, `src/lib/account/login.ts`, `src/lib/account/session.ts`, `src/lib/telegram-bot/handler.ts` (contact only), tests | M1 |
| M3 Bot & notifications | web_app buttons, order-placed + SHIPPING messages, `/start` `/orders`, location messages, menu button + commands | `superpowers:test-driven-development` (owner) | `src/lib/telegram-bot/*`, `src/lib/account/notify.ts`, `src/app/api/orders/route.ts`, tests | M1, M2 |
| M4 Telegram-mode UI | TG shell (tab bar, top bar, bridge), catalog index, Back/MainButton, checkout phone gate | `frontend-developer` guidance (owner, done by lead) | `src/components/tg/`, `src/components/store/StoreShell.tsx`, `CartDrawer.tsx`, `CheckoutForm.tsx`, `src/app/[locale]/c/page.tsx`, `messages/*.json` | M2 |
| M5 Location UI & admin | location button in checkout/addresses, admin map links + SHIPPING UI, account badges | `frontend-developer` guidance (owner, done by lead) | `src/components/store/LocationButton.tsx`, `CheckoutForm.tsx`, `src/components/account/*`, `src/components/admin/OrderStatusButtons.tsx`, `src/app/admin/(panel)/orders/**`, `messages/*.json` | M1, M4 |
| M6 Docs & verification | README section, full checks, browser QA, review | `superpowers:verification-before-completion` (owner) · `evidence-collector` (QA) · `code-reviewer` (verifier) | `README.md`, plan file | M1–M5 |

Gaps: **live Telegram check** needs a public HTTPS URL (tunnel or deploy). It is done only if one is available, otherwise handed to the owner (not claimed).

Waves (**all serial, in the main working tree**). Worktrees branch from `HEAD`, and ~80 files have uncommitted owner changes this work builds on (`CheckoutForm.tsx`, `orders.ts`, `customers.ts` …). A worktree agent would build on stale code, so there are no parallel units:
- Wave 1: M1 → Wave 2: M2 → Wave 3: M3 → Wave 4: M4 → Wave 5: M5 → Wave 6: M6

## 5. Tasks

**Goal:** the shop runs as a Telegram Mini App on the same pages and DB, with bot order notifications and location pins. **Architecture:** a `tg_mode` cookie switches `StoreShell` into Telegram chrome. `/tg` validates `initData` and issues the existing `customer_session`. Bot helpers gain `web_app` buttons that always enter through `/tg?next=`. **Tech:** Next.js 16 (read `node_modules/next/dist/docs/` for route handlers, cookies and proxy before code), Prisma 7/SQLite, next-intl, Tailwind 4, vitest (node env), Telegram WebApp JS from `https://telegram.org/js/telegram-web-app.js`.

### Global constraints
- No new npm runtime dependency. HMAC via `node:crypto`. Migrations are additive (`npm run db:migrate -- --name tg_mini_app`).
- Every Telegram call goes through `botCall`/`botCallResult` with an injectable `fetchImpl`; tests use the `fakeTelegram()` pattern from `tests/lib/telegram-bot.test.ts`.
- Edit only the hunks a task needs inside the owner's dirty files. Never revert unrelated changes. No commits unless the owner asks (the plan's "commit" steps are skipped).
- User-visible copy in uz/ru/en: `messages/*.json` for the site, `src/lib/telegram-bot/messages.ts` (`BotCopy`) for the bot.
- Website without `tg_mode` must render exactly as before.

### Review focus (each has a test in its owning task)
1. `next` param abuse (`//evil.com`, `https://evil.com`, `/\evil.com`, `javascript:`) → falls back to `/{locale}` (T5).
2. Switching Telegram accounts on one device: `customer_session` for customer B while initData says user A → B's session is replaced (A linked) or cleared (A unlinked) (T5).
3. Malformed coordinates: one of the pair, strings, `NaN`, out of range → order `INVALID` / address `INVALID`; a valid pair is stored to 6 decimals (T1, T3).
4. Bot location callback naming another customer's address id → refused, nothing stored (T9).
5. A contact shared while a website login is pending still goes down the existing login flow, not the tokenless path (T7).

### M1 — Data & domain (wave 1)
- [x] **T1 Coordinates column + helper.** _Evidence: migration `20261117151212_tg_mini_app` (4 ADD COLUMN, additive); `tests/lib/geo.test.ts` RED (module missing) → 14/14 GREEN._ Schema: `lat Float?`, `lng Float?` on `Order` and `CustomerAddress`; migration `tg_mini_app`. Create `src/lib/geo.ts`:
  - `cleanLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null | 'INVALID'`: both absent/null → `null`; finite numbers in range → rounded to 6 dp; anything else → `'INVALID'`.
  - `mapLinks(lat: number, lng: number): { yandex: string; google: string }` returning `https://yandex.com/maps/?pt=${lng},${lat}&z=17&l=map` and `https://www.google.com/maps?q=${lat},${lng}`.
  - Test `tests/lib/geo.test.ts`: `(41.311081, 69.240562)` ok; `(41.3, undefined)`, `('41', 69)`, `(NaN, 1)`, `(91, 0)`, `(0, 181)` → `'INVALID'`; `(null, null)` → `null`; `41.3110814` → `41.311081`.
  - Verify: `npx vitest run tests/lib/geo.test.ts` passes; `npx prisma migrate status` up to date.
- [x] **T2 Optional SHIPPING status.** _Evidence: 4 new tests RED (2 failing after tightening a vacuous one) → `tests/lib/orders.test.ts` 25/25; `orderCounts` gained SHIPPING; tsc clean._ `OrderStatus` adds `'SHIPPING'`. TRANSITIONS: `CONFIRMED: ['SHIPPING','DELIVERED','CANCELLED']`, `SHIPPING: ['DELIVERED','CANCELLED']`. Stock is restored on `CONFIRMED|SHIPPING → CANCELLED`. `ORDER_STATUSES` in `src/lib/admin/orders.ts` gets SHIPPING after CONFIRMED.
  - Tests in `tests/lib/orders.test.ts`: CONFIRMED→SHIPPING→DELIVERED ok; CONFIRMED→DELIVERED ok; NEW→SHIPPING `BAD_TRANSITION`; SHIPPING→CANCELLED restores the variant stock to its pre-confirm value; DELIVERED→SHIPPING refused.
  - Verify: `npx vitest run tests/lib/orders.test.ts`.
- [x] **T3 Coordinates on orders and addresses.** _Evidence: 4 new tests RED → public-orders/telegram/account-domain/orders 65/65 GREEN; tsc clean._
  - Orders: `CreateOrderInput.location?: { lat: unknown; lng: unknown } | null`. `cleanLatLng` result `'INVALID'` → `{ok:false,error:'INVALID'}`, otherwise stored on the order and passed to `saveOrderAddress`. `/api/orders` reads `b.location`.
  - Addresses: `AddressInput` + `AddressView` gain `lat?`/`lng?` (`cleanAddress` validates via `cleanLatLng`).
  - Staff alert: `NotifyOrder.mapUrl?: string | null` → line `Map: <google link>` in `src/lib/telegram.ts`.
  - Tests: `tests/api/public-orders.test.ts` (valid pin stored; half pair → 400 INVALID; no location → order ok with nulls); `tests/lib/account-domain.test.ts` (address with pin saved and listed; bad pin INVALID); `tests/lib/telegram.test.ts` (alert text contains `Map: https://www.google.com/maps?q=41.311081,69.240562` only when pinned).

### M2 — Mini App auth (wave 2)
- [x] **T4 initData validator.** _Evidence: tests/lib/tg-init-data.test.ts RED (module missing) → 8/8._ Create `src/lib/tg/init-data.ts`:
  - `verifyInitData(raw: string, botToken: string, opts?: { now?: Date; maxAgeSec?: number }): { userId: string; firstName: string; languageCode: string | null; authDate: Date } | null`
  - Telegram algorithm: drop `hash`; data-check-string = sorted `key=value` joined by `\n`; secret = `HMAC_SHA256(key="WebAppData", msg=botToken)`; compare hex with `timingSafeEqual`. maxAge defaults to 86400; a future `auth_date` > 60 s is rejected.
  - Test helper `signInitData(fields, botToken)` in `tests/fixtures/tg.ts`.
  - Tests `tests/lib/tg-init-data.test.ts`: valid; tampered `user`; wrong token; missing `hash`; missing `user`/non-numeric id; `auth_date` 86401 s old; empty string.
- [x] **T5 Session endpoint.** _Evidence: tests/api/tg-session.test.ts RED → 21/21 (cookies, switching accounts, next abuse, locale, 30/min limit)._
  - `src/lib/tg/mode.ts`: `TG_MODE_COOKIE = 'tg_mode'`, `isTelegramMode(): Promise<boolean>` (reads `cookies()`), `tgCookieOptions(secure: boolean)` → `{ httpOnly, path:'/', sameSite: secure ? 'none' : 'lax', secure, maxAge: CUSTOMER_SESSION_MAX_AGE }`.
  - `src/lib/tg/next.ts`: `safeNext(next: unknown, fallback: string): string` accepts only `/`-prefixed paths without `//`, `/\`, control chars; `tgLaunchUrl(next: string, site = process.env.SITE_URL): string | null` → `${site}/tg?next=${encodeURIComponent(next)}`.
  - `src/app/api/tg/session/route.ts` `POST {initData, next}`:
    - 401 `{error:'BAD_INIT_DATA'}` when invalid.
    - Otherwise 200 `{ signedIn, locale, next }` and sets `tg_mode=1`.
    - Linked account (`telegramUserId`, `accountCreatedAt` set) → `customer_session` via `issueCustomerSession`; unlinked → deletes any existing `customer_session`.
    - Locale: `accountLocale` → `languageCode` if uz/ru/en → `uz`. Rate-limited per IP with the existing `rate-limit.ts` limiter (30/min).
  - Tests `tests/api/tg-session.test.ts`: linked → both cookies, `SameSite=None; Secure` when `NODE_ENV=production`; unlinked → no session, old session cleared (review focus 2); bad → 401; `safeNext` cases from review focus 1; locale fallback.
- [x] **T6 `/tg` launch page + proxy.** _Evidence: matcher tests RED (2) → 17/17; tsc clean apart from stale .next generated route types (dev server regenerated them; cleared by build). Runtime check of /tg pending (M6 browser pass)._
  - `src/proxy.ts` matcher becomes `/((?!api|admin|tg(?:/|$)|_next|_vercel|.*\\..*).*)`.
  - `src/app/tg/page.tsx` (noindex, own minimal `<html>`) + client `src/components/tg/TgLaunch.tsx`: loads the Telegram script, `ready()`, `expand()`, POSTs initData + `next` from the query. On success → `location.replace(next ?? '/'+locale)`; no initData or 401 → localized "Open this shop from the Telegram bot" with a `t.me/<botUsername>` link. Copy is inline uz/ru/en, picked by `navigator.language`, because this page has no next-intl provider.
  - Tests: `tests/middleware-matcher.test.ts` adds `/tg` and `/tg/` to skipped, `/tgx` and `/uz/tg` still matched.
- [x] **T7 Tokenless phone link.** _Evidence: 3 new tests RED → telegram-bot/account-api/account-auth 112/112 (existing sign-in tests unchanged and green)._
  - Refactor `linkTelegramContact`: move the transaction body into a private `linkPhoneTx(tx, {...}, now)`.
  - Add `linkTelegramContactDirect(i: { telegramUserId; chatId; contactUserId; phone; name; locale? }, opts): Promise<'ok' | 'not_own_contact' | 'bad_phone'>` with the same rules and relink notice, minus the login row.
  - `onContact` in `handler.ts`: `findPendingLogin` hit → existing flow (unchanged); otherwise → direct link → reply `copy.phoneLinked` with REMOVE_KEYBOARD, then an "Open shop" web_app button (T8's `webApp` button; until T8 lands, a plain url button).
  - Tests in `tests/lib/telegram-bot.test.ts`: contact with no pending login creates the account (`accountCreatedAt`, ids set); another person's contact → `notOwnContact`; non-UZ → `badPhone`; pending login + contact → old flow's confirm prompt (review focus 5); relink bumps the old account's `sessionVersion`.
- [x] **M2 verifier:** _Evidence: appsec-engineer — no Critical/High. Fixed (each test RED→GREEN): (1) /api/orders cross-site + non-JSON → 403/415; (2) /api/tg/session same (login CSRF); (3) launch limiter → shared-aware (no shop-wide 30/min without TRUST_PROXY); (4) sign-out/delete inside Mini App clears the partitioned cookie; (5) initData accepted for 1 h, not 24 h. tg-session/public-orders/account-api 64/64._ dispatch `appsec-engineer` on the diff of T4–T7 (initData, cookies, next, linking). Fix confirmed findings (≤1 repair round each).

### M3 — Bot & notifications (wave 3)
- [x] **T8 web_app buttons + messages.** _Evidence: account-notify 6 RED → 11/11; wiring test RED → status-notify-wiring + public-orders 17/17._
  - `InlineButton` gains `webApp?: string` → `{text, web_app:{url}}` in `inlineKeyboard` (and the `ReplyMarkup` type).
  - `notifyOrderStatus` uses `webApp: tgLaunchUrl('/'+lang+'/account/orders/'+n)` (falls back to `url` when `tgLaunchUrl` is null or not https). STATUS gets `SHIPPING`: uz `yo‘lga chiqdi — kuryer yo‘lda`, ru `передан курьеру — в пути`, en `out for delivery`.
  - New `notifyOrderPlaced(orderNumber: number, deps): Promise<'sent'|'skipped'|'failed'>` in `notify.ts`. Text, e.g. en: `Order #1001 received: 3 items, 1 250 000 so'm. Payment on delivery. We will message you when it is confirmed.` (uz/ru equivalents), using `formatUzs`.
  - `/api/orders` calls it in `runAfterResponse` beside `notifyNewOrder`.
  - Tests `tests/lib/account-notify.test.ts`: placed → sent with `web_app.url` = `https://shop.test/tg?next=%2Fru%2Faccount%2Forders%2F1001`; guest or notify-off → skipped; SHIPPING text in uz/ru/en; http SITE_URL → url button. `tests/api/status-notify-wiring.test.ts`: order POST triggers the placed notice.
- [x] **T9 Bot commands + location.** _Evidence: 7 tests RED → telegram-bot 41/41 (incl. foreign address id + bad pin refused)._
  - `/start` without payload → `copy.welcome` + web_app "🛍 Open shop" (`tgLaunchUrl('/'+locale)`).
  - `/orders` → last 5 orders of the linked account (`#n · status · total`), one web_app button each; unlinked → `copy.askPhoneInShop` + Open shop.
  - `location` message → linked: buttons per saved address (`callback_data` `loc:<addressId>:<lat6>:<lng6>`, ≤ 64 bytes) + web_app "➕ New address" → `/{l}/account/addresses?lat=..&lng=..`; unlinked → `askPhoneInShop`.
  - Callback `loc:` → re-validate with `cleanLatLng`, update only when `address.customerId` is the sender's account, answer `copy.locationSaved`.
  - Tests in `tests/lib/telegram-bot.test.ts`: each branch; foreign address id → no DB change + `copy.locationFailed` (review focus 4).
- [x] **T10 Menu button + commands on Connect.** _Evidence: 2 tests RED → telegram-bot + admin-misc 57/57; admin activity log records warnings. admin-misc orderCounts expectation updated for SHIPPING (intended T2 change)._ `connectBotWebhook` also calls `setChatMenuButton {menu_button:{type:'web_app', text:'🛍 Shop', web_app:{url: tgLaunchUrl('/uz')}}}` (only when SITE_URL is https) and `setMyCommands` (`start`, `orders`, `help`), plus `language_code` variants for ru/en. A failure of these two is reported in the result but does not fail the webhook connect. Test in `tests/lib/telegram-bot.test.ts` (connect action): calls recorded with the expected bodies; http SITE_URL → menu button skipped.

### M4 — Telegram-mode UI (wave 4)
- [x] **T11 TG shell.** _Evidence: tsc clean (excluding stale .next types); browser verification moved to the M6 pass (one pass for M4+M5)._
  - `StoreShell` reads `isTelegramMode()`. When true it renders `TgTopBar` (search + LangSwitcher), `main` with bottom padding, and `TabBar` (Home `/{l}`, Catalog `/{l}/c`, Cart opens drawer + count badge, Orders `/{l}/account/orders`, Profile `/{l}/account`; active by pathname), plus `TgBridge`. Otherwise it renders the current Navbar/Footer.
  - `TgBridge` (client) loads the script and sets `setHeaderColor`/`setBackgroundColor` to the store's `--background`. It shows BackButton on non-tab paths (`router.back()`, falling back to home when history is empty). It intercepts clicks on external `<a>` → `openLink`/`openTelegramLink`, and adds haptic `impactOccurred('light')` on a `tg:added-to-cart` window event fired by the existing add-to-cart code.
  - New `src/app/[locale]/c/page.tsx` lists the categories (reuse `CategoryTiles`). Hide "Sign out" in `ProfileForm` when in TG mode.
  - Verify: `npx tsc --noEmit`; dev server + `tg_mode=1` cookie in the browser pane at 375 px: tab bar visible, no Navbar/Footer; without the cookie the page is unchanged (screenshots in Result).
- [x] **T12 MainButton + checkout phone gate.** _Evidence: tsc clean; live Telegram behaviour needs HTTPS (M6)._
  - `useTgMainButton(text: string | null, onClick)` hook in `src/components/tg/useTg.ts`. Cart drawer: "Checkout · {total}". Checkout: "Place order · {total}", which submits the form, shows progress, and the in-page submit button is hidden in TG mode.
  - Checkout in TG mode without an account shows a "Share phone number" block → `Telegram.WebApp.requestContact(cb)` → poll `POST /api/tg/session` every 1.5 s up to 10 s until `signedIn`, then `router.refresh()`. Declined → localized hint.
  - New strings `tg.*` in `messages/{uz,ru,en}.json`.
  - Verify: tsc + build; manual in a real Telegram (gap if no HTTPS).

### M5 — Location UI & admin (wave 5)
- [x] **T13 Location button.** _Evidence: tsc clean; server-side pin validation already covered by T3 tests; "make default" now round-trips lat/lng (would otherwise clear the pin per T3 ruling). Browser check in M6._
  - `src/components/store/LocationButton.tsx` (client): `value {lat,lng}|null`, `onChange`. In Telegram it uses `LocationManager.init` → `getLocation` when `isInited && isLocationAvailable`, otherwise `navigator.geolocation.getCurrentPosition` (10 s timeout). States: idle / locating / attached ("Location attached ✓ · view on map · remove") / error (denied or unavailable).
  - Used in `CheckoutForm` (sent as `location` in the order body; kept when a saved address with a pin is chosen) and `AddressesManager` (save with lat/lng; prefill from `?lat&lng` query, validated client-side with the same range rule).
  - `checkout.location.*` strings in uz/ru/en.
  - Verify: tsc; browser pane with geolocation permission, or the error state shown when denied (screenshot).
- [x] **T14 Admin + account status UI.** _Evidence: tsc clean; admin-actions-guard + dashboard + account-domain 42/42; SHIPPING labels added to order.statuses + account.statuses in uz/ru/en (JSON parsed)._
  - `OrderStatusButtons` shows "Out for delivery" when allowed. Orders list filter and badge colours include SHIPPING (`src/app/admin/(panel)/orders/page.tsx`, dashboard counts if they enumerate statuses). Order detail shows "Location: Yandex · Google" links via `mapLinks`.
  - Account `StatusBadge`, order timeline and the public `/order/[number]` page get SHIPPING labels (`orderStatus.SHIPPING` in messages json).
  - Verify: tsc; `npx vitest run tests/api/admin-actions-guard.test.ts tests/lib/dashboard.test.ts`; admin order page screenshot with a pinned order.

### M6 — Docs & verification (wave 6)
- [x] **T15 README "Telegram Mini App" section:** what it does; HTTPS requirement; local test via `cloudflared tunnel --url http://localhost:3000` → set `SITE_URL` → admin Settings "Connect bot"; optional BotFather `/newapp` for a `t.me/<bot>/shop` link; known limit (Telegram Web + blocked third-party cookies). _Evidence: README §Telegram Mini App + Orders paragraph (SHIPPING, pins, pay on delivery)._
- [x] **T16 Full checks:** _Evidence: `npx vitest run` → 48 files, 755/755 passed (baseline 670); `npm run build` → exit 0, routes include /tg and /api/tg/session (2 pre-existing Turbopack tracing warnings); `npx tsc --noEmit` → only 2 errors in generated .next/dev/types vs .next/types (stale dev types from the owner's crashed dev server; no source errors)._ `npm test`, `npx tsc --noEmit`, `npm run build`. Record the outputs in §Result.
- [x] **T17 QA + review:** _Evidence: browser pass on `next start` :3001 (owner's dev server on :3000 had crashed — see Result): website unchanged; /tg outside Telegram → "open in the bot" + bot link (not locale-redirected); TG mode → top bar + tab bar, no header/footer; Catalog page; Orders tab as guest → phone gate (not website login); checkout location button denied + attached states; stale tg_mode in a normal browser → falls back to website UI once, no loop. code-reviewer (opus): 0 Critical, 4 Important — all fixed (below). Live Telegram spot checks NOT run (no HTTPS URL)._
  - `evidence-collector` browser pass: site unchanged; TG mode at 375 px across home, catalog, product, cart, checkout, account orders, admin order with pin.
  - `code-reviewer` on the whole diff. Fix confirmed issues (one repair each).
  - Live Telegram spot checks (§2) only if an HTTPS URL exists, otherwise listed for the owner.

## 6. Verification
- `npm test` · `npx tsc --noEmit` · `npm run build` · `npm run smoke` (if dev server running)

## 7. Rollback
Additive only: new migration (drop columns by reverting migration), new files under `src/app/tg`, `src/app/api/tg`, `src/lib/tg/`, `src/components/tg/`. Edited existing files are listed per task; restore with `git diff`-based manual revert of only those hunks (working tree has unrelated owner changes — no `git checkout` of whole files).

### Rulings (execution)
- Plan file is the ledger; no commits (owner rule), so the SDD task-start/task-done scripts (commit-range based) are not used — cost if wrong: none, evidence lines live here.
- T3: re-saving an identical address via checkout with a pin attaches the pin to the existing pin-less address instead of skipping silently — cheap, matches "save this address" intent; cost if wrong: an address gains a pin the customer sent anyway.
- T3: editing a saved address without lat/lng clears its pin (forms must round-trip the pin) — keeps one validation path; cost if wrong: a pin lost on edit if the UI forgets to send it (T13 must send it).

- T5: reused existing `safeNext` (src/lib/account/next.ts, requires a locale prefix) via `tgSafeNext` instead of a new validator; limiter lives in `src/lib/tg/limits.ts` (route files must not export non-handlers). Cookies also get `Partitioned` on https (CHIPS, documented in Next cookies API) for the Telegram Web iframe. Cost if wrong: none functional.
- T5: cookie Secure/None decided by SITE_URL being https, not NODE_ENV — deterministic, matches where Telegram can open the app; cost if wrong: a prod deploy with http SITE_URL keeps Lax (Telegram would not open it anyway).
- T7: replaced the old test "contact without a pending login → start on the website first" with the tokenless-link behaviour the approved design requires; `startOnSiteFirst` copy is now unused (kept, harmless). Cost if wrong: none — behaviour change is the spec.
- T7: `web_app` button support (planned in T8) landed in T7 because the Phone-linked reply needs it.

- M2 review: initData max age cut to 1 h (reviewer #5); the 30-day session JWT itself is unchanged (same as website sessions) — cost if wrong: a stolen fresh initData still yields a 30-day session within that hour.
- M2 review: /api/orders now also requires same-origin + application/json for **all** callers (website checkout already sends JSON) — cost if wrong: a non-browser API client posting form data gets 415.
- Not fixed (pre-existing, noted by reviewer): recycled UZ numbers can take over an old account via "newest verified contact wins"; mitigated by the relink notice.

- M4: the phone gate also replaces the website login page inside the Mini App (`/login` in TG mode → one-tap phone share), because `requireAccountCustomer` redirects Orders/Profile tabs there — the deep-link+code login makes no sense inside Telegram. Cost if wrong: none for the website (TG mode only).
- M4: no unit tests for client components (vitest runs in node env, no DOM lib in the project); verified by typecheck + browser pass. Cost if wrong: UI regressions caught later than a unit test would.
- Post-M3 full suite: 2 timeouts (admin-products SEO, seo sitemap) under load from a parallel tsc; both files 47/47 when rerun alone.

### Final review (code-reviewer, opus)
- Final: fixed SHIPPING missing from revenue / dashboard status counts / client spend — dashboard + customers tests RED→GREEN.
- Final: fixed variants in SHIPPING orders deletable — admin-products test RED→GREEN.
- Final: fixed Telegram mode without a Telegram client was a dead end (no MainButton, in-page buttons hidden) — new POST /api/tg/exit (test RED→GREEN, same-origin only) + TgBridge drops TG mode when the WebApp is absent; in-page buttons hidden only while MainButton actually shows; failed script load not cached. Browser-verified.
- Final: fixed LocationManager on pre-8.0 clients could hang — version guard + try/catch + 10 s timeout falling back to browser geolocation (tsc only; no Telegram client available).
- Final: re-graded minor → fixed: checkout MainButton enabled while checkout blocked (tap did nothing) — now disabled with the same rule as the in-page button (tsc only).
- Final: minor (deferred): partitioned vs unpartitioned customer_session can coexist if Telegram's WebView shares a cookie jar with a website login (unconfirmed).
- Final: minor (deferred): phone gate polls with the launch initData; after >1 h open it always shows "failed" (reopen fixes it).
- Final: minor (deferred): an address edit form opened before a bot location arrives can clear that pin on save (T3 ruling race).
- Final: minor (deferred): bot stays silent for a location from an account with no addresses when SITE_URL is not http(s).
- Final: minor (deferred): non-object `location` in /api/orders is treated as no pin rather than INVALID.
- Final: Ruling: TG mode is dropped when the Telegram script fails to load within 8 s — a genuine Mini App on a very slow network then shows the website UI (still fully usable) — cost if wrong: Telegram look lost for that visit.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-17: requirement drafted; builder check folded in (proxy matcher excludes `tg`, all entries via `/tg?next=`, TG script in StoreShell, tokenless contact link); SHIPPING optional (owner).
- 2026-11-17: requirement approved by owner; plan §4–5 drafted (`/help` answers like `/start`).

## Baseline
- 2026-11-17 before any change: `npx vitest run` → 45 files, 670/670 passed.

## Result
**Delivered:** Telegram Mini App on the same Next.js storefront (`/tg` launch with initData sign-in, TG-mode shell with tab bar/top bar/Back/MainButton, catalog index, one-tap phone link, exit fallback); bot: Open shop button, `/orders`, `/help`, location → address pin, menu button + commands on Connect; customer messages for order received + every status incl. new optional SHIPPING, all opening the order in the Mini App; lat/lng on orders + addresses with checkout/address LocationButton, admin map links, staff alert map line; security hardening (same-origin JSON on /api/orders and /api/tg/session, partitioned cookies, 1 h initData); uz/ru/en strings; README section.
**Checks run:** `npx vitest run` → 759 tests, 758 passed + 1 timeout in tests/lib/auth.test.ts (password hashing under load; 26/26 when rerun alone; file untouched by this work). `npm run build` → exit 0 (includes /tg, /api/tg/session, /api/tg/exit). `npx tsc --noEmit` → no source errors (2 errors only in generated .next dev-vs-build route types). Browser pass on production build (T17).
**Gaps:** never run inside a real Telegram client (needs public HTTPS) — MainButton, BackButton, requestContact, LocationManager, menu button and web_app buttons are verified by code/tests only. Admin order map links verified by typecheck, not viewed. No commits (owner rule).
**Side effect:** `npm run build` rewrote `.next` under the owner's running `next dev` (PID 32516, :3000), whose worker crashed (500s) — restart it. Added `.claude/launch.json` (estore-dev, estore-prod).
**Follow-ups:** deferred minors above; online payment (acquiring) later as planned.

## Handoff
All 18 tasks done; code complete and tested, uncommitted. Remaining: live check inside Telegram — set SITE_URL to an https tunnel/deploy, restart the app, Admin → Settings → Connect bot, then run the §2 manual spot checks. Owner's dev server on :3000 must be restarted (crashed during my build). Deferred minors are listed under Final review.
