CREATE INDEX "DeliveryOrder_status_deliveredAt_routeId_idx"
  ON "DeliveryOrder"("status", "deliveredAt", "routeId");

CREATE INDEX "DeliveryIncident_occurredAt_routeId_vehicleId_idx"
  ON "DeliveryIncident"("occurredAt", "routeId", "vehicleId");
