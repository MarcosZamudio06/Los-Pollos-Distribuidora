\set ON_ERROR_STOP on
INSERT INTO "Role" (id, name, "updatedAt") VALUES ('dr-role', 'DR fixture role', now());
INSERT INTO "OperationalLocation" (id, name, type, "updatedAt") VALUES
  ('dr-location', 'DR fixture location', 'DISTRIBUTION_CENTER', now()),
  ('dr-route-location', 'DR fixture route stock', 'ROUTE_STOCK', now());
INSERT INTO "User" (id, name, email, "controlNumber", phone, "passwordHash", "roleId", "operationalLocationId", "updatedAt") VALUES
  ('dr-user', 'DR fixture user', 'dr-user@example.test', 'DR-USER-1', '+520000000099', 'not-a-login-hash', 'dr-role', 'dr-location', now());
INSERT INTO "Sale" (id, "saleNumber", "userId", "locationId", "saleChannel", "documentType", subtotal, discount, tax, total, "paymentType", "updatedAt") VALUES
  ('dr-sale', 'DR-SALE-1', 'dr-user', 'dr-location', 'ROUTE', 'SIMPLE_NOTE', 1, 0, 0, 1, 'CASH_SALE', now());
INSERT INTO "DeliveryRoute" (id, name, "driverId", "routeStockLocationId", "scheduledDate", "updatedAt") VALUES
  ('dr-route', 'DR fixture route', 'dr-user', 'dr-route-location', now(), now());
INSERT INTO "DeliveryOrder" (id, "routeId", "saleId", "deliveryAddress", "updatedAt") VALUES
  ('dr-order', 'dr-route', 'dr-sale', 'Disposable DR fixture', now());
INSERT INTO "DeliveryEvidence" (id, "deliveryOrderId", type, "storageKey", "mimeType", sha256, "sizeBytes", "capturedAt", "updatedAt") VALUES
  ('dr-evidence', 'dr-order', 'PHOTO', 'evidence/dr-evidence.txt', 'text/plain', :'evidence_sha', :evidence_size, now(), now());
INSERT INTO "LegalEntity" (id, "legalName", "taxId", "updatedAt") VALUES
  ('dr-legal-entity', 'DR fixture legal entity', 'DRF010101AAA', now());
INSERT INTO "Invoice" (id, "legalEntityId", "currencyCode", series, folio, subtotal, discount, tax, total, "createdByUserId", "updatedAt") VALUES
  ('dr-invoice', 'dr-legal-entity', 'MXN', 'DR', '1', 1, 0, 0, 1, 'dr-user', now());
INSERT INTO "FiscalArtifact" (id, "invoiceId", type, status, "storageKey", "mimeType", "byteSize", sha256, "storedAt", "updatedAt") VALUES
  ('dr-fiscal-artifact', 'dr-invoice', 'PDF', 'AVAILABLE', 'fiscal/dr-fixture.pdf', 'application/pdf', :fiscal_size, :'fiscal_sha', now(), now());
