export type CedisCycleStatus =
  "OPEN" | "READY_FOR_REVIEW" | "CLOSED" | "CANCELLED";

export type OperationalLocationType =
  | "BRANCH"
  | "WAREHOUSE"
  | "DISTRIBUTION_CENTER"
  | "MIXED"
  | "EXTERNAL_POINT_OF_SALE"
  | "ROUTE_STOCK";

export type CedisLocation = {
  id: string;
  name: string;
  code?: string | null;
  type: OperationalLocationType;
  parentId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateBranchLocationPayload = {
  name: string;
  code?: string;
  type: "BRANCH";
  parentId: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type CedisDashboardFilters = {
  cedisLocationId: string;
  businessDate: string;
  status?: CedisCycleStatus;
  search?: string;
};

export type CedisDashboardLocation = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

export type CedisDashboardCard = {
  branch: CedisDashboardLocation;
  cycle: {
    id: string;
    businessDate: string;
    status: CedisCycleStatus;
    version: number;
  } | null;
  physical: {
    deliveredKg: string;
    deliveredPieces: string;
    returnedKg: string;
    returnedPieces: string;
    expectedSoldKg: string;
    expectedSoldPieces: string;
    actualSoldKg: string;
    actualSoldPieces: string;
  } | null;
  financial: {
    expectedSales: string;
    potentialSales?: string;
    actualSales: string;
    creditSales?: string;
    expectedCost?: string;
    actualCost?: string;
    expectedProfit?: string;
    actualProfit?: string;
    actualNetProfit?: string;
  } | null;
  cash: {
    expected: string;
    counted: string | null;
    difference: string | null;
  } | null;
  warningCount: number;
  lastActivityAt: string | null;
};

export type CedisDashboardResponse = {
  cedisLocationId: string;
  businessDate: string;
  items: CedisDashboardCard[];
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisBranchHistoryFilters = {
  dateFrom: string;
  dateTo: string;
  status?: CedisCycleStatus;
  page?: number;
  limit?: number;
};

export type CedisBranchHistoryResponse = {
  branchId: string;
  dateFrom: string;
  dateTo: string;
  items: CedisDashboardCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisCycleSummary = {
  id: string;
  businessDate: string;
  status: CedisCycleStatus;
  version: number;
  notes: string | null;
  branch: CedisDashboardLocation;
  distributionCenter: CedisDashboardLocation;
  totals: {
    deliveredKg: string;
    deliveredPieces: string;
    returnedKg: string;
    returnedPieces: string;
    expectedSoldKg: string;
    expectedSoldPieces: string;
    actualSoldKg: string;
    actualSoldPieces: string;
    expectedSales: string;
    potentialSales?: string;
    actualSales: string;
    creditSales: string;
    expectedCash: string;
    cashCounted: string | null;
    cashDifference: string | null;
    expectedCost?: string;
    actualCost?: string;
    expectedProfit?: string;
    actualProfit?: string;
    actualNetProfit?: string;
  };
  items: CedisCycleItem[];
  transfers: CedisCycleTransfer[];
  dailyClose: CedisDailyClose | null;
  cashMovementSummary: CedisCashMovementSummary | null;
  warningCount: number;
  lastActivityAt: string | null;
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
};

export type CedisCycleItem = {
  id: string;
  snapshotKey: string;
  productId: string;
  name: string;
  sku: string | null;
  unit: "KG" | "PIECE" | "KG_AND_PIECE";
  unitPrice: string;
  unitCost?: string;
  deliveredKg: string;
  deliveredPieces: string;
  returnedKg: string;
  returnedPieces: string;
  expectedSoldKg: string;
  expectedSoldPieces: string;
  actualSoldKg: string;
  actualSoldPieces: string;
  expectedSales: string;
  actualSales: string;
  expectedCost?: string;
  actualCost?: string;
  expectedProfit?: string;
  actualProfit?: string;
};

export type CedisCycleTransferItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  unit: "KG" | "PIECE" | "KG_AND_PIECE";
  quantityKg: string | null;
  quantityPieces: number | null;
  balance?: CedisTransferBalance | null;
};

export type CedisTransferBalance = {
  locationId: string;
  quantityKg: number;
  quantityPieces: number;
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
};

export type CedisCycleTransfer = {
  id: string;
  role: "SUPPLY" | "RETURN" | string;
  linkedAt: string;
  transfer: {
    id: string;
    transferNumber: string;
    status: string;
    originLocationId: string;
    destinationLocationId: string;
    requestedAt: string | null;
    confirmedAt: string | null;
    cancelledAt: string | null;
    updatedAt: string;
    items: CedisCycleTransferItem[];
    receipt?: CedisSupplyReceipt | null;
  };
};

export type CedisSupplyReceiptItem = {
  transferItemId: string;
  productId: string;
  productName: string;
  unit: "KG" | "PIECE" | "KG_AND_PIECE" | string;
  sentKg: string;
  sentPieces: number;
  receivedKg: string;
  receivedPieces: number;
  differenceKg: string;
  differencePieces: number;
};

export type CedisSupplyReceipt = {
  id: string;
  receivedAt: string;
  notes: string | null;
  receivedBy: { id: string; name: string };
  items: CedisSupplyReceiptItem[];
};

export type CedisIncomingSupplyItem = {
  transferItemId: string;
  productId: string;
  productName: string;
  unit: "KG" | "PIECE" | "KG_AND_PIECE" | string;
  quantityKg: number;
  quantityPieces: number;
};

export type CedisIncomingSupply = {
  id: string;
  transferNumber: string;
  cycleId: string;
  cycleVersion: number;
  businessDate: string;
  status: "PENDING" | "RECEIVED";
  origin: { id: string; name: string; code: string | null };
  destination: { id: string; name: string; code: string | null };
  notes: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: CedisIncomingSupplyItem[];
  receipt: CedisSupplyReceipt | null;
};

export type CedisIncomingSuppliesResponse = {
  items: CedisIncomingSupply[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CedisIncomingSuppliesFilters = {
  businessDate: string;
  branchLocationId?: string;
  status?: "PENDING" | "RECEIVED";
  page?: number;
  limit?: number;
};

export type CedisReceiveSupplyItem = {
  transferItemId: string;
  quantityKg?: number;
  quantityPieces?: number;
};

export type CedisReceiveSupplyCommand = {
  expectedCycleVersion: number;
  notes?: string;
  items: CedisReceiveSupplyItem[];
};

export type CedisDailyCloseDifference = {
  id: string;
  code: string;
  scope: string;
  unit: "MXN" | "KG" | "PIECE" | string;
  expectedValue: string;
  recordedValue: string | null;
  differenceValue: string;
  differenceType: "SURPLUS" | "SHORTAGE" | string;
  status: string;
  reason: string | null;
  evidence: string | null;
};

export type CedisDailyClose = {
  id: string;
  businessDate: string;
  status: string;
  version: number;
  totals: {
    cash: string;
    cardVoucher: string;
    transfer: string;
    expenses: string;
    grossSales: string;
    creditSales: string;
    netCashExpected: string;
    cashCounted: string | null;
    cashDifference: string | null;
    purchaseCost?: string;
    grossProfit?: string;
    netProfit?: string;
  };
  unresolvedDifferences: CedisDailyCloseDifference[];
  updatedAt: string;
};

export type CedisCashMovementGroup = {
  type: string;
  movementChannel: string;
  isOpening: boolean;
  count: number;
  grossAmount: string;
  cashImpact: string;
};

export type CedisPaymentGroup = {
  paymentMethod: string;
  count: number;
  amount: string;
};

export type CedisCashMovementSummary = {
  dailyCloseId: string;
  movementCount: number;
  expenseTotal: string;
  cashInTotal: string;
  cashOutTotal: string;
  cashAdjustmentTotal: string;
  movementsByTypeAndChannel: CedisCashMovementGroup[];
  paymentsByMethod: CedisPaymentGroup[];
  shifts: {
    activeShiftCount: number;
    openShiftCount: number;
    openingCash: string;
    shiftCashCounted: string | null;
  };
};

export type CedisCycleCommandItem = {
  productId: string;
  unit: "KG" | "PIECE" | "KG_AND_PIECE";
  quantityKg?: number;
  quantityPieces?: number;
  unitEquivalentId?: string | null;
};

export type CedisCycleCommand = {
  expectedVersion: number;
  assignedDriverId: string;
  vehicleId: string;
  notes?: string;
  items: CedisCycleCommandItem[];
};

export type CedisLogisticsDriver = {
  id: string;
  name: string;
  isActive: boolean;
  role: { name: string };
};

export type CedisLogisticsVehicle = {
  id: string;
  code: string;
  displayName: string;
  plateNumber?: string | null;
  homeLocationId?: string | null;
  isActive: boolean;
};

export type CedisLogisticsResources = {
  drivers: CedisLogisticsDriver[];
  vehicles: CedisLogisticsVehicle[];
  isLoading: boolean;
  error?: unknown;
};

export type CedisRefreshCommand = {
  expectedVersion: number;
};

export type CedisOpenCycleCommand = {
  distributionCenterLocationId: string;
  branchLocationId: string;
  businessDate: string;
  notes?: string;
};

export type CedisCloseCycleCommand = {
  expectedVersion: number;
};

export type CedisReopenCycleCommand = {
  expectedVersion: number;
  reason: string;
};

export type CedisCancelCycleCommand = {
  expectedVersion: number;
  reason: string;
};

export type CedisMutationInput<T> = {
  payload: T;
  idempotencyKey: string;
};

export type CedisBranchReturnStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export type CedisBranchReturn = {
  id: string;
  transferNumber: string;
  cycle: {
    id: string;
    version: number;
    businessDate: string;
    branch: { id: string; name: string; code: string | null };
    distributionCenter: { id: string; name: string; code: string | null };
  };
  status: CedisBranchReturnStatus;
  notes: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
  route?: {
    id: string;
    type: "BRANCH_RETURN" | string;
    status: string;
    driverId: string;
    driver: { id: string; name: string };
    vehicleId: string;
    vehicle: {
      id: string;
      code: string;
      displayName: string;
      plateNumber: string | null;
    };
    inventoryTransferId: string;
    originLocationId: string | null;
    scheduledDate: string;
  } | null;
  items: Array<{
    transferItemId: string;
    productId: string;
    productName: string;
    unit: "KG" | "PIECE" | "KG_AND_PIECE" | string;
    quantityKg: number;
    quantityPieces: number;
  }>;
};

export type CedisReturnsResponse = {
  items: CedisBranchReturn[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CedisReturnsFilters = {
  businessDate: string;
  status?: CedisBranchReturnStatus | "ALL";
  branchLocationId?: string;
  page?: number;
  limit?: number;
};
