-- Allow each hall to select one POS menu and keep removed layouts for audit safety.
ALTER TABLE "Hall"
  ADD COLUMN "menuId" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "DiningTable"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Hall_menuId_idx" ON "Hall"("menuId");

ALTER TABLE "Hall"
  ADD CONSTRAINT "Hall_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
