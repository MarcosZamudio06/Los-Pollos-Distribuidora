import {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  CustomerType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  InventoryTransferStatus,
  MovementChannel,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  PointOfSaleDailyCloseLineConcept,
  PointOfSaleDailyCloseLineSection,
  PointOfSaleDailyCloseStatus,
  PurchaseStatus,
  RouteSettlementStatus,
  SaleChannel,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';

/* ------------------------------------------------------------------ *
 * Constants & deterministic helpers
 * ------------------------------------------------------------------ */

/**
 * Idempotency prefix used for every entity created by the operational seed.
 * Allows the seed to be re-run by deleting rows whose idempotency key
 * starts with this prefix, without ever touching base seed rows or rows
 * created by the application's services.
 */
export const SEED_IDEMPOTENCY_PREFIX = 'seed-op-';

/** All operational seed rows are tagged with this marker. */
export const SEED_TAG = 'SEED-OPERATIONAL';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Stable id derived from a stable label. Lets the seed upsert on a
 * deterministic key instead of relying on auto-generated cuids.
 */
export function seedId(label: string): string {
  // Prefix with a recognizable namespace so DB rows are easy to identify.
  return `seedop_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function seedIdempotencyKey(label: string): string {
  return `${SEED_IDEMPOTENCY_PREFIX}${label}`;
}

/**
 * Replicate SalesService.nextSaleNumber without the count()+1 race.
 * Produces a stable SALE-SEED-NNNNNN sequence, unique against production
 * SALE-NNNNNN numbers (the production format uses 6 digits, no "SEED").
 */
export function seedSaleNumber(index: number): string {
  return `SALE-SEED-${String(index).padStart(6, '0')}`;
}

export function seedPurchaseNumber(index: number): string {
  return `PUR-SEED-${String(index).padStart(6, '0')}`;
}

export function seedTransferNumber(index: number): string {
  return `TRF-SEED-${String(index).padStart(6, '0')}`;
}

export function seedDailyCloseNumber(locationCode: string, businessDate: Date): string {
  const yyyymmdd = businessDate.toISOString().slice(0, 10).replace(/-/g, '');
  return `PDC-SEED-${locationCode}-${yyyymmdd}`;
}

/* ------------------------------------------------------------------ *
 * Aging logic — mirrors AccountsReceivableService.resolveAgingStatus
 * plus the DUE_SOON enrichment the frontend expects (7 day window).
 * ------------------------------------------------------------------ */

export function resolveAgingStatus(dueDate: Date, asOf: Date, outstanding: number): AgingStatus {
  if (outstanding <= 0) return AgingStatus.CURRENT;
  if (asOf > dueDate) return AgingStatus.OVERDUE;
  if (daysBetween(asOf, dueDate) <= 7) return AgingStatus.DUE_SOON;
  return AgingStatus.CURRENT;
}

export function calculateDaysOverdue(dueDate: Date, asOf: Date, outstanding: number): number {
  if (outstanding <= 0 || asOf <= dueDate) return 0;
  return daysBetween(dueDate, asOf);
}

/* ------------------------------------------------------------------ *
 * Static seed configuration
 * ------------------------------------------------------------------ */

export type SeedCommercialPolicy = {
  id: string;
  name: string;
  description: string;
  customerType: CustomerType;
  defaultCreditLimit: number;
  defaultCreditDays: number;
  overdueBlockingMode: string;
  creditLimitBlockingMode: string;
  allowAdministrativeOverride: boolean;
};

export const seedCommercialPolicies: SeedCommercialPolicy[] = [
  {
    id: seedId('policy-retail'),
    name: 'Política menudeo',
    description: 'Crédito corto para clientes de mostrador con pago rápido.',
    customerType: CustomerType.RETAIL,
    defaultCreditLimit: 5000,
    defaultCreditDays: 7,
    overdueBlockingMode: 'WARN_ONLY',
    creditLimitBlockingMode: 'HARD_BLOCK',
    allowAdministrativeOverride: true,
  },
  {
    id: seedId('policy-wholesale'),
    name: 'Política mayoreo',
    description: 'Crédito intermedio para mayoristas con historial verificable.',
    customerType: CustomerType.WHOLESALE,
    defaultCreditLimit: 45000,
    defaultCreditDays: 15,
    overdueBlockingMode: 'BLOCK_NEW_CREDIT',
    creditLimitBlockingMode: 'HARD_BLOCK',
    allowAdministrativeOverride: true,
  },
  {
    id: seedId('policy-institutional'),
    name: 'Política institucional',
    description: 'Línea alta para escuelas, hospitales y comedores.',
    customerType: CustomerType.INSTITUTIONAL,
    defaultCreditLimit: 120000,
    defaultCreditDays: 30,
    overdueBlockingMode: 'BLOCK_NEW_CREDIT',
    creditLimitBlockingMode: 'REVIEW_REQUIRED',
    allowAdministrativeOverride: false,
  },
];

export type SeedSupplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export const seedSuppliers: SeedSupplier[] = [
  {
    id: seedId('supplier-pollo-fino'),
    name: 'Pollería Fino S.A. de C.V.',
    phone: '229-210-1111',
    email: 'ventas@polleriafino.example',
    address: 'Carretera Xalapa-Veracruz km 12.5, Veracruz',
  },
  {
    id: seedId('supplier-avianorsa'),
    name: 'Avianorsa Distribución',
    phone: '229-210-2222',
    email: 'pedidos@avianorsa.example',
    address: 'Parque Industrial Brian 23, Boca del Río',
  },
  {
    id: seedId('supplier-el-patron'),
    name: 'Proveedor El Patrón',
    phone: '229-210-3333',
    email: 'contacto@elpatron.example',
    address: 'Av. Ruiz Cortines 1500, Veracruz',
  },
  {
    id: seedId('supplier-teziutlan'),
    name: 'Distribuidora Teziutlán',
    phone: '229-210-4444',
    email: 'comercial@teziutlan.example',
    address: ' Blvd. Miguel Alemán 600, Veracruz',
  },
];

/**
 * Route stock locations. Each DeliveryRoute requires a ROUTE_STOCK
 * OperationalLocation (1:1 via routeStockLocationId). The branch
 * locations already exist from the base seed (VER, BDR, ALV); these
 * route stock sub-locations are created by the operational seed and
 * parented to the corresponding branch.
 */
export type SeedRouteStockLocation = {
  id: string;
  name: string;
  code: string;
  parentIdByCode: string;
};

export const seedRouteStockLocations: SeedRouteStockLocation[] = [
  {
    id: seedId('route-stock-veracruz'),
    name: 'Ruta stock Veracruz',
    code: 'RUTA-VER',
    parentIdByCode: 'VER',
  },
  {
    id: seedId('route-stock-boca-del-rio'),
    name: 'Ruta stock Boca del Río',
    code: 'RUTA-BDR',
    parentIdByCode: 'BDR',
  },
  {
    id: seedId('route-stock-alvarado'),
    name: 'Ruta stock Alvarado',
    code: 'RUTA-ALV',
    parentIdByCode: 'ALV',
  },
];

/**
 * External point of sale operational locations (for EXTERNAL_POINT_OF_SALE
 * sale channel). Required by SalesService.assertLocationMatchesSaleChannel.
 */
export type SeedExternalPosLocation = {
  id: string;
  name: string;
  code: string;
  parentIdByCode: string;
};

export const seedExternalPosLocations: SeedExternalPosLocation[] = [
  {
    id: seedId('pos-mercado-zaragoza'),
    name: 'Punto de venta externo Mercado Zaragoza',
    code: 'POS-MZG',
    parentIdByCode: 'VER',
  },
  {
    id: seedId('pos-plaza-americas'),
    name: 'Punto de venta externo Plaza Américas',
    code: 'POS-PLA',
    parentIdByCode: 'BDR',
  },
];

export type SeedRoute = {
  id: string;
  name: string;
  driverEmail: string;
  originLocationCode: string;
  routeStockLocationId: string;
  scheduledDateOffsetDays: number;
};

export const seedRoutes: SeedRoute[] = [
  {
    id: seedId('route-veracruz-norte'),
    name: 'Ruta Veracruz Norte',
    driverEmail: 'dev.driver@pollos.local',
    originLocationCode: 'VER',
    routeStockLocationId: seedId('route-stock-veracruz'),
    scheduledDateOffsetDays: -2,
  },
  {
    id: seedId('route-boca-del-rio-sur'),
    name: 'Ruta Boca del Río Sur',
    driverEmail: 'dev.driver@pollos.local',
    originLocationCode: 'BDR',
    routeStockLocationId: seedId('route-stock-boca-del-rio'),
    scheduledDateOffsetDays: -1,
  },
  {
    id: seedId('route-alvarado-costa'),
    name: 'Ruta Alvarado Costa',
    driverEmail: 'dev.driver@pollos.local',
    originLocationCode: 'ALV',
    routeStockLocationId: seedId('route-stock-alvarado'),
    scheduledDateOffsetDays: -3,
  },
];

export type SeedCustomer = {
  id: string;
  customerNumber: string;
  name: string;
  commercialName?: string;
  phone?: string;
  email?: string;
  billingEmail?: string;
  address?: string;
  customerType: CustomerType;
  creditLimit?: number;
  creditDays?: number;
  creditStatus: CreditStatus;
  requiresBilling: boolean;
  assignedRouteId?: string;
  commercialPolicyId: string;
};

/**
 * 20 customers spread across the three retail types and the three routes.
 * Some are blocked/suspended to exercise the UI badges.
 */
export const seedCustomers: SeedCustomer[] = [
  // Retail — public counter
  {
    id: seedId('customer-maria-lopez'),
    customerNumber: 'C-0001',
    name: 'María López',
    phone: '229-300-1001',
    email: 'maria.lopez@example.com',
    address: 'Calle Libertad 12, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 3000,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-juan-perez'),
    customerNumber: 'C-0002',
    name: 'Juan Pérez',
    phone: '229-300-1002',
    email: 'juan.perez@example.com',
    address: 'Calle Mina 45, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 2500,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-carmen-ruiz'),
    customerNumber: 'C-0003',
    name: 'Carmen Ruíz',
    phone: '229-300-1003',
    address: 'Av. Diaz Miron 200, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 1800,
    creditDays: 7,
    creditStatus: CreditStatus.BLOCKED,
    requiresBilling: false,
    assignedRouteId: seedId('route-boca-del-rio-sur'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-luis-ortiz'),
    customerNumber: 'C-0004',
    name: 'Luis Ortiz',
    phone: '229-300-1004',
    address: 'Callejon Zaragoza 88, Boca del Río',
    customerType: CustomerType.RETAIL,
    creditLimit: 0,
    creditDays: 0,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    commercialPolicyId: seedId('policy-retail'),
  },
  // Wholesale
  {
    id: seedId('customer-polleria-la-gallina'),
    customerNumber: 'W-0001',
    name: 'Pollería La Gallina Feliz',
    commercialName: 'La Gallina Feliz',
    phone: '229-300-2001',
    email: 'compras@lagallinafeliz.example',
    billingEmail: 'facturacion@lagallinafeliz.example',
    address: 'Blvd. Adolfo Ruiz Cortines 1850, Veracruz',
    customerType: CustomerType.WHOLESALE,
    creditLimit: 30000,
    creditDays: 15,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-wholesale'),
  },
  {
    id: seedId('customer-distribuciones-del-puerto'),
    customerNumber: 'W-0002',
    name: 'Distribuciones del Puerto',
    commercialName: 'Del Puerto',
    phone: '229-300-2002',
    email: 'compras@delpuerto.example',
    billingEmail: 'facturacion@delpuerto.example',
    address: 'Av. Ruiz Cortines 2200, Boca del Río',
    customerType: CustomerType.WHOLESALE,
    creditLimit: 42000,
    creditDays: 15,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-boca-del-rio-sur'),
    commercialPolicyId: seedId('policy-wholesale'),
  },
  {
    id: seedId('customer-pollo-y-mas'),
    customerNumber: 'W-0003',
    name: 'Pollo y Más',
    phone: '229-300-2003',
    address: 'Calle Mocambo 100, Boca del Río',
    customerType: CustomerType.WHOLESALE,
    creditLimit: 15000,
    creditDays: 15,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-boca-del-rio-sur'),
    commercialPolicyId: seedId('policy-wholesale'),
  },
  {
    id: seedId('customer-aves-mexico'),
    customerNumber: 'W-0004',
    name: 'Aves México',
    phone: '229-300-2004',
    address: 'Prol. Díaz Miron 400, Veracruz',
    customerType: CustomerType.WHOLESALE,
    creditLimit: 5000,
    creditDays: 15,
    creditStatus: CreditStatus.SUSPENDED,
    requiresBilling: false,
    commercialPolicyId: seedId('policy-wholesale'),
  },
  // Institutional
  {
    id: seedId('customer-secundaria-10'),
    customerNumber: 'I-0001',
    name: 'Escuela Secundaria 10',
    phone: '229-300-3001',
    email: 'compras@secundaria10.example',
    billingEmail: 'facturacion@secundaria10.example',
    address: 'Calle Reverendo 500, Veracruz',
    customerType: CustomerType.INSTITUTIONAL,
    creditLimit: 80000,
    creditDays: 30,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-institutional'),
  },
  {
    id: seedId('customer-hospital-regional'),
    customerNumber: 'I-0002',
    name: 'Hospital Regional Veracruz',
    phone: '229-300-3002',
    email: 'compras@hrv.example',
    billingEmail: 'facturacion@hrv.example',
    address: 'Av. Salvador Diaz Miron 740, Veracruz',
    customerType: CustomerType.INSTITUTIONAL,
    creditLimit: 110000,
    creditDays: 30,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-alvarado-costa'),
    commercialPolicyId: seedId('policy-institutional'),
  },
  {
    id: seedId('customer-comedor-universitario'),
    customerNumber: 'I-0003',
    name: 'Comedor Universitario UV',
    phone: '229-300-3003',
    address: 'Campus USBI, Xalapa-Veracruz km 3, Veracruz',
    customerType: CustomerType.INSTITUTIONAL,
    creditLimit: 60000,
    creditDays: 30,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-alvarado-costa'),
    commercialPolicyId: seedId('policy-institutional'),
  },
  // More retail customers spread across routes
  {
    id: seedId('customer-rosa-martinez'),
    customerNumber: 'C-0005',
    name: 'Rosa Martínez',
    phone: '229-300-1010',
    address: 'Callejon Las Palmas 15, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 2000,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-pedro-diaz'),
    customerNumber: 'C-0006',
    name: 'Pedro Díaz',
    phone: '229-300-1011',
    address: 'Callejon Hidalgo 23, Boca del Río',
    customerType: CustomerType.RETAIL,
    creditLimit: 2200,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-boca-del-rio-sur'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-ana-torres'),
    customerNumber: 'C-0007',
    name: 'Ana Torres',
    phone: '229-300-1012',
    address: 'Malecón 100, Alvarado',
    customerType: CustomerType.RETAIL,
    creditLimit: 1500,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-alvarado-costa'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-jose-hernandez'),
    customerNumber: 'C-0008',
    name: 'José Hernández',
    phone: '229-300-1013',
    address: 'Calle 5 de Mayo 8, Alvarado',
    customerType: CustomerType.RETAIL,
    creditLimit: 1700,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    assignedRouteId: seedId('route-alvarado-costa'),
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-fernanda-velazquez'),
    customerNumber: 'C-0009',
    name: 'Fernanda Velázquez',
    phone: '229-300-1014',
    address: 'Av. Independencia 320, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 0,
    creditDays: 0,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    commercialPolicyId: seedId('policy-retail'),
  },
  {
    id: seedId('customer-gabriel-mora'),
    customerNumber: 'C-0010',
    name: 'Gabriel Mora',
    phone: '229-300-1015',
    address: 'Callejon la Cañada 7, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 900,
    creditDays: 7,
    creditStatus: CreditStatus.SUSPENDED,
    requiresBilling: false,
    commercialPolicyId: seedId('policy-retail'),
  },
  // One more wholesale
  {
    id: seedId('customer-aves-del-bajio'),
    customerNumber: 'W-0005',
    name: 'Aves del Bajío',
    phone: '229-300-2005',
    address: 'Av. Allende 800, Veracruz',
    customerType: CustomerType.WHOLESALE,
    creditLimit: 20000,
    creditDays: 15,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-boca-del-rio-sur'),
    commercialPolicyId: seedId('policy-wholesale'),
  },
  // One more institutional
  {
    id: seedId('customer-colegio-cervantes'),
    customerNumber: 'I-0004',
    name: 'Colegio Cervantes',
    phone: '229-300-3004',
    email: 'compras@cervantes.example',
    address: 'Av. Diaz Miron 730, Veracruz',
    customerType: CustomerType.INSTITUTIONAL,
    creditLimit: 50000,
    creditDays: 30,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: true,
    assignedRouteId: seedId('route-veracruz-norte'),
    commercialPolicyId: seedId('policy-institutional'),
  },
  // Retail without route (counter only)
  {
    id: seedId('customer-pablo-castro'),
    customerNumber: 'C-0011',
    name: 'Pablo Castro',
    phone: '229-300-1016',
    address: 'Callejon Reforma 14, Veracruz',
    customerType: CustomerType.RETAIL,
    creditLimit: 1200,
    creditDays: 7,
    creditStatus: CreditStatus.ACTIVE,
    requiresBilling: false,
    commercialPolicyId: seedId('policy-retail'),
  },
];

/* ------------------------------------------------------------------ *
 * Numerical enums re-exported for ergonomic imports in the orchestrator
 * ------------------------------------------------------------------ */

export {
  AgingStatus,
  CollectionStatus,
  CreditStatus,
  CustomerType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  InventoryTransferStatus,
  MovementChannel,
  OperationalLocationType,
  PaymentMethod,
  PaymentStatus,
  PointOfSaleDailyCloseLineConcept,
  PointOfSaleDailyCloseLineSection,
  PointOfSaleDailyCloseStatus,
  PurchaseStatus,
  RouteSettlementStatus,
  SaleChannel,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
};
