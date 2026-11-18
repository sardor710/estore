# Profile UI, one-line menu, live product search — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | – | 14/14 | 2026-11-18 | None (deferred minors listed in Result) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement
- **Goal:** (a) a clear, recognisable profile entry in the header and a nicer profile area; (b) the desktop category menu stays on one line in every language; (c) "adaptive" search: matching product suggestions appear under the search field while typing, tolerant of typos, partial words and Latin/Cyrillic spelling.
- **Found at start (2026-11-18):** profile icon (`AccountMenu.tsx`) and `/account` pages (overview, profile, orders, favorites, addresses) already exist; the category row wraps to 2 lines at 1280–1366px in uz/ru (Sale + Blog drop); search is submit-only, substring match on title/shortSpec/SKU (`searchProducts` in `src/lib/catalog.ts`).
- **Deliverables:**
  1. **Search engine** `src/lib/search/`: text normalisation (case, diacritics, ʻ ’ ' apostrophes), Cyrillic↔Latin transliteration, tokenising, per-token prefix match + typo tolerance (edit distance ≤1 for tokens ≥4 chars, ≤2 for ≥8), weighted scoring (title > brand/category > short spec > SKU), all locales searched, current locale ranked first. Storefront products only (same rules as today).
  2. **Suggest API** `GET /api/search/suggest?q=&locale=` → up to 6 products (slug, title, image, current price, old price if discounted) + up to 3 matching categories; min 2 chars; q capped at 100 chars; short in-memory cache.
  3. **`/search` page** uses the same engine (results consistent with suggestions; typo-tolerant).
  4. **SearchBox component** (shared by store header and Telegram Mini App top bar): dropdown under the field while typing (debounced ~200ms), product rows with thumbnail, title with matched part highlighted, price; category chips; "See all results for “q”" row; loading and "nothing found" states; keyboard ↑/↓/Enter/Esc, ARIA combobox; click outside closes; Enter with no selection goes to `/search?q=`.
  5. **One-line menu**: desktop category row measures available width and moves the categories that don't fit into a "More ▾" dropdown; Sale and Blog stay visible. Re-measures on resize and locale.
  6. **Profile UI**: header — signed out shows icon + "Sign in" label (lg+), signed in shows initial avatar + first name (lg+); dropdown gets a header block (avatar, name, phone). Account area — profile card at the top of the account sidebar (avatar initial, name, phone, "Edit profile"), and the profile page gets an avatar header above the form.
  7. All new texts in `messages/{uz,ru,en}.json`.
- **Constraints:** Next.js 16 in this repo — read the relevant `node_modules/next/dist/docs/` guide before writing route/page code (AGENTS.md). Existing stack only (Tailwind, lucide-react, next-intl, Prisma/SQLite); no new dependencies. Mobile layout (390px) must not regress. Existing tests keep passing.
- **Non-goals:** profile photo upload; search history / popular queries; external search service (Elasticsearch, Algolia); admin search; mobile menu redesign; search analytics.
- **Assumptions (my calls):** catalog is small (12 products now; designed for up to a few thousand) so an in-memory index is fine; "adaptive" = live suggestions + typo/script tolerance; the Telegram Mini App gets the same suggestions since it shares the search field.
- **Open questions:** none.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Engine: "anker" finds Anker products; typo "ankr"/"zaryadlovhci" still matches; Cyrillic "анкер" matches Latin "Anker"; prefix "char" matches "charger"; unrelated text returns nothing | auto | `npx vitest run tests/lib/search.test.ts` |
| A2 | Suggest API returns ≤6 products + ≤3 categories, only published/storefront products, empty for q<2, 400-safe for junk | auto | `npx vitest run tests/api/search-suggest.test.ts` |
| A3 | Typing in header search shows suggestions under the field; ↑/↓/Enter opens a product; Esc closes; "See all" opens `/search?q=` | manual (browser) | screenshots at 1366 + 390 |
| A4 | `/search?q=ankr` shows Anker products | manual (browser) | page check |
| A5 | Desktop category row is a single line at 1280, 1366, 1536 in uz, ru, en; hidden categories reachable via "More"; Sale + Blog visible | manual (browser) | JS: row height == one item height + screenshots |
| A6 | Header profile control shows label/avatar per state; dropdown header shows name + phone; account sidebar shows profile card; profile page shows avatar header | manual (browser) | screenshots signed in/out |
| A7 | No regressions | auto | `npx tsc --noEmit`, `npm test`, `npm run build` |

Manual spot checks: 390px mobile header still fits one line; Telegram Mini App search field shows suggestions; keyboard-only use of search and "More" menu.

## 3. Anti-drift
- **Primary objective:** a shopper typing in the search field immediately sees the right products even with typos or the other alphabet; the menu never wraps; the profile entry is obvious.
- **Proxy signals (not success by themselves):** build/tests pass; dropdown renders; menu "looks fine" in English only.
- **Intended scope:** `src/lib/search/`, `src/app/api/search/`, `src/app/[locale]/search/page.tsx`, `src/components/store/{Navbar,SearchBox,CategoryBar}.tsx`, `src/components/tg/TgTopBar.tsx`, `src/components/account/*`, `src/app/[locale]/account/{layout,profile/page}.tsx`, `messages/*.json`, `src/lib/catalog.ts` (searchProducts delegates), new tests.
- **Completion target:** full delivery.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Search engine + API | Typo/script-tolerant ranking, `/api/search/suggest`, `/search` page on new engine | `superpowers:test-driven-development` (owner, agent_direct) | `src/lib/search/`, `src/app/api/search/`, `src/lib/catalog.ts`, `src/app/[locale]/search/page.tsx`, `tests/lib/search*.test.ts`, `tests/api/search-suggest.test.ts`, `tests/lib/catalog.test.ts` | – |
| M2 Profile UI | Labelled header control, dropdown header, sidebar profile card, profile page header | `frontend-developer` guidance (owner, agent_direct) | `src/components/account/{AccountMenu,ProfileCard}.tsx`, `src/components/store/StoreShell.tsx`, `src/app/[locale]/account/{layout,profile/page}.tsx`, `messages/*.json` (`nav`, `account` keys) | – |
| M3 SearchBox UI | Live suggestion dropdown in header + Telegram top bar | `frontend-developer` (owner), `accessibility-auditor` checklist (verifier) | `src/components/store/SearchBox.tsx`, `src/components/store/Navbar.tsx` (search parts), `src/components/tg/TgTopBar.tsx`, `messages/*.json` (`search.suggest`) | M1 (API shape), M2 (messages file) |
| M4 One-line menu | Category row never wraps; overflow → "More ▾" | `frontend-developer` (owner) | `src/components/store/CategoryBar.tsx`, `src/components/store/Navbar.tsx` (category row), `messages/*.json` (`nav.more`) | M3 (Navbar) |
| M5 Verification | Evidence for A1–A7, review | `superpowers:verification-before-completion` (owner), `evidence-collector` approach (verifier), `code-reviewer` (verifier) | plan file only | M1–M4 |

Gaps (no fitting skill): none.

Waves (Navbar.tsx and messages/*.json are shared, so UI modules are serial; executed inline in this session, no worktrees needed):
- Wave 1: M1 ‖ M2 (disjoint scopes; run one after another inline)
- Wave 2: M3
- Wave 3: M4
- Wave 4: M5

**Known behaviour change (approved by the requirement):** with transliteration, `searchProducts('zaryad','uz')` now also returns a product whose ru spec says «зарядка» (ranked after the title match). `tests/lib/catalog.test.ts` "finds by uz title…" is updated to `['z','s']`.

## 5. Tasks

**Spec:** sections 1–3 above. **Tech:** Next 16 App Router, React 19, Tailwind 4, next-intl 4, Prisma 7/SQLite, vitest, lucide-react.

**Global constraints:** no new dependencies; every user-visible string in uz/ru/en; storefront products only (`storefrontWhere()`); q trimmed and capped at 100 chars; min 2 chars for suggestions; ≤6 products, ≤3 categories; 390px header stays on one line.

**Review focus (inputs no task's happy path covers):**
1. Query with only punctuation/emoji (`"!!!"`, `"🔥"`) → empty results, no crash (M1 test).
2. Uzbek apostrophes in either form (`"oʻ"`, `"o'"`, `"o‘"`) match each other (M1 test).
3. Fast typing → stale responses arriving out of order must not overwrite newer results (M3: request id / AbortController).
4. Multi-word query where one word has no match → product excluded (AND semantics) (M1 test).
5. Very long category names in uz/ru + window resize → "More" recomputes; no category lost (M4 browser check).

### M1 — Search engine + API (wave 1)

**Files:** create `src/lib/search/text.ts`, `src/lib/search/rank.ts`, `src/lib/search/service.ts`, `src/app/api/search/suggest/route.ts`, `tests/lib/search.test.ts`, `tests/api/search-suggest.test.ts`; modify `src/lib/catalog.ts` (export `storefrontWhere`, `toCard` already exported; `searchProducts` → re-export from service), `src/app/[locale]/search/page.tsx` (no change needed if it keeps importing `searchProducts`), `tests/lib/catalog.test.ts:131`.

**Interfaces (produces):**
- `text.ts`: `normalize(s: string): string` (lowercase, NFKD + strip combining marks, delete `ʻ ʼ ’ ‘ ' \``, `ё→е`); `toLatin(s: string): string` (Cyrillic→Latin: а a, б b, в v, г g, ғ g, д d, е e, ж j, з z, и i, й y, к k, қ q, л l, м m, н n, о o, п p, р r, с s, т t, у u, ў o, ф f, х x, ҳ h, ц ts, ч ch, ш sh, щ sh, ъ/ь "", ы i, э e, ю yu, я ya); `tokenize(s: string): string[]` = `toLatin(normalize(s))` split on `/[^a-z0-9]+/`, empties removed.
- `rank.ts`: `type Field = 'titleLocal' | 'title' | 'brand' | 'category' | 'spec' | 'sku'`; `WEIGHTS: Record<Field, number> = { titleLocal: 10, title: 8, brand: 7, category: 6, spec: 4, sku: 3 }`; `type SearchDoc = { id: number; tokens: Record<Field, string[]>; skuCompact: string[] }`; `editDistance(a: string, b: string, max: number): number` (optimal string alignment, returns `max+1` when exceeded); `tokenMatch(q: string, t: string): number` → 1 exact, 0.9 if `t.startsWith(q)` and `q.length>=2`, else typo budget `q.length>=8 ? 2 : q.length>=4 ? 1 : 0` compared against `t` and `t.slice(0, q.length)` → `0.7 - 0.1*d`, else 0; `scoreDoc(qTokens: string[], qCompact: string, doc: SearchDoc): number` — each query token takes its best `tokenMatch × WEIGHTS[field]` over all fields; any token scoring 0 → doc score 0 (AND); plus +3 if `qCompact.length>=3` and some `skuCompact` includes it; `rank(q: string, docs: SearchDoc[]): number[]` → doc ids with score>0, sorted desc, ties keep input order.
- `service.ts` (server-only): `buildDoc(row, locale): SearchDoc` (row = product with `variants`, `brand`, `category`); `searchProducts(q: string, locale: Locale, limit?: number): Promise<CardProduct[]>`; `type Suggestions = { products: { slug: string; title: string; image: string | null; priceUzs: number; compareAtUzs: number | null }[]; categories: { slug: string; name: string }[] }`; `suggest(q: string, locale: Locale): Promise<Suggestions>`. Rows cached 15 s in module memory (skip cache when `process.env.VITEST`); `resetSearchCache()` exported.
- API: `GET /api/search/suggest?q=&locale=` → `200 Suggestions` (`Cache-Control: no-store`); invalid locale → falls back to `routing.defaultLocale`; `q.trim().length < 2` → empty lists.

- [x] 1.1 Read `node_modules/next/dist/docs/` route handler guide (App Router `route.ts`, `NextRequest` searchParams). — verify: note in plan. _Read 01-getting-started/15-route-handlers.md: GET handlers reading the request are dynamic; repo convention `export const dynamic = 'force-dynamic'` kept._
- [x] 1.2 Write `tests/lib/search.test.ts` (pure, no DB): `tokenize('Oʻzbek‘ Zaryadlovchi!')` equals `tokenize("O'zbek zaryadlovchi")`; `tokenize('Быстрая зарядка')` → `['bystraya','zaryadka']`; `tokenize('!!! 🔥')` → `[]`; `editDistance('ankr','anker',1)` → 1; `tokenMatch('char','charger')` → 0.9; `tokenMatch('zaryadlovhci','zaryadlovchi')` > 0; `tokenMatch('ab','xy')` → 0; `rank` with docs Anker charger / Baseus cable: `'ankr'`→[anker], `'анкер'`→[anker], `'anker cable'`→[] (AND), `'xyzzy'`→[]. Run → FAIL (module missing). _RED observed: import failed._
- [x] 1.3 Implement `text.ts`, `rank.ts`. Run `npx vitest run tests/lib/search.test.ts` → PASS. _9/9 pass after Ruling: ы→y (plan map said `i`, its own test expected `bystraya`; standard ru translit)._
- [x] 1.4 Write `tests/api/search-suggest.test.ts` (DB, style of `tests/api/track.test.ts` + `mkCat/mkProduct` helpers like `tests/lib/catalog.test.ts`): 8 published products titled "Anker N" + 1 DRAFT "Anker hidden" + category `chargers` named `{en:'Chargers', uz:'Zaryadlovchilar'}`; `GET ?q=ankr&locale=en` → `products.length===6`, no slug of the draft; `?q=zaryad&locale=uz` → `categories[0].slug==='chargers'`; `?q=a` → both lists empty; `?q=<300 x "a">&locale=xx` → 200. Run → FAIL. _RED observed (route missing)._
- [x] 1.5 Implement `service.ts` + route; in `catalog.ts` delete old `searchProducts` body, `export { searchProducts } from './search/service'`, export `storefrontWhere`. Update `tests/lib/catalog.test.ts:131` expectation to `['z','s']`. Run `npx vitest run tests/api/search-suggest.test.ts tests/lib/catalog.test.ts tests/lib/search.test.ts` → PASS. _31/31 pass; `npx tsc --noEmit` clean. Ruling: `storefrontWhere` already exported from `@/lib/visibility`, catalog.ts needed no export; unused `locales` import removed._

### M2 — Profile UI (wave 1)

**Interfaces:** `NavAccount = { name: string; phone: string } | null` (StoreShell passes `customer.phone`); new `ProfileCard({ locale, name, phone, compact? }: …)` server-safe component in `src/components/account/ProfileCard.tsx` — avatar circle (initialOf, `bg-neutral-900`, 48px; 64px when not compact), name (fallback formatted phone), `formatPhone(phone)`, link "Edit profile" → `/account/profile` (hidden when compact). New messages: `account.card.edit` (uz "Profilni tahrirlash", ru "Редактировать профиль", en "Edit profile").

- [x] 2.1 `AccountMenu`: signed out → icon + `t('signIn')` text visible at `lg:` (`hidden lg:inline`), signed in → avatar + first word of name at `lg:` (max-w-24 truncate); dropdown top block: avatar + name + formatted phone (replaces the plain name line). `StoreShell` passes phone. Check other `NavAccount` usages compile. — verify: `npx tsc --noEmit`. _tsc clean; browser 1366 en: signed out shows icon + "Sign in"; signed in shows avatar + "QA"; dropdown header shows name + +998 90 123 45 67._
- [x] 2.2 `ProfileCard` in account layout `<aside>` above `AccountNav` (non-compact on lg, compact under lg); profile page: heading row shows the 64px avatar (same style as ProfileCard) left of the title. Messages added in 3 locales. — verify: `npx tsc --noEmit`; browser screenshot of `/en/account` signed in (A6) at 1366 and 390. _Seen: sidebar card en 1366, profile page avatar header ru 1366, uz 375 card. One repair: at 375 the uz edit label squeezed name/phone → button icon-only below sm (label kept as sr-only + title). Ruling: all new message keys (nav.more, account.card.edit, search.suggest.*) added once here, inserted as text to keep the hand-formatted JSON intact. Ruling: QA test customer #1 temporarily given accountCreatedAt in dev.db for signed-in checks — reverted at M5._

### M3 — SearchBox (wave 2)

**Interfaces:** `SearchBox({ locale, id, autoFocus?, onNavigate? }: { locale: Locale; id: string; autoFocus?: boolean; onNavigate?: () => void })` client component; consumes `GET /api/search/suggest` → `Suggestions` (M1). Messages `search.suggest.{products,categories,seeAll,none,loading}` — en "Products" / "Categories" / "See all results for “{q}”" / "No matches for “{q}”" / "Searching…" (+ uz, ru).

- [x] 3.1 Build `SearchBox`: input (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `autoComplete="off"`), debounce 200 ms, `AbortController` per request (drop stale), listbox panel `absolute top-full mt-2 w-full min-w-80` with sections: categories (chips) → products (40px thumb, title with matched substring in `<mark>`-like bold, `formatUzs` price, struck old price) → "See all" row. States: loading (only if >300 ms), none. Keys: ↓/↑ move over all options, Enter = open active option or `/search?q=`, Esc = close (second Esc clears). Click outside closes; navigation calls `onNavigate`. _Done; highlight reuses `tokenize`/`tokenMatch` client-side so typo matches are bolded too. Ruling: added `align: 'left'|'right'` prop — in the Mini App the field is left of the language switch, so a right-anchored panel wider than the field would overflow the left edge._
- [x] 3.2 Use it in `Navbar` (both desktop 2xl field and the toggled row; toggled row `autoFocus`, `onNavigate` closes it) and `TgTopBar`. Remove the old `searchForm`. — verify: `npx tsc --noEmit`; browser A3: type "ankr" at 1366 → dropdown with Anker items; ↓ Enter opens product; Esc closes; 390px dropdown fits viewport (no horizontal scroll); `/ru` type "анкер" → results. _tsc clean. Browser: 1366 en "ankr" → 3 published Anker products (drafts excluded), bold match, old price struck; ↓↓ Enter → /en/p/a2697-…, row closed; 1536 uz "zaryad" → category "Zaryadlovchi qurilmalar" + products, Esc closes (aria-expanded=false, text kept), 2nd Esc clears; API ru "анкер" → 3 Anker, "chargkey" → ChargeKey, "leathr case" → leather cases; 375 ru "чехол" → panel 16–359px, scrollWidth 375 (no h-scroll). A4: /en/search?q=ankr → "3 products". Not browser-checked: Telegram Mini App (needs Telegram launch) — same component, align=left. Note: "анкер павер" → nothing ("paver" is 2 edits from "power"; AND rule)._

### M4 — One-line category row (wave 3)

**Interfaces:** `CategoryBar({ locale, categories }: { locale: Locale; categories: CategoryNode[] })` client component; message `nav.more` (uz "Yana", ru "Ещё", en "More").

- [x] 4.1 Move desktop category `<nav>` from Navbar into `CategoryBar`. Layout: `flex flex-nowrap overflow-hidden` row; Sale + Blog pinned at the right end; a hidden measuring copy of all items (`invisible absolute`) gives widths; `ResizeObserver` on the row + `document.fonts.ready` recompute `visibleCount` = most categories whose widths + "More" button + pinned items fit. Overflow categories listed in a "More ▾" dropdown (same hover/focus-within pattern as current submenus, children shown indented). Before measuring (SSR) render all items with `overflow-hidden` so no wrap flash. _Done. Repairs found in browser: (1) measuring copy widened the page (scrollWidth 1388 at 1280) → wrapped in a zero-height `overflow-hidden` box, now 1274; (2) Ruling: "More" panel driven by click state + hover (not focus-within) and closes on blur, so Esc can actually close it and return focus to the button._
- [x] 4.2 Verify A5: in browser at 1280, 1366, 1536 for uz/ru/en run `document.querySelector('[data-category-bar]').getBoundingClientRect().height` ≤ 48 and "More" lists the missing categories; Sale + Blog visible; keyboard Tab reaches "More" and its items. _Row height 36px (= one item) at 1280 en (all 7 fit, no More), 1366 uz/ru, 1536 uz/ru (6 + "Yana/Ещё" holding "Chexollar va aksessuarlar/Чехлы и аксессуары"); Sale + Blog always visible; no page h-scroll. Keyboard: focus button → Enter opens → Tab to "Чехлы и аксессуары" (visible) → Esc hides + focus back on "Ещё"; Tab past last item hides it._

### M5 — Verification + review (wave 4)
- [x] 5.1 `npx tsc --noEmit` → 0 errors; `npm test` → all pass; `npm run build` → success. Record counts. _tsc: 0 errors; `npm test`: 50 files, 771/771 passed; `npm run build`: compiled OK, `/api/search/suggest` listed as dynamic; 2 build warnings are pre-existing (`src/lib/uploads.ts` dynamic fs tracing, untouched)._
- [x] 5.2 Browser evidence A3–A6 (screenshots described in Result), mobile 390 header one line, Telegram top bar suggestions via `/tg` route if reachable in dev. _A3–A6 evidence recorded under M2–M4. 390px header: height 64, shop name 28px (one line) in ru/uz/en, scrollWidth 390. Telegram Mini App not opened (needs Telegram launch); it renders the same SearchBox (align=left). Noted, not changed: at 375px the ru shop name wraps to 2 lines (pre-existing; spec target is 390)._
- [x] 5.3 Code review of the diff (code-reviewer agent, fresh context); fix confirmed findings (one repair each), rerun 5.1. _Reviewer (opus, fresh): 0 Critical, 3 Important, 11 Minor. Fixed: (1) suggest API cost/abuse → `src/lib/search/limit.ts` 120 req/min per client (shared 3000) → 429 + Retry-After 60; query capped at 6 distinct words; rows + categories + per-locale token index cached together (15 s) — tests "answers 429 after 120 requests…" and "uses at most 6 distinct query words" RED→GREEN; (2) digits fuzzy-matched ("4060"→"4070", "iphone 15"→15W spec) → digit tokens exact or number-complete prefix only — tests "matches tokens with digits exactly…" and "\"iphone 15\" does not match…" RED→GREEN; (3) Sale/Blog clipped before hydration → moved outside the clipped categories box (Ruling: they now sit at the row's right end, needed so the measured box's width never depends on its content) — verified: SSR HTML Sale not inside `.overflow-hidden`, live row 36px at 1280 uz/en and 1366 ru. Rerun: tsc 0 errors, `npm test` 775/775, build OK (same 2 pre-existing warnings)._

## 6. Verification
- `npx tsc --noEmit` · `npm test` · `npm run build` · browser checks A3–A6

## 7. Rollback
Additive changes; restore listed files via `git checkout -- <file>` if a wave fails. No schema changes.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-18: requirement drafted and approved by user; plan drafted and approved ("Start it"); executed inline on `main`, uncommitted (vibe: no commit unless asked).
- 2026-11-18 (user-approved follow-up): admin `refreshStorefront()` in `src/app/admin/actions.ts`, `actions/products.ts`, `actions/brands.ts` now also calls `resetSearchCache()`; cache toggle `setSearchCacheEnabled` replaces the VITEST bypass in tests. New `tests/api/search-cache.test.ts` (cache is real; unpublish / category rename / brand rename visible at once) RED→GREEN 4/4; full suite 779/779; build OK.

## Result
**Delivered:** search engine `src/lib/search/{text,rank,service,limit}.ts`; `GET /api/search/suggest`; `/search` on the new engine; `SearchBox` (header + Telegram top bar); `CategoryBar` (one-line row + "More"); profile UI (`ProfileCard`/`Avatar`, labelled header control, dropdown header, sidebar card, profile page header); new strings in uz/ru/en.
**Checks run:** `npx tsc --noEmit` 0 errors · `npm test` 50 files 775/775 · `npm run build` OK · browser A3–A6 at 375/390/1280/1366/1536 in uz/ru/en (details under tasks) · fresh code review, 3 Important fixed.
**Gaps:** Telegram Mini App not opened in a real Telegram client (same component). Mid-word matches dropped vs old substring search ("fon" no longer finds "smartfon"; 3-letter words match by prefix only). Phonetic ru spellings of English words ("павер") don't match.
**Deferred minors (from review):** spinner can stick after deleting back below 2 chars on a slow network; "See all" label shows the previous query while the new one loads; loading/none text sits inside `role=listbox` and result count isn't announced; Enter during IME composition navigates; "More" may reopen open after widen→narrow; `aria-haspopup` on "More" without menu semantics; search cache staleness after admin edits — FIXED 2026-11-18 (see Revisions); catalog.ts ↔ search/service.ts circular import (safe today).
**Follow-ups:** optional aria-live result count.

## Handoff
Done. All work uncommitted on `main` (see `git status`). Dev DB: QA customer #1's `accountCreatedAt` was set for signed-in checks and reset to NULL afterwards. Deferred minors listed in Result; nothing blocked.
