ALTER TABLE "BillingRequestSaleDocument"
ADD COLUMN "selectedSaleItemIds" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "BillingRequestSaleDocument"
ADD CONSTRAINT "BillingRequestSaleDocument_selected_items_array_check"
CHECK (jsonb_typeof("selectedSaleItemIds") = 'array');
