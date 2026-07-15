DROP INDEX IF EXISTS "DeliveryRoutePlanDraft_consumedByRouteId_key";

CREATE INDEX "DeliveryRoutePlanDraft_consumedByRouteId_idx"
  ON "DeliveryRoutePlanDraft"("consumedByRouteId");
