ALTER TABLE "User"
  ADD COLUMN "cedisLocationId" TEXT;

CREATE INDEX "User_cedisLocationId_idx"
  ON "User"("cedisLocationId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_cedisLocationId_fkey"
  FOREIGN KEY ("cedisLocationId") REFERENCES "OperationalLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
