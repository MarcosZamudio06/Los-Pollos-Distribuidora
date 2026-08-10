export type OperationalUnit = "KG" | "PIECE" | "KG_AND_PIECE";
export type ProductPresentation = "KG" | "WHOLE" | "CUT";
export type EquivalentPolicyStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type ProductStatus = "ACTIVE" | "INACTIVE" | string;
export type InventoryMovementType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "SALE"
  | "PURCHASE"
  | "CANCEL_SALE"
  | "CANCEL_PURCHASE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "SHRINKAGE"
  | "RETURN";

export type InventoryCategory = {
  id: string;
  name: string;
};

export type InventoryLocation = {
  id: string;
  name: string;
  type?: string;
  parentId?: string | null;
  isActive?: boolean;
};

export const INVENTORY_STORAGE_LOCATION_TYPES = [
  "BRANCH",
  "WAREHOUSE",
  "DISTRIBUTION_CENTER",
  "MIXED",
  "EXTERNAL_POINT_OF_SALE",
  "ROUTE_STOCK",
] as const;

export function isInventoryStorageLocation(location: InventoryLocation) {
  return (
    location.isActive === true &&
    typeof location.id === "string" &&
    location.id.trim().length > 0 &&
    typeof location.name === "string" &&
    location.name.trim().length > 0 &&
    typeof location.type === "string" &&
    (INVENTORY_STORAGE_LOCATION_TYPES as readonly string[]).includes(
      location.type,
    )
  );
}

export type InventoryQuantity = {
  kg: string;
  pieces: string;
};

export type CedisInventorySummaryItem = {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  opening: InventoryQuantity;
  physicalAtCedis: InventoryQuantity;
  reservedAtCedis: InventoryQuantity;
  availableToDispatch: InventoryQuantity;
  inBranchCustody: InventoryQuantity;
  ownedNetworkTotal: InventoryQuantity;
  receivedFromSuppliers: InventoryQuantity;
  sentToBranches: InventoryQuantity;
  returnedFromBranches: InventoryQuantity;
  otherNet: InventoryQuantity;
  remaining: InventoryQuantity;
};

export type CedisInventorySummary = {
  cedis: { id: string; name: string };
  businessDate: string;
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
  totals: Omit<
    CedisInventorySummaryItem,
    "productId" | "productName" | "sku" | "unit"
  >;
  items: CedisInventorySummaryItem[];
};

export type ProductEquivalenceSummary = {
  id: string;
  unitFrom: OperationalUnit;
  unitTo: OperationalUnit;
  factor: number;
  roundingMode?: string | null;
  effectiveFrom?: string | Date | null;
};

export type InventoryBalance = {
  id?: string;
  productId?: string;
  productName?: string;
  locationId: string;
  locationName?: string;
  quantityKg: number;
  quantityPieces: number;
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
  minQuantityKg?: number | null;
  minQuantityPieces?: number | null;
  minimumKg?: number | null;
  minimumPieces?: number | null;
  isLowStock?: boolean;
};

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  category?: { id: string; name: string } | string | null;
  categoryId?: string | null;
  presentationType?: ProductPresentation | null;
  presentation?: ProductPresentation | null;
  salePrice: number;
  purchaseCost?: number | null;
  cost?: number | null;
  minStock?: number | null;
  unit?: OperationalUnit | null;
  operationalUnit?: OperationalUnit | null;
  pieceWeightEquivalent?: number | null;
  equivalentWeightKg?: number | null;
  equivalentPolicyStatus?: EquivalentPolicyStatus | null;
  equivalencePolicyStatus?: EquivalentPolicyStatus | string | null;
  isActive?: boolean;
  active?: boolean;
  status?: ProductStatus;
  inventoryBalance?: InventoryBalance | null;
  locationBalance?: InventoryBalance | null;
  balances?: InventoryBalance[];
  activeEquivalences?: ProductEquivalenceSummary[];
  visibleEquivalence?: string | null;
};

const CANONICAL_PRODUCT_UNITS = ["KG", "PIECE", "KG_AND_PIECE"] as const;
const CANONICAL_PRESENTATION_TYPES = ["KG", "WHOLE", "CUT"] as const;
const CANONICAL_EQUIVALENCE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasProperties(
  value: Record<string, unknown>,
  properties: readonly string[],
) {
  return properties.every((property) => property in value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function quantitiesMatch(actual: number, expected: number) {
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)) * 8;
  return Math.abs(actual - expected) <= tolerance;
}

export function isCanonicalInventoryBalance(
  value: unknown,
  locationId?: string,
  unit?: OperationalUnit | null,
): value is InventoryBalance {
  if (!isRecord(value)) return false;

  if (
    !isNonNegativeFiniteNumber(value.quantityKg) ||
    !isNonNegativeFiniteNumber(value.quantityPieces) ||
    !isNonNegativeFiniteNumber(value.reservedQuantityKg) ||
    !isNonNegativeFiniteNumber(value.reservedQuantityPieces) ||
    !isNonNegativeFiniteNumber(value.availableQuantityKg) ||
    !isNonNegativeFiniteNumber(value.availableQuantityPieces) ||
    !isNonNegativeFiniteNumber(value.minQuantityKg) ||
    !isNonNegativeFiniteNumber(value.minQuantityPieces)
  ) {
    return false;
  }

  const {
    quantityKg,
    quantityPieces,
    reservedQuantityKg,
    reservedQuantityPieces,
    availableQuantityKg,
    availableQuantityPieces,
    minQuantityKg,
    minQuantityPieces,
  } = value;

  const dimensionsAreConsistent =
    reservedQuantityKg <= quantityKg &&
    reservedQuantityPieces <= quantityPieces &&
    quantitiesMatch(availableQuantityKg, quantityKg - reservedQuantityKg) &&
    quantitiesMatch(
      availableQuantityPieces,
      quantityPieces - reservedQuantityPieces,
    );
  if (!dimensionsAreConsistent) return false;

  const pieceDimensionsAreIntegers = [
    quantityPieces,
    reservedQuantityPieces,
    availableQuantityPieces,
    minQuantityPieces,
  ].every((quantity) => Number.isInteger(quantity));
  if (!pieceDimensionsAreIntegers) return false;

  if (
    unit === "KG" &&
    [
      quantityPieces,
      reservedQuantityPieces,
      availableQuantityPieces,
      minQuantityPieces,
    ].some((quantity) => quantity !== 0)
  ) {
    return false;
  }

  if (
    unit === "PIECE" &&
    [
      quantityKg,
      reservedQuantityKg,
      availableQuantityKg,
      minQuantityKg,
    ].some((quantity) => quantity !== 0)
  ) {
    return false;
  }

  const expectedLowStock =
    availableQuantityKg < minQuantityKg ||
    availableQuantityPieces < minQuantityPieces;

  return (
    typeof value.locationId === "string" &&
    value.locationId.trim().length > 0 &&
    (!locationId || value.locationId === locationId) &&
    typeof value.isLowStock === "boolean" &&
    value.isLowStock === expectedLowStock
  );
}

export function getCanonicalInventoryBalance(
  product: Product,
  locationId?: string,
) {
  const balances = [
    product.inventoryBalance,
    ...(Array.isArray(product.balances) ? product.balances : []),
  ];

  return balances.find((balance) =>
    isCanonicalInventoryBalance(balance, locationId, product.unit),
  );
}

export function isCanonicalProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;

  if (
    !hasProperties(value, [
      "id",
      "name",
      "sku",
      "categoryId",
      "presentationType",
      "salePrice",
      "minStock",
      "unit",
      "pieceWeightEquivalent",
      "equivalentPolicyStatus",
      "isActive",
    ])
  ) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isNullableString(value.sku) &&
    isNullableString(value.categoryId) &&
    (CANONICAL_PRESENTATION_TYPES as readonly unknown[]).includes(
      value.presentationType,
    ) &&
    isFiniteNumber(value.salePrice) &&
    isFiniteNumber(value.minStock) &&
    (CANONICAL_PRODUCT_UNITS as readonly unknown[]).includes(value.unit) &&
    (value.pieceWeightEquivalent === null ||
      isFiniteNumber(value.pieceWeightEquivalent)) &&
    (value.equivalentPolicyStatus === null ||
      (CANONICAL_EQUIVALENCE_STATUSES as readonly unknown[]).includes(
        value.equivalentPolicyStatus,
      )) &&
    typeof value.isActive === "boolean"
  );
}

export type ProductFormValues = {
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  presentationType: ProductPresentation;
  salePrice: number;
  purchaseCost: number;
  minStock: number;
  unit: OperationalUnit;
  pieceWeightEquivalent?: number | null;
  equivalentPolicyStatus?: EquivalentPolicyStatus | null;
};

export type InventoryMovement = {
  id: string;
  productId?: string;
  productName?: string;
  locationId?: string;
  locationName?: string;
  type: InventoryMovementType | string;
  unit?: OperationalUnit;
  quantityKg?: number | null;
  quantityPieces?: number | null;
  previousQuantityKg?: number | null;
  newQuantityKg?: number | null;
  previousQuantityPieces?: number | null;
  newQuantityPieces?: number | null;
  reason?: string | null;
  reference?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
};

export type InventoryAdjustmentValues = {
  productId: string;
  locationId: string;
  type: Extract<
    InventoryMovementType,
    "IN" | "OUT" | "ADJUSTMENT" | "SHRINKAGE" | "RETURN"
  >;
  unit: OperationalUnit;
  quantityKg?: number;
  quantityPieces?: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
};

export type InventoryTransferLine = {
  productId: string;
  productName?: string;
  unit: OperationalUnit;
  quantityKg?: number;
  quantityPieces?: number;
};

export type InventoryTransfer = {
  id: string;
  transferNumber?: string;
  originLocationId?: string;
  originLocationName?: string;
  destinationLocationId?: string;
  destinationLocationName?: string;
  status:
    "DRAFT" | "REQUESTED" | "IN_TRANSIT" | "CONFIRMED" | "CANCELLED" | string;
  userId?: string;
  responsibleName?: string;
  notes?: string | null;
  requestedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  itemsCount?: number;
  items?: InventoryTransferLine[];
  movements?: InventoryMovement[];
};

export type InventoryTransferValues = {
  originLocationId: string;
  destinationLocationId: string;
  notes?: string;
  items: InventoryTransferLine[];
};
