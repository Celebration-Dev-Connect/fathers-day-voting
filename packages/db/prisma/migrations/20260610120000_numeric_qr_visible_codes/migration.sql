UPDATE "QrCard"
SET "visibleCode" = lpad(substring("visibleCode" from 3), 4, '0')
WHERE "visibleCode" ~ '^C-[0-9]+$';
