-- Add user access status and deactivation audit fields without removing data.
ALTER TABLE "User"
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedByUserId" TEXT,
ADD COLUMN     "deactivationReason" TEXT;

CREATE INDEX "User_deactivatedByUserId_idx" ON "User"("deactivatedByUserId");

ALTER TABLE "User"
ADD CONSTRAINT "User_deactivatedByUserId_fkey"
FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
