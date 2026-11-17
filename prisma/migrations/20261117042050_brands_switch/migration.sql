-- Brands switch: Product.brand (free text) -> Brand rows + Product.brandId, then drop Product.brand.

-- 1) One Brand per distinct trimmed name, case-insensitively (" Anker " and "anker" collapse). Names already in
--    Brand (any case) are reused. The first spelling in sort order becomes the display name.
INSERT INTO "Brand" ("name", "slug", "sortOrder")
SELECT MIN(trim("brand")), '__tmp_' || lower(trim("brand")), 0
FROM "Product"
WHERE trim("brand") <> ''
  AND lower(trim("brand")) NOT IN (SELECT lower("name") FROM "Brand")
GROUP BY lower(trim("brand"));

-- 2) Slugify the new rows (the app's slugify rules for ASCII names). Only the lowest id per slug takes the plain
--    slug, and only when no other brand already has it.
UPDATE "Brand" SET "slug" = trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-')
WHERE substr("slug", 1, 6) = '__tmp_'
  AND trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-') <> ''
  AND NOT EXISTS (SELECT 1 FROM "Brand" AS b2 WHERE b2."slug" = trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("Brand"."name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-'))
  AND "id" = (SELECT MIN(b3."id") FROM "Brand" AS b3 WHERE substr(b3."slug", 1, 6) = '__tmp_' AND trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(b3."name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-') = trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("Brand"."name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-'));

-- 3) Anything left (empty or clashing slug): append the id, which keeps the slug unique.
UPDATE "Brand" SET "slug" = CASE WHEN trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-') = '' THEN 'brand' ELSE trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim("name")), '&', '-and-'), ' ', '-'), '.', '-'), ',', '-'), '/', '-'), '_', '-'), '''', '-'), '+', '-'), '(', '-'), ')', '-'), '!', '-'), ':', '-'), '"', '-'), '#', '-'), '*', '-'), '?', '-'), '|', '-'), '@', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-') END || '-' || "id"
WHERE substr("slug", 1, 6) = '__tmp_';

-- 4) Point every product with a brand name at its Brand row.
UPDATE "Product" SET "brandId" = (SELECT b."id" FROM "Brand" AS b WHERE lower(b."name") = lower(trim("Product"."brand")))
WHERE trim("brand") <> '' AND "brandId" IS NULL;

-- 5) Drop the legacy column (Prisma's table redefine; every row is copied).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "templateOverride" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "brandId" INTEGER,
    "seoTitle" JSONB,
    "seoDescription" JSONB,
    "sourceUrl" TEXT,
    "sourcePriceUsd" REAL,
    "title" JSONB NOT NULL,
    "subtitle" JSONB NOT NULL,
    "shortSpec" JSONB NOT NULL,
    "descriptionHtml" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "highlights" JSONB NOT NULL,
    "inTheBox" JSONB NOT NULL,
    "faq" JSONB NOT NULL,
    "specs" JSONB NOT NULL,
    "images" JSONB NOT NULL,
    "badge" TEXT,
    "reviewed" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("badge", "brandId", "categoryId", "createdAt", "descriptionHtml", "faq", "highlights", "id", "images", "inTheBox", "isDemo", "reviewed", "sections", "seoDescription", "seoTitle", "shortSpec", "slug", "sourcePriceUsd", "sourceUrl", "specs", "status", "subtitle", "templateOverride", "title", "updatedAt") SELECT "badge", "brandId", "categoryId", "createdAt", "descriptionHtml", "faq", "highlights", "id", "images", "inTheBox", "isDemo", "reviewed", "sections", "seoDescription", "seoTitle", "shortSpec", "slug", "sourcePriceUsd", "sourceUrl", "specs", "status", "subtitle", "templateOverride", "title", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_sourceUrl_key" ON "Product"("sourceUrl");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
