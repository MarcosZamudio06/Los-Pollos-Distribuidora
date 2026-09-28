\set ON_ERROR_STOP on
BEGIN;
INSERT INTO "Role" (id, name, "updatedAt") VALUES ('dr-role', 'DR fixture role', now());
INSERT INTO "OperationalLocation" (id, name, type, "updatedAt") VALUES
  ('dr-location', 'DR fixture location', 'DISTRIBUTION_CENTER', now()),
  ('dr-route-location', 'DR fixture route stock', 'ROUTE_STOCK', now());
INSERT INTO "User" (id, name, email, "controlNumber", phone, "passwordHash", "roleId", "operationalLocationId", "updatedAt") VALUES
  ('dr-user', 'DR fixture user', 'dr-user@example.test', 'DR-USER-1', '+520000000099', 'not-a-login-hash', 'dr-role', 'dr-location', now());
INSERT INTO "Customer" (id, "customerNumber", name, "customerType", "requiresBilling", "fiscalName", "updatedAt") VALUES
  ('dr-customer', 'DR-CUSTOMER-1', 'DR fixture customer', 'WHOLESALE', true, 'DR fixture customer', now());
INSERT INTO "Product" (id, name, sku, "presentationType", "salePrice", "purchaseCost", unit, "updatedAt") VALUES
  ('dr-product', 'DR fixture product', 'DR-PRODUCT-1', 'WHOLE', 1, 1, 'PIECE', now());
INSERT INTO "LegalEntity" (id, "legalName", "taxId", "updatedAt") VALUES
  ('dr-legal-entity', 'DR fixture legal entity', 'DRF010101AAA', now());
INSERT INTO "Sale" (id, "saleNumber", "customerId", "userId", "locationId", "legalEntityId", "saleChannel", "documentType", "requiresAdministrativeInvoice", subtotal, discount, tax, total, "paymentType", status, "updatedAt") VALUES
  ('dr-sale', 'DR-SALE-1', 'dr-customer', 'dr-user', 'dr-location', 'dr-legal-entity', 'ROUTE', 'SIMPLE_NOTE', true, 1, 0, 0, 1, 'CASH_SALE', 'CONFIRMED', now());
INSERT INTO "SaleItem" (id, "saleId", "productId", quantity, "quantityPieces", unit, "unitPrice", "productNameSnapshot", "productSkuSnapshot", "unitPriceSnapshot", "quantitySnapshot", subtotal, discount, "taxableBase", tax, total, "unitCostSnapshot", "costSubtotalSnapshot", "costSnapshotSource", "updatedAt") VALUES
  ('dr-sale-item', 'dr-sale', 'dr-product', 1, 1, 'PIECE', 1, 'DR fixture product', 'DR-PRODUCT-1', 1, 1, 1, 0, 1, 0, 1, 1, 1, 'SALE_CONFIRMATION', now());
INSERT INTO "DeliveryRoute" (id, name, "driverId", "routeStockLocationId", "scheduledDate", "updatedAt") VALUES
  ('dr-route', 'DR fixture route', 'dr-user', 'dr-route-location', now(), now());
INSERT INTO "SaleDocument" (id, "saleId", "documentType", "operationalLocationId", "physicalFolio", status, "requiresAdministrativeInvoice", "routeId", "updatedAt") VALUES
  ('dr-sale-document', 'dr-sale', 'SIMPLE_NOTE', 'dr-location', 'DR-SALE-1', 'ISSUED', true, 'dr-route', now());
INSERT INTO "DeliveryOrder" (id, "routeId", "saleId", "deliveryAddress", "updatedAt") VALUES
  ('dr-order', 'dr-route', 'dr-sale', 'Disposable DR fixture', now());
INSERT INTO "DeliveryEvidence" (id, "deliveryOrderId", type, "storageKey", "mimeType", sha256, "sizeBytes", "capturedAt", "updatedAt") VALUES
  ('dr-evidence', 'dr-order', 'PHOTO', 'evidence/dr-evidence.txt', 'text/plain', :'evidence_sha', :evidence_size, now(), now());
-- A reportable sale invoice must consume an approved billing request and its
-- exact sale-document/item applications. This is the minimum valid chain for
-- the ACTIVE legacy fixture; no native CFDI/PAC fields are fabricated.
INSERT INTO "BillingRequest" (id, "saleId", "customerId", "requestedByUserId", status, "requestedAt", "reviewedAt", "reviewedByUserId", "updatedAt") VALUES
  ('dr-billing-request', 'dr-sale', 'dr-customer', 'dr-user', 'APPROVED', now(), now(), 'dr-user', now());
INSERT INTO "BillingRequestSaleDocument" (id, "billingRequestId", "saleDocumentId", "requestedSubtotal", "requestedTax", "requestedTotal", "createdByUserId", "updatedAt") VALUES
  ('dr-billing-document', 'dr-billing-request', 'dr-sale-document', 1, 0, 1, 'dr-user', now());
INSERT INTO "BillingRequestSaleItem" (id, "billingRequestSaleDocumentId", "saleItemId", "requestedSubtotal", "requestedTax", "requestedTotal") VALUES
  ('dr-billing-item', 'dr-billing-document', 'dr-sale-item', 1, 0, 1);
INSERT INTO "Invoice" (id, "legalEntityId", "sourceBillingRequestId", "currencyCode", series, folio, subtotal, discount, tax, total, status, "createdByUserId", "updatedAt") VALUES
  ('dr-invoice', 'dr-legal-entity', 'dr-billing-request', 'MXN', 'DR', '1', 1, 0, 0, 1, 'ACTIVE', 'dr-user', now());
INSERT INTO "InvoiceSaleDocument" (id, "invoiceId", "saleDocumentId", "billingRequestSaleDocumentId", "subtotalApplied", "taxApplied", "totalApplied", "createdByUserId", "updatedAt") VALUES
  ('dr-invoice-document', 'dr-invoice', 'dr-sale-document', 'dr-billing-document', 1, 0, 1, 'dr-user', now());
INSERT INTO "InvoiceSaleItemApplication" (id, "invoiceSaleDocumentId", "saleItemId", "subtotalApplied", "taxApplied", "totalApplied", "createdByUserId", "updatedAt") VALUES
  ('dr-invoice-item', 'dr-invoice-document', 'dr-sale-item', 1, 0, 1, 'dr-user', now());
INSERT INTO "FiscalArtifact" (id, "invoiceId", type, status, "storageKey", "mimeType", "byteSize", sha256, "storedAt", "updatedAt") VALUES
  ('dr-fiscal-artifact', 'dr-invoice', 'PDF', 'AVAILABLE', 'fiscal/dr-fixture.pdf', 'application/pdf', :fiscal_size, :'fiscal_sha', now(), now());
COMMIT;
