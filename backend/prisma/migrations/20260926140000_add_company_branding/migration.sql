CREATE TABLE "CompanyBranding" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "displayName" VARCHAR(80) NOT NULL,
    "shortName" VARCHAR(32),
    "logoObjectKey" VARCHAR(512),
    "logoMimeType" VARCHAR(32),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyBranding_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "CompanyBranding_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
