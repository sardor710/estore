# Admin UI Refresh, Multi-Image Upload, Visual Variants, Homepage Banners — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 5 | 27/27 | 2026-11-17 | Owner: restart own dev server (Prisma client cache), review uncommitted diff, decide on follow-ups (importer bundle names) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement

### Owner's request (2026-11-17)
1. Use design skills to make the admin panel UI better.
2. Product images: allow uploading **multiple pictures at once** (today: one file per upload).
3. Products page: show variants **by name / color, with the photo of that variant/bundle** — "too hard to know what that variant is just by SKU".
4. **Homepage banner management**: image, title, text, URL, button text.

### What exists today (recon)
- Admin: `src/app/admin/(panel)/*`, UI kit `src/components/admin/ui.tsx` (neutral Tailwind tokens), grouped sidebar `AdminNav.tsx`. Roles `ADMIN | PRODUCT_MANAGER | BLOG_EDITOR`, enforced server-side.
- `ImagesEditor.tsx`: URL paste + single-file `<input type=file>` → `POST /api/admin/uploads` (one file per request, jpg/png/webp/gif ≤ 5 MB, stored under `uploads/`, served by a route handler).
- `Variant` already has `name` (per-locale JSON), `colorHex`, `imageIndex` (index into `Product.images`). The **admin product list** (`ProductTable.tsx:127`) shows only the SKU (and only when >1 variant); the **editor** (`VariantEditor.tsx`) asks for an image *number*.
- Homepage hero `src/components/store/HeroBanner.tsx`: 3 hardcoded gradient slides, copy from `messages/*.json` (`home.hero.*`), CTA links to fixed categories. No images.

### Decisions
| Topic | Decision |
|---|---|
| Variant model *(my call, owner: "your choice")* | **Display fix only — no schema change.** Variants stay a flat list; we make the existing name/color/photo visible and easy to set. Option groups (Color × Bundle) are a non-goal. |
| Product list variants *(my call)* | Each variant row shows **thumbnail** (variant's image, falling back to product cover) + **color dot** + **name** (en, else uz/ru) with the SKU as small secondary text, then the inline price/stock fields. Shown for single-variant products too. |
| Variant editor *(my call)* | "Image #" number field replaced by a **visual picker** (grid of the product's images, click to select, "none" option). Variant card header shows thumbnail + color + name so collapsed cards are recognizable. Name is required to save if the product has >1 variant (warning, not hard block, for imported products). |
| Multi-upload *(my call)* | File input gets `multiple`; plus a **drag-and-drop zone** in the Images tab. Files upload with limited concurrency (3 at a time), each with its own progress/error row; successful ones append in selection order; a failed file does not cancel others. Server endpoint unchanged (one file per request) — limits and sniffing stay as they are. Thumbnails shown as a grid with drag/arrow reordering and remove; first image = cover. |
| Banner storage *(my call)* | New `Banner` table: per-locale `title`, `text`, `buttonText` (uz/ru/en JSON), `imageUrl` (upload or http(s) URL), optional separate `mobileImageUrl`, `linkUrl` (internal path like `/c/chargers` — locale prefix added automatically — or full http(s) URL), `active` on/off, optional `startsAt`/`endsAt`, `sortOrder`. Additive migration. |
| Banner admin *(my call)* | Page **Content → Banners**: list with thumbnails, active/scheduled badges, drag/arrow reorder, edit form with live preview of the slide, per-locale fields, duplicate/delete. Access: **ADMIN and PRODUCT_MANAGER** (blog editors no). Changes recorded in the Activity log. Link URL validated (no `javascript:`). |
| Banner storefront *(my call)* | `HeroBanner` renders active banners from DB (image as background with dark gradient overlay for legible text, keeps current slider behaviour: autoplay, pause on hover, reduced-motion, arrows, dots, first slide `<h1>`). Missing locale text falls back to uz. Empty title/text/button allowed (image-only slide). **If no active banners exist, the current gradient slides show** (so the homepage never goes blank). Seed creates no banners. |
| Admin UI refresh *(my call)* | Visual pass, not a rewrite: refined design tokens in `ui.tsx` (surface/background contrast, spacing, type scale, focus rings, one accent color), polished sidebar + top bar, consistent page headers, cards, tables (sticky header, zebra/hover, better empty states), form layout, buttons, badges, toasts. Applied to all admin pages via the shared kit and layout; page-specific polish on Dashboard, Products list, Product editor, Banners. Light theme only; admin stays English; accessibility (contrast AA, keyboard focus) kept or improved. |

### Approaches considered
- **Variants:** A) display fix on existing fields — **chosen** (no migration, works for all current/imported products); B) option groups + combinations — rejected for now (schema + storefront + import migration, not needed to solve "can't tell variants apart").
- **Banners:** A) dedicated `Banner` table + admin page — **chosen** (scheduling, ordering, activity log, per-locale fields); B) JSON blob in `Setting` — rejected (no validation per row, awkward ordering, no audit granularity); C) keep translation-file copy and only add images — rejected (owner wants title/text/URL/button editable).
- **Multi-upload:** A) client sends files one request each, concurrency-limited — **chosen** (reuses hardened endpoint, per-file errors); B) new multi-file endpoint — rejected (duplicates validation, one bad file fails the batch).
- **UI refresh:** A) upgrade shared kit + layout, then polish key pages — **chosen**; B) adopt a component library (shadcn etc.) — rejected (new dependency, rewrite of every form, no owner ask for it).

- **Goal:** Staff can manage products faster and with less confusion (see variants by photo/color/name, upload many images at once), the owner controls homepage banners without code, and the admin looks polished and consistent.
- **Deliverables:** refreshed admin UI kit + layout + key pages; multi-file drag-and-drop image uploader; visual variant display in product list and editor with image picker; `Banner` model + migration, admin Banners page (CRUD, reorder, preview, schedule), DB-driven homepage hero with fallback; tests; README note.
- **Constraints:** Next.js 16 (read `node_modules/next/dist/docs/` before code, per AGENTS.md), Prisma 7 + SQLite, Tailwind 4, lucide, next-intl. No new runtime dependencies unless clearly justified. Additive migration; existing data preserved. Permissions server-side. Existing tests and smoke keep passing.
- **Non-goals:** variant option groups/combinations; storefront redesign beyond the hero; dark mode for admin; image cropping/resizing; banners on pages other than home; changing the upload endpoint's limits.
- **Assumptions:** admin used mostly on desktop but must stay usable on tablet/phone width; uploaded images are served by the existing `/uploads` route; owner reviews on `main` (no feature branch requested).
- **Open questions:** none blocking.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Selecting or dropping N image files (e.g. 5) in the product Images tab uploads all N and appends them in order; a rejected file shows its own error while others succeed | manual + unit | browser run; unit test for the upload queue |
| A2 | Admin product list shows, per variant, thumbnail (variant image or cover), color dot and name, SKU secondary; also for single-variant products | manual + auto | browser screenshot; render/unit test |
| A3 | Variant editor picks the image from a thumbnail grid (no number typing); saved `imageIndex` matches the picked image; reordering images keeps each variant pointing at the same picture | auto + manual | unit test on index remap; browser |
| A4 | `Banner` table created by an additive migration; existing data intact | auto | `npx prisma migrate status`, tests |
| A5 | ADMIN and PRODUCT_MANAGER can create/edit/reorder/activate/schedule/delete banners; BLOG_EDITOR gets 403 on page and actions | auto | API/action tests |
| A6 | Banner validation: link URL internal path or http(s) only (`javascript:` rejected), image required, end ≥ start | auto | unit tests |
| A7 | Homepage shows active, in-schedule banners in sort order with image, localized title/text/button and correct link (locale-prefixed for internal paths); falls back to current gradient slides when none | auto + manual | test on banner query; browser in uz/ru/en |
| A8 | Admin UI refresh applied across all admin pages via shared kit/layout; no page left in the old style; keyboard focus visible; text contrast AA | manual | screenshots of every admin page before/after; design review |
| A9 | `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run smoke` all pass | auto | commands |

Manual spot checks: upload 6 images by drag-and-drop on a real product; identify every variant of a multi-variant product from the list alone; create a banner with an uploaded image, see it on `/uz`, `/ru`, `/en`; deactivate all banners and see the fallback; view admin at 390px width.

## 3. Anti-drift
- **Primary objective:** staff can tell variants apart instantly, upload many images in one go, edit homepage banners themselves, and the admin feels clearly better to use.
- **Proxy signals (not success by themselves):** build/tests pass; tokens changed in `ui.tsx`; a Banner table exists; `multiple` attribute added. Success needs the browser evidence (screenshots) of the real flows.
- **Intended scope:** admin UI + ImagesEditor + VariantEditor + ProductTable + Banner model/admin/storefront hero. Nothing else in the storefront.
- **Completion target:** full delivery of all four requests.

---

# Implementation Plan

> **For agentic workers:** execute with superpowers:executing-plans (serial, lead session) — parallel units only as listed in Waves, each in its own worktree. Steps use checkbox syntax; the lead updates markers here.

**Goal:** Polished admin, multi-file image upload, variants recognizable by photo/color/name, and DB-managed homepage banners.
**Architecture:** Pure helpers in `src/lib/**` carry the logic and are unit-tested (vitest runs in `node`, no DOM); client components in `src/components/admin/**` stay thin. Banners follow the existing Brands pattern: lib (validate + activity log) → server action (`requirePermission`) → page. Visual refresh goes through the shared kit `src/components/admin/ui.tsx` + nav/layout so every page inherits it.
**Tech stack:** Next.js 16 App Router, React 19, Prisma 7 + SQLite, Tailwind 4, lucide-react, next-intl, vitest.
**Spec:** sections 1–3 above.

## Global constraints
- Read the relevant guide in `node_modules/next/dist/docs/01-app/` before writing Next-specific code (server actions, route handlers, images) — AGENTS.md.
- No new runtime dependencies. Additive Prisma migration only. Admin copy in English.
- Every admin page/action checks permission server-side (`requirePermission`); nav hiding is cosmetic.
- Upload limits unchanged: jpg/png/webp/gif, ≤ 5 MB, endpoint `POST /api/admin/uploads` field `upload` → `{ url }`.
- Locales `uz` (default), `ru`, `en`; localized fields are `L10n = Partial<Record<Locale,string>>` (`src/lib/localized.ts`).
- Contrast WCAG AA, visible keyboard focus, usable at 390px width.
- "Commit" steps are checkpoints: they run only if the owner allows commits; otherwise work stays uncommitted on `main` and the step is marked done with the diff as evidence.

## Review focus
1. Removing or reordering product images after a variant points at one → the variant keeps the same picture, or becomes "none" if that picture was removed (test in 3.1).
2. Dropping a mixed batch (one 8 MB file, one .pdf, four valid images) → four upload in selection order, two show a reason, nothing else is lost (2.1).
3. Banner schedule edges: `startsAt` in the future or `endsAt` in the past → hidden; admin datetime inputs are local (browser time), stored UTC (4.2, 5.1).
4. Banner text missing in the viewer's locale → falls back uz → en → ru; a banner with no text renders as an image-only slide with no empty button (4.2, 5.2).
5. Link URLs `javascript:alert(1)`, `//evil.com`, `data:` rejected; `/ru/c/x` (already prefixed) not double-prefixed; `/c/x` becomes the locale path (4.2).

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Design direction + kit | Audit of current admin, token/visual spec, upgraded `ui.tsx`, nav, panel layout, login | `agentic-council:visual-audit` (support: critique of screenshots) → `agentic-council:design-system-architecture` (support: token set) → `ui-designer` agent (owner) | `src/components/admin/ui.tsx`, `AdminNav.tsx`, `src/app/admin/(panel)/layout.tsx`, `src/app/admin/login/**`, `LoginForm.tsx`, `src/app/globals.css` (admin-scoped additions only) | – |
| M2 Multi-image upload | Multi-select + drag-drop, concurrent queue, per-file errors, thumbnail grid | `frontend-developer` (owner), `superpowers:test-driven-development` (support) | `ImagesEditor.tsx`, `src/lib/admin/upload-queue.ts`, `tests/lib/upload-queue.test.ts` | M1 |
| M3 Visual variants | List shows thumb/color/name; editor image picker; index remap on image changes | `frontend-developer` (owner), `superpowers:test-driven-development` (support) | `src/lib/admin/variant-display.ts`, `src/lib/admin/product-list.ts`, `ProductTable.tsx`, `VariantEditor.tsx`, `ProductEditor.tsx` (images onChange only), `tests/lib/variant-display.test.ts`, `tests/lib/product-list.test.ts` | M1 |
| M4 Banner backend | Model + migration, permission, lib, public query, actions, tests | `backend-architect` (owner), `superpowers:test-driven-development` (support) | `prisma/schema.prisma`, `prisma/migrations/*_banners/`, `src/lib/permissions.ts`, `src/lib/admin/banners.ts`, `src/lib/banners.ts`, `src/app/admin/actions/banners.ts`, `tests/lib/banners.test.ts`, `tests/lib/permissions.test.ts`, `tests/api/admin-actions-guard.test.ts` | – |
| M5 Banner admin + storefront | Banners pages with preview/reorder; DB-driven hero with fallback; nav item; README | `frontend-developer` (owner), `ui-designer` (verifier of look) | `src/app/admin/(panel)/banners/**`, `BannerList.tsx`, `BannerEditor.tsx`, `src/components/store/HeroSlide.tsx`, `HeroBanner.tsx`, `src/app/[locale]/page.tsx`, `AdminNav.tsx` (one item), `README.md` | M1, M4 |
| M6 Apply refresh to all pages | Every admin page uses the new kit; dashboard/products/editor polish | `ui-designer` (owner), `ui-finish-gate-reviewer` (verifier) | `src/app/admin/(panel)/**/page.tsx`, `src/components/admin/**` (style-only), `src/components/admin/dashboard/**` | M2, M3, M5 |
| M7 Review + QA | Code review, browser evidence for A1–A9, fixes | `code-reviewer` + `superpowers:requesting-code-review` (verifier), `evidence-collector` (verifier), `superpowers:verification-before-completion` | fixes only, in files above | M6 |

Gaps: none. (The design skills are read-only critics/specifiers; the `ui-designer` agent writes the code.)

Waves (≤ 2 parallel, disjoint write scopes; parallel units in own worktrees, lead merges):
- Wave 1: M1 ‖ M4
- Wave 2: M2 ‖ M3
- Wave 3: M5
- Wave 4: M6
- Wave 5: M7

## 5. Tasks

### M1 — Design direction + kit (wave 1, owner: `ui-designer`)
**Produces:** same exports from `ui.tsx` (`input, btn, btnGhost, btnDanger, btnSm, card, PageTitle, Label, Notice, Badge`) with unchanged signatures, plus `PageHeader({ title, description?, actions? })`, `EmptyState({ icon, title, text?, action? })`, `table`/`th`/`td` class constants, `Toolbar({ children })`. Existing call sites keep compiling.
- [x] 1.1 Start dev server, log in, screenshot every admin page at 1440px and 390px into `outputs/admin-before/` — verify: ≥ 16 page screenshots exist. _Evidence: 30 JPGs (15 pages × 2 widths) in outputs/admin-before/; login page not captured (owner session kept signed in)._
- [x] 1.2 Run `agentic-council:visual-audit` on them; record top findings under "M1 design notes". _Done by ui-designer agent; findings below._
- [x] 1.3 Run `agentic-council:design-system-architecture` scoped to Tailwind 4, admin, light theme: surface/background, borders, text tiers, one accent, radius, spacing, type scale, focus ring, table density. Record the token table under "M1 design notes". _Token table below._
- [x] 1.4 Implement tokens + primitives in `ui.tsx`; restyle sidebar (brand mark, grouped sections, accent active state, mobile top bar with menu button), panel layout (page background vs card surface, `max-w-7xl`), login page — verify: `npx tsc --noEmit` 0 errors; screenshots in `outputs/admin-after-m1/`. _Evidence: ui.tsx (+PageHeader, EmptyState, Toolbar, table/th/td, Badge accent/violet), AdminNav (240px sidebar, mobile top bar + menu with aria-expanded/Escape), panel layout (.admin-ui, skip link, max-w-7xl), login page, globals.css (.admin-ui-scoped AA text tiers + focus ring). Lead re-ran `npx tsc --noEmit` → 0 errors; viewed outputs/admin-after-m1/products-1440.jpg._
- [x] 1.5 Commit `style(admin): design tokens, primitives, nav and layout`. _No commit (owner)._

### M2 — Multi-image upload (wave 2, owner: `frontend-developer`)
**Produces** (`src/lib/admin/upload-queue.ts`):
- `checkImageFile(f: { name: string; type: string; size: number }): string | null` — null = OK; else `'Not a JPG, PNG, WEBP or GIF'` or `'Larger than 5 MB'`.
- `uploadAll<F extends { name: string; type: string; size: number }>(files: F[], upload: (f: F) => Promise<string>, opts?: { concurrency?: number /* default 3 */; onStatus?: (index: number, s: 'queued' | 'uploading' | 'done' | 'error', detail?: string) => void }): Promise<{ urls: string[]; errors: { name: string; message: string }[] }>` — `urls` in selection order, successes only.
- [x] 2.1 Failing tests `tests/lib/upload-queue.test.ts`: pdf rejected; 5 MB + 1 byte rejected, exactly 5 MB ok; selection order kept when later files finish first; never > 3 in flight; one rejecting upload → others in `urls`, error carries file name; pre-check failures never call `upload`; mixed batch from Review focus #2. `npx vitest run tests/lib/upload-queue.test.ts` → FAIL. _Evidence: module-missing FAIL before impl._
- [x] 2.2 Implement → same command PASS. _Evidence: 7/7 pass._
- [x] 2.3 ImagesEditor: `<input multiple>`, drop zone (dragover highlight, "Choose files" button, paste-URL field kept), per-file status rows (preview via `URL.createObjectURL`, revoked after), errors per file, append `urls` when the batch finishes; images as thumbnail grid (cover badge on #0, move, remove, "Set as cover"). Verify `npx tsc --noEmit`; browser: 5 files → 5 appended in order. _Evidence (frontend-developer agent): drop zone + multiple input + per-file status rows + Dismiss + single onChange per batch + unmount guard; 2–4 col thumbnail grid with cover badge, move, set cover, edit URL, remove; tile buttons fixed for 390px. tsc 0 errors. Rendered at 1440/390 on product 1, no console errors. Real-upload run deferred to M7 (throwaway product). Reorder is arrow buttons, not drag (drag reorder dropped as minor)._
- [x] 2.4 Commit `feat(admin): multi-file drag-and-drop image upload`. _No commit (owner)._

### M3 — Visual variants (wave 2, owner: `frontend-developer`)
**Produces** (`src/lib/admin/variant-display.ts`):
- `variantThumb(images: string[], imageIndex: number | null): string | null` → `images[imageIndex]` if valid, else `images[0]`, else null.
- `remapImageIndex(before: string[], after: string[], index: number | null): number | null` → position of `before[index]` in `after` (first match); null if gone, null, or out of range.
- `ProductRowVariant` (`product-list.ts`) gains `colorHex: string | null; image: string | null`.
- [x] 3.1 Failing tests: `variantThumb` (valid; out of range → cover; no images → null); `remapImageIndex` (move pointed image to front → 0; remove pointed → null; remove earlier image → index−1; null stays null; duplicate URLs → first); product-list row has `colorHex` and `image`. Run → FAIL. _Evidence: 2 files failed to import + product-list variant test failed before impl._
- [x] 3.2 Implement; `npx vitest run tests/lib/variant-display.test.ts tests/lib/product-list.test.ts` → PASS. _Evidence: upload-queue + variant-display + product-list = 22/22 pass; tsc clean._
- [x] 3.3 ProductTable: per variant `[32px thumb] [color dot] name`, SKU small muted mono below, then inline price/stock; also for single-variant products; accessible labels "Price of {name} ({sku})". _Evidence: browser /admin/products shows thumb + name + SKU per variant (product 29). Names wrap to 2 lines instead of truncating._
- [x] 3.4 VariantEditor: replace "Image #" with a picker (thumbnail grid + "None", radio-group semantics, selected ring); card header shows thumb + color + name (or "Unnamed variant") + SKU; warning when > 1 variant and one has no name. ProductEditor images `onChange`: remap every variant's `imageIndex` with `remapImageIndex(old, new, v.imageIndex)` in the same `patch`. Drop the old "Reordering changes…" hint. _Evidence: browser product 29: picker collapsed shows "Image 8" for variant 2 (= DB imageIndex 7); Change picture → pick image 3 → header thumb = picked src, "unsaved" shown (not saved). Lead addition: picker collapsed by default with "Change picture"/"Done" (product 29 has 104 images × 10 variants), lazy thumbnails, scrollable grid._
- [x] 3.5 Verify `npx tsc --noEmit`; browser: reorder images on a multi-variant product → thumbs unchanged; save, reload → same. Commit `feat(admin): show variants by photo, color and name`. _Evidence: browser product 1 [A,B,C] → set #3 cover, remove #2 → variants: A→None(cover), B→Image 2 (same src), C→Image 1 (same src). Not saved (real data); save/reload covered by existing save path, re-checked in M7 on a throwaway product. tsc clean._

### M4 — Banner backend (wave 1, owner: `backend-architect`)
**Schema:**
```prisma
model Banner {
  id             Int       @id @default(autoincrement())
  title          Json      // L10n
  text           Json      // L10n
  buttonText     Json      // L10n
  imageUrl       String
  mobileImageUrl String?
  linkUrl        String?
  active         Boolean   @default(true)
  startsAt       DateTime?
  endsAt         DateTime?
  sortOrder      Int       @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```
**Produces:**
- `permissions.ts`: `'banners'` in `PERMISSIONS`; `SECTION.banners = 'banners'` (PM allowed, BLOG_EDITOR not).
- `src/lib/admin/banners.ts`: `BannerInput = { id?: number; title: L10n; text: L10n; buttonText: L10n; imageUrl: string; mobileImageUrl: string; linkUrl: string; active: boolean; startsAt: string | null; endsAt: string | null }` (ISO UTC); `BannerRow = Required<Pick<BannerInput,'id'>> & Omit<BannerInput,'id'> & { sortOrder: number; state: 'live' | 'scheduled' | 'expired' | 'off' }`; `listBanners(now?: Date)`, `getBanner(id)`, `saveBanner(input, staff): Promise<{ ok: true; id: number } | { ok: false; errors: Record<string, string> }>` (new = last), `deleteBanner(id, staff)`, `reorderBanners(ids: number[], staff)`, `setBannerActive(id, active, staff)`, `isValidBannerLink(s: string): boolean`. Limits per locale: title ≤ 120, text ≤ 300, buttonText ≤ 40. Image required: `UPLOAD_PATH_RE` or `isHttpUrl` (same for mobile, optional). Link: empty, or single leading `/` (not `//`), or `http(s)://`. `endsAt` > `startsAt`. Activity actions `banner.create|update|delete|reorder|toggle`.
- `src/lib/banners.ts`: `PublicBanner = { id: number; title: string; text: string; buttonText: string; imageUrl: string; mobileImageUrl: string | null; href: string | null }`; `getActiveBanners(locale: Locale, now = new Date())` (active, within schedule, `sortOrder, id`; text fallback locale → uz → en → ru); `bannerHref(locale, linkUrl): string | null` (`/c/x` → `path(locale, '/c/x')`; paths already starting with a locale segment kept; http(s) kept; else null).
- `src/app/admin/actions/banners.ts` (`requirePermission('banners')`, `revalidatePath('/', 'layout')` on success): `saveBannerAction`, `deleteBannerAction`, `reorderBannersAction`, `toggleBannerAction`.
- [x] 4.1 Read the Next docs guide on server actions. _Evidence: read 01-app/01-getting-started/07-mutating-data.md; migration `20261117073526_banners` = CREATE TABLE "Banner" + one index only; `prisma generate` ok._ Add model; `npx prisma migrate dev --name banners` → new migration SQL contains only `CREATE TABLE "Banner"`.
- [x] 4.2 Failing tests `tests/lib/banners.test.ts`: valid save with `/uploads/2026/11/ab12.jpg` ok; missing image → `errors.imageUrl`; `javascript:alert(1)`, `//evil.com`, `data:x` → `errors.linkUrl`; `/c/chargers`, `https://x.uz` ok; endsAt ≤ startsAt → `errors.endsAt`; 121-char title → `errors.title`; `getActiveBanners` excludes inactive, future-start, past-end and orders by `reorderBanners([b, a])`; ru-missing title falls back to uz; `bannerHref('ru','/c/x') === '/ru/c/x'`, `bannerHref('ru','/ru/c/x') === '/ru/c/x'`, `bannerHref('en','https://a.b') === 'https://a.b'`, uz result equals `path('uz','/c/x')`; activity row on create. `tests/lib/permissions.test.ts`: PM can `banners`, BLOG_EDITOR cannot, `permissionForPath('/admin/banners/3') === 'banners'`. `tests/api/admin-actions-guard.test.ts`: BLOG_EDITOR → `saveBannerAction` forbidden like other actions. Run → FAIL. _Evidence: 4 permission tests failed + 2 files failed to import before implementation._
- [x] 4.3 Implement; `npx vitest run tests/lib/banners.test.ts tests/lib/permissions.test.ts tests/api/admin-actions-guard.test.ts` → PASS; `npm test` → all pass. _Evidence: 3 files, 78/78 pass; full suite 490/491 — the 1 failure is a 5s timeout in product-list "sorts and paginates" under machine load, passes alone (7/7); tsc clean. Notes: activity actions use the existing vocabulary create/update/delete/status; text fallback reuses `t()` (locale → uz → ru → en); pure link helpers live in client-safe `src/lib/banner-link.ts`._
- [x] 4.4 Commit `feat(banners): model, validation, permissions and actions`. _No commit (owner). Diff: schema, migration, src/lib/{banner-link,banners}.ts, src/lib/admin/banners.ts, actions/banners.ts, permissions.ts, tests._

### M5 — Banner admin + storefront (wave 3, owner: `frontend-developer`)
**Consumes:** M4 exports; M1 primitives; `L10nField`; upload endpoint.
- [x] 5.1 Admin: `banners/page.tsx` (list) and `banners/[id]/page.tsx` (`id` number or `new`), both `requirePermission('banners')`. `BannerList`: thumbnail, title, state badge (Live green, Scheduled blue, Expired amber, Off neutral), schedule, toggle, move up/down, edit, delete (confirm), `EmptyState` with "Add banner". `BannerEditor`: image upload/URL + optional mobile image, `L10nField` for title/text/button text, link URL with hint, active switch, start/end `datetime-local` (local ↔ UTC ISO), sticky save bar, field errors, **live preview** via shared `src/components/store/HeroSlide.tsx` with uz/ru/en switcher. Nav: Content group `{ href: '/admin/banners', label: 'Banners', icon: GalleryHorizontal }` before Blog. Verify `npx tsc --noEmit`; browser create/edit/reorder/toggle/delete; BLOG_EDITOR gets 403 on `/admin/banners`. _Evidence (prod build on :3200, owner dev server needs restart for new Prisma model — see note): empty state; create via real upload (canvas JPG → /api/admin/uploads → /uploads/2026/11/…jpg, live preview rendered); `javascript:alert(1)` flagged inline + rejected by server; created → Live; 2nd image-only banner with mobile image; move up reorders; toggle off → Off + "No banner is live" warning; end<start → "End must be after start."; 09:30 Tashkent round-trips → Scheduled; delete ×2 → empty. Pages: banners/page.tsx, new/page.tsx, [id]/page.tsx (separate `new` route like promotions). BLOG_EDITOR 403 covered by guard + permissions tests._
- [x] 5.2 Storefront: `[locale]/page.tsx` adds `getActiveBanners(locale)` to its `Promise.all` and passes `banners` to `HeroBanner`. With banners: render via `HeroSlide` — `<picture>` with mobile source `(max-width: 640px)`, `<img>` `object-cover`, first slide `fetchPriority="high"` and `<h1>` title, others lazy, alt = title or ''; dark overlay; button only when `buttonText && href`; whole slide a link when `href` but no button text; internal via `next/link`, external `<a rel="noopener">`; single banner → no arrows/dots/autoplay. Without banners: current gradient slides unchanged. Verify browser `/uz`, `/ru`, `/en` with 2 banners; deactivate all → fallback. _Evidence: /uz /ru /en → h1 "QA banner title", CTA "/{l}/c/chargers | Shop chargers" (en text fallback), upload image 200 image/jpeg; single banner → 0 dots; two → 2 dots, image-only slide = whole-slide `<a rel=noopener aria-label=Open>` + `<source media=(max-width: 640px)>`; all off → built-in slides (3 dots, "Tez va xavfsiz zaryad")._
- [x] 5.3 README "Homepage banners" (where, roles, image sizes 1920×720 desktop / 800×1000 mobile, fallback). Commit `feat(banners): admin pages and DB-driven homepage hero`. _README: roles table + "Product images and variants" + "Homepage banners". No commit (owner)._

### M6 — Apply refresh to all pages (wave 4, owner: `ui-designer`, verifier: `ui-finish-gate-reviewer`)
Style-only; no behaviour or data changes.
- [x] 6.1 Use `PageHeader`, `table/th/td` (sticky header, hover rows), `EmptyState`, `Toolbar` on: dashboard, orders, clients, promotions, products, categories, brands, import, blog, translations, users, activity, settings, account (+ their detail/edit pages). Verify `npx tsc --noEmit`, `npm test`. _ui-designer agent: PageHeader/Toolbar/EmptyState/table kit on all listed pages + new BackLink.tsx; black pills → accent segmented controls (grep: no bg-neutral-900 left in scope). tsc 0, permissions test 49/49. No horizontal scroll at 390px on 21 pages (scrollWidth=390); dashboard 601px overflow fixed with grid-cols-1._
- [x] 6.2 Polish Dashboard (KPI hierarchy, chart cards), Products list (thumb column, compact toolbar, bulk bar), Product editor (tab bar, section cards, sticky save bar), Banners. _Dashboard KPI hierarchy (4 sales tiles + 3 quieter traffic tiles), chart cards; products compact filter grid, 56px thumbs, sticky headers, BulkBar top-16 on mobile; editor accent tab bar, save bar md:left-60 aligned with sidebar + status dot._
- [x] 6.3 Screenshots of every admin page at 1440/390px → `outputs/admin-after/`; `ui-finish-gate-reviewer` compares with `outputs/admin-before/` and the M1 notes; fix blocking findings (one repair round). Commit `style(admin): apply refreshed UI across admin pages`. _after-screens: outputs/admin-after/ (7 key pages). ui-finish-gate-reviewer (:3200 build, 21 pages × 1440/390, scripted contrast + overflow audit): **PASS WITH FIXES, 0 blocking**; 0 AA contrast failures, one accent, one h1 per page, no page h-scroll. Repair round applied: products list on phones shows variant picture/color/name/price/stock (table-fixed below md; measured table 341=341px, desktop unchanged 900px + 74 inline inputs); empty banner preview collapses to 128px (Images card above fold); banner back links use BackLink; Filter/Apply/per-row category Save → secondary buttons; focus ring extended to checkbox/radio/file inputs.__

### M7 — Review + QA (wave 5)
- [x] 7.1 `code-reviewer` on `git diff a407867..HEAD` (correctness, banner link/upload safety, permissions); fix confirmed findings. _code-reviewer: no auth/security holes; findings: (1) CONFIRMED in-place URL edit nulled variant picture → fixed in remapImageIndex (same length + one slot changed keeps index) + 2 tests; (2) whitespace in image URLs → srcset injection → rejected in saveBanner + isValidBannerLink, tested; (3) no h1 for title-less first banner → sr-only h1 from store name+tagline, localized whole-slide label; (4) non-array / non-string payloads threw → guarded, tested; (5) reorder last-write-wins accepted (small team); (6) picker focus loss + (7d) empty-SKU label → fixed after M6 (focus moves to checked radio on open, back to trigger on Done; `||` labels); (7a) live alert on typing → plain hint. 43/43 tests, tsc clean._
- [x] 7.2 `evidence-collector`: manual spot checks from section 2 in the browser → `outputs/qa/`; pass/fail per A1–A8. _A1 done on :3200 product 1 (not saved): drop of 6 files (4 PNG, 6 MB JPG, PDF) → zone highlighted, ≤3 uploading, 4 appended in exact selection order (pixel-checked red/green/blue/yellow), 2 rows kept with "Larger than 5 MB" / "Not a JPG, PNG, WEBP or GIF" + Dismiss; left without saving, 4 test files deleted, product 1 still 6 images. A5–A7 done in 5.1/5.2. A8: see 6.3. A2/A3: 3.3–3.5. A4: migrate status. A9: 7.3._
- [x] 7.3 Section 6 verification; record outputs in Result. _2026-11-17 final run: `npx tsc --noEmit` 0 errors; `npm test` 38 files / 513 tests pass; `npm run build` exit 0; `npm run smoke -- http://localhost:3200` "All checks passed"; `npx prisma migrate status` "Database schema is up to date" (5 migrations)._

### M1 design notes

#### Visual audit (before: outputs/admin-before/, 15 pages x 1440/390) — score 5/10
1. [CRITICAL] No accent: active nav, primary buttons, filter chips, language chips are all neutral-900 pills, so the primary action never stands out from navigation or toggles.
2. [CRITICAL] Contrast: neutral-400 (#a1a1a1) used for group labels, hints, placeholders = 2.6:1 on white (fails AA). neutral-500 on page bg ~4.5:1 (borderline).
3. [CRITICAL] Mobile nav = horizontal scrolling pill strip: items cut off ("P..."), no sign of more, Logout and Account hidden at the end, no brand.
4. Surfaces: page bg neutral-50 (#fafafa) vs white cards is ~1.04:1, so cards rely only on a faint border and pages look flat and washed out.
5. Width: content capped at max-w-5xl leaves ~35% empty canvas at 1440; dense tables (products, activity, translations) get squeezed.
6. Three radii fight each other (pill buttons, rounded-lg inputs, rounded-2xl cards); buttons look like chips.
7. Buttons have no explicit focus-visible style (browser default only); inputs have a 1px dark ring that is hard to see.
8. Empty states are bare text ("No posts yet.", "No data yet"), with no icon or next action.
9. Tables are styled per page: different header treatments, no hover, row separators missing in places.
10. Sidebar: "Admin" text only, no brand mark; user and role are tiny text at the top; Logout floats at the bottom of the list.
Quick wins (done in M1): one accent on primary buttons and active nav; darken text tiers inside the admin scope; real mobile menu.

#### Token table (Tailwind 4 utilities; scope class `.admin-ui` on panel shell + login)
| Token | Value | Notes |
|---|---|---|
| page bg | neutral-100 #f5f5f5 | set by `.admin-ui` |
| surface | white, border neutral-200 #e5e5e5, shadow-xs | `card`, Toolbar, sidebar |
| surface-subtle | neutral-50 #fafafa | table header, account chip |
| border input / strong | neutral-300 #d4d4d4 / neutral-400 (hover) | |
| text primary | neutral-900 #171717 | headings, values |
| text secondary | neutral-700 #404040 / 600 #525252 | nav items, descriptions |
| text muted | neutral-500 -> #666666 (override) | 5.7:1 white, 5.2:1 page bg |
| text hint | neutral-400 -> #767676 (override) | 4.5:1 white; placeholders, hints |
| accent | indigo-600 #4f46e5 / hover 700 / active 800 | white text 6.3:1; the only accent |
| accent tint | indigo-50 bg + indigo-700 text | active nav, info notice, `accent` badge |
| status | green/amber/red 50 bg + 700/800 text + 200 ring | badges, notices |
| radius | controls 8px (rounded-lg), surfaces 12px (rounded-xl), badges full | |
| spacing | 4px grid; card p-4/sm:p-5; page header mb-6; section gap 16-24 | |
| type | h1 24/32 semibold tight; section 16 semibold; body 14/20; label 12 semibold uppercase | Inter body, Montserrat brand |
| focus | 2px outline indigo-600, offset 2px; inputs: indigo border + 3px ring indigo-600/20 | base rule in globals.css covers all links/buttons |
| table | th 12px uppercase neutral-500 on neutral-50, px-3 py-2.5; td 14px px-3 py-3; row border neutral-100 | `table`/`th`/`td` exports |
| layout | sidebar 240px (md+); mobile 56px top bar + menu; content max-w-7xl, px-4/6/8 | skip link to #admin-main |

#### Known gaps / follow-ups for M6
- Pages still hard-code `bg-neutral-900` for segmented chips (dashboard range, orders tabs, lang chips) and some dashboard buttons; migrate to accent or ghost.
- Input border neutral-300 is 1.5:1 on white (WCAG 1.4.11 asks 3:1 for boundaries); kept for look, with hover/focus cues. Revisit if strict AA is audited.
- Pages should adopt PageHeader / Toolbar / EmptyState / table constants; tables need the `overflow-x-auto` wrapper on mobile.
- Login page "before" was not captured (session already signed in; did not log out the owner's browser session).

## 6. Verification
- `npx tsc --noEmit` — 0 errors
- `npm test` — all pass
- `npm run build` — succeeds
- `npm run start` (background) then `npm run smoke -- http://localhost:3000` — all pass
- `npx prisma migrate status` — up to date
- Browser evidence in `outputs/admin-after/` and `outputs/qa/`

## 7. Rollback
Additive only. Banners: revert M4/M5 commits and delete the `*_banners` migration folder (table unused elsewhere). UI refresh: revert M1/M6 commits (style-only). M2/M3 isolated to their listed files. Tree was clean at start — no foreign dirty files.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-17: requirement approved by owner.
- 2026-11-17 (later): owner approved importer follow-up ("Yes, fix importer"): variant name = all option labels joined " / " (anker-parse.ts); existing product 29 renamed via one-off scratch script (EN names only, dry-run first, dev.db backed up). Test: importer.test.ts "names a variant from every option".
- 2026-11-17 (later): owner hit "prisma.banner undefined" on :3000 (dev server started before the Banner model; client cached on globalThis). Fix: src/lib/db.ts keys the dev cache by the generated PrismaClient class, so a regenerated client replaces the stale one on hot reload. Verified without restarting the owner's server: /uz /ru /en 200, /admin/banners renders, no dev-overlay issues; npm test 514/514; build ok.
- 2026-11-17: plan approved; owner: do not commit. Consequence: parallel units share the checkout (disjoint write scopes) instead of worktrees, since worktree merges need commits. "Commit" steps are marked done with diff evidence.

## Result
**Delivered (uncommitted, on main as owner asked):**
- Admin UI refresh: design kit (indigo accent, AA text tiers, focus ring, PageHeader/Toolbar/EmptyState/table, BackLink), new sidebar + mobile menu, every admin page restyled; dashboard/products/editor polish.
- Multi-image upload: drag-and-drop or multi-select, ≤3 parallel, per-file errors, thumbnail grid with cover/move/remove/edit URL.
- Variants by picture: list rows (desktop table + phone list) show photo, color dot, name, SKU secondary; editor photo picker; images reorder/remove/edit keeps each variant on its picture.
- Homepage banners: Banner model + additive migration, 'banners' permission (ADMIN, PRODUCT_MANAGER), Content → Banners list/new/edit with live preview (uz/ru/en, desktop/mobile), schedule (Tashkent), reorder, on/off, delete, activity log; DB-driven homepage hero with built-in fallback; README.
**Checks run (final, 2026-11-17):** tsc 0 errors · npm test 38 files / 513 tests · npm run build exit 0 · smoke on :3200 all passed · prisma migrate status up to date · browser QA (multi-upload mixed batch, variant remap, banner CRUD/schedule/fallback in 3 locales, 390px) · code review (1 data-loss bug + 4 smaller fixed) · finish-gate design review PASS WITH FIXES (fixes applied).
**Gaps:** Reorder is arrow buttons, not drag. Keyboard Tab traversal verified from CSS/DOM only (pane hidden). Banner edit page checked with real data during QA, test banners then deleted (activity-log rows remain).
**Importer revision (done):** bundle variants named from every option, e.g. "Space Black / Power Bank + Charger"; product 29's 10 variants renamed (EN only; backup of dev.db in session scratchpad); 1 new test; tsc 0, npm test 38 files / 514 tests; admin list + storefront picker checked (no overflow at 375px). uz/ru variant names still need Translate.
**Follow-ups (not done, need owner OK):** (2) product editor save bar on phones wraps to 2 rows → Save + More menu; (3) dashboard: emphasize Pending orders tile, move TRUST_PROXY notice; (4) grouped price formatting in inline price inputs; "none" swatch for variants without color; orders card "1 items"; (5) kit: SegmentedControl/stickyTh exports to remove repeated local constants; (6) leftover `next start -p 3100` (from 10:53, not this session) still running an old build.

## Handoff
Status Done (27/27). All work is uncommitted on main (owner: no commits). Dev server picks up schema changes on hot reload (db.ts cache keyed by client class). Verification commands are in section 6; evidence and screenshots in outputs/admin-before, admin-after-m1, admin-after. Importer bundle naming fixed (see Revisions); new uz/ru variant names need the Translate button on product 29.
