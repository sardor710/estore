-- Backfill: one Customer per distinct Order.phone, taking name/region from the latest order.
-- Idempotent (skips phones that already have a Customer); tags start empty, never blocked.
INSERT INTO "Customer" ("phone", "name", "region", "notes", "tags", "blocked", "createdAt", "updatedAt")
SELECT o."phone", o."name", o."region", '', '[]', false, agg."firstAt", CURRENT_TIMESTAMP
FROM "Order" o
JOIN (
    SELECT "phone", MAX("id") AS "lastId", MIN("createdAt") AS "firstAt"
    FROM "Order"
    GROUP BY "phone"
) agg ON agg."lastId" = o."id"
WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."phone" = o."phone");
