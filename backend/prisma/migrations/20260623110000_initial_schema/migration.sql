-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OperationalLocationType" AS ENUM ('BRANCH', 'WAREHOUSE', 'MIXED', 'EXTERNAL_POINT_OF_SALE', 'ROUTE_STOCK');

-- CreateEnum
CREATE TYPE "ProductPresentationType" AS ENUM ('KG', 'WHOLE', 'CUT');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('KG', 'PIECE', 'KG_AND_PIECE');

-- CreateEnum
CREATE TYPE "EquivalentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'WHOLESALE', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('COUNTER', 'EXTERNAL_POINT_OF_SALE', 'ROUTE', 'INSTITUTIONAL', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "SaleDocumentType" AS ENUM ('SCALE_TICKET', 'SIMPLE_NOTE', 'LARGE_NOTE', 'INTERNAL_RECEIPT');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalePaymentType" AS ENUM ('CASH_SALE', 'CREDIT_SALE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'SALE', 'PURCHASE', 'CANCEL_SALE', 'CANCEL_PURCHASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'SHRINKAGE', 'RETURN');

-- CreateEnum
CREATE TYPE "InventoryTransferStatus" AS ENUM ('DRAFT', 'REQUESTED', 'IN_TRANSIT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgingStatus" AS ENUM ('CURRENT', 'DUE_SOON', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REGISTERED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingRequestStatus" AS ENUM ('REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryRouteStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('PENDING', 'IN_ROUTE', 'DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'PARTIALLY_REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "DeliveryEvidenceType" AS ENUM ('PHOTO', 'SIGNATURE', 'GEOLOCATION', 'NOTE');

-- CreateEnum
CREATE TYPE "RouteSettlementStatus" AS ENUM ('OPEN', 'CLOSED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "PointOfSaleDailyCloseStatus" AS ENUM ('DRAFT', 'REVIEWED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PointOfSaleDailyCloseLineSection" AS ENUM ('INPUT', 'OUTPUT', 'INCOME', 'PROFIT');

-- CreateEnum
CREATE TYPE "PointOfSaleDailyCloseLineConcept" AS ENUM ('PRODUCT_RECEIVED', 'SALE_NOTE', 'SALE_SCALE_TICKET', 'REMAINING_STOCK', 'SHORTAGE', 'SURPLUS', 'OTHER_OUTPUT', 'CASH_INCOME', 'CARD_VOUCHER_INCOME', 'TRANSFER_INCOME', 'EXPENSE', 'PURCHASE_COST', 'GROSS_PROFIT', 'NET_PROFIT');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('EXPENSE', 'CASH_IN', 'CASH_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MovementChannel" AS ENUM ('CASH', 'CARD_VOUCHER', 'TRANSFER', 'DEPOSIT', 'OTHER');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "OperationalLocationType" NOT NULL,
    "parentId" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "presentationType" "ProductPresentationType" NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "purchaseCost" DECIMAL(14,2) NOT NULL,
    "minStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" "ProductUnit" NOT NULL,
    "pieceWeightEquivalent" DECIMAL(14,3),
    "equivalentPolicyStatus" "EquivalentStatus",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitEquivalent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitFrom" "ProductUnit" NOT NULL,
    "unitTo" "ProductUnit" NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "roundingMode" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" "EquivalentStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitEquivalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantityKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantityPieces" INTEGER NOT NULL DEFAULT 0,
    "minQuantityKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minQuantityPieces" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerNumber" TEXT,
    "name" TEXT NOT NULL,
    "commercialName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "billingEmail" TEXT,
    "address" TEXT,
    "customerType" "CustomerType" NOT NULL,
    "priceListId" TEXT,
    "creditLimit" DECIMAL(14,2),
    "creditDays" INTEGER,
    "creditStatus" "CreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "requiresBilling" BOOLEAN NOT NULL DEFAULT false,
    "fiscalName" TEXT,
    "taxId" TEXT,
    "fiscalAddress" TEXT,
    "deliveryAddress" TEXT,
    "assignedRouteId" TEXT,
    "commercialPolicyId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "saleChannel" "SaleChannel" NOT NULL,
    "documentType" "SaleDocumentType" NOT NULL,
    "physicalFolio" TEXT,
    "requiresAdministrativeInvoice" BOOLEAN NOT NULL DEFAULT false,
    "deliveredByUserId" TEXT,
    "collectedByUserId" TEXT,
    "routeId" TEXT,
    "commercialPolicyId" TEXT,
    "pointOfSaleDailyCloseId" TEXT,
    "collectionStatus" "CollectionStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "paymentType" "SalePaymentType" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3),
    "quantityKg" DECIMAL(14,3),
    "quantityPieces" INTEGER,
    "unit" "ProductUnit" NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitEquivalentId" TEXT,
    "appliedEquivalentFactor" DECIMAL(18,6),
    "roundingMode" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "productSkuSnapshot" TEXT,
    "unitPriceSnapshot" DECIMAL(14,2) NOT NULL,
    "quantitySnapshot" DECIMAL(14,3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleDocument" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "documentType" "SaleDocumentType" NOT NULL,
    "operationalLocationId" TEXT,
    "pointOfSaleDailyCloseId" TEXT,
    "physicalFolio" TEXT,
    "status" "SaleDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "requiresAdministrativeInvoice" BOOLEAN NOT NULL DEFAULT false,
    "deliveredByUserId" TEXT,
    "collectedByUserId" TEXT,
    "routeId" TEXT,
    "customerSnapshot" JSONB,
    "productSnapshot" JSONB,
    "priceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3),
    "quantityKg" DECIMAL(14,3),
    "quantityPieces" INTEGER,
    "unit" "ProductUnit" NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "unitEquivalentId" TEXT,
    "appliedEquivalentFactor" DECIMAL(18,6),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,3),
    "quantityKg" DECIMAL(14,3),
    "quantityPieces" INTEGER,
    "previousStock" DECIMAL(14,3),
    "newStock" DECIMAL(14,3),
    "previousQuantityKg" DECIMAL(14,3),
    "newQuantityKg" DECIMAL(14,3),
    "previousQuantityPieces" INTEGER,
    "newQuantityPieces" INTEGER,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "transferId" TEXT,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "routeSettlementId" TEXT,
    "pointOfSaleDailyCloseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "originLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityKg" DECIMAL(14,3),
    "quantityPieces" INTEGER,
    "unit" "ProductUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReceivable" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "billingRequestId" TEXT,
    "originalSaleId" TEXT NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "outstandingAmount" DECIMAL(14,2) NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL,
    "lastPaymentDate" TIMESTAMP(3),
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "agingStatus" "AgingStatus" NOT NULL DEFAULT 'CURRENT',
    "physicalDocumentFolio" TEXT,
    "collectorUserId" TEXT,
    "commercialPolicyId" TEXT,
    "status" "CollectionStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "accountReceivableId" TEXT,
    "saleId" TEXT,
    "customerId" TEXT,
    "userId" TEXT NOT NULL,
    "collectedByUserId" TEXT,
    "collectionPass" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "bankName" TEXT,
    "referenceNumber" TEXT,
    "appliedDocumentId" TEXT,
    "appliedDocumentType" TEXT,
    "operationalLocationId" TEXT,
    "routeId" TEXT,
    "routeSettlementId" TEXT,
    "pointOfSaleDailyCloseId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REGISTERED',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRequest" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "BillingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "customerType" "CustomerType",
    "priceListId" TEXT,
    "defaultCreditLimit" DECIMAL(14,2),
    "defaultCreditDays" INTEGER,
    "overdueBlockingMode" TEXT,
    "creditLimitBlockingMode" TEXT,
    "allowAdministrativeOverride" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "locationId" TEXT,
    "description" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DeliveryRouteStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "originLocationId" TEXT,
    "routeStockLocationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "accountReceivableId" TEXT,
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAddress" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "collectedByUserId" TEXT,
    "deliveredByUserId" TEXT,
    "collectionPass" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvidence" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "type" "DeliveryEvidenceType" NOT NULL,
    "value" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteSettlement" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "RouteSettlementStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expectedCashAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedTransferAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "differenceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedReason" TEXT,
    "routeCollectionsSummary" JSONB,
    "paidAtDeliveryAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overdueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "secondPassCollectionsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointOfSaleDailyClose" (
    "id" TEXT NOT NULL,
    "operationalLocationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "PointOfSaleDailyCloseStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastValidatedAt" TIMESTAMP(3),
    "validatedSourceVersion" INTEGER,
    "openedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "closedByUserId" TEXT,
    "cancelledByUserId" TEXT,
    "reopenedByUserId" TEXT,
    "totalInputKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalSoldKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalRemainingKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalShortageKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalSurplusKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "scaleReportedKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "scaleDifferenceKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cashTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cardVoucherTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transferTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expenseTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossSalesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netCashExpected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashDifferenceTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchaseCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossProfitTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netProfitTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointOfSaleDailyClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointOfSaleDailyCloseLine" (
    "id" TEXT NOT NULL,
    "pointOfSaleDailyCloseId" TEXT NOT NULL,
    "operationalLocationId" TEXT NOT NULL,
    "section" "PointOfSaleDailyCloseLineSection" NOT NULL,
    "conceptType" "PointOfSaleDailyCloseLineConcept" NOT NULL,
    "productId" TEXT,
    "saleId" TEXT,
    "inventoryMovementId" TEXT,
    "scaleTicketReferenceId" TEXT,
    "quantityKg" DECIMAL(14,3),
    "quantityPieces" INTEGER,
    "amount" DECIMAL(14,2),
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointOfSaleDailyCloseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "operationalLocationId" TEXT NOT NULL,
    "pointOfSaleDailyCloseId" TEXT,
    "type" "CashMovementType" NOT NULL,
    "movementChannel" "MovementChannel" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleTicketReference" (
    "id" TEXT NOT NULL,
    "operationalLocationId" TEXT NOT NULL,
    "pointOfSaleDailyCloseId" TEXT,
    "saleId" TEXT,
    "physicalFolio" TEXT NOT NULL,
    "capturedDate" DATE NOT NULL,
    "productId" TEXT,
    "weightKg" DECIMAL(14,3),
    "pieceCount" INTEGER,
    "unitPrice" DECIMAL(14,2),
    "amount" DECIMAL(14,2),
    "capturedByUserId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleTicketReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalLocation_code_key" ON "OperationalLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ProductUnitEquivalent_productId_unitFrom_unitTo_status_idx" ON "ProductUnitEquivalent"("productId", "unitFrom", "unitTo", "status");

-- CreateIndex
CREATE INDEX "ProductUnitEquivalent_effectiveFrom_effectiveTo_idx" ON "ProductUnitEquivalent"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productId_locationId_key" ON "InventoryBalance"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");

-- CreateIndex
CREATE INDEX "Sale_locationId_createdAt_idx" ON "Sale"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_collectionStatus_idx" ON "Sale"("customerId", "collectionStatus");

-- CreateIndex
CREATE INDEX "SaleDocument_operationalLocationId_physicalFolio_idx" ON "SaleDocument"("operationalLocationId", "physicalFolio");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");

-- CreateIndex
CREATE INDEX "Purchase_locationId_createdAt_idx" ON "Purchase"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_locationId_createdAt_idx" ON "InventoryMovement"("productId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_transferNumber_key" ON "InventoryTransfer"("transferNumber");

-- CreateIndex
CREATE INDEX "InventoryTransfer_originLocationId_status_idx" ON "InventoryTransfer"("originLocationId", "status");

-- CreateIndex
CREATE INDEX "InventoryTransfer_destinationLocationId_status_idx" ON "InventoryTransfer"("destinationLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountReceivable_saleId_key" ON "AccountReceivable"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountReceivable_billingRequestId_key" ON "AccountReceivable"("billingRequestId");

-- CreateIndex
CREATE INDEX "AccountReceivable_customerId_status_dueDate_idx" ON "AccountReceivable"("customerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_accountReceivableId_paidAt_idx" ON "Payment"("accountReceivableId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_saleId_paidAt_idx" ON "Payment"("saleId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_operationalLocationId_paidAt_idx" ON "Payment"("operationalLocationId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRequest_saleId_key" ON "BillingRequest"("saleId");

-- CreateIndex
CREATE INDEX "OperationalConfig_key_scope_locationId_isActive_idx" ON "OperationalConfig"("key", "scope", "locationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRoute_routeStockLocationId_key" ON "DeliveryRoute"("routeStockLocationId");

-- CreateIndex
CREATE INDEX "DeliveryRoute_driverId_scheduledDate_status_idx" ON "DeliveryRoute"("driverId", "scheduledDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_saleId_key" ON "DeliveryOrder"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteSettlement_routeId_key" ON "RouteSettlement"("routeId");

-- CreateIndex
CREATE INDEX "PointOfSaleDailyClose_operationalLocationId_businessDate_st_idx" ON "PointOfSaleDailyClose"("operationalLocationId", "businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PointOfSaleDailyClose_id_operationalLocationId_key" ON "PointOfSaleDailyClose"("id", "operationalLocationId");

-- CreateIndex
CREATE INDEX "PointOfSaleDailyCloseLine_pointOfSaleDailyCloseId_operation_idx" ON "PointOfSaleDailyCloseLine"("pointOfSaleDailyCloseId", "operationalLocationId");

-- CreateIndex
CREATE INDEX "CashMovement_operationalLocationId_occurredAt_idx" ON "CashMovement"("operationalLocationId", "occurredAt");

-- CreateIndex
CREATE INDEX "ScaleTicketReference_operationalLocationId_capturedAt_idx" ON "ScaleTicketReference"("operationalLocationId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleTicketReference_operationalLocationId_capturedDate_phy_key" ON "ScaleTicketReference"("operationalLocationId", "capturedDate", "physicalFolio");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalLocation" ADD CONSTRAINT "OperationalLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitEquivalent" ADD CONSTRAINT "ProductUnitEquivalent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitEquivalent" ADD CONSTRAINT "ProductUnitEquivalent_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitEquivalent" ADD CONSTRAINT "ProductUnitEquivalent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedRouteId_fkey" FOREIGN KEY ("assignedRouteId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_commercialPolicyId_fkey" FOREIGN KEY ("commercialPolicyId") REFERENCES "CommercialPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_commercialPolicyId_fkey" FOREIGN KEY ("commercialPolicyId") REFERENCES "CommercialPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_unitEquivalentId_fkey" FOREIGN KEY ("unitEquivalentId") REFERENCES "ProductUnitEquivalent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDocument" ADD CONSTRAINT "SaleDocument_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_unitEquivalentId_fkey" FOREIGN KEY ("unitEquivalentId") REFERENCES "ProductUnitEquivalent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_routeSettlementId_fkey" FOREIGN KEY ("routeSettlementId") REFERENCES "RouteSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_billingRequestId_fkey" FOREIGN KEY ("billingRequestId") REFERENCES "BillingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_collectorUserId_fkey" FOREIGN KEY ("collectorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_commercialPolicyId_fkey" FOREIGN KEY ("commercialPolicyId") REFERENCES "CommercialPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_routeSettlementId_fkey" FOREIGN KEY ("routeSettlementId") REFERENCES "RouteSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPolicy" ADD CONSTRAINT "CommercialPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPolicy" ADD CONSTRAINT "CommercialPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalConfig" ADD CONSTRAINT "OperationalConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalConfig" ADD CONSTRAINT "OperationalConfig_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalConfig" ADD CONSTRAINT "OperationalConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_routeStockLocationId_fkey" FOREIGN KEY ("routeStockLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvidence" ADD CONSTRAINT "DeliveryEvidence_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSettlement" ADD CONSTRAINT "RouteSettlement_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSettlement" ADD CONSTRAINT "RouteSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteSettlement" ADD CONSTRAINT "RouteSettlement_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyClose" ADD CONSTRAINT "PointOfSaleDailyClose_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_scaleTicketReferenceId_fkey" FOREIGN KEY ("scaleTicketReferenceId") REFERENCES "ScaleTicketReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSaleDailyCloseLine" ADD CONSTRAINT "PointOfSaleDailyCloseLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicketReference" ADD CONSTRAINT "ScaleTicketReference_operationalLocationId_fkey" FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicketReference" ADD CONSTRAINT "ScaleTicketReference_pointOfSaleDailyCloseId_fkey" FOREIGN KEY ("pointOfSaleDailyCloseId") REFERENCES "PointOfSaleDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicketReference" ADD CONSTRAINT "ScaleTicketReference_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicketReference" ADD CONSTRAINT "ScaleTicketReference_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleTicketReference" ADD CONSTRAINT "ScaleTicketReference_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

