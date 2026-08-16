CREATE INDEX "VehiclePosition_recordedAt_id_idx"
  ON "VehiclePosition"("recordedAt", "id");

CREATE INDEX "DeliveryIncident_positionId_idx"
  ON "DeliveryIncident"("positionId");
