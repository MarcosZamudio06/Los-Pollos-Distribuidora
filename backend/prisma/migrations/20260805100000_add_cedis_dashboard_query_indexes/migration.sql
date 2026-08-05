CREATE INDEX "BranchSupplyCycle_distributionCenterLocationId_businessDate_status_branchLocationId_idx"
  ON "BranchSupplyCycle" (
    "distributionCenterLocationId",
    "businessDate",
    "status",
    "branchLocationId"
  );

CREATE INDEX "BranchSupplyCycle_branchLocationId_businessDate_id_idx"
  ON "BranchSupplyCycle" (
    "branchLocationId",
    "businessDate" DESC,
    "id" DESC
  );
