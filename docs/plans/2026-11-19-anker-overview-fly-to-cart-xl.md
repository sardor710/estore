# Anker overview import, fly-to-cart and shop review — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done – partial | 5 | 16/17 | 2026-11-19 | User: sign in to admin and spot-check the banner editor (T13); check Telegram fly target on a real device (A10) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

- **Goal:** Imported Anker products look as rich as on anker.com (every product-related picture, including the Overview), and adding to cart feels like a modern shop: the item visibly flies into the cart, the cart opens only when the shopper asks for it, and checkout starts from there. Fix anything in the shopping flow that behaves unusually.

- **Deliverables:**
  1. **Overview import.** The Anker parser reads `pageProps.metafields.components` and turns every product-related media block (`videoEle*`, `devices*`, `swiperProducts`, `compatible*`, and any other block whose shape carries image + optional title/subtitle) into **banner sections**. Each banner carries: heading (HTML stripped, `<br>` → space), optional subtitle/body, desktop image, optional mobile image. Order = the object's key order on the page. The `faq` component fills the product's `faq` (q/a, sanitized HTML → text). Blocks that point at other products or site chrome (related/recommended carousels, reviews, variantsMetafields, htmlContainer, productSpecs) are skipped. Video blocks: use their poster/fallback image if present; the video itself is not imported.
  2. **Storage.** Banners live in the existing `Product.sections` JSON (no migration). `Section` gains optional `layout: 'banner'`, `imageMobile`, `sourceKey`, `hidden`. Existing text sections built from key features stay; banners are appended after them. Re-import follows the "keep admin edits" rule below.
  3. **Translation.** Banner headings/bodies and imported FAQ go through the existing machine translation (`translate/apply.ts` already walks `sections` and `faq`); verify it handles the new fields and empty headings.
  4. **Storefront rendering.** On the DETAILED template, banner sections render full-width, edge to edge, heading (and subtitle) above the image, `<picture>` with the mobile image under the small breakpoint, lazy-loaded, intrinsic aspect ratio kept (no cropping). Text sections keep today's two-column layout. Broken images hide themselves instead of showing a broken icon.
  5. **Admin.** The product editor's "Feature sections" editor gets a banner toggle and a mobile-image field, so imported banners can be edited, reordered and deleted.
  6. **Cart flow.** `useCart().add` no longer opens the drawer. Adding from the product page, product cards and "Buy again" plays a fly-to-cart animation: a copy of the product image travels from the clicked button to the cart icon (Navbar on the website, TabBar cart tab in the Telegram Mini App), then the count badge pops. Built with the Web Animations API, no new library. With `prefers-reduced-motion`, no flight, only the badge change. A small toast "Added · View cart" (localized uz/ru/en, `aria-live=polite`) shows ~3 s; "View cart" opens the drawer. Clicking the cart icon opens the drawer; checkout is reached from the drawer as today. If no cart icon is visible (e.g. scrolled header hidden, mobile menu), the toast alone is the feedback.
  7. **Shop review pass.** Walk browse → product page → cart → checkout → account as a shopper on desktop and mobile widths and in the Telegram layout. Fix clear bugs (broken states, wrong counts, dead buttons, layout breaks, stuck focus, missing feedback). Anything that changes business behavior (prices, delivery, order rules, stock policy) is listed for the user, not changed.

- **Constraints:**
  - Next.js version in this repo has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
  - Do not touch the user's dirty files except for adding new keys: `messages/{en,ru,uz}.json` may receive new keys only, appended without altering the existing uncommitted edits; never touch `.env.example`, `src/components/store/LocationButton.tsx`, `src/components/store/MapPicker.tsx`.
  - Images stay hotlinked from Anker's CDN (same as the gallery today).
  - Gallery import behavior (`MAX_IMAGES`, variant image mapping) stays as is; banners have their own cap (proposal: 40 blocks) so a page can't flood the product.
  - Existing tests (`vitest run`) keep passing; no commit unless the user asks.

- **Non-goals:** downloading/re-hosting Anker images; importing videos; changing the checkout form itself; new database columns; importers for other brands; restyling the whole site.

- **Assumptions:**
  - The live page shape seen on 2026-11-19 for `a120f-100w-usb-c-gan-charger-battery-care` (components with `src/srcMb`, `img/mobImg`, `list[].img/mobImg/title/subTitle`, `list[].child[].image/imageMob`) is representative of Anker product pages; the parser is written shape-tolerant (looks for these key pairs generically) rather than per-block.
  - A fresh fixture of that live page is saved to `tests/fixtures/` for tests (the existing `anker-a120f.html` is older and has fewer components; keep it, add a new one).
  - Banner sections show only on the DETAILED template (SIMPLE template products are hand-made and keep their layout).

- **Builder calls (from the builder check; user may override):**
  - **FAQ on re-import (call):** imported FAQ merges like banners, matched by English question text: uz/ru translations kept, hand-added FAQ kept. New import fills FAQ from the page instead of `[]`.
  - **Existing products (call):** no bulk backfill. Already-imported products get banners when the admin presses re-import (existing per-product action).
  - **"Buy again" (call):** one flight (a bag-icon bubble from the button: buy-again lines carry no image), toast reads "N items added · View cart"; the existing inline panel for unavailable items stays.
  - **Stock cap (call):** `add()` returns whether the cart changed. If nothing changed (stock cap reached): no flight, toast "Maximum available quantity is already in your cart".
  - **Merge pairing (call):** banner/FAQ merge never falls back to matching by position; only by key (English heading, else desktop image URL without query).

- **Re-import vs. admin edits (user decision 2026-11-19: keep admin edits):** each imported banner stores a `sourceKey` (English heading slug, else desktop image URL without query). Re-import leaves existing banners untouched (text, images, order, translations) and only appends banners whose `sourceKey` isn't already on the product. Hand-added banners (no `sourceKey`) are never touched. Deleting an imported banner in admin hides it (`hidden: true`, shown greyed with "Restore") so re-import doesn't bring it back; hidden banners don't render on the storefront. Same rule for imported FAQ (`sourceKey` = English question).

- **Open questions:** none.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Parsing the fresh fixture yields ≥ 10 banner blocks with desktop images, mobile images where present, headings without HTML, and the FAQ items | auto | `npx vitest run tests/lib/importer.test.ts` |
| A2 | Related-product carousels, reviews, footer/nav/marketing images are not in banners or gallery | auto | same test (asserts on excluded URLs) |
| A3 | Import creates `sections` with `layout:'banner'` entries and FAQ; re-import keeps edited, reordered and hidden banners as they are, keeps hand-added ones, and appends only new source banners | auto | `npx vitest run tests/lib/importer.test.ts` |
| A4 | `add()` does not open the drawer; count updates | auto | `npx vitest run tests/lib/cart.test.ts` |
| A5 | Translation walker handles banner sections (empty heading allowed) | auto | `npx vitest run tests/lib/translate*.test.ts` (or the existing translate test file) |
| A6 | Full suite and production build pass | auto | `npm test` and `npm run build` |
| A7 | Imported A120F product page shows full-width banners in page order, mobile image at phone width, no broken images | manual (browser) | screenshot desktop + 375px |
| A8 | Add to cart from product page and from a product card: image flies to the cart icon, badge pops, toast appears, drawer stays closed; clicking cart icon opens drawer; Checkout button leads to checkout | manual (browser) | screenshots / recording |
| A9 | Reduced-motion: no flight, toast still shown | manual (browser) | emulate `prefers-reduced-motion` |
| A10 | Telegram layout: flight targets the TabBar cart tab | manual (browser) | `/tg` route screenshot |
| A11 | Review pass: findings list written in Result section; each fixed item has before/after evidence; business-rule items listed, not changed | manual | plan file Result section |

Manual spot checks: re-import an already imported Anker product from admin and confirm banner edits/translations survive; edit a banner in admin (toggle, mobile image) and see it on the storefront.

## 3. Anti-drift
- **Primary objective:** a shopper sees Anker's full overview story on the product page, and adding to cart is visibly confirmed without interrupting browsing.
- **Proxy signals (not success by themselves):** tests pass; build passes; parser returns "many images" (count alone — they must be the product's overview, in order, not site chrome); animation code exists (it must actually land on the visible cart icon).
- **Intended scope:** `src/lib/importer/`, `src/lib/admin/import.ts` (if needed), `src/lib/catalog.ts` (Section type), `src/lib/translate/apply.ts` (if needed), `src/components/store/DetailedProduct.tsx`, a new banner component, `src/components/admin/ProductEditor.tsx` sections editor, `src/lib/cart/useCart.ts`, new fly-to-cart + toast modules, `ProductHero.tsx`, `ProductCard.tsx`, `BuyAgainButton.tsx`, `Navbar.tsx`, `tg/TabBar.tsx`, new message keys, tests; plus small targeted fixes found in the review pass.
- **Completion target:** full delivery of deliverables 1–6; deliverable 7 bounded to clear bugs found in one review pass.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Overview import | Parser + importer produce banner sections and FAQ; re-import keeps admin edits; admin save keeps the new fields | `superpowers:test-driven-development` (owner, agent_direct) | `src/lib/importer/`, `src/lib/catalog.ts` (types), `src/lib/admin/products.ts` (cleaners), `tests/lib/importer.test.ts`, `tests/lib/translate.test.ts`, `tests/lib/admin-products.test.ts`, `tests/fixtures/anker-a120f-live.html` | – |
| M2 Banner UI | Full-width banners on product page; admin banner toggle, mobile image, hide/restore | `frontend-developer` guidance (owner, done inline), `ux-architect` lens for layout | `src/components/store/DetailedProduct.tsx`, new `src/components/store/OverviewBanner.tsx`, `src/components/admin/ContentEditor.tsx` | M1 (types) |
| M3 Cart flow | Add never opens drawer; fly-to-cart; badge pop; toast with "View cart" | `superpowers:test-driven-development` (owner for store logic), `frontend-developer` (owner for UI) | `src/lib/cart/`, new `src/components/store/CartToast.tsx`, `ProductHero.tsx`, `ProductCard.tsx`, `BuyAgainButton.tsx`, `Navbar.tsx`, `tg/TabBar.tsx`, `StoreShell.tsx`, `messages/{en,ru,uz}.json` (new keys only), `tests/lib/cart.test.ts` | – |
| M4 Shop review | Shopper walkthrough; clear bugs fixed with evidence; business items listed | `evidence-collector` method (owner, done inline in built-in browser), `superpowers:systematic-debugging` (support per bug) | small targeted fixes, each logged in Result | M1–M3 |
| M5 Verify and deliver | All checks run, independent diff review, plan closed | `superpowers:verification-before-completion` (owner), `code-reviewer` agent (verifier) | plan file only (+ fixes from review) | M4 |

Gaps (no fitting skill): none.

Waves (serial on purpose: M1/M3 have disjoint code, but `messages/*.json` carries the user's uncommitted edits, which a separate worktree would not have, so parallel worktrees would create merge risk on user files):
- Wave 1: M1
- Wave 2: M2
- Wave 3: M3
- Wave 4: M4
- Wave 5: M5

## 5. Tasks

**Global constraints (apply to every task):** read the relevant `node_modules/next/dist/docs/01-app` guide before using any Next.js API not already used in the touched file; no new npm dependencies; `messages/*.json` get appended keys only; never touch `.env.example`, `LocationButton.tsx`, `MapPicker.tsx`; no commits unless the user asks (the "commit" step of writing-plans is replaced by updating this tracker).

**Review focus (inputs no happy-path test hits; each has a test in its owning task):**
1. Anker page without `metafields.components` (older pages, the old fixture's missing blocks) → import still succeeds with zero banners (M1 T1).
2. Video-only block (`type:'video'`, `.mp4` src, no poster) → skipped, no `.mp4` ever stored as an image (M1 T1).
3. Two blocks with the same heading → both kept, distinct `sourceKey`s (M1 T1).
4. Admin saves a product with banners → `layout/imageMobile/sourceKey/hidden` survive; a non-https `imageMobile` is dropped (M1 T3).
5. Add when the cart already holds full stock → `add` returns false, no flight, "max" toast (M3 T1).

### M1 — Overview import (wave 1)

**Interfaces produced:**
- `src/lib/catalog.ts`: `Section = { heading: L10n; body: L10n; image?: string; imageMobile?: string; layout?: 'banner'; sourceKey?: string; hidden?: boolean }`; `FaqItem = { q: L10n; a: L10n; sourceKey?: string; hidden?: boolean }`.
- `src/lib/importer/anker-parse.ts`: `ImportedProduct` gains `banners: { heading: string; body: string; image: string; imageMobile?: string; sourceKey: string }[]` and `faq: { q: string; a: string; sourceKey: string }[]`; `export const MAX_BANNERS = 40`.

- [x] **T0 Fixture.** Save the live page `https://www.anker.com/products/a120f-100w-usb-c-gan-charger-battery-care` (plain GET with the importer's browser User-Agent, same as `fetchAnkerHtml`) to `tests/fixtures/anker-a120f-live.html`. Keep the old fixture. — verify: file contains `"videoEle_1"` and `"compatible_2"`. — **evidence:** saved 1.8 MB via curl (200); contains videoEle_1 and compatible_2.
- [x] **T1 Parser (TDD).** In `tests/lib/importer.test.ts` add `describe('parseAnkerHtml overview banners (live fixture)')` with: `≥ 10 banners`; first banner image key ends `A210C011_A__landing_page_01_US_V1_jpg.png` with mobile `Frame_2147239181.png`; a banner with heading `Charging Power Guide` exists; no heading contains `<`; every `image`/`imageMobile` is https and not `.mp4|.webm|.mov`; no banner image equals a `pageProps.metafields.menuCharger`/footer image; `faq.length ≥ 3` with no `<` in `a`. Plus synthetic cases built by editing the fixture's `__NEXT_DATA__` (reuse the existing `withImages`-style helper): components removed → `banners: []` and import fields otherwise unchanged; a `{type:'video', src:'https://x/a.mp4'}` block → skipped; two blocks with heading `Same` → keys `same` and `same-2`; 60 blocks → `MAX_BANNERS` cap. Run: `npx vitest run tests/lib/importer.test.ts` → new tests FAIL. Implement `parseOverview(components: unknown): { banners; faq }` in `anker-parse.ts`, called from `parseAnkerHtml` with `pageProps.metafields?.components`. Rules: walk entries in key order; skip keys `/^(reviews|faq|htmlContainer|productSpecs|variantsMetafields)/` (faq handled separately from `components.faq.items[{question,answer}]`); skip a block if any list item carries `handle`, `productId` or a `/products/` link (related-product carousels); desktop image from the first of `src|img|image|pcImg`, mobile from `srcMb|mobImg|imageMob|mobileImg|mbImg`, poster from `poster|cover` when the desktop value is a video; heading = item `title|txt`, falling back to the block's `title|topContent.title|_topContent.title` for the block's first entry; body = `subTitle|desc|topContent.desc|_topContent.desc`; nested `list[].child[]` entries inherit the parent item's `txt`; text = `textOf` with `<br>` → space; dedupe by desktop image key; `sourceKey = slugify(heading) || imageKey`, repeated keys get `-2`, `-3`. Run again → PASS, and all old importer tests still PASS. — **evidence:** 11 new tests RED (banners undefined) then GREEN; importer.test.ts 34/34; live page gives 19 banners (all with a mobile image) and 8 FAQ; old fixture also 19.
- [x] **T2 Importer + re-import (TDD).** Tests in the `importAnkerProduct` describe using the live fixture: new import → `sections` = key-feature text sections followed by banners with `layout:'banner'`, `sourceKey`, `image`, optional `imageMobile`; `faq` non-empty with `sourceKey`. Re-import test: after import, set a banner's `heading.uz`, edit another banner's `heading.en`, move the last banner to the front, mark one `hidden:true`, delete one banner entirely, append a hand-made banner without `sourceKey`, edit one FAQ answer; call `refreshAnkerProduct` → existing banners exactly as edited and in the edited order (hidden still hidden), hand-made banner kept, the deleted one re-appended at the end (it has no tombstone — admin delete in UI hides instead, see M2), FAQ edit kept, nothing duplicated. Implement in `anker.ts`: `buildBanners(p): Section[]`, `buildFaq(p): FaqItem[]`, `appendNewBySourceKey<T extends { sourceKey?: string }>(old: T[], fresh: T[]): T[]` (keeps `old` as is, appends `fresh` whose `sourceKey` is absent from `old`); import writes `sections: [...buildSections(p), ...buildBanners(p)]`, `faq: buildFaq(p)`; refresh writes `sections: [...mergeItems(buildSections(p), oldText, enOf('heading')), ...appendNewBySourceKey(oldBanners, buildBanners(p))]` where old is split by `layout === 'banner'`, and `faq: appendNewBySourceKey(oldFaq, buildFaq(p))`. Run `npx vitest run tests/lib/importer.test.ts` → PASS (incl. the existing "refresh applies changed upstream EN…" test). — **evidence:** 2 new tests RED then GREEN; importer.test.ts 37/37; tsc clean.
- [x] **T3 Admin save keeps banner fields (TDD).** In `tests/lib/admin-products.test.ts`: saving a product whose sections/faq carry `layout:'banner'`, `imageMobile:'https://…'`, `sourceKey`, `hidden:true` round-trips them; `imageMobile:'javascript:x'` and `layout:'weird'` are dropped. Implement in `src/lib/admin/products.ts` `cleanSections` and the faq mapper (line ~182) via a small `cleanSourceFields(s)` helper: `layout` only `'banner'`, `imageMobile` only `https?://`, `sourceKey` string ≤ 200 chars, `hidden` only `true`. Run `npx vitest run tests/lib/admin-products.test.ts` → PASS. — **evidence:** new test RED (fields stripped) then GREEN; admin-products + translate 63/63 once the other session's run ended (its run had wiped test.db mid-test earlier).
- [x] **T4 Translation covers banners.** In `tests/lib/translate.test.ts`: a product with a banner `{heading:{en:''}, body:{en:'Body'}, layout:'banner'}` and an FAQ item translates `body` and FAQ, skips the empty heading, keeps `layout/image/sourceKey`. Expected to pass without code changes (walker already skips empty EN); fix `apply.ts` only if it fails. Run `npx vitest run tests/lib/translate.test.ts` → PASS. — **evidence:** test passed without code changes, as the plan predicted (walker already skips empty EN and keeps other fields).

### M2 — Banner UI (wave 2)

- [x] **T5 Storefront banners.** New client component `src/components/store/OverviewBanner.tsx`: `OverviewBanner({ heading, body, image, imageMobile }: { heading: string; body: string; image: string; imageMobile?: string })` — `<section aria-label={heading || undefined}>`; heading `h2` + body centered above (rendered only when non-empty); `<picture>` with `<source media="(max-width: 639px)" srcSet={imageMobile}>` when present and `<img src={image} alt={heading} loading="lazy" decoding="async" className="block h-auto w-full">`; the whole section returns `null` after the image errors (same `complete && naturalWidth === 0` pre-hydration check as `ProductHero`). In `DetailedProduct.tsx`: `visible = sections.filter(s => !s.hidden)`, split into `text` (no `layout`) and `banners`; text sections render exactly as today; description shows when `text.length === 0` (call: banners no longer suppress the description); banners render after the text-section container and before specs, each full-bleed (`w-full`, image capped at `max-w-[1920px] mx-auto`), stacked with no gaps between images, heading block `py-10`; FAQ list skips `hidden`. Verify: `npx tsc --noEmit` clean, then A7 in browser after an import (M4). — **evidence:** OverviewBanner + DetailedProduct split; tsc clean. Browser proof in T10.
- [x] **T6 Admin editor.** In `src/components/admin/ContentEditor.tsx`: `Row` gains optional `onRemove` override and `muted` flag. `SectionsEditor`: checkbox "Full-width banner (image shown edge to edge)" toggling `layout`; when banner, an input "Mobile image (optional http(s) URL)" for `imageMobile`; remove on an item with `sourceKey` sets `hidden:true` instead of deleting; hidden items render muted with label "Hidden — re-import won't bring it back" and a "Restore" button (`hidden` removed); items without `sourceKey` delete as today. `FaqEditor`: same hide/restore rule. Verify: `npx tsc --noEmit` clean; manual spot check in M4. — **evidence:** SectionsEditor banner toggle, mobile image, hide/restore; FaqEditor hide/restore; tsc clean. Browser proof in T13.

### M3 — Cart flow (wave 3)

**Interfaces produced:**
- `src/lib/cart/useCart.ts`: `addToCart(variantId: number, qty: number, max?: number): boolean` (store-level; true when the variant's qty in the cart changed); `isCartDrawerOpen(): boolean`; hook `useCart().add` has the same signature/return; `add` never opens the drawer.
- `src/lib/cart/flyToCart.ts`: `flyToCart(opts: { from: Element; imageSrc?: string | null }): Promise<void>`; targets are elements with `data-cart-target`.
- `src/lib/cart/cartToast.ts`: `showCartToast(t: { kind: 'added' } | { kind: 'addedMany'; count: number } | { kind: 'max' }): void`, `useCartToast(): { toast: CartToastState | null; dismiss(): void }`.

- [x] **T7 Store logic (TDD).** In `tests/lib/cart.test.ts` add `describe('cart store')`: `addToCart(7, 1, 5)` → `true`, `isCartDrawerOpen()` → `false`; adding again with qty capped at `max` (cart already at 5 of `max 5`) → `false`; `addToCart(7, 0)` → `false`. Reset between tests via the existing `clear` path (export `clearCart()` if needed). Run `npx vitest run tests/lib/cart.test.ts` → FAIL, implement in `useCart.ts` (remove `setDrawer(true)` from add; change = qty before ≠ after), → PASS. — **evidence:** 3 store tests RED (clearCart is not a function) then GREEN; cart.test.ts 9/9; full suite 805/805 (52 files).
- [x] **T8 Fly + toast.** `flyToCart`: resolve immediately when `matchMedia('(prefers-reduced-motion: reduce)')` matches or no `[data-cart-target]` element has a non-zero rect inside the viewport; otherwise append a fixed 56px rounded clone (`<img>` of `imageSrc` with white bg, or a black dot with a bag icon when no image) at the `from` element's center and `animate()` it to the target's center along a curved path (two keyframe offsets, lift ~80px), scale 1 → 0.3, opacity 1 → 0.6, 700 ms `cubic-bezier(.5,-0.2,.7,1)`; on finish remove the clone and run `target.animate([{transform:'scale(1)'},{transform:'scale(1.3)'},{transform:'scale(1)'}], 300)`. `CartToast.tsx` (client): fixed bottom-center (`bottom-6`; Telegram prop → `bottom-[calc(5rem+env(safe-area-inset-bottom))]`), `role="status" aria-live="polite"`, auto-hide 3 s (paused on hover/focus), text from `cartToast.added|addedMany|max`, a "View cart" button (`cartToast.view`) calling `useCartDrawer().setOpen(true)` then dismiss; mounted in both branches of `StoreShell.tsx`. Messages (append to each file, new namespace `cartToast`): en `added: "Added to cart"`, `addedMany: "{count, plural, one {# item} other {# items}} added to cart"`, `max: "The maximum available quantity is already in your cart"`, `view: "View cart"`; ru `"Добавлено в корзину"`, `"{count, plural, one {# товар добавлен} few {# товара добавлено} many {# товаров добавлено} other {# товара добавлено}} в корзину"`, `"В корзине уже максимально доступное количество"`, `"Открыть корзину"`; uz `"Savatga qo'shildi"`, `"{count} ta mahsulot savatga qo'shildi"`, `"Savatda mavjud bo'lgan maksimal miqdor bor"`, `"Savatni ochish"`. Verify: `npx tsc --noEmit`; `npx vitest run tests/lib/messages*.test.ts` if a messages-parity test exists. — **evidence:** flyToCart.ts, cartToast.ts, CartToast.tsx, messages en/ru/uz; tsc clean. Browser proof in T11.
- [x] **T9 Wire call sites.** `Navbar.tsx` cart button icon wrapper and `TabBar.tsx` cart icon `<span className="relative">` get `data-cart-target`. `ProductHero.tsx`: ref on the add button; `if (add(...)) { void flyToCart({ from: btn, imageSrc: current }); showCartToast({kind:'added'}) } else showCartToast({kind:'max'})`, keep the green "Added" state only on success. `ProductCard.tsx`: same with `product.image`, from the quick-add button. `BuyAgainButton.tsx`: drop `useCartDrawer`/`setOpen`; after adding, if any line changed → `flyToCart({ from: button })` + `showCartToast({kind:'addedMany', count: r.lines.length})`; the inline result panel stays. `CheckoutForm.tsx` untouched. Verify: `npx tsc --noEmit`; `npm test` all PASS; browser A8–A10 in M4. — **evidence:** Navbar/TabBar data-cart-target; ProductHero, ProductCard, BuyAgainButton wired; tsc clean. Browser proof in T11.

### M4 — Shop review (wave 4)

- [x] **T10 Import the A120F product locally** through admin Import (dev server via `preview_start estore-dev`), publish it with a price/stock, and run A7 (desktop 1440 + 375 px screenshots). — **evidence:** A120F was already in the dev DB (id 13), so a temp script ran the re-import path: 19 banners + 8 FAQ appended. A7 checked on the other session's dev server (:3000; Next allows one dev server per folder): 1440px banners 1434px wide with desktop images; 375px uses mobile images (780px), scrollWidth 375 (no sideways scroll); 0 broken images; 8 FAQ items. Lazy images only loaded after forcing eager in-page because the browser pane was hidden (the URL itself loads 2880x1440). Screenshots taken at both widths.
- [x] **T11 Cart checks** A8, A9 (`prefers-reduced-motion` emulated via a CSS media override in DevTools or `matchMedia` stub), A10 (`/tg` mode as previous Telegram plan did). — **evidence:** A8: add on product page → image ghost flew, badge 1→2, toast "Added to cart · View cart", drawer stayed closed; cart icon opens drawer with Checkout link /en/checkout; ghost removed itself, toast auto-hid. Max case: badge unchanged, no ghost, "max" toast. A9 (reduced motion stubbed): no ghost, toast shown; follow-up fix removed the icon pop in this mode. A10: not verifiable live (site leaves Telegram mode without a real Telegram client, by design); verified in code only (TabBar cart icon has data-cart-target; header is not rendered in Telegram mode).
- [x] **T12 Shopper walkthrough** home → category → search → product (both templates) → cart drawer (qty +/−, remove, empty state) → checkout (validation, success) → account (orders, buy again, favorites) at 1440 and 375 px; console clean. Each clear bug: one `systematic-debugging` pass, fix, before/after evidence, logged in Result. Business-rule findings → Result "For the user" list, unchanged. — **evidence:** Walkthrough on :3000 at 1440/375px: home quick-add (fly, badge, toast, drawer closed), product page, cart drawer (+ disabled at stock, − works, remove), checkout opens from drawer and validates name/phone/region/address with messages; ru toast text checked; 0 console errors. Two bugs fixed (see Rulings T12).
- [!] **T13 Admin spot checks**: edit/hide/restore a banner and FAQ item, save, re-import → edits survive, hidden stays hidden. — **evidence:** admin UI not clicked: signing in needs the admin password from the user's real .env, which I must not type. Admin save of the new fields is covered by tests/lib/admin-products.test.ts; the editor UI (banner toggle, mobile image, hide/restore) still needs a manual look.

### M5 — Verify and deliver (wave 5)

- [x] **T14** Run `npm test`, `npm run build`, record output summaries here. — **evidence:** npx tsc clean; npm test 52 files / 808 tests passed; npm run build exit 0 (Compiled successfully).
- [x] **T15** Dispatch `code-reviewer` on the full diff (excluding the user's pre-existing dirty files); apply confirmed fixes (one repair each), rerun T14. — **evidence:** code-reviewer (opus): 0 Critical, 2 Important, 8 Minor. Fixed: toast stuck after clicking its buttons (browser repro RED → GREEN), un-bannered import lost on re-import (test RED → GREEN), plus Minor #4 re-graded Important (CDN /products/ image paths dropped whole blocks; test RED → GREEN). Suite 808/808 after the fix pass.
- [x] **T16** Fill Result, set Status, remove temp files created by this run (scratchpad probe only). — **evidence:** Result filled; temp import script deleted; scratchpad probes only.

## 6. Verification
- `npm test` (vitest; needs the local test DB used by `tests/global-setup.ts`)
- `npm run build`
- `npx tsc --noEmit`
- Browser checks A7–A10 (built-in browser, `estore-dev` launch config)

## 7. Rollback
Additive changes; restore touched files with `git checkout -- <file>` for files that were clean before this run. Leave unrelated dirty files untouched.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|
| A10 (live) | The site leaves Telegram mode without a real Telegram client (by design) | User checks add-to-cart in the Telegram Mini App on a phone | 2026-11-19 |
| T13 | Admin sign-in needs the user's own password | User signs in to /admin in the browser pane (or their browser) and checks: product 13 → Feature sections → toggle/mobile image/hide/restore, save, re-import | 2026-11-19 |

## Revisions
- 2026-11-19: requirement drafted (approaches chosen by user: full-width banners in existing `sections`; hand-built fly-to-cart with toast).
- 2026-11-19: requirement approved by user ("keep admin edits" on re-import). Plan drafted.
- 2026-11-19: plan approved; executor = inline (user: "build yourself").
- Ruling: work in this checkout on main, no commits — user said do not commit unless asked and the plan keeps serial in-place work because of the user's dirty messages files — cost if wrong: user wanted a branch; easy to branch later since nothing is committed.
- Ruling: ledger is this plan file (vibe tracker rule), not the sdd workspace scripts, which need per-task commits — cost if wrong: none beyond tooling preference.
- Ruling (T1): a block's first entry takes the block title; nested child images after the first get no heading (stacked images, as on anker.com) — cost if wrong: some banners lack headings; admin can add them.
- Ruling (T5): banners no longer suppress the product description; only hand-written text sections do (a banner-only product would otherwise lose its description) — cost if wrong: description shows above the banners.
- Ruling (T6): ListControls gets an optional removeLabel so the trash button on imported items reads "Hide … (imported)" — cost if wrong: none.
- Ruling (T8): toast reuses the existing fadeIn keyframes (no CSS change), auto-dismisses when the drawer opens, and has a Close button (extra `cartToast.close` key) — cost if wrong: none.
- Ruling (T9): buy-again toast counts lines that actually changed (not r.lines.length) and shows "max" when none changed, matching the stock-cap rule — cost if wrong: count differs from the server's line count when some lines were already at stock.
- Ruling (T8/T9): the fly target is the whole header cart button (icon and badge pop together); new message keys are inserted before `product`, not at file end, to stay clear of the other session's location keys — cost if wrong: none.
- Ruling (T10): imported via a temporary script calling importAnkerProduct/refreshAnkerProduct instead of the admin UI — the admin password is in the user's real .env, which must not be typed — cost if wrong: the admin Import button itself was not clicked (same function underneath). The script set price 749,000 / stock 3 only where they were 0 and published product 13 in the dev DB; script deleted afterwards.
- Ruling (T12): fixed in review pass (each with failing check first): (a) cart drawer dropped keyboard focus to <body> on close → now returns to opener, or to the cart icon when opened from the toast (browser check RED → GREEN); (b) product-card quick-add had no stock cap, so repeated taps showed "Added" past stock until the drawer clamped it → CardProduct.quickAddStock + cap (catalog test RED → GREEN; 8 taps stop at stock 5 with "max" toast).
- Ruling (T12): not changed, listed for the user: checkout does not move focus to the first invalid field (CheckoutForm.tsx is being edited by the other session); order placement not exercised (would create a real order and notifications); first imported A120F banner is anker.com's own block about a different charger (admin can hide it).
- Final: fixed toast stays up after its buttons are clicked — browser repro (hover View cart → close → add → toast still shown at 4.5 s) RED → GREEN after keying ToastBody by toast id; suite 808/808.
- Final: fixed imported banner turned into a text row was dropped and re-added on re-import — test 're-import keeps an imported banner the admin turned into a text section' RED → GREEN; suite 808/808.
- Final: Ruling: reviewer Minor #4 ("/products/" filter also matched Shopify CDN image paths) re-graded Important — it would silently drop overview blocks hosted under cdn.shopify.com/.../products/, defeating "import all pics"; fixed, test 'a block whose images live under a Shopify CDN /products/ path is still imported' RED → GREEN.
- Final: minor (deferred): OverviewBanner pre-hydration broken check could misfire on browsers that report complete=true for unloaded lazy images (verify Safari/Firefox).
- Final: minor (deferred): a video block whose src is an extension-less player URL is stored as an image (storefront hides it, admin sees a junk banner); use poster keys only when type==='video'.
- Final: minor (deferred): repeated-heading sourceKey suffixes (-2, -3) depend on page order.
- Final: minor (deferred): admin can save a banner with no image (storefront silently skips it); imageMobile accepts http:// (mixed content).
- Final: minor (deferred): adding more than the remaining stock shows "Added" even though fewer were added (no "capped" note).
- Final: minor (deferred): hidden banners/FAQ are still machine-translated.
- Final: minor (deferred): on touch devices, closing the drawer focuses the cart icon (check iOS for a sticky focus ring).

## Result
Delivered:
- Anker importer reads all overview blocks (19 banners with desktop + mobile images on A120F) and the page FAQ (8); related-product carousels, videos and site chrome excluded; cap 40. `src/lib/importer/anker-parse.ts`, `anker.ts`.
- Re-import keeps admin edits (order, text, translations, hidden, hand-made, un-bannered imports) and only appends new source items.
- Product page: full-width banners with phone images (`OverviewBanner.tsx`, `DetailedProduct.tsx`); admin editor: banner toggle, mobile image, hide/restore (`ContentEditor.tsx`, `ListControls.tsx`); admin save keeps the new fields (`src/lib/admin/products.ts`).
- Cart: add never opens the drawer; fly-to-cart to the header icon / Telegram tab (`src/lib/cart/flyToCart.ts`); "Added · View cart" / "max" toast in en/ru/uz (`CartToast.tsx`, `cartToast.ts`); `add()` returns whether the cart changed.
- Review fixes: cart drawer returns focus to its opener; product-card quick-add capped at stock (`CardProduct.quickAddStock`).

Checks run: tsc clean; npm test 808/808 (52 files); npm run build OK; browser checks A7, A8, A9 on the dev server; independent code review (fixes above).

Gaps: T13 admin editor UI not clicked (needs the user's admin sign-in); A10 Telegram fly target verified in code only; order placement not exercised.

For the user (not changed): checkout does not move focus to the first invalid field (CheckoutForm.tsx belongs to the other session's work); the first imported A120F banner is anker.com's own block about a different charger — hide it in admin if unwanted; dev DB product 13 was published with price 749,000 / stock 3 where those were 0.

Follow-ups: deferred minors listed under Revisions ("Final: minor (deferred)").

## Handoff
Done – partial on 2026-11-19. All code is uncommitted on main (user asked for no commits); another session is concurrently committing Yandex-map work in this folder, so commit only this plan's files (see Result). Remaining: T13 (user signs in to admin and checks the Feature sections editor on product 13) and a live Telegram check (A10). Deferred minors are in Revisions. Tests share test.db: don't run vitest while another session's run is active.
