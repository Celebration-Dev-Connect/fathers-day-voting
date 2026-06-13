-- Normalize QrCard.visibleCode from the legacy C-N format to 4-digit zero-padded
-- format, and enforce that format via a CHECK constraint.
--
-- The original migration (20260610203000_enforce_four_digit_qr_visible_codes) was
-- skipped on all environments because some databases already contained 4-digit
-- codes alongside C-N codes, causing the plain UPDATE to fail on the existing
-- unique(eventId, visibleCode) constraint.
--
-- This replacement handles the two cases separately:
--   Step 1 — Safe update: normalize C-N codes whose target 4-digit form does not
--             already exist for the same event.
--   Step 2 — Conflict resolution: for any C-N codes whose normalized form would
--             collide, assign new unique codes above the current maximum.
--   Step 3 — Enforce the 4-digit format going forward.

-- Step 1: Normalize non-conflicting C-N codes.
UPDATE "QrCard"
SET "visibleCode" = lpad(substring("visibleCode" FROM 3), 4, '0')
WHERE "visibleCode" ~ '^C-[0-9]+$'
  AND NOT EXISTS (
    SELECT 1
    FROM "QrCard" q2
    WHERE q2."eventId"    = "QrCard"."eventId"
      AND q2."visibleCode" = lpad(substring("QrCard"."visibleCode" FROM 3), 4, '0')
      AND q2.id            <> "QrCard".id
  );

-- Step 2: Reassign any remaining C-N codes (those that conflicted in step 1) to
-- new unique 4-digit codes above the current maximum for that event.
DO $$
DECLARE
  r         RECORD;
  next_code INT;
BEGIN
  FOR r IN
    SELECT id, "eventId"
    FROM   "QrCard"
    WHERE  "visibleCode" ~ '^C-[0-9]+$'
    ORDER  BY "eventId", id
  LOOP
    -- Start above the highest existing numeric code for this event.
    SELECT COALESCE(MAX("visibleCode"::INT), 0) + 1
    INTO   next_code
    FROM   "QrCard"
    WHERE  "eventId"    = r."eventId"
      AND  "visibleCode" ~ '^[0-9]{4}$';

    -- Advance past any gaps that are already taken.
    WHILE EXISTS (
      SELECT 1
      FROM   "QrCard"
      WHERE  "eventId"    = r."eventId"
        AND  "visibleCode" = lpad(next_code::TEXT, 4, '0')
    ) LOOP
      next_code := next_code + 1;
    END LOOP;

    UPDATE "QrCard"
    SET    "visibleCode" = lpad(next_code::TEXT, 4, '0')
    WHERE  id = r.id;
  END LOOP;
END $$;

-- Step 3: Enforce 4-digit format going forward.
ALTER TABLE "QrCard"
  ADD CONSTRAINT "QrCard_visibleCode_four_digits_check"
  CHECK ("visibleCode" ~ '^[0-9]{4}$');
