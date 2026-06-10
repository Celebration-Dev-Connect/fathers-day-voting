UPDATE "QrCard"
SET "visibleCode" = lpad(substring("visibleCode" from 3), 4, '0')
WHERE "visibleCode" ~ '^C-[0-9]+$';

ALTER TABLE "QrCard"
ADD CONSTRAINT "QrCard_visibleCode_four_digits_check"
CHECK ("visibleCode" ~ '^[0-9]{4}$');
