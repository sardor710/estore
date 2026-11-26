# Online Card Payments via Octo — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 4 | 8/9 (+T9 partial) | 2026-11-26 | Owner: send Octo support message; after test cards → finish T9; then set OCTO_TEST=0 |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Intent and why
Owner's words (2026-11-26): "integrate that to my website and enable paying via octopay for bank cards Uzcard, Humo, Visa, Mastercard and Google Pay and Apple pay as well. test everything after integration whether its working and report me shortly at the end and tell me how that gonna work."
Decisions in conversation: **charge immediately** (one-stage, `auto_capture: true`), not hold-and-capture; **option 1 — redirect to Octo's hosted payment page**.

### What exists today (recon, 2026-11-26)
- Checkout `src/app/[locale]/checkout/page.tsx` + `src/components/store/CheckoutForm.tsx` → `POST /api/orders` (`src/app/api/orders/route.ts`) → `createOrder` in `src/lib/orders.ts`. No payment step; customers pay on delivery. Also used inside the Telegram Mini App (MainButton submits).
- `Order` already has unused `paymentStatus String @default("UNPAID")` and `paymentProvider String?`.
- Order pages: customer `src/app/[locale]/order/[number]`, account `src/app/[locale]/account/orders/[number]`, admin `src/app/admin/(panel)/orders/[id]`. New-order notifications: `src/lib/account/notify.ts` / Telegram bot.
- Octo (docs https://help.octo.uz/en/): `POST https://secure.octo.uz/prepare_payment` with `octo_shop_id` + `octo_secret` in the JSON body → `octo_pay_url`; status check = same URL with `shop_transaction_id`; `POST /refund`; callback to `notify_url` (POST JSON: status, maskedPan, card_vendor, signature, …). Statuses: created, wait_user_action, waiting_for_capture, succeeded, canceled.
- **Verified 2026-11-26:** a `test: true` prepare_payment with shop 43297 and the owner's key returned `error: 0` and a pay URL; the hosted page shows the shop name "Zanko", a "test payment" banner, and two choices: **Visa/Mastercard** and **Uzcard/Humo**. No Apple Pay / Google Pay button.

### Goal
A customer can choose "Pay online by card" at checkout, pay on Octo's page with Uzcard, Humo, Visa or Mastercard, return to zanko.uz and see the order marked paid; the owner sees payment details in admin and can refund. Cash on delivery keeps working.

### Deliverables
1. Checkout payment choice: **Cash on delivery** (default, as today) / **Pay online by card** (logos: Uzcard, Humo, Visa, Mastercard). Works on the website and in the Telegram Mini App. uz/ru/en texts.
2. Card choice → order is created (as today) with payment `PENDING`, then the customer is sent to Octo's page (`language` = site locale, amount = order total in UZS, `return_url` = the order page, `notify_url` = our callback, ttl 30 min).
3. Callback endpoint `POST /api/payments/octo/notify` + return page: the order becomes `PAID` only after the server asks Octo for the status itself (the callback alone is never trusted). Idempotent: repeated callbacks or reloads never double-process.
4. Order page shows payment state: Paid (card brand + masked number) / Waiting for payment with a **Pay now** button (new Octo link) / Payment failed with **Try again**.
5. Admin order page: payment status, method, card, Octo payment id, paid time; **Refund** button (full amount, with confirmation) → `POST /refund`; refund recorded on the order and in the activity log. Admin orders list shows a paid badge.
6. Owner's Telegram new-order message says "paid by card" / "cash on delivery"; a second message when a card payment succeeds.
7. Credentials in `.env` only (`OCTO_SHOP_ID`, `OCTO_SECRET`, `OCTO_TEST`); a missing key hides the card option instead of breaking checkout.
8. A short message for Octo support (drafted for the owner) asking them to enable **Apple Pay and Google Pay** on the hosted page for shop 43297 and to confirm the callback signature key.
9. Short owner report: how it works, how to refund, what was tested.

### Constraints
- Card data never touches zanko.uz (hosted page only). `OCTO_SECRET` stays server-side, never in client bundles or logs.
- Amounts in whole UZS (`total_sum` = order total; confirmed by the test call returning `total_sum: 1000.0` for 1,000 UZS).
- Additive DB migration only (new nullable columns / a payment table); existing orders unaffected.
- Production is live (zanko.uz, systemd `zanko.service`, SQLite): back up the DB before migrating; deploy = build + restart as in earlier deploys.
- No real-money transaction during testing unless the owner explicitly asks; tests use Octo `test: true`.

### Non-goals
- Card form inside zanko.uz (option 2), saved cards/tokenization, hold-and-capture.
- Apple Pay back-to-back integration (needs the owner's Apple merchant account + certificates) — replaced by asking Octo to enable wallets on the hosted page.
- Partial refunds (full refund only for now), Payme/Click or other providers.
- Fiscal receipts via Octo basket — owner 2026-11-26: "no fiscal receipts needed for now, we gonna integrate it later".

### Assumptions (my calls, open to correction)
- Unpaid card orders stay as normal orders (status NEW, payment PENDING/FAILED) so the manager can still call the customer; they are not auto-cancelled.
- Stock is reserved exactly as today when the order is placed (no change to stock logic).
- If Octo never calls back (e.g. callback URL not set in their cabinet), the payment is still settled by asking Octo whenever the customer opens the order page, admin opens the order, or admin presses **Check status** (no background timer).
- The public order page is reachable by sequential number, so payment details and **Pay now** appear only with a random per-order token in the link (`/order/1005?t=…`); without it the page shows what it shows today.
- `payment_methods` is not sent, so Octo's page shows every method enabled for the shop (wallets appear automatically once Octo enables them).

### Open questions
- **Apple Pay / Google Pay:** depend on Octo enabling them for shop 43297 (deliverable 8).
- **Test cards:** Octo's docs list none; the end-to-end test of a *successful* payment needs either a test card from Octo or the hosted test page accepting any card. If neither works, a successful payment will be simulated against our callback and status logic only, and reported as such.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Checkout shows Cash / Card; cash orders behave exactly as before | auto + manual | API tests; browser screenshot uz/ru |
| A2 | Card order creates order + Octo payment (test mode) and redirects to `pay2.octo.uz` | auto + live | vitest with mocked Octo; live `test: true` call through the real endpoint |
| A3 | Order is PAID only when Octo's status check says `succeeded`; forged callback is ignored | auto | vitest: forged/unknown/mismatched-amount callbacks don't change the order |
| A4 | Repeated callbacks / reloads are idempotent (one PAID transition, one notification) | auto | vitest |
| A5 | Abandoned / canceled payment → order shows "Pay now", which makes a new working link | auto + live | vitest + live test-mode link |
| A6 | Admin shows payment details and Refund calls Octo `/refund` once, records it | auto | vitest with mocked Octo |
| A7 | Secret never reaches the browser | auto | `grep` of `.next/static` for the secret = no match |
| A8 | Full test suite, typecheck, build pass; site up after deploy | auto | `npx vitest run`, `npx tsc --noEmit`, `npm run build`, curl 200 |
| A9 | End-to-end on the live site in Octo test mode: checkout → Octo page → result back on the order page | live | headless browser run, screenshots |

Manual spot checks: the owner places one real small card payment after release and refunds it from admin (optional, owner's call).

## 3. Anti-drift
- **Primary objective:** real customers can pay for an order by card through Octo and the shop reliably knows it was paid.
- **Proxy signals (not success by themselves):** tests passing with a mocked Octo; Octo page opening; build passing. Success needs a live Octo test-mode round trip through the deployed site.
- **Intended scope:** checkout choice, Octo payment create/verify/refund, order + admin + Telegram display. Nothing else in checkout, pricing or stock changes.
- **Completion target:** full delivery of deliverables 1–9; Apple/Google Pay is complete when the request to Octo is drafted (enabling them is Octo's side).

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 | DB fields + Octo API client + payment service (start / settle / refund) | `superpowers:test-driven-development` (owner, lead) | `prisma/`, `src/lib/payments/`, `tests/lib/payments-*.test.ts` | – |
| M2 | Order API takes a payment choice; Octo callback, Pay-now and admin refund/check routes | `superpowers:test-driven-development` (owner, lead) | `src/lib/orders.ts`, `src/app/api/orders`, `src/app/api/payments/`, `src/app/api/admin/orders/[id]/{refund,payment-check}`, `tests/api/payments.test.ts` | M1 |
| M3 | Checkout choice, order-page payment panel, uz/ru/en texts | lead (owner), following `frontend-developer` conventions | `src/components/store/`, `src/app/[locale]/checkout`, `src/app/[locale]/order/`, `src/app/[locale]/account/orders/`, `messages/` | M2 |
| M4 | Admin payment block + refund/check buttons, orders-list badge, Telegram texts | lead (owner) | `src/app/admin/(panel)/orders/`, `src/components/admin/`, `src/lib/telegram.ts` | M2 |
| M5 | Review, deploy, live test-mode round trip, Octo support message, owner report | `code-reviewer` (verifier), `superpowers:verification-before-completion` | production `.env`, this plan | M3, M4 |

Gaps: Apple Pay / Google Pay can only be *requested* (Octo enables them); the success-path test depends on Octo's test page (see Open questions).

Waves (run serially by the lead: modules share `orders.ts` and `messages/*.json`, so no parallel worktrees):
- Wave 1: M1 · Wave 2: M2 · Wave 3: M3 → M4 · Wave 4: M5

## 5. Tasks

**Global constraints:** amounts in whole UZS (`total_sum` = `Order.totalUzs`); `OCTO_SECRET` only on the server; one-stage (`auto_capture: true`); no `payment_methods` field; an order becomes PAID only after `octoStatus()` returns `succeeded` with `totalSum === amountUzs`; vitest mocks `fetch` (no network in tests).

**Review focus (each pinned by a test in the owning task):**
1. Callback for an unknown `shop_transaction_id`, or a forged body saying `succeeded` while Octo says `created` → order unchanged (T3).
2. Octo reports a different amount than the order → never PAID, logged (T2).
3. Two callbacks at once / page reload after payment → exactly one PAID transition and one "paid" notification (T2).
4. Customer pays attempt 1 after starting attempt 2 (two tabs) → order PAID; Pay now refuses with ALREADY_PAID (T2, T3).
5. Octo down / error on prepare → order still created, customer lands on the order page with "Try again"; cash flow unaffected (T3).

### M1 — Payments core (wave 1)
- [x] **T1: Schema + Octo client.** _Evidence: payments-octo.test.ts 8/8; migration diff vs schema empty; commit 5ab9250._
  Migration `prisma/migrations/20261126000000_octo_payments/migration.sql` (additive): `Order.payMethod TEXT NOT NULL DEFAULT 'CASH'` (`CASH`|`CARD`); `Order.payToken TEXT` unique; table `Payment` (`id`, `orderId` → Order cascade, `provider` default `octo`, `shopTransactionId` unique, `octoPaymentId`, `status` default `created`, `amountUzs` Int, `payUrl`, `maskedPan`, `cardVendor`, `paidAt`, `refundedUzs` Int default 0, `refundId`, `createdAt`, `updatedAt`; index on `orderId`). `Order.paymentStatus` values: `UNPAID` (cash) · `PENDING` · `PAID` · `FAILED` · `REFUNDED`.
  `src/lib/payments/octo.ts`:
  - `octoConfig(): { shopId: number; secret: string; test: boolean } | null` (env `OCTO_SHOP_ID`, `OCTO_SECRET`, `OCTO_TEST=1`)
  - `class OctoError extends Error { code: number }`
  - `octoPrepare({ shopTransactionId, amountUzs, description, returnUrl, notifyUrl, language, phone? }, f = fetch): Promise<{ uuid; payUrl; status }>`: POST `https://secure.octo.uz/prepare_payment`, `init_time` in Tashkent time `yyyy-MM-dd HH:mm:ss`, `ttl: 30`, `auto_capture: true`, `test` from config
  - `octoStatus(shopTransactionId, f): Promise<{ uuid; status; totalSum; maskedPan?; cardVendor?; payedTime? }>`: same URL, body `{ octo_shop_id, octo_secret, shop_transaction_id }`
  - `octoRefund({ uuid, refundId, amountUzs }, f): Promise<{ refundId; status: 'succeeded' | 'pending' | 'failed' }>`: POST `/refund`. Read fields from `data` first, top level as fallback.
  Tests `tests/lib/payments-octo.test.ts`:
  - the body carries `octo_shop_id: 43297`, `octo_secret`, `total_sum: 1500000`, `currency: 'UZS'`, `auto_capture: true`, and `test: true` when `OCTO_TEST=1`
  - an `error: 2` response throws `OctoError` with code 2 and message 'Wrong secret'
  - `octoConfig()` is `null` when either env var is missing

  Verify: `npx vitest run tests/lib/payments-octo.test.ts` passes, and the migration applies on the test DB.
- [x] **T2: Payment service** _Evidence: payments-service.test.ts 14/14 (race → 1 notify, amount mismatch stays PENDING, late cancel keeps PAID); commit fb0809d._ `src/lib/payments/service.ts` (injectable deps `{ fetch?, notifyPaid?(orderId) }`):
  - `startCardPayment(orderId): Promise<{ payUrl }>`
    - Throws `'ALREADY_PAID'`, `'TOO_MANY_ATTEMPTS'` (max 10) or `OctoError`.
    - Creates a new `Payment` with `shopTransactionId = zanko-<number>-<attempt>`; the order gets `paymentStatus PENDING` and `paymentProvider 'octo'`.
    - Description `Zanko order #<number>`; `language` is the order locale.
    - `returnUrl = ${SITE_URL}/<locale>/order/<number>?t=<payToken>`; `notifyUrl = ${SITE_URL}/api/payments/octo/notify`.
  - `settlePayment(shopTransactionId): Promise<'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN'>`
    - Asks `octoStatus`.
    - `succeeded` with a matching amount: fills the payment row (uuid, maskedPan, cardVendor, paidAt) and sets the order PAID via a conditional `updateMany where paymentStatus != 'PAID'`. `notifyPaid` fires only if that update changed a row.
    - `canceled`: payment `canceled`; the order becomes `FAILED` only if it was `PENDING` and no other attempt succeeded.
    - Amount mismatch: `console.error`, and the order stays PENDING.
  - `settleOrder(orderId)`: settles every open attempt (`created` / `wait_user_action`) of a PENDING order.
  - `refundOrder(orderId): Promise<{ status: 'REFUNDED' | 'REFUND_PENDING' }>`
    - PAID orders only; refunds the full `amountUzs` of the succeeded attempt, with `refundId = zanko-r-<number>`.
    - `succeeded`: order REFUNDED and `refundedUzs` recorded.
    - `pending`: stores `refundId`, order stays PAID.
    - `failed` or an error: throws.
  Tests `tests/lib/payments-service.test.ts`:
  - happy path ends PAID
  - an amount mismatch stays PENDING
  - two concurrent `settlePayment` calls give exactly one `notifyPaid`
  - paid attempt 1 plus pending attempt 2 gives PAID, and `startCardPayment` throws ALREADY_PAID
  - canceled gives FAILED
  - a succeeded refund gives REFUNDED
  - refunding an unpaid order throws

  Verify: the test file passes. Commit M1.

### M2 — APIs (wave 2)
- [x] **T3: Order API + payment routes.** _Evidence: payments.test.ts 12/12 (forged callback ignored, payError keeps order, wrong token 404, paid 409, refund needs admin); commit dee46f6._
  - **`createOrder`:** input gains `payMethod?: 'CASH' | 'CARD'`. Card orders store `payMethod CARD`, `paymentStatus PENDING`, and a `payToken` of 24 random bytes (base64url).
  - **`POST /api/orders`:**
    - reads `body.payment === 'card'`
    - if `octoConfig()` is null it returns `400 CARD_UNAVAILABLE` before creating anything
    - card orders return `201 { number, token, payUrl }`; if `startCardPayment` throws, they return `{ number, token, payError: true }` and the order is kept
    - the cash response is unchanged
  - **`POST /api/payments/octo/notify`:** reads only `shop_transaction_id` from the JSON body, calls `settlePayment`, and always answers `200 { ok: true }`.
  - **`POST /api/payments/octo/pay` `{ number, token }`:**
    - same-origin and JSON checks, as in `/api/orders`
    - the token must match (`timingSafeEqual`), and requests are rate-limited by `clientKey`
    - returns `{ payUrl }`, or `409 ALREADY_PAID` / `404`
  - **Admin routes:** `POST /api/admin/orders/[id]/refund` and `/payment-check` go through `adminApi('orders', …)`, and both call `logActivity(staff, 'payment', 'order', id, …)`.
  Tests `tests/api/payments.test.ts` (with `fetch` mocked):
  - a card order returns a payUrl and creates a Payment
  - a cash order is unchanged (`paymentStatus UNPAID`)
  - a forged notify saying `succeeded` while mocked Octo says `created` leaves the order PENDING
  - an unknown id returns 200 and changes nothing
  - Pay now with a wrong token returns 404, and after PAID returns 409
  - a prepare failure still returns 201 with `payError`
  - the refund route requires admin

  Verify: `npx vitest run tests/api/payments.test.ts tests/api/public-orders.test.ts` passes. Commit.

### M3 — Storefront (wave 3)
- [x] **T4: Checkout choice.** _Evidence: tsc clean; commit 1109b36 (UI verified live in T9)._
  - `CheckoutForm` gets the prop `cardPayments: boolean`, set by `checkout/page.tsx` as `octoConfig() !== null`.
  - Under the address block, two radio cards:
    - **Cash on delivery** (the default)
    - **Pay online by card**, with Uzcard, Humo, Visa and Mastercard marks as text badges
  - With card selected, the submit button reads "Proceed to payment".
  - On success: `clear()`, then `window.location.assign(payUrl)`. On `payError`: the order page with the token.
  - New `checkout.*` keys in uz/ru/en: `payment`, `payCash`, `payCashHint`, `payCard`, `payCardHint`, `submitCard`, `errors.CARD_UNAVAILABLE`.

  Verify: `npx tsc --noEmit` and the existing checkout tests pass.
- [x] **T5: Order page payment panel.** _Evidence: payments-view.test.ts 4/4 (no token → null, settles before showing); commit af1080a._
  - A new helper `orderPaymentView(number, token)` in `src/lib/payments/view.ts` checks the token, settles the order if it is PENDING, and returns the view.
  - `/order/[number]` reads `searchParams.t`. With a valid token on a card order it shows one of four panels:
    - **Paid**: card vendor and masked number
    - **Waiting for payment**, with **Pay now**
    - **Payment failed**, with **Try again**
    - **Refunded**
  - The Pay buttons are a small client component posting to `/api/payments/octo/pay`.
  - The heading for an unpaid card order says "Order received — awaiting payment". Without a token the page is unchanged.
  - The same panel appears on `account/orders/[number]` (signed in, so no token is needed).
  - New `order.payment.*` keys in uz/ru/en.

  Verify: vitest for `orderPaymentView` (wrong token gives null; the PENDING path calls settle), and `npx tsc --noEmit`. Commit M3.

### M4 — Admin + Telegram (wave 3)
- [x] **T6: Admin.** _Evidence: tsc clean, admin-guard 29/29; commit 31bc135._
  - The order page gets a payment block: method, status badge, card vendor and masked number, Octo payment id, paid time, refunded amount.
  - Buttons **Check status** and **Refund** live in `src/components/admin/OrderPaymentButtons.tsx`. Refund shows only for PAID orders and asks for confirmation, showing the amount.
  - The orders list shows a `Paid` / `Awaiting payment` badge next to the status.

  Verify: `npx tsc --noEmit` and the admin guard tests pass.
- [x] **T7: Telegram.** _Evidence: telegram.test.ts 10/10 (built inside T3, see ledger ruling); commit dee46f6._
  - `NotifyOrder` gains `payMethod`. The summary line reads "💵 Cash on delivery" or "💳 Card (Octo) — awaiting payment".
  - `notifyOrderPaid(orderNumber)` sends "✅ Order #N paid by card: <amount> (<vendor> <maskedPan>)", wired in as the service's `notifyPaid`.

  Verify: extend the telegram tests and run them. Commit M4.

### M5 — Ship + prove (wave 4)
- [x] **T8: Review + deploy.** _Evidence: code-reviewer (opus): 0 Critical, 3 Important + 2 regraded → fixed test-first (suite 965/965 → 966 after language fix), 8 minors deferred (ledger); merged to main ce97f52 + language fix; db:deploy applied 20261126000000_octo_payments; build ok; secret in .next/static: 0 files; zanko.service active._
  - A `code-reviewer` subagent reviews the diff, focused on secret handling, PAID only via the status check, idempotency and the token check. Fix its findings.
  - Run the full `npx vitest run`, `npx tsc --noEmit` and `npm run build`.
  - Back up `zanko.db`, then add `OCTO_SHOP_ID=43297`, `OCTO_SECRET` and `OCTO_TEST=1` to the production `.env`.
  - Run `npm run db:deploy` and restart the service.
  - Grep `.next/static` for the secret: there must be no match.
- [~] **T9: Live test-mode round trip + handover.** _Evidence (live zanko.uz, test mode): /checkout?octo_test=1 shows Cash/Card, normal /checkout shows none; card order #1011 → redirected to pay2.octo.uz test page "Zanko order #1011", UZS 90000 (shots/octo-1-checkout.png, octo-2-octo-page.png, octo-4-form.png); forged callback claiming succeeded → 200, order stays PENDING (real Octo status = created); order page with token shows Waiting for payment + Pay now, without token unchanged; Pay now wrong token 404, after cancel 409 ORDER_CLOSED. **Not verified:** a successful payment, real Octo callback delivery, refund — Octo publishes no test cards (fake 8600… rejected as invalid). Octo support message drafted: /home/nick/zanko-data/octo-support-message.md. Test order #1011 cancelled._
  - In the headless browser on zanko.uz: add a product, check out with card, land on the `pay2.octo.uz` test page (screenshot), and try to complete it with a test card.
  - Confirm the callback arrives (server log) and the order page shows Paid.
  - If that's impossible, say plainly that the success path was proven only by mocked tests plus a real status check returning `created`.
  - Check Pay now and a cash order.
  - Draft the Octo support message: Apple Pay, Google Pay, the signature key, and test cards.
  - The owner decides when to set `OCTO_TEST=0`, which is go-live.
  - Write the Result section and the short owner report.

## 6. Verification
- `npx vitest run` (all) · `npx tsc --noEmit` · `npm run build`
- Live: `https://zanko.uz/uz/checkout` returns 200; headless T9 run with screenshots `/home/nick/tools/browser/shots/octo-*.png`.

## 7. Rollback
All changes are additive.
- **Turn card payments off instantly:** remove `OCTO_SECRET` from `.env` and restart. The card option disappears and cash is unaffected.
- **Full rollback:** `git revert` the feature commits. Restore `zanko-data/backups/zanko-pre-octo-*.db` only if the migration itself misbehaves; the new columns are defaulted or nullable, so old code runs on the new DB.
- Untracked `scripts/translate-images.ts` is not ours; leave it alone.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-26: requirement approved (fiscal receipts out of scope for now).
- 2026-11-26: plan approved; executing inline on branch `feat/octo-payments` (worktree /home/nick/zanko-octo).

## Result
Delivered: Octo card payments (Uzcard, Humo, Visa, Mastercard) on zanko.uz in **test mode**: checkout choice, Octo hosted page, verified-by-status settlement, order-page panel with Pay now/Try again, admin payment block with Check status/Refund and attempts list, Telegram "paid" message + double-payment/cancelled-order alerts, test-mode gating.
Checks run: full vitest 966 tests green, tsc clean, build ok, independent review (fixes applied), live test-mode run (see T9).
Gaps: successful payment / callback / refund not proven live (needs Octo test cards); Apple Pay & Google Pay need Octo to enable them; fiscal receipts out of scope (owner).
Follow-ups: send octo-support-message.md; when test cards arrive run /checkout?octo_test=1 end-to-end incl. refund; then set OCTO_TEST=0 in /home/nick/zanko/.env and restart (go live). Deferred minors M3–M10 in the ledger list.

## Handoff
Live on zanko.uz in Octo TEST mode (OCTO_TEST=1 in /home/nick/zanko/.env); card option only on /checkout?octo_test=1. Code: src/lib/payments/{octo,service,view,live}.ts, routes under src/app/api/payments/octo and admin orders/[id]/{refund,payment-check}. Branch feat/octo-payments merged into main (not pushed). Next: owner sends the Octo support message; with test cards finish T9 (success + refund), then OCTO_TEST=0 + restart to go live. Disable instantly by removing OCTO_SECRET and restarting.
