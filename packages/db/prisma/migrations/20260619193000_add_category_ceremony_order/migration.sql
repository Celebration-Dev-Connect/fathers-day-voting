ALTER TABLE "Category"
  ADD COLUMN "ceremonyOrder" INTEGER;

ALTER TABLE "SpecialAward"
  ADD COLUMN "ceremonyOrder" INTEGER;

UPDATE "Category"
SET "ceremonyOrder" = CASE
  WHEN lower("name") IN ('bike', 'bikes', 'motorbike', 'motorbikes', 'motorcycle', 'motorcycles') THEN 1
  WHEN lower("name") IN ('van/suv', 'van-suv', 'van', 'suv') THEN 2
  WHEN lower("name") IN ('truck', 'trucks') THEN 3
  WHEN lower("name") = 'modern car' THEN 4
  WHEN lower("name") = 'classic car' THEN 5
  ELSE NULL
END
WHERE "eventId" = 'event-2026-fathers-day';
