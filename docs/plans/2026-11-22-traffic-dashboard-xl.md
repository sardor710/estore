# Traffic Section on the Admin Dashboard — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 4 | 7/7 tasks | 2026-11-25 | Owner: review branch `feat/traffic-dashboard` (committed locally, not pushed); see Follow-ups |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Intent and why
The owner wants one place on the admin dashboard that answers: how many people visited, how many of them were guests and how many were registered customers, where the registered ones are from, when customers last signed in, and at which hours and on which weekdays the shop is busiest.

Owner's words (2026-11-22): "make traffic traction window on dashboard. to see how many users visited. news or registered users, if possible their region, and login time. most users visit hours and days". After the gap list below was shown, the owner answered "go with that plan" and did not say what decisions the numbers feed. The calls marked *(my call)* are therefore mine and open to correction.

### What exists today (recon, 2026-11-22)
- Dashboard `src/app/admin/(panel)/page.tsx` with data from `src/lib/admin/dashboard.ts`: Visitors and Page views tiles (with previous-period comparison), a Visitors-per-day chart, Top pages, Traffic sources, Devices. All follow the range picker (today, 7d, 30d, 90d, custom).
- Tracking: `src/components/TrackPageView.tsx` (mounted in `src/app/[locale]/layout.tsx`) posts to `src/app/api/track/route.ts`, which calls `recordPageView` in `src/lib/analytics/record.ts`. One `PageView` row per view: day, path, locale, referrer host, device, visitor hash, `createdAt`.
- Tracking is anonymous on purpose: no cookie, the visitor hash is keyed by a salt that changes every Tashkent day and is deleted afterwards (`src/lib/analytics/visitor.ts`, `rollup.ts`). Raw rows are kept 180 days; older days survive only as `DailyTraffic` (views, visitors).
- Customer accounts: `customer_session` cookie (`src/lib/account/session.ts`). Sessions are issued in three places: `src/app/api/account/login/status/route.ts` (Telegram deep-link sign-in), `src/app/api/account/login/verify/route.ts` (6-digit code), `src/app/api/tg/session/route.ts` (every Mini App launch). `Customer` has a profile `region` (code from `src/lib/regions.ts`) but no last sign-in or last seen time. `CustomerLogin` rows are deleted after 30 days.
- Charts use `recharts` through `src/components/admin/dashboard/TrendChart.tsx`; lists use `RankList.tsx`. Tests: `tests/lib/analytics.test.ts`, `tests/lib/dashboard.test.ts`, `tests/api/track.test.ts` (vitest).

### Gap list (shown to the owner)
| Asked for | Today | Needs |
|---|---|---|
| How many visited | Already on the dashboard | Regroup under one Traffic heading |
| New or registered | Not known | Mark each page view as signed-in or guest |
| Region | Not known | Signed-in: profile region. Guests: would need an IP lookup database |
| Login time | Sign-in records deleted after 30 days | Store last sign-in and last seen on the customer |
| Busiest hours and days | Time is stored on every view | Aggregate by hour and weekday |

### Approaches
| | Approach | Trade-off |
|---|---|---|
| **A (chosen, my call)** | Each page view gets two extra fields: signed-in yes/no and, when signed in, the customer's profile region. The customer row gets last sign-in and last seen times. No customer id on page views. | Smallest change; guest/registered split, region and busiest times all work; a customer's page-by-page history stays unrecorded. Guests have no region. |
| B | Store the customer id on every page view. | Gives per-customer browsing history and per-customer visit times, but ends anonymous tracking for signed-in users and was not asked for. Larger change (retention, deletion on account removal, client page views). |
| C | Add an external counter (Yandex Metrica or Google Analytics). | Gives guest region by IP and new-vs-returning for free, but adds a third-party script and cookies, the numbers live outside the admin, and it cannot tell registered customers apart. Can be added later next to A. |

The owner handed over the how ("go with that plan"); A is my pick because it answers every item except guest region without giving up anonymous tracking.

### Goal
A **Traffic** section on the admin dashboard, driven by the existing range picker, that shows visits, the guest versus signed-in split, signed-in visitors by region, recent customer sign-ins, and the busiest hours and weekdays.

### What the owner will see (sketch)
```
Traffic                                              (7d · Tashkent time)
┌ Visitors ─┐ ┌ Page views ┐ ┌ Signed-in ─┐ ┌ Guests ───┐ ┌ New accounts ┐
│ 1 240 +8% │ │ 5 310 +3%  │ │ 186 (15%)  │ │ 1 054     │ │ 23           │
└───────────┘ └────────────┘ └────────────┘ └───────────┘ └──────────────┘
Visitors per day        ▇▇▇▇▇▇▇  guests ▒ signed-in █
Busiest hours           00 ▁▁▁▁▂▃▅▆▇▇▆▅▅▆▇█▇▆▅▃▂▁ 23     Peak: 20:00–21:00
Busiest weekdays        Mon ▅ Tue ▅ Wed ▆ Thu ▅ Fri ▆ Sat █ Sun ▇   Peak: Sat
Signed-in visitors by region        Recent sign-ins
 Tashkent city        92             Aziz K.   Tashkent city   today 20:14
 Samarkand region     31             Dilnoza   Samarkand       today 18:02
 …                                   …  (name links to the client page)
Top pages · Traffic sources · Devices   (existing lists, moved here)
```

### Deliverables
1. **Tracking**: each page view records whether the visitor was signed in and, if so, the customer's profile region at that moment. Views recorded before this change stay "unknown", not "guest".
2. **Customer times**: `lastLoginAt` (set on website sign-in by link or code) and `lastSeenAt` (latest signed-in visit on the website or Mini App, written at most once per 5 minutes per customer).
3. **Traffic section** on the dashboard as sketched: tiles (Visitors, Page views, Signed-in visitors, Guests, New accounts), guests versus signed-in per day, busiest hours (24 bars), busiest weekdays (7 bars), signed-in visitors by region, recent sign-ins (latest 20 customers by last sign-in), plus the existing Top pages, Traffic sources and Devices lists moved under the same heading.
4. **Client page**: last sign-in and last seen shown on `/admin/clients/[id]`.
5. **Database migration** for the new columns, and tests for the new recording and aggregation.
6. **README** Analytics section updated to say what is now stored.

### Definitions *(my call)*
- **Signed-in visitor** of a day: a daily visitor with at least one view that day made while signed in. **Guest**: a daily visitor with none. Signed-in + Guests = Visitors for days with the split.
- **New accounts**: customers whose account was created inside the range.
- **Busiest hours / weekdays**: page views grouped by Tashkent hour (0–23) and weekday, over the chosen range. Weekdays show the average per calendar day so a range with two Saturdays is not inflated.
- **Last sign-in** means a website sign-in. A Mini App launch signs the customer in silently every time it opens, so it updates Last seen only.
- **Region** of a signed-in visitor: the profile region stored on the view at the time, shown with the English names from `src/lib/regions.ts`.

### Constraints
- Page views never store a customer id, phone or name. Only a yes/no flag and a region code.
- The public beacon stays as it is for visitors: always 204, never an error, same daily caps and throttles. A signed-in view may cost one extra customer lookup; a guest view costs none.
- Hour, weekday, region and split figures exist only for days that still have raw rows (last 180 days) and only from the day this ships. The section must say so when the range reaches further back, and must not show earlier days as "all guests".
- Hour and weekday totals are computed in the database, not by loading every row into memory (the daily cap is 200 000 rows).
- Tashkent time (UTC+5) everywhere, as in the rest of the dashboard.
- Same access rule as the dashboard (`dashboard` permission). Admin UI stays English.
- Follow `AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- No new npm dependencies (recharts is already installed).

### Non-goals
- **Region of guests.** Needs an IP lookup database and `TRUST_PROXY=1`, and is unreliable at region level inside Uzbekistan. This is a partial delivery of "region, if possible": only signed-in visitors get a region. Listed as a follow-up.
- **New versus returning visitors.** The visitor id changes every day by design; recognising a returning guest would need a long-lived cookie.
- Per-customer browsing history, live "online now" counter, a full sign-in history table, exports, charts for the storefront, Telegram bot traffic.

### Assumptions
- "news or registered users" means guests versus registered (signed-in) customers, with new accounts as an extra count.
- "login time" means when each customer last signed in and was last seen, not a full history of every sign-in.
- The section lives on the existing dashboard page, not a separate page or pop-up window.
- Work is done on a new branch `feat/traffic-dashboard` cut from the current `feat/yandex-map-picker` head (`fc931ff`, clean tree). Nothing is committed unless the owner asks.

### Open questions
None blocking. The owner may correct any *(my call)* item or assumption above before the plan is written.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode (auto/manual) | Check |
|---|---|---|---|
| A1 | A beacon sent with a valid `customer_session` cookie stores a view with signed-in = yes and the customer's region; without a cookie, or with an invalid or revoked one, it stores signed-in = no and no region. No customer id, phone or name is stored on the view. | auto | `npx vitest run tests/api/track.test.ts tests/lib/analytics.test.ts` |
| A2 | The beacon still answers 204 in every case, and the per-visitor and global caps still hold. | auto | `npx vitest run tests/api/track.test.ts` |
| A3 | A website sign-in (link and code) sets `lastLoginAt`; a signed-in view sets `lastSeenAt` and does not write again within 5 minutes; a Mini App launch does not change `lastLoginAt`; deleting the account clears both. | auto | `npx vitest run tests/lib tests/api/account-api.test.ts tests/api/tg-session.test.ts tests/api/track.test.ts` |
| A4 | For a seeded range, the traffic data returns: signed-in visitors + guests + unknown = visitors per day; a visitor with one signed-in view counts once as signed-in; views from before the change are reported as unknown. | auto | `npx vitest run tests/lib/traffic.test.ts` |
| A5 | Hour and weekday figures use Tashkent time: a view at 19:30 UTC on a Friday lands in hour 0 of Saturday; weekday values are per-day averages. | auto | `npx vitest run tests/lib/traffic.test.ts` |
| A6 | Region list counts signed-in visitors per region for the range; recent sign-ins lists at most 20 customers, newest first; new accounts counts accounts created in the range. | auto | `npx vitest run tests/lib/traffic.test.ts` |
| A7 | Whole suite, types and production build pass. | auto | `npm test` · `npx tsc --noEmit` · `npm run build` |
| A8 | The migration applies to a copy of the current database without data loss. | auto | `npm run db:deploy` against a copy of `dev.db`, then row counts of `PageView` and `Customer` unchanged |
| A9 | The Traffic section renders as sketched with real data, at desktop and phone width, with correct empty states when there is no data. | manual | Browser check on the dev server with screenshots |

Manual spot checks:
- Visit the storefront as a guest, then sign in and visit again; the dashboard for Today shows one more guest view and one more signed-in view, the region list shows the test customer's region, and Recent sign-ins shows the test customer with the right time.
- Open `/admin/clients/<id>` for that customer: Last sign-in and Last seen are filled.
- Pick a 90-day range: the note about the day the split starts is shown.
- Sign in as a blog editor: the dashboard (and the Traffic section) is still not reachable.

## 3. Anti-drift
- **Primary objective:** the owner opens the dashboard and reads correct numbers for visits, guests versus registered customers, region of registered visitors, recent sign-ins, and busiest hours and weekdays.
- **Proxy signals (not success by themselves):** tests pass; the build passes; the section renders; charts show bars. None of these proves the numbers are right. Correctness is proven by seeded data with known answers (A4–A6) and the manual guest/sign-in walk-through.
- **Intended scope:** tracking record path, customer sign-in points, dashboard data and page, client detail page, one migration, tests, README. Nothing in the storefront UI, checkout, bot or other admin sections.
- **Completion target:** full delivery of deliverables 1–6. Guest region and new-versus-returning are declared non-goals, not silent omissions.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 | Page views carry signed-in flag + region; customers carry last sign-in / last seen | `superpowers:test-driven-development` (owner) | `prisma/schema.prisma`, `prisma/migrations/20261123000000_traffic_split/`, `src/lib/analytics/record.ts`, `src/app/api/track/route.ts`, `src/lib/account/{session,activity,profile}.ts`, `src/app/api/account/login/{status,verify}/route.ts`, `tests/api/{track,account-api,tg-session}.test.ts`, `tests/lib/analytics.test.ts` | – |
| M2 | `getTraffic` returns every number the section shows | `superpowers:test-driven-development` (owner) | `src/lib/admin/traffic.ts`, `src/lib/analytics/visitor.ts` (one helper), `tests/lib/traffic.test.ts` | M1 |
| M3 | Traffic section on the dashboard; times on the client page; README | `dataviz` (owner for charts and colours), agent_direct for layout | `src/components/admin/dashboard/*`, `src/app/admin/(panel)/page.tsx`, `src/app/admin/(panel)/clients/[id]/page.tsx`, `src/lib/customers.ts`, `README.md` | M2 |
| M4 | Evidence that the numbers are right and nothing else broke | `superpowers:verification-before-completion` (owner), `code-reviewer` agent through `superpowers:requesting-code-review` (verifier) | plan file only (+ one repair round where the review demands it) | M3 |

Gaps (no fitting skill): none.

Waves (all serial: M2 needs M1's columns, M3 imports M2's types, and the test suite shares one `test.db`):
- Wave 1: M1 (T1–T3)
- Wave 2: M2 (T4)
- Wave 3: M3 (T5–T6)
- Wave 4: M4 (T7)

Execution: `superpowers:executing-plans` in this session (set by `/vibe`), on a new branch `feat/traffic-dashboard` cut from `fc931ff`. No commits unless the owner asks.

## 5. Tasks

**Architecture:** the beacon route resolves the `customer_session` cookie to an account and passes it to `recordPageView`, which stores a yes/no flag and a region code on the view (never an id). Sign-in routes stamp `lastLoginAt`; signed-in views stamp `lastSeenAt` through a conditional update that is its own throttle. A new `src/lib/admin/traffic.ts` aggregates in SQLite and returns one `TrafficData` object; a server component renders it with two small recharts client components. `src/lib/admin/dashboard.ts` is not changed.

**Tech stack:** Next.js 16 App Router, Prisma 7 + better-sqlite3 (`DateTime` is stored as ISO text in UTC), recharts 3, vitest 5.

### Global constraints
- Page views never store a customer id, phone or name: only `signedIn` and `region`.
- `/api/track` always answers 204 and never throws; existing caps and throttles are untouched.
- `PageView.signedIn`: `true` signed in, `false` guest, `null` unknown (recorded before this change, or the account lookup failed). Unknown is never shown as guest.
- Tashkent time (UTC+5) for every day, hour and weekday.
- Aggregation runs in the database (`prisma.$queryRaw` / `groupBy`), never by loading raw rows.
- No new npm dependencies. Admin UI text in English.
- Before writing Next.js code read the guides named in the task (`AGENTS.md`).
- Tests follow the existing style (`tests/setup.ts` wipes the DB before each test; `NOW`-style fixed dates).

### Review focus
1. **Stale or forged session cookie on the beacon** (expired, revoked by `sessionVersion`, deleted account, garbage): expected a guest view and 204. Pinned in T2.
2. **Account lookup fails** (DB hiccup while reading the customer): expected 204 and a view stored as unknown, not as guest. Pinned in T2.
3. **Customer deletes the account**: expected `lastLoginAt` / `lastSeenAt` cleared and the customer gone from Recent sign-ins. Pinned in T3 and T4.
4. **Range reaches before the split started or before raw rows exist**: expected "Unknown" for those days and a note, never "all guests", and weekday averages not diluted by days with no tracking. Pinned in T4.
5. **Views around Tashkent midnight** (19:00 UTC): expected the next day's hour 0 and the next weekday. Pinned in T4.

### M1 — Tracking and customer times (wave 1, owner: `superpowers:test-driven-development`)

#### T1 — Schema and migration
**Evidence (2026-11-25):** copy: "1 migration applied", PageView 172 / Customer 2 before and after, columns present on the copy and not yet on dev.db, `prisma db push` on the copy: "already in sync". dev.db: `npm run db:deploy` applied it, `migrate status`: "Database schema is up to date!", counts still 172 / 2. Pre-migration backup kept in the session scratchpad as `dev-pre-migration.db`.

**Files:** modify `prisma/schema.prisma`; create `prisma/migrations/20261123000000_traffic_split/migration.sql`.
**Produces:** `PageView.signedIn Boolean?`, `PageView.region String?`, `Customer.lastLoginAt DateTime?`, `Customer.lastSeenAt DateTime?`.

- [x] Add the four fields to the schema (comment on `signedIn`: `// null = unknown: recorded before the split existed, or the account lookup failed`).
- [x] Write the migration by hand (additive only): four `ALTER TABLE ... ADD COLUMN` statements — `"PageView"."signedIn" BOOLEAN`, `"PageView"."region" TEXT`, `"Customer"."lastLoginAt" DATETIME`, `"Customer"."lastSeenAt" DATETIME`.
- [x] Prove it on a copy: copy `dev.db` into the scratchpad, note `SELECT count(*)` of `PageView` and `Customer`, run `DATABASE_URL=file:<copy> npx prisma migrate deploy` — verify: "1 migration applied", same two counts, and `DATABASE_URL=file:<copy> npx prisma db push` reports the database is already in sync (the SQL matches the schema). (A8)
- [x] Apply to the dev database: `npm run db:deploy` — verify: `npx prisma migrate status` prints "Database schema is up to date!".

#### T2 — Record signed-in flag and region
**Evidence (2026-11-25):** RED: 7 new tests failed on missing flag/region (2 guard tests passed by construction: unknown-by-default and no-identity-keys). GREEN: `npx vitest run tests/api/track.test.ts tests/lib/analytics.test.ts` 33/33. See R2, R5.

**Files:** modify `src/lib/analytics/record.ts`, `src/app/api/track/route.ts`, `src/lib/account/session.ts`; tests in `tests/lib/analytics.test.ts`, `tests/api/track.test.ts`. Read first: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `.../03-api-reference/04-functions/cookies.md`.
**Produces:**
- `AccountCustomer` gains `region: string` (filled in `customerFromToken`).
- `PageViewInput` gains `account?: { id: number; region: string } | null` — object = signed in, `null` = guest, `undefined` = unknown.
- `recordPageView` stores `signedIn` (`true` / `false` / `null`) and `region` (the account's region when `getRegion(region)` knows the code, else `null`; always `null` for guest and unknown).

- [x] Failing tests in `tests/lib/analytics.test.ts` (`describe('recordPageView account')`): with `account: { id: 1, region: 'samarkand' }` the row is `{ signedIn: true, region: 'samarkand' }`; with `account: null` it is `{ signedIn: false, region: null }`; with no `account` it is `{ signedIn: null, region: null }`; with `region: 'nowhere'` it is `{ signedIn: true, region: null }`; `Object.keys(row)` contains no key matching `/customer|phone|name/i`.
- [x] Failing tests in `tests/api/track.test.ts` (`describe('signed-in views')`), using a customer row with `accountCreatedAt` set and a cookie from `createCustomerSession`: valid cookie → 204, row `{ signedIn: true, region: <customer region> }`; no cookie → `{ signedIn: false }`; cookie `customer_session=garbage`, a cookie with a stale `sv`, and a cookie for a customer whose `accountCreatedAt` is null → each 204 and `{ signedIn: false, region: null }`; account lookup throwing (`vi.spyOn(prisma.customer, 'findUnique').mockRejectedValueOnce(...)`) → 204 and `{ signedIn: null }`; the existing cap tests still pass unchanged.
- [x] Run both files — verify: the new tests fail, the old ones pass.
- [x] Implement. In the route: read the cookie the way `src/app/api/orders/route.ts` does (`readCookie(req, CUSTOMER_COOKIE)`), only after `allowTrack` passed; no cookie → `account = null` with no DB call; cookie → `customerFromToken` inside its own try/catch (`undefined` on throw, `null` when it returns null).
- [x] Run `npx vitest run tests/api/track.test.ts tests/lib/analytics.test.ts` — verify: all pass. (A1, A2)

#### T3 — Last sign-in and last seen
**Evidence (2026-11-25):** RED: `activity` module missing + 3 route tests failed on null stamps. GREEN: `npx vitest run tests/lib/account-activity.test.ts tests/api/account-api.test.ts tests/api/tg-session.test.ts tests/api/track.test.ts tests/lib/analytics.test.ts` 106/106. See R3, R4.

**Files:** create `src/lib/account/activity.ts`; modify `src/app/api/account/login/status/route.ts`, `src/app/api/account/login/verify/route.ts`, `src/app/api/track/route.ts`, `src/lib/account/profile.ts` (account deletion); tests in `tests/lib/analytics.test.ts` or a new `tests/lib/account-activity.test.ts`, `tests/api/account-api.test.ts`, `tests/api/tg-session.test.ts`.
**Produces:**
- `export const LAST_SEEN_STEP_MS = 5 * 60_000`
- `markSignedIn(customerId: number, now: Date): Promise<void>` — sets `lastLoginAt` and `lastSeenAt` to `now`.
- `touchLastSeen(customerId: number, now: Date): Promise<boolean>` — one `updateMany` where `lastSeenAt` is null or older than `now - LAST_SEEN_STEP_MS`; returns whether a row was written.

- [x] Failing tests: `touchLastSeen` writes on first call, returns `false` 4 min 59 s later (value unchanged), writes again at 5 min; `markSignedIn` sets both fields; status route `done` and verify route success each leave `lastLoginAt` within the test's time window (extend the two existing happy-path tests in `account-api.test.ts`); a failed verify leaves it null; `POST /api/tg/session` for a linked user leaves `lastLoginAt` null (extend the first test in `tg-session.test.ts`); a signed-in beacon sets `lastSeenAt`, a guest beacon touches no customer; `deleteAccountAction` leaves `lastLoginAt` and `lastSeenAt` null.
- [x] Run them — verify: they fail for the missing module / fields.
- [x] Implement. Both sign-in routes call `markSignedIn` after `issueCustomerSession` returned a token, inside try/catch with `console.error` (a failed stamp must not fail the sign-in). The track route calls `touchLastSeen` only when the view was stored (`recordPageView` returned true) and `account` is an object, inside the route's existing try. Account deletion sets both fields to null next to `accountCreatedAt: null`.
- [x] Run `npx vitest run tests/api/account-api.test.ts tests/api/tg-session.test.ts tests/api/track.test.ts tests/lib` — verify: all pass. (A3)

### M2 — Aggregation (wave 2, owner: `superpowers:test-driven-development`)

#### T4 — `getTraffic`
**Evidence (2026-11-25):** RED: "Cannot find package @/lib/admin/traffic". GREEN: `npx vitest run tests/lib/traffic.test.ts tests/lib/dashboard.test.ts` 26/26 (15 new). See R6, R7, R8.

**Files:** create `src/lib/admin/traffic.ts`, `tests/lib/traffic.test.ts`; modify `src/lib/analytics/visitor.ts` (add `tashkentDateTime`).
**Consumes:** `DashboardRange`, `Kpi` from `src/lib/admin/dashboard.ts`; `getRegion` from `src/lib/regions.ts`; T1 columns.
**Produces:**
```ts
export type TrafficDay = { day: string; signedIn: number; guests: number; unknown: number }
export type TrafficData = {
  /** First Tashkent day that has a view with signedIn not null; null when there is none yet. */
  splitSince: string | null
  /** First Tashkent day that still has raw page views; null when there are none. */
  rawSince: string | null
  kpis: { signedIn: Kpi; guests: Kpi; newAccounts: Kpi }
  perDay: TrafficDay[]            // one entry per range day, ascending
  hours: number[]                 // 24 view counts, index = Tashkent hour
  weekdays: number[]              // 7 averages rounded to 1 decimal, index 0 = Monday
  peakHour: number | null         // index of the largest value, earliest wins a tie, null when all zero
  peakWeekday: number | null
  regions: { code: string; name: string; visitors: number }[]
  recentSignIns: { id: number; name: string; region: string; lastLoginAt: Date; lastSeenAt: Date | null }[]
}
export async function getTraffic(range: DashboardRange, now?: Date): Promise<TrafficData>
// visitor.ts
export function tashkentDateTime(d: Date): string   // 'YYYY-MM-DD HH:mm' in Tashkent
```
Rules the tests pin:
- Per day, from one grouped query on `PageView`: `signedIn` = distinct `visitorHash` with any `signedIn = true` view; known = distinct hashes with any non-null view; `guests = known - signedIn`; `unknown` = distinct hashes of the day minus known. Days without raw rows are `{0, 0, 0}`.
- `kpis.signedIn` / `kpis.guests`: sums over the range days, `prev` over the equally long period before (`range.prevFrom` .. `range.prevTo`). `kpis.newAccounts`: customers with `accountCreatedAt` in `[from, to)`, `prev` likewise.
- `hours`: `COUNT(*)` grouped by `CAST(strftime('%H', createdAt, '+5 hours') AS INTEGER)` for the range days.
- `weekdays`: views of the range grouped by day, summed per weekday of `day`, divided by the number of range days with that weekday that are on or after `rawSince` (0 when there is none).
- `regions`: for `signedIn = true` views, distinct `(day, visitorHash)` per `region`; `null` region → `{ code: '', name: 'Not set' }`; names are the English ones from `getRegion`, unknown code → the code; sorted by visitors desc, then name.
- `recentSignIns`: customers with `lastLoginAt` and `accountCreatedAt` not null, newest first, at most 20, not limited by the range; `region` is the English region name (or the raw code).

- [x] Failing tests in `tests/lib/traffic.test.ts` (seed with `prisma.pageView.create` setting `day`, `visitorHash`, `signedIn`, `region`, `createdAt`; `NOW = 2026-12-05T08:00:00Z`):
  - `splits a day into signed-in, guests and unknown`: day 2026-12-02, hash `a` with views `[false, true]`, `b` `[false]`, `c` `[null]`, `d` `[null, false]` → `perDay` entry `{ signedIn: 1, guests: 2, unknown: 1 }`, `kpis.signedIn.value 1`, `kpis.guests.value 2`, and their sum + unknown equals `getDashboard(...).kpis.visitors.value` (4). (A4)
  - `days before the split are unknown, never guests`: views with `signedIn: null` on 12-01, `false` on 12-03 → 12-01 `{0,0,1}`, `splitSince '2026-12-03'`; with no non-null view at all `splitSince` is null.
  - `previous period feeds prev`: one signed-in visitor on the day before a one-day range → `kpis.signedIn.prev 1`.
  - `hours use Tashkent time`: `createdAt 2026-12-04T19:30:00Z` with `day '2026-12-05'` → `hours[0] === 1`; `createdAt 2026-12-04T10:15:00Z` → `hours[15] === 1`; `peakHour` is the larger bucket, `null` with no views. (A5)
  - `weekdays are per-day averages and skip days before tracking`: range 2026-11-22..2026-12-05 (two of each weekday), earliest raw row on Saturday 2026-11-28 with 4 views, Saturday 2026-12-05 (reached by `2026-12-04T19:30:00Z`) with 2 views → `weekdays[5] === 3`, `peakWeekday === 5`; Monday 2026-11-23 is before `rawSince`, so 3 views on Monday 2026-11-30 give `weekdays[0] === 3`, not 1.5. (A5)
  - `regions count signed-in daily visitors`: two hashes in `samarkand`, one in `tashkent-city` seen on two days, one signed-in view with `region: null`, one guest → `[{ code: 'samarkand' | 'tashkent-city', visitors: 2 } x2 sorted by name, { code: '', name: 'Not set', visitors: 1 }]`. (A6)
  - `recent sign-ins: newest first, 20 at most, accounts only`: 22 customers with `lastLoginAt`, one without an account, one never signed in → 20 rows, first is the newest, the deleted-account and never-signed-in customers are absent. (A6)
  - `new accounts are counted by creation time in the range`: one inside, one at `range.to` exactly (excluded), one in the previous period → `{ value: 1, prev: 1 }`. (A6)
  - `tashkentDateTime(new Date('2026-12-04T19:30:00Z')) === '2026-12-05 00:30'`.
- [x] Run `npx vitest run tests/lib/traffic.test.ts` — verify: fails with "Cannot find module" / missing export.
- [x] Implement `getTraffic` and `tashkentDateTime`. Raw queries use `prisma.$queryRaw` tagged templates; convert `bigint` counts with `Number()`.
- [x] Run `npx vitest run tests/lib/traffic.test.ts tests/lib/dashboard.test.ts` — verify: all pass. (A4–A6)

### M3 — Section, client page, README (wave 3, owner: `dataviz` + agent_direct)

#### T5 — Traffic section on the dashboard
**Evidence (2026-11-25):** `npx tsc --noEmit` exit 0; `npm test` 840/840 in 54 files, no existing test edited to pass (one pinned the account shape and failed; the code was changed instead, see R5). Colours validated with the dataviz script, see R9. Visual proof is T7.

**Files:** create `src/components/admin/dashboard/TrafficSection.tsx` (server), `SplitChart.tsx` and `BarsChart.tsx` (client); modify `KpiTiles.tsx`, `TrendChart.tsx` (colour constants only), `src/app/admin/(panel)/page.tsx`. Read first: the `dataviz` skill, and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
**Consumes:** `TrafficData`, `getTraffic`, `tashkentDateTime` (T4); `DashboardData` (unchanged).
**Produces:**
- `KpiTiles.tsx` exports `StatTile({ label, value, hint?, kpi? })` and keeps the top row as five tiles: Revenue, Orders, Pending orders, Average order, Conversion. Visitors and Page views leave the top row.
- `SplitChart({ data: TrafficDay[] })`: stacked bars per day (signed-in, guests, unknown), printed legend, collapsed data table like `TrendChart`.
- `BarsChart({ title, data: { label: string; value: number }[], color, note? })`: category bars from zero with the same data table; used for hours (`'00'`..`'23'`) and weekdays (`'Mon'`..`'Sun'`).
- `SERIES_COLOR` gains `signedIn`, `guests`, `unknown`: next validated palette slots per the `dataviz` skill, `unknown` a neutral grey; `guests` reuses `SERIES_COLOR.visitors`.
- `TrafficSection({ traffic, kpis, topPages, sources, devices, firstDay, lastDay })` renders, in order: heading "Traffic"; tiles Visitors, Page views, Signed-in visitors (hint: share of visitors), Guests, New accounts; notes; `SplitChart` titled "Visitors per day"; `BarsChart` "Busiest hours" with note `Peak: 20:00–21:00` and `BarsChart` "Busiest weekdays" with note `Peak: Saturday` (notes omitted when the peak is null); `RankList` "Signed-in visitors by region" and a "Recent sign-ins" card (name linking to `/admin/clients/<id>`, region, `tashkentDateTime(lastLoginAt)`); then the existing Top pages, Traffic sources, Devices lists.

Copy the section must use:
- `splitSince === null`: "Guest and signed-in counts start with the first visit recorded after this update."
- `splitSince > firstDay`: "The guest / signed-in split starts on {splitSince}. Earlier days are shown as Unknown."
- `rawSince === null` or `rawSince > firstDay`: "Hours, weekdays and regions cover visits from {later of rawSince and firstDay} on; older visits are kept as daily totals only."
- Empty lists and charts: "No data yet". Recent sign-ins empty: "No customer has signed in yet."

- [x] Implement the components and wire the page: `getTraffic(range, now)` runs in the same `Promise.all` step as `getDashboard`; the standalone Visitors chart and the three traffic `RankList`s are removed from their old places; `<TrafficSection>` sits right after the Revenue / Orders charts.
- [x] Run `npx tsc --noEmit` — verify: exit 0.
- [x] Run `npm test` — verify: all pass (no test may have been edited to pass).

#### T6 — Client page times and README
**Evidence (2026-11-25):** RED: new `getCustomer` test failed on missing fields. GREEN: `npm test` 840/840, `npx tsc --noEmit` exit 0. README Analytics section extended.

**Files:** modify `src/lib/customers.ts` (`CustomerDetail` gains `lastLoginAt: Date | null`, `lastSeenAt: Date | null`, filled in `getCustomer`), `src/app/admin/(panel)/clients/[id]/page.tsx`, `README.md` (Analytics section), `tests/lib/customers.test.ts`.

- [x] Failing test in `tests/lib/customers.test.ts`: `getCustomer` returns the two stored times, and `null` for a customer who never signed in. Run — verify: fails.
- [x] Implement; on the client page add "Last sign-in" and "Last seen" entries (`tashkentDateTime`, "never" when null), shown only when the customer has an account.
- [x] README Analytics: state that a page view now also stores whether the visitor was signed in and, if so, the profile region (never the customer id), that customers store last sign-in and last seen, and that guest region and returning-visitor detection are not collected.
- [x] Run `npx vitest run tests/lib/customers.test.ts` and `npx tsc --noEmit` — verify: pass, exit 0.

### M4 — Verification and review (wave 4, owner: `superpowers:verification-before-completion`)

#### T7 — Evidence
**Evidence so far (2026-11-25):**
- `npm test`: 55 files, 843/843 passed. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0 (all routes compiled). (A7)
- Browser check on `traffic-check.db` (a copy of `dev.db`, seeded by a scratch script that prints the expected totals; `dev.db` row counts unchanged: PageView 172, Customer 2, AdminUser 1). Dev server started with `DATABASE_URL=file:./traffic-check.db`. 7 days expected visitors 47 / page views 112 / signed-in 11 / guests 36; page showed 48 / 113 / 11 / 37, the +1 being my own page load, recorded live as a guest view on `/en`. Per-day split, hours (09: 22, 10: 70, 20: 20), weekdays (Sat 32 peak), regions (Tashkent city 5, Samarkand 4, Not set 2), Recent sign-ins (2 rows, Tashkent times) and New accounts all matched. 30 days: unknown days and both notes shown, the pruned day 2026-10-30 shows 9 unknown. Empty range (2026-01-01..07): zeros and "No data yet" everywhere. Phone width 375: no horizontal overflow. No console or server errors. (A9)
- Walk-through against the running server with `curl` (the in-app browser is not treated as a bot, but separate user agents were needed for separate visitors): guest beacon 204 → guests +1; signed-in beacon with a test customer session 204 → signed-in +1, region samarkand, `lastSeenAt` updated, `lastLoginAt` unchanged; forged cookie 204 → stored as guest. `/admin/clients/5` shows Last sign-in and Last seen. Blog editor signing in lands on `/admin/blog`; opening `/admin` redirects back, no Traffic section.
- Found and fixed during the check (R12): hour and weekday bars rendered black.
- Review: `code-reviewer` agent on the working-tree diff. No Critical; 2 Important and 6 Minor findings. One fix pass, every fix RED then GREEN (11 new tests failed first); see the "Final" lines under Rulings.
- After the fix pass: `npm test` 55 files, 855/855; `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npx prisma migrate status`: "Database schema is up to date!". Tiles rechecked in the browser: 7 days shows Guests with "no earlier period to compare" and no percentage; an untracked range shows "—" and "not recorded for these days".
- Cleanup: dev server stopped; `traffic-check.db`, `scripts/_traffic-check-seed.mts`, the scratch secrets, the migrated test copy and the review bundle removed; the `estore-traffic-check` entry removed from `.claude/launch.json` (file back to its committed content). `dev.db` row counts unchanged (PageView 172, Customer 2, AdminUser 1). Kept on purpose: `dev-pre-migration.db` next to `dev.db` in the project root (the database as it was before the migration; ignored by git through `*.db`).
- First-run state on real data, rendered on an unseeded copy of the migrated `dev.db` (2026-11-25, 30 days): the note "Guest and signed-in counts start with the first visit recorded after this update." is shown; Signed-in and Guests read "—" / "not recorded for these days"; the 172 existing views (2026-11-17..21) are 11 Unknown visitors; hours and weekdays are filled (peak 18:00–19:00, Tuesday); regions and Recent sign-ins show their empty texts. The copy, its check admin and the launch entry were removed again afterwards; `npm test` 855/855 and `npx tsc --noEmit` exit 0 rerun after the last edits.

- [x] `npm test`, `npx tsc --noEmit`, `npm run build` — record the output summaries here. (A7)
- [x] Browser check on a seeded copy of the database, never the real `dev.db`: copy `dev.db` to `traffic-check.db`, seed it with a scratch script (views over 14 days: guests, signed-in with three regions, unknown days; two customers with sign-in times), start the dev server against it, open `/admin` — verify by reading the page and by screenshot at desktop and at 375 px: tiles, split chart, hours, weekdays, regions, recent sign-ins, the three notes for a 90-day range, and empty states on an empty copy. Each seeded number is compared with the value known from the seed. (A9)
- [x] Walk-through on the same copy: one guest view, then a view with a test customer's session cookie → Today shows one more guest view and one more signed-in view, the region list shows the test customer's region, `/admin/clients/<id>` shows Last seen. Sign in as a blog editor → no dashboard.
- [x] Review: dispatch `code-reviewer` on the branch diff with the requirement and Review focus list. Apply at most one repair round, rerun the affected checks.
- [x] Cleanup: remove `traffic-check.db`, the scratch seed script and any `.claude/launch.json` entry added for the check. Fill Result and Handoff.

## 6. Verification
- `npm test` (vitest, whole suite)
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma migrate status` → "Database schema is up to date!"
- Browser check and walk-through from T7, with screenshots.

## 7. Rollback
All changes are additive. To undo: switch back to `feat/yandex-map-picker` (nothing is committed unless asked, so discard the working changes of the files listed in section 4). The four new columns are nullable and harmless to older code; to remove them from `dev.db` as well, restore `dev-pre-migration.db` (project root, taken in T1) or drop the columns and delete the `20261123000000_traffic_split` row from `_prisma_migrations`. Unrelated dirty files (none at start) are left untouched.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-22: requirement drafted.
- 2026-11-23: requirement approved by the owner ("Approve"). Sections 4–7 written. Changes to section 2 made while planning: A4–A6 now point at the new `tests/lib/traffic.test.ts` (aggregation lives in `src/lib/admin/traffic.ts`, not `dashboard.ts`); A3 also covers clearing the times on account deletion; A4 states the sum including unknown.

- 2026-11-25: plan approved by the owner ("Approve, build it"). Execution started.
- 2026-11-25: owner asked for the working tree to be committed; done as one commit on `feat/traffic-dashboard`. To undo the code after this, revert that commit instead of discarding working changes (section 7 was written before the commit).

## Rulings made during execution
- R12 (T7): `SERIES_COLOR` moved out of the 'use client' file `TrendChart.tsx` into `series-colors.ts`. A server component that reads a value from a client file gets only a reference, so the colour was undefined and the bars black. The dashboard page already passed colours to the Revenue and Orders charts this way, so those were affected before this work too and are fixed by the same move. Pinned by `tests/lib/series-colors.test.ts` (RED then GREEN). Cost if wrong: none.
- R13 (T7): Traffic tiles are 3 per row up to very wide screens (5 only from 1536 px) and the tile is labelled "Signed-in" with the line "N% of known visitors"; at laptop width five tiles wrapped badly. Cost if wrong: layout preference.
- R1 (setup): the plan file is the ledger; the `executing-plans` workspace scripts (`task-start`, `task-done`, `review-package`) are not used — they are built on per-task commits and `/vibe` forbids commits unless asked. The final review reads `git diff fc931ff` plus the untracked files instead. Cost if wrong: no commit-by-commit history of the work.
- R2 (T2): `readCookie` moved from `src/app/api/orders/route.ts` into `src/lib/account/session.ts` and imported by both routes, instead of copying it into the track route. Touches the orders route (import only). Cost if wrong: one extra file in the diff.
- R3 (T3): the two times are also cleared in `src/lib/account/login.ts` (`linkPhoneTx`), where a Telegram user who links another phone turns the old account off; the plan only named `profile.ts`. Cost if wrong: none (the old account can no longer sign in).
- R4 (T3): the try/catch around `markSignedIn` lives in one helper, `stampSignIn` in `src/app/api/account/_lib.ts`, used by both sign-in routes. Cost if wrong: none.
- R5 (T2): `AccountCustomer` does NOT gain `region` (the plan said it would). An existing test pins its exact shape, so the beacon uses a new `visitorAccountFromToken()` that shares the validity check (`accountRow`) with `customerFromToken`. Cost if wrong: one more exported function.
- R6 (T4): a day whose raw rows were pruned shows its rolled-up `DailyTraffic.visitors` as Unknown instead of `{0,0,0}` (plan text). Otherwise the stacked chart would lose history that the old Visitors chart showed, and the parts would not add up to the Visitors tile. Cost if wrong: none; it only affects days older than 180 days.
- R7 (T4): the plan's weekday test had Monday and Saturday both at 3, and the earliest wins a tie, so its expected peak (Saturday) was wrong. Monday is seeded with 2 views; a separate test pins the tie rule. Cost if wrong: none.
- R8 (T4): `getTraffic(range)` takes no `now` argument (the plan listed an optional one); nothing in it depends on the current time. Cost if wrong: none.
- R9 (T5): colours: signed-in `#2a78d6`, guests `#1baf7a` (the existing visitors hue), unknown `#c3c2b7`. Validator (`--pairs all`, light): CVD separation PASS (worst 11.1), normal-vision floor PASS (19.6). The grey fails the categorical lightness and chroma checks on purpose: it stands for missing information, not a category; the legend and the data table carry the labels. Cost if wrong: the Unknown segment reads fainter than the other two.
- R10 (T5): note copy shortened: the raw-coverage note reads "Hours, weekdays and regions are available from {day}; older days are kept as daily totals only." and is shown only when raw rows exist and start after the first day of the range. The existing TRUST_PROXY warning also says that without it guests on the same kind of browser as a signed-in customer are counted as signed-in. Cost if wrong: wording only.
- R11 (T5): `TrafficSection` takes `firstDay` only (no `lastDay`), and Conversion keeps its place under the four sales tiles in the quiet style rather than as a fifth large tile (five large tiles wrap the revenue figure at laptop width). Cost if wrong: layout preference.
- Final: fixed "last seen was stored with the exact time of a page view, which ties a customer to that day's visitor hash" (Important) — `touchLastSeen` stores the start of the 5-minute slot — tests "stores the start of the 5-minute slot…" and "last seen is a 5-minute slot…" RED→GREEN, suite 855/855.
- Final: fixed "Signed-in / Guests percentages compare against days that were not tracked" (Important) — `TrafficData` gains `splitInRange` and `prevComparable`; the two tiles show no "vs previous" unless the whole previous period was tracked, and "—" for a range the split cannot cover — 4 tests RED→GREEN, suite 855/855.
- Final: fixed "another Telegram user taking over a phone number keeps the previous holder's times" (reviewer: Minor; re-graded Important because the plan's Review focus 3 names it) — test RED→GREEN, suite 855/855.
- Final: fixed "a stamp can land on a just-deleted account" (Minor; fixed because it is one WHERE condition in the function rewritten for the first fix) — test RED→GREEN, suite 855/855.
- Final: fixed "every signed-in view issues an UPDATE" (reviewer: Minor; re-graded Important: the requirement allows one extra lookup, not a write per view) — the route skips the write while the stored slot is current — test "a second signed-in view in the same slot writes nothing to the customer" RED→GREEN, suite 855/855.
- Final: guard test added for the reviewer's point that nothing pinned the try/catch around the sign-in stamp ("a failing sign-in stamp does not fail the sign-in"); it passed at once because the code was already right. Also corrected my own stray edit in `visitor.ts` (`BOT_RE =/`) and the now-wrong "cookie-less" comment in the track route.
- Final: minor (deferred): a failing traffic query takes the whole dashboard page down; `getTraffic` is not wrapped the way the rollup is.
- Final: minor (deferred): the account lookup runs before `recordPageView` rejects bots, non-storefront paths and capped visitors (signed-in callers only).
- Final: minor (deferred): peak hour 23 prints "23:00–24:00"; the weekday peak is picked from rounded averages; `TrackPageView.tsx` still calls itself "cookie-less" (it sets none, so this is still true).
- Final: minor (deferred): the weekday test seeds `day` by hand, so it pins the hour shift but not that the recorder writes the right `day` (that part is pinned by the existing `tashkentDay` tests).
- Final: Ruling: region comes from `Customer.region`, which is filled by orders and is empty for accounts that never ordered, so "Signed-in visitors by region" can be mostly "Not set" — stands as approved ("profile region"); falling back to the saved address region is a follow-up — cost if wrong: the region list is less useful until customers order.
- Final: Ruling: customers who only use the Telegram Mini App never get a last sign-in and never appear in Recent sign-ins (they do get Last seen) — stands, it is the approved definition — cost if wrong: Mini App regulars are missing from that list.
- Final: Ruling: today's partial day counts as a full day in its weekday average — stands — cost if wrong: today's weekday reads slightly low until the day ends.
- Final: Ruling: residual link between a customer and page views: signed-in views carry a region and last seen is a 5-minute slot, so in a quiet shop someone with database access could still guess which views belong to a customer — stands; removing it means dropping region or last seen, both asked for — cost if wrong: weaker anonymity for signed-in customers than for guests.

## Result
**Status: Done (2026-11-25).** All seven tasks have evidence. Committed to `feat/traffic-dashboard` on 2026-11-25 at the owner's request (one commit, not pushed).

**Delivered**
- Tracking: `PageView.signedIn` / `region`, migration `prisma/migrations/20261123000000_traffic_split/`, `src/lib/analytics/record.ts`, `src/app/api/track/route.ts`.
- Customer times: `src/lib/account/activity.ts`, both sign-in routes; cleared on account deletion and on both relink paths.
- Aggregation: `src/lib/admin/traffic.ts`.
- Dashboard: `src/components/admin/dashboard/TrafficSection.tsx`, `SplitChart.tsx`, `BarsChart.tsx`, `series-colors.ts`, `KpiTiles.tsx`, `src/app/admin/(panel)/page.tsx`.
- Client page: Last sign-in and Last seen on `/admin/clients/[id]`. README Analytics section updated.
- Tests: new `tests/lib/traffic.test.ts`, `account-activity.test.ts`, `series-colors.test.ts`; extended `tests/api/track.test.ts`, `account-api.test.ts`, `tg-session.test.ts`, `tests/lib/analytics.test.ts`, `customers.test.ts`. Whole suite: 855 passed in 55 files.

**Checks run:** see T7 evidence (suite, types, build, migration on a copy and on dev.db, browser check on a seeded copy at desktop and 375 px, live beacon walk-through, role check, independent code review and one fix pass).

**Gaps (stated, not hidden)**
- Region of guests and new-versus-returning visitors are not delivered (approved non-goals).
- Region is the profile region, which is empty until a customer has ordered, so the region list may show mostly "Not set" at first.
- Recent sign-ins fills only from website sign-ins made after this ships. Customer sessions last 30 days, so customers who are already signed in (the one existing account in `dev.db` included) appear only after their next sign-in; Mini App-only customers never do. Both still get Last seen on their next signed-in visit.
- The guest / signed-in split starts with the first visit after this ships. The real `dev.db` has no such visit yet, so on real data the section shows the "starts with the first visit" note for now. The numbers were proven on a seeded copy.
- Not checked: behaviour behind a real reverse proxy with `TRUST_PROXY=1`; the real Telegram sign-in flow end to end (covered by route tests only).

**Also fixed on the way:** the Revenue and Orders chart colours on the dashboard, which had the same server/client fault as the new charts (R12).

**Follow-ups**
- Region fallback to the customer's saved address when the profile region is empty.
- Count a Mini App launch as a sign-in, or list "recently seen" customers instead of sign-ins.
- Guard the dashboard against a failing traffic query (deferred minor).
- Guest region by IP lookup, if still wanted, once the shop runs behind a proxy with `TRUST_PROXY=1`.

## Handoff
Done on 2026-11-25: all 7 tasks complete on branch `feat/traffic-dashboard`; the work is committed locally in one commit (not pushed) and `dev.db` is already migrated (8 migrations). Next action is the owner's: review, then say whether to push or open a PR. On production run `npm run db:deploy` before starting the new build. A pre-migration copy of dev.db is in the project root as `dev-pre-migration.db` (git-ignored). Open decisions are under Follow-ups; the deferred minor code items are the "Final: minor (deferred)" lines under Rulings.
