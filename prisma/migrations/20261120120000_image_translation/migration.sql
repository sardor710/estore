-- CreateTable
CREATE TABLE "ImageTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceUrl" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "url" TEXT,
    "texts" JSONB,
    "error" TEXT,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageTranslation_sourceUrl_locale_key" ON "ImageTranslation"("sourceUrl", "locale");

-- CreateIndex
CREATE INDEX "ImageTranslation_status_idx" ON "ImageTranslation"("status");
