ALTER TABLE "Category"
ADD COLUMN "importIdentifier" TEXT,
ADD COLUMN "importYearMin" INTEGER,
ADD COLUMN "importYearMax" INTEGER;

UPDATE "Category" SET "importIdentifier" = 'car', "importYearMax" = 1984 WHERE "name" = 'Classic Car';
UPDATE "Category" SET "importIdentifier" = 'car', "importYearMin" = 1985 WHERE "name" = 'Modern Car';
UPDATE "Category" SET "importIdentifier" = 'truck' WHERE "name" = 'Truck';
UPDATE "Category" SET "importIdentifier" = 'bike' WHERE "name" = 'Motorbike';
UPDATE "Category" SET "importIdentifier" = 'van-suv' WHERE "name" = 'Van/SUV';
UPDATE "Category" SET "importIdentifier" = 'custom' WHERE "name" = 'Custom';
