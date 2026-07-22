import { createHash } from 'node:crypto'
import {
  Prisma,
  PrismaClient,
  AgingStatus,
  CollectionStatus,
  CashMovementType,
  DeliveryOrderStatus,
  DeliveryRouteStatus,
  InventoryMovementType,
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
  type ProductUnit,
} from '@prisma/client'
import { assertSeedEnvironment } from './seed-guard';
import {
  addDays,
  calculateDaysOverdue,
  daysBetween,
  resolveAgingStatus,
  roundMoney,
  roundQuantity,
  SEED_IDEMPOTENCY_PREFIX,
  SEED_TAG,
  seedCommercialPolicies,
  seedCustomers,
  seedDailyCloseNumber,
  seedExternalPosLocations,
  seedId,
  seedIdempotencyKey,
  seedPurchaseNumber,
  seedRouteStockLocations,
  seedRoutes,
  seedSaleNumber,
  seedSuppliers,
  seedTransferNumber,
} from './seed.operational.data'

type BaseUser = { id: string; email: string; name: string }
type BaseLocation = { id: string; code: string; name: string; type: OperationalLocationType }
type BaseProduct = {
  id: string
  sku: string | null
  name: string
  unit: ProductUnit
  salePrice: Prisma.Decimal | number | string
  purchaseCost: Prisma.Decimal | number | string
  minStock: Prisma.Decimal | number | string
}

type ProductLine = {
  productId: string
  productSku: string | null
  productName: string
  unit: ProductUnit
  unitPrice: number
  quantityKg: number
  quantityPieces: number
  unitEquivalentId: string | null
  appliedEquivalentFactor: number | null
  roundingMode: string | null
}

type SalePlan = {
  id: string
  saleNumber: string
  saleDate: Date
  saleChannel: SaleChannel
  paymentType: SalePaymentType
  locationId: string
  customerId: string | null
  customerType: string | null
  customerName: string | null
  commercialPolicyId: string | null
  routeId: string | null
  documentType: SaleDocumentType
  physicalFolio: string | null
  requiresAdministrativeInvoice: boolean
  userId: string
  discount: number
  items: ProductLine[]
  initialPaymentAmount: number
  initialPaymentMethod: PaymentMethod | null
  initialPaymentAt: Date | null
  expectedOutstanding: number
  scaleTicketFolio: string | null
}

type PurchasePlan = {
  id: string
  purchaseNumber: string
  purchaseDate: Date
  locationId: string
  supplierId: string
  userId: string
  items: ProductLine[]
}

type TransferPlan = {
  id: string
  transferNumber: string
  requestedAt: Date
  originLocationId: string
  destinationLocationId: string
  userId: string
  items: ProductLine[]
}

type DailyClosePlan = {
  id: string
  businessDate: Date
  locationId: string
  openedByUserId: string
}

type SeedContext = {
  adminUser: BaseUser
  sellerUser: BaseUser
  warehouseUser: BaseUser
  driverUser: BaseUser
  collectionsUser: BaseUser
  branchLocationsByCode: Map<string, BaseLocation>
  productsBySku: Map<string, BaseProduct>
  routeStockLocations: Map<string, { id: string; code: string }>
  externalPosLocations: Map<string, { id: string; code: string }>
}

type InventoryChange = {
  product: BaseProduct
  locationId: string
  quantityKg: number
  quantityPieces: number
  previousQuantityKg: number
  previousQuantityPieces: number
  newQuantityKg: number
  newQuantityPieces: number
}

const PURCHASE_COUNT = 12
const TRANSFER_COUNT = 5
const SALES_PER_DAY = 5
const SALES_DAYS = 30
const SALES_COUNT = SALES_PER_DAY * SALES_DAYS
const DAILY_CLOSE_COUNT = 9

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}

function seedNotes(label: string): string {
  return `${SEED_TAG} :: ${label}`
}

function buildProductLine(product: BaseProduct, quantityKg: number, quantityPieces: number, index: number): ProductLine {
  const unitPrice = roundMoney(toNumber(product.salePrice))
  const quantity = quantityKg > 0 ? quantityKg : quantityPieces
  return {
    productId: product.id,
    productSku: product.sku,
    productName: product.name,
    unit: product.unit,
    unitPrice,
    quantityKg: roundQuantity(quantityKg),
    quantityPieces,
    unitEquivalentId: null,
    appliedEquivalentFactor: null,
    roundingMode: null,
  }
}

function buildLineSubtotal(line: ProductLine): number {
  return roundMoney(line.unitPrice * (line.quantityKg > 0 ? line.quantityKg : line.quantityPieces))
}

function buildSaleItemLines(products: BaseProduct[], saleIndex: number, saleChannel: SaleChannel): ProductLine[] {
  const whole = products.find((product) => product.sku === 'DEV-WHOLE-CHICKEN-KG') ?? products[0]
  const breast = products.find((product) => product.sku === 'DEV-BREAST-KG') ?? products[1]
  const wings = products.find((product) => product.sku === 'DEV-WINGS-PIECE') ?? products[2]

  const mod = saleIndex % 4
  if (saleChannel === SaleChannel.ROUTE) {
    return [
      buildProductLine(whole, roundQuantity(1.8 + (mod * 0.3)), 0, saleIndex),
      buildProductLine(wings, 0, 6 + mod * 2, saleIndex),
    ]
  }

  if (saleChannel === SaleChannel.WHOLESALE) {
    return [
      buildProductLine(whole, roundQuantity(4.5 + mod), 0, saleIndex),
      buildProductLine(breast, roundQuantity(2.25 + mod * 0.5), 0, saleIndex),
    ]
  }

  if (saleChannel === SaleChannel.INSTITUTIONAL) {
    return [
      buildProductLine(whole, roundQuantity(6 + mod), 0, saleIndex),
      buildProductLine(breast, roundQuantity(3.5 + mod), 0, saleIndex),
      buildProductLine(wings, 0, 12 + mod * 3, saleIndex),
    ]
  }

  if (saleChannel === SaleChannel.EXTERNAL_POINT_OF_SALE) {
    return [
      buildProductLine(whole, roundQuantity(1.2 + mod * 0.2), 0, saleIndex),
      buildProductLine(wings, 0, 5 + mod, saleIndex),
    ]
  }

  // COUNTER
  if (mod % 2 === 0) {
    return [
      buildProductLine(whole, roundQuantity(1.5 + mod * 0.25), 0, saleIndex),
      buildProductLine(wings, 0, 4 + mod, saleIndex),
    ]
  }

  return [
    buildProductLine(breast, roundQuantity(1.8 + mod * 0.3), 0, saleIndex),
    buildProductLine(wings, 0, 5 + mod, saleIndex),
  ]
}

function buildSalesPlans(ctx: SeedContext, baseDate: Date): SalePlan[] {
  const retailCustomers = seedCustomers.filter((customer) => customer.customerType === 'RETAIL')
  const wholesaleCustomers = seedCustomers.filter((customer) => customer.customerType === 'WHOLESALE')
  const institutionalCustomers = seedCustomers.filter((customer) => customer.customerType === 'INSTITUTIONAL')
  const routeCustomers = seedCustomers.filter((customer) => customer.assignedRouteId)
  const branchCodes = ['VER', 'BDR', 'ALV']
  const routes = seedRoutes
  const branchLocations = Array.from(ctx.branchLocationsByCode.values())
  const firstBranch = branchLocations[0]
  const externalLocations = seedExternalPosLocations

  const plans: SalePlan[] = []
  for (let day = 0; day < SALES_DAYS; day += 1) {
    const dayBase = addDays(baseDate, day)
    const route = routes[day % routes.length]
    const branchLocation = ctx.branchLocationsByCode.get(branchCodes[day % branchCodes.length])
    const routeLocation = route.routeStockLocationId
    const externalLocation = externalLocations[day % externalLocations.length].id

    const daySales: Array<Pick<SalePlan, 'saleChannel' | 'paymentType' | 'locationId' | 'customerId' | 'customerType' | 'customerName' | 'commercialPolicyId' | 'routeId' | 'documentType' | 'requiresAdministrativeInvoice' | 'initialPaymentAmount' | 'initialPaymentMethod' | 'scaleTicketFolio'>> = [
      {
        saleChannel: SaleChannel.COUNTER,
        paymentType: day % 2 === 0 ? SalePaymentType.CASH_SALE : SalePaymentType.CREDIT_SALE,
        locationId: branchLocation?.id ?? firstBranch.id,
        customerId: retailCustomers[day % retailCustomers.length].id,
        customerType: retailCustomers[day % retailCustomers.length].customerType,
        customerName: retailCustomers[day % retailCustomers.length].name,
        commercialPolicyId: retailCustomers[day % retailCustomers.length].commercialPolicyId,
        routeId: null,
        documentType: day % 3 === 0 ? SaleDocumentType.SIMPLE_NOTE : SaleDocumentType.INTERNAL_RECEIPT,
        requiresAdministrativeInvoice: false,
        initialPaymentAmount: 0,
        initialPaymentMethod: day % 2 === 0 ? PaymentMethod.CASH : PaymentMethod.CARD,
        scaleTicketFolio: day % 3 === 0 ? `STK-${day + 1}` : null,
      },
      {
        saleChannel: SaleChannel.COUNTER,
        paymentType: day % 4 === 0 ? SalePaymentType.CREDIT_SALE : SalePaymentType.CASH_SALE,
        locationId: branchLocation?.id ?? firstBranch.id,
        customerId: day % 4 === 0 ? retailCustomers[(day + 3) % retailCustomers.length].id : day % 5 === 0 ? null : retailCustomers[(day + 3) % retailCustomers.length].id,
        customerType: day % 4 === 0 ? retailCustomers[(day + 3) % retailCustomers.length].customerType : day % 5 === 0 ? null : retailCustomers[(day + 3) % retailCustomers.length].customerType,
        customerName: day % 4 === 0 ? retailCustomers[(day + 3) % retailCustomers.length].name : day % 5 === 0 ? null : retailCustomers[(day + 3) % retailCustomers.length].name,
        commercialPolicyId: day % 4 === 0 ? retailCustomers[(day + 3) % retailCustomers.length].commercialPolicyId : day % 5 === 0 ? null : retailCustomers[(day + 3) % retailCustomers.length].commercialPolicyId,
        routeId: null,
        documentType: SaleDocumentType.LARGE_NOTE,
        requiresAdministrativeInvoice: false,
        initialPaymentAmount: 0,
        initialPaymentMethod: day % 4 === 0 ? PaymentMethod.TRANSFER : PaymentMethod.CASH,
        scaleTicketFolio: null,
      },
      {
        saleChannel: SaleChannel.ROUTE,
        paymentType: day % 10 === 0 ? SalePaymentType.CASH_SALE : SalePaymentType.CREDIT_SALE,
        locationId: routeLocation,
        customerId: routeCustomers[(day + 1) % routeCustomers.length].id,
        customerType: routeCustomers[(day + 1) % routeCustomers.length].customerType,
        customerName: routeCustomers[(day + 1) % routeCustomers.length].name,
        commercialPolicyId: routeCustomers[(day + 1) % routeCustomers.length].commercialPolicyId,
        routeId: route.id,
        documentType: SaleDocumentType.SCALE_TICKET,
        requiresAdministrativeInvoice: routeCustomers[(day + 1) % routeCustomers.length].requiresBilling,
        initialPaymentAmount: 0,
        initialPaymentMethod: day % 10 === 0 ? PaymentMethod.CASH : PaymentMethod.TRANSFER,
        scaleTicketFolio: `STK-${day + 101}`,
      },
      {
        saleChannel: SaleChannel.WHOLESALE,
        paymentType: SalePaymentType.CREDIT_SALE,
        locationId: branchLocation?.id ?? ctx.branchLocationsByCode.values().next().value.id,
        customerId: wholesaleCustomers[day % wholesaleCustomers.length].id,
        customerType: wholesaleCustomers[day % wholesaleCustomers.length].customerType,
        customerName: wholesaleCustomers[day % wholesaleCustomers.length].name,
        commercialPolicyId: wholesaleCustomers[day % wholesaleCustomers.length].commercialPolicyId,
        routeId: null,
        documentType: SaleDocumentType.LARGE_NOTE,
        requiresAdministrativeInvoice: wholesaleCustomers[day % wholesaleCustomers.length].requiresBilling,
        initialPaymentAmount: 0,
        initialPaymentMethod: null,
        scaleTicketFolio: null,
      },
      {
        saleChannel: day % 2 === 0 ? SaleChannel.INSTITUTIONAL : SaleChannel.EXTERNAL_POINT_OF_SALE,
        paymentType: day % 2 === 0 ? SalePaymentType.CREDIT_SALE : SalePaymentType.CASH_SALE,
        locationId: day % 2 === 0 ? branchLocation?.id ?? firstBranch.id : externalLocation,
        customerId: day % 2 === 0 ? institutionalCustomers[day % institutionalCustomers.length].id : retailCustomers[(day + 7) % retailCustomers.length].id,
        customerType: day % 2 === 0 ? institutionalCustomers[day % institutionalCustomers.length].customerType : retailCustomers[(day + 7) % retailCustomers.length].customerType,
        customerName: day % 2 === 0 ? institutionalCustomers[day % institutionalCustomers.length].name : retailCustomers[(day + 7) % retailCustomers.length].name,
        commercialPolicyId: day % 2 === 0 ? institutionalCustomers[day % institutionalCustomers.length].commercialPolicyId : retailCustomers[(day + 7) % retailCustomers.length].commercialPolicyId,
        routeId: null,
        documentType: day % 4 === 0 ? SaleDocumentType.INTERNAL_RECEIPT : SaleDocumentType.SIMPLE_NOTE,
        requiresAdministrativeInvoice: day % 2 === 0 ? institutionalCustomers[day % institutionalCustomers.length].requiresBilling : false,
        initialPaymentAmount: 0,
        initialPaymentMethod: day % 2 === 0 ? null : PaymentMethod.CASH,
        scaleTicketFolio: null,
      },
    ]

    daySales.forEach((sale, slot) => {
      const index = day * SALES_PER_DAY + slot + 1
      const items = buildSaleItemLines(Array.from(ctx.productsBySku.values()), index, sale.saleChannel)
      const subtotal = roundMoney(items.reduce((sum, item) => sum + buildLineSubtotal(item), 0))
      const discount = sale.saleChannel === SaleChannel.WHOLESALE ? roundMoney((index % 3) * 5) : 0
      const total = roundMoney(subtotal - discount)
      const expectedOutstanding = sale.paymentType === SalePaymentType.CASH_SALE ? 0 : total

      plans.push({
        id: seedId(`sale-${index}`),
        saleNumber: seedSaleNumber(index),
        saleDate: dayBase,
        saleChannel: sale.saleChannel,
        paymentType: sale.paymentType,
        locationId: sale.locationId,
        customerId: sale.customerId,
        customerType: sale.customerType,
        customerName: sale.customerName,
        commercialPolicyId: sale.commercialPolicyId,
        routeId: sale.routeId,
        documentType: sale.documentType,
        physicalFolio: sale.documentType === SaleDocumentType.SCALE_TICKET ? sale.scaleTicketFolio ?? `STK-${index}` : null,
        requiresAdministrativeInvoice: sale.requiresAdministrativeInvoice,
        userId: sale.saleChannel === SaleChannel.ROUTE ? ctx.driverUser.id : ctx.sellerUser.id,
        discount,
        items,
        initialPaymentAmount: sale.paymentType === SalePaymentType.CASH_SALE ? total : 0,
        initialPaymentMethod: sale.paymentType === SalePaymentType.CASH_SALE ? sale.initialPaymentMethod : null,
        initialPaymentAt: sale.paymentType === SalePaymentType.CASH_SALE ? dayBase : null,
        expectedOutstanding,
        scaleTicketFolio: sale.scaleTicketFolio,
      })
    })
  }

  return plans
}

function buildPurchasePlans(ctx: SeedContext, baseDate: Date): PurchasePlan[] {
  const plans: PurchasePlan[] = []
  const branchLocations = Array.from(ctx.branchLocationsByCode.values())
  const suppliers = seedSuppliers
  const products = Array.from(ctx.productsBySku.values())
  const whole = products.find((product) => product.sku === 'DEV-WHOLE-CHICKEN-KG') ?? products[0]
  const breast = products.find((product) => product.sku === 'DEV-BREAST-KG') ?? products[1]
  const wings = products.find((product) => product.sku === 'DEV-WINGS-PIECE') ?? products[2]

  for (let index = 1; index <= PURCHASE_COUNT; index += 1) {
    const purchaseDate = addDays(baseDate, Math.floor((index - 1) * (SALES_DAYS / PURCHASE_COUNT)))
    const location = branchLocations[(index - 1) % branchLocations.length]
    const supplier = suppliers[(index - 1) % suppliers.length]

    const lines = [
      buildProductLine(whole, roundQuantity(180 + index * 8), 0, index),
      buildProductLine(breast, roundQuantity(90 + index * 4), 0, index),
      // Wings are consumed by route transfers and counter/external sales in every branch.
      // Replenish them in every purchase plan so each origin location has enough stock.
      buildProductLine(wings, 0, 420 + index * 20, index),
    ]

    plans.push({
      id: seedId(`purchase-${index}`),
      purchaseNumber: seedPurchaseNumber(index),
      purchaseDate,
      locationId: location.id,
      supplierId: supplier.id,
      userId: ctx.warehouseUser.id,
      items: lines,
    })
  }

  return plans
}

function buildTransferPlans(ctx: SeedContext, baseDate: Date): TransferPlan[] {
  const plans: TransferPlan[] = []
  const routes = seedRoutes
  const products = Array.from(ctx.productsBySku.values())
  const externalLocations = seedExternalPosLocations

  for (let index = 1; index <= TRANSFER_COUNT; index += 1) {
    const route = routes[(index - 1) % routes.length]
    const origin = ctx.branchLocationsByCode.get(route.originLocationCode)
    if (!origin) {
      throw new Error(`Missing branch location ${route.originLocationCode}`)
    }

    const items = [
      // Route stock must cover 30 route sales across 3 routes. Seed with a clear buffer.
      buildProductLine(products[0], roundQuantity(70 + index * 10), 0, index),
      buildProductLine(products[2], 0, 240 + index * 30, index),
    ]

    plans.push({
      id: seedId(`transfer-${index}`),
      transferNumber: seedTransferNumber(index),
      requestedAt: addDays(baseDate, 10 + index),
      originLocationId: origin.id,
      destinationLocationId: route.routeStockLocationId,
      userId: ctx.warehouseUser.id,
      items,
    })
  }

  externalLocations.forEach((location, index) => {
    const originCode = location.parentIdByCode
    const origin = ctx.branchLocationsByCode.get(originCode)
    if (!origin) {
      throw new Error(`Missing branch location ${originCode}`)
    }

    plans.push({
      id: seedId(`transfer-external-${index + 1}`),
      transferNumber: seedTransferNumber(TRANSFER_COUNT + index + 1),
      requestedAt: addDays(baseDate, 14 + index),
      originLocationId: origin.id,
      destinationLocationId: location.id,
      userId: ctx.warehouseUser.id,
      items: [
        buildProductLine(products[0], roundQuantity(80 + index * 12), 0, TRANSFER_COUNT + index + 1),
        buildProductLine(products[2], 0, 220 + index * 30, TRANSFER_COUNT + index + 1),
      ],
    })
  })

  return plans
}

function buildDailyClosePlans(ctx: SeedContext, baseDate: Date): DailyClosePlan[] {
  const branchLocations = Array.from(ctx.branchLocationsByCode.values())
  const plans: DailyClosePlan[] = []
  for (let index = 1; index <= DAILY_CLOSE_COUNT; index += 1) {
    plans.push({
      id: seedId(`daily-close-${index}`),
      businessDate: addDays(baseDate, SALES_DAYS - DAILY_CLOSE_COUNT + index - 1),
      locationId: branchLocations[(index - 1) % branchLocations.length].id,
      openedByUserId: ctx.adminUser.id,
    })
  }
  return plans
}

async function loadSeedContext(prisma: PrismaClient): Promise<SeedContext> {
  const [adminUser, sellerUser, warehouseUser, driverUser, collectionsUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'dev.admin@pollos.local' } }),
    prisma.user.findUnique({ where: { email: 'dev.seller@pollos.local' } }),
    prisma.user.findUnique({ where: { email: 'dev.warehouse@pollos.local' } }),
    prisma.user.findUnique({ where: { email: 'dev.driver@pollos.local' } }),
    prisma.user.findUnique({ where: { email: 'dev.collections@pollos.local' } }),
  ])

  const branchLocations = await prisma.operationalLocation.findMany({ where: { code: { in: ['VER', 'BDR', 'ALV'] } } })
  const products = await prisma.product.findMany({ where: { sku: { in: ['DEV-WHOLE-CHICKEN-KG', 'DEV-BREAST-KG', 'DEV-WINGS-PIECE'] } } })

  if (!adminUser || !sellerUser || !warehouseUser || !driverUser || !collectionsUser) {
    throw new Error('Missing base seed users. Run backend/prisma/seed.ts first.')
  }

  if (branchLocations.length !== 3) {
    throw new Error('Missing base seed locations. Run backend/prisma/seed.ts first.')
  }

  if (products.length !== 3) {
    throw new Error('Missing base seed products. Run backend/prisma/seed.ts first.')
  }

  return {
    adminUser: { id: adminUser.id, email: adminUser.email, name: adminUser.name },
    sellerUser: { id: sellerUser.id, email: sellerUser.email, name: sellerUser.name },
    warehouseUser: { id: warehouseUser.id, email: warehouseUser.email, name: warehouseUser.name },
    driverUser: { id: driverUser.id, email: driverUser.email, name: driverUser.name },
    collectionsUser: { id: collectionsUser.id, email: collectionsUser.email, name: collectionsUser.name },
    branchLocationsByCode: new Map(branchLocations.map((location) => [location.code ?? location.name, {
      id: location.id,
      code: location.code ?? location.name,
      name: location.name,
      type: location.type,
    }])),
    productsBySku: new Map(products.map((product) => [product.sku ?? product.name, {
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      salePrice: product.salePrice,
      purchaseCost: product.purchaseCost,
      minStock: product.minStock,
    }])),
    routeStockLocations: new Map(),
    externalPosLocations: new Map(),
  }
}

async function deleteOperationalData(prisma: PrismaClient, ctx: SeedContext, salePlans: SalePlan[], purchasePlans: PurchasePlan[], transferPlans: TransferPlan[], dailyClosePlans: DailyClosePlan[]) {
  const saleIds = salePlans.map((plan) => plan.id)
  const deliveryOrderIds = salePlans.filter((plan) => plan.saleChannel === SaleChannel.ROUTE).map((plan) => seedId(`delivery-order-${plan.saleNumber}`))
  const purchaseIds = purchasePlans.map((plan) => plan.id)
  const transferIds = transferPlans.map((plan) => plan.id)
  const dailyCloseIds = dailyClosePlans.map((plan) => plan.id)
  const routeIds = seedRoutes.map((route) => route.id)
  const routeStockIds = seedRouteStockLocations.map((location) => location.id)
  const externalPosIds = seedExternalPosLocations.map((location) => location.id)
  await prisma.deliveryEvidence.deleteMany({ where: { deliveryOrderId: { in: deliveryOrderIds } } })
  await prisma.deliveryOrder.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.payment.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.accountReceivable.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.saleDocument.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.inventoryMovement.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.scaleTicketReference.deleteMany({ where: { saleId: { in: saleIds } } })
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })

  await prisma.inventoryMovement.deleteMany({ where: { purchaseId: { in: purchaseIds } } })
  await prisma.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } })
  await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } })

  await prisma.inventoryMovement.deleteMany({ where: { transferId: { in: transferIds } } })
  await prisma.inventoryTransferItem.deleteMany({ where: { transferId: { in: transferIds } } })
  await prisma.inventoryTransfer.deleteMany({ where: { id: { in: transferIds } } })

  await prisma.pointOfSaleDailyCloseLine.deleteMany({ where: { pointOfSaleDailyCloseId: { in: dailyCloseIds } } })
  await prisma.cashMovement.deleteMany({ where: { pointOfSaleDailyCloseId: { in: dailyCloseIds } } })
  await prisma.inventoryMovement.deleteMany({ where: { pointOfSaleDailyCloseId: { in: dailyCloseIds } } })
  await prisma.pointOfSaleDailyClose.deleteMany({ where: { id: { in: dailyCloseIds } } })

  await prisma.routeSettlement.deleteMany({ where: { routeId: { in: routeIds } } })
  await prisma.deliveryRoute.deleteMany({ where: { id: { in: routeIds } } })

  await prisma.inventoryBalance.deleteMany({ where: { locationId: { in: [...routeStockIds, ...externalPosIds, ...Array.from(ctx.branchLocationsByCode.values()).map((location) => location.id)] } } })
  await prisma.operationalLocation.deleteMany({ where: { id: { in: [...routeStockIds, ...externalPosIds] } } })
  await prisma.customer.deleteMany({ where: { id: { in: seedCustomers.map((customer) => customer.id) } } })
  await prisma.supplier.deleteMany({ where: { id: { in: seedSuppliers.map((supplier) => supplier.id) } } })
  await prisma.commercialPolicy.deleteMany({ where: { id: { in: seedCommercialPolicies.map((policy) => policy.id) } } })
}

async function upsertCommercialPolicies(prisma: PrismaClient, ctx: SeedContext) {
  for (const policy of seedCommercialPolicies) {
    await prisma.commercialPolicy.upsert({
      where: { id: policy.id },
      update: {
        name: policy.name,
        description: policy.description,
        customerType: policy.customerType,
        defaultCreditLimit: policy.defaultCreditLimit,
        defaultCreditDays: policy.defaultCreditDays,
        overdueBlockingMode: policy.overdueBlockingMode,
        creditLimitBlockingMode: policy.creditLimitBlockingMode,
        allowAdministrativeOverride: policy.allowAdministrativeOverride,
        isActive: true,
        updatedByUserId: ctx.adminUser.id,
      },
      create: {
        id: policy.id,
        name: policy.name,
        description: policy.description,
        customerType: policy.customerType,
        defaultCreditLimit: policy.defaultCreditLimit,
        defaultCreditDays: policy.defaultCreditDays,
        overdueBlockingMode: policy.overdueBlockingMode,
        creditLimitBlockingMode: policy.creditLimitBlockingMode,
        allowAdministrativeOverride: policy.allowAdministrativeOverride,
        isActive: true,
        effectiveFrom: new Date(),
        createdByUserId: ctx.adminUser.id,
        updatedByUserId: ctx.adminUser.id,
      },
    })
  }
}

async function upsertOperationalLocations(prisma: PrismaClient, ctx: SeedContext) {
  const routeStockRecords = seedRouteStockLocations.map((location) => ({
    id: location.id,
    name: location.name,
    code: location.code,
    parentId: ctx.branchLocationsByCode.get(location.parentIdByCode)?.id ?? null,
    type: OperationalLocationType.ROUTE_STOCK,
    address: location.name,
    isActive: true,
  }))

  const externalPosRecords = seedExternalPosLocations.map((location) => ({
    id: location.id,
    name: location.name,
    code: location.code,
    parentId: ctx.branchLocationsByCode.get(location.parentIdByCode)?.id ?? null,
    type: OperationalLocationType.EXTERNAL_POINT_OF_SALE,
    address: location.name,
    isActive: true,
  }))

  for (const location of [...routeStockRecords, ...externalPosRecords]) {
    await prisma.operationalLocation.upsert({
      where: { id: location.id },
      update: location,
      create: location,
    })
  }

  ctx.routeStockLocations = new Map(routeStockRecords.map((location) => [location.id, { id: location.id, code: location.code ?? location.name }]))
  ctx.externalPosLocations = new Map(externalPosRecords.map((location) => [location.id, { id: location.id, code: location.code ?? location.name }]))
}

async function upsertSuppliers(prisma: PrismaClient) {
  for (const supplier of seedSuppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: supplier,
      create: { ...supplier },
    })
  }
}

async function upsertRoutes(prisma: PrismaClient, ctx: SeedContext) {
  for (const route of seedRoutes) {
    const origin = ctx.branchLocationsByCode.get(route.originLocationCode)
    if (!origin) {
      throw new Error(`Missing origin location ${route.originLocationCode}`)
    }

    await prisma.deliveryRoute.upsert({
      where: { id: route.id },
      update: {
        name: route.name,
        driverId: ctx.driverUser.id,
        status: DeliveryRouteStatus.PENDING,
        scheduledDate: addDays(new Date(), route.scheduledDateOffsetDays),
        originLocationId: origin.id,
        routeStockLocationId: route.routeStockLocationId,
      },
      create: {
        id: route.id,
        name: route.name,
        driverId: ctx.driverUser.id,
        status: DeliveryRouteStatus.PENDING,
        scheduledDate: addDays(new Date(), route.scheduledDateOffsetDays),
        originLocationId: origin.id,
        routeStockLocationId: route.routeStockLocationId,
      },
    })
  }
}

async function upsertCustomers(prisma: PrismaClient, ctx: SeedContext) {
  for (const customer of seedCustomers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: {
        customerNumber: customer.customerNumber,
        name: customer.name,
        commercialName: customer.commercialName ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        billingEmail: customer.billingEmail ?? null,
        address: customer.address ?? null,
        customerType: customer.customerType,
        priceListId: null,
        creditLimit: customer.creditLimit ?? null,
        creditDays: customer.creditDays ?? null,
        creditStatus: customer.creditStatus,
        requiresBilling: customer.requiresBilling,
        fiscalName: customer.commercialName ?? customer.name,
        taxId: null,
        fiscalAddress: customer.address ?? null,
        deliveryAddress: customer.address ?? null,
        assignedRouteId: customer.assignedRouteId ?? null,
        commercialPolicyId: customer.commercialPolicyId,
        notes: seedNotes(customer.name),
        isActive: true,
      },
      create: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        commercialName: customer.commercialName ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        billingEmail: customer.billingEmail ?? null,
        address: customer.address ?? null,
        customerType: customer.customerType,
        priceListId: null,
        creditLimit: customer.creditLimit ?? null,
        creditDays: customer.creditDays ?? null,
        creditStatus: customer.creditStatus,
        requiresBilling: customer.requiresBilling,
        fiscalName: customer.commercialName ?? customer.name,
        taxId: null,
        fiscalAddress: customer.address ?? null,
        deliveryAddress: customer.address ?? null,
        assignedRouteId: customer.assignedRouteId ?? null,
        commercialPolicyId: customer.commercialPolicyId,
        notes: seedNotes(customer.name),
        isActive: true,
      },
    })
  }
}

async function applyInventoryDelta(
  tx: Prisma.TransactionClient,
  params: {
    product: BaseProduct
    locationId: string
    quantityKg: number
    quantityPieces: number
    direction: 1 | -1
  },
): Promise<InventoryChange> {
  const { product, locationId, quantityKg, quantityPieces, direction } = params

  if (direction === -1) {
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        productId: product.id,
        locationId,
        quantityKg: { gte: quantityKg },
        quantityPieces: { gte: quantityPieces },
      },
      data: {
        quantityKg: { decrement: quantityKg },
        quantityPieces: { decrement: quantityPieces },
      },
    })

    if (updated.count !== 1) {
      throw new Error(`Insufficient stock for product ${product.name} (${product.id}) at location ${locationId}; requiredKg=${quantityKg}; requiredPieces=${quantityPieces}`)
    }
  } else {
    await tx.inventoryBalance.upsert({
      where: { productId_locationId: { productId: product.id, locationId } },
      create: {
        productId: product.id,
        locationId,
        quantityKg,
        quantityPieces,
        minQuantityKg: toNumber(product.minStock),
        minQuantityPieces: 0,
      },
      update: {
        quantityKg: { increment: quantityKg },
        quantityPieces: { increment: quantityPieces },
        minQuantityKg: toNumber(product.minStock),
      },
    })
  }

  const balance = await tx.inventoryBalance.findUnique({ where: { productId_locationId: { productId: product.id, locationId } } })
  if (!balance) {
    throw new Error('Inventory balance could not be resolved')
  }

  const newQuantityKg = toNumber(balance.quantityKg)
  const newQuantityPieces = balance.quantityPieces
  return {
    product,
    locationId,
    quantityKg,
    quantityPieces,
    previousQuantityKg: roundQuantity(newQuantityKg - direction * quantityKg),
    previousQuantityPieces: newQuantityPieces - direction * quantityPieces,
    newQuantityKg,
    newQuantityPieces,
  }
}

async function createInventoryMovement(
  tx: Prisma.TransactionClient,
  params: {
    change: InventoryChange
    userId: string
    type: InventoryMovementType
    reason: string
    referenceType: string
    referenceId: string
    saleId?: string | null
    purchaseId?: string | null
    transferId?: string | null
    pointOfSaleDailyCloseId?: string | null
    routeSettlementId?: string | null
  },
) {
  const { change, userId, type, reason, referenceType, referenceId, saleId, purchaseId, transferId, pointOfSaleDailyCloseId, routeSettlementId } = params

  await tx.inventoryMovement.create({
    data: {
      productId: change.product.id,
      locationId: change.locationId,
      userId,
      type,
      quantity: change.quantityKg > 0 ? change.quantityKg : change.quantityPieces,
      quantityKg: change.quantityKg,
      quantityPieces: change.quantityPieces,
      previousStock: change.previousQuantityKg,
      newStock: change.newQuantityKg,
      previousQuantityKg: change.previousQuantityKg,
      newQuantityKg: change.newQuantityKg,
      previousQuantityPieces: change.previousQuantityPieces,
      newQuantityPieces: change.newQuantityPieces,
      reason,
      referenceType,
      referenceId,
      saleId: saleId ?? null,
      purchaseId: purchaseId ?? null,
      transferId: transferId ?? null,
      pointOfSaleDailyCloseId: pointOfSaleDailyCloseId ?? null,
      routeSettlementId: routeSettlementId ?? null,
    },
  })
}

async function seedPurchases(prisma: PrismaClient, ctx: SeedContext, baseDate: Date, plans: PurchasePlan[]) {
  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      const subtotal = roundMoney(plan.items.reduce((sum, item) => sum + buildLineSubtotal(item), 0))
      await tx.purchase.create({
        data: {
          id: plan.id,
          purchaseNumber: plan.purchaseNumber,
          supplierId: plan.supplierId,
          userId: plan.userId,
          locationId: plan.locationId,
          subtotal,
          total: subtotal,
          status: PurchaseStatus.CONFIRMED,
          createdAt: plan.purchaseDate,
        },
      })

      await tx.purchaseItem.createMany({
        data: plan.items.map((item, itemIndex) => ({
          id: seedId(`purchase-item-${plan.purchaseNumber}-${itemIndex + 1}`),
          purchaseId: plan.id,
          productId: item.productId,
          quantity: item.quantityKg > 0 ? item.quantityKg : item.quantityPieces,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          unit: item.unit,
          unitCost: item.unitPrice,
          unitEquivalentId: null,
          appliedEquivalentFactor: null,
          subtotal: buildLineSubtotal(item),
          createdAt: plan.purchaseDate,
        })),
      })

      for (const [itemIndex, item] of plan.items.entries()) {
        const product = ctx.productsBySku.get(item.productSku ?? item.productName)
        if (!product) {
          throw new Error(`Missing product ${item.productName}`)
        }

        const change = await applyInventoryDelta(tx, {
          product,
          locationId: plan.locationId,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          direction: 1,
        })

        await createInventoryMovement(tx, {
          change,
          userId: plan.userId,
          type: InventoryMovementType.PURCHASE,
          reason: seedNotes(`Purchase ${plan.purchaseNumber}`),
          referenceType: 'PURCHASE',
          referenceId: plan.id,
          purchaseId: plan.id,
        })
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}

async function seedTransfers(prisma: PrismaClient, ctx: SeedContext, plans: TransferPlan[]) {
  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransfer.create({
        data: {
          id: plan.id,
          transferNumber: plan.transferNumber,
          originLocationId: plan.originLocationId,
          destinationLocationId: plan.destinationLocationId,
          userId: plan.userId,
          status: InventoryTransferStatus.REQUESTED,
          notes: seedNotes(`Transfer ${plan.transferNumber}`),
          requestedAt: plan.requestedAt,
          items: {
            create: plan.items.map((item, itemIndex) => ({
              id: seedId(`transfer-item-${plan.transferNumber}-${itemIndex + 1}`),
              productId: item.productId,
              quantityKg: item.quantityKg > 0 ? item.quantityKg : null,
              quantityPieces: item.quantityPieces > 0 ? item.quantityPieces : null,
              unit: item.unit,
              createdAt: plan.requestedAt,
            })),
          },
        },
      })

      for (const [itemIndex, item] of plan.items.entries()) {
        const product = ctx.productsBySku.get(item.productSku ?? item.productName)
        if (!product) {
          throw new Error(`Missing product ${item.productName}`)
        }

        const originChange = await applyInventoryDelta(tx, {
          product,
          locationId: plan.originLocationId,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          direction: -1,
        })

        await createInventoryMovement(tx, {
          change: originChange,
          userId: plan.userId,
          type: InventoryMovementType.TRANSFER_OUT,
          reason: seedNotes(`Transfer out ${plan.transferNumber}`),
          referenceType: 'TRANSFER',
          referenceId: plan.id,
          transferId: plan.id,
        })

        const destinationChange = await applyInventoryDelta(tx, {
          product,
          locationId: plan.destinationLocationId,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          direction: 1,
        })

        await createInventoryMovement(tx, {
          change: destinationChange,
          userId: plan.userId,
          type: InventoryMovementType.TRANSFER_IN,
          reason: seedNotes(`Transfer in ${plan.transferNumber}`),
          referenceType: 'TRANSFER',
          referenceId: plan.id,
          transferId: plan.id,
        })
      }

      await tx.inventoryTransfer.update({
        where: { id: plan.id },
        data: { status: InventoryTransferStatus.CONFIRMED, confirmedAt: new Date(plan.requestedAt.getTime() + 15 * 60 * 1000) },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}

async function seedSales(prisma: PrismaClient, ctx: SeedContext, plans: SalePlan[]) {
  const creditReceivables: Array<{ salePlan: SalePlan; receivableId: string; dueDate: Date; outstanding: number }> = []
  const routeSales: Array<{ saleId: string; routeId: string; amount: number; paidAt: Date }> = []
  const scaleTicketPlans: Array<{ saleId: string; locationId: string; saleDate: Date; physicalFolio: string }> = []

  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      const subtotal = roundMoney(plan.items.reduce((sum, item) => sum + buildLineSubtotal(item), 0))
      const total = roundMoney(subtotal - plan.discount)
      const collectionStatus = plan.paymentType === SalePaymentType.CASH_SALE ? CollectionStatus.PAID : CollectionStatus.UNPAID
      const salePayload = {
        saleNumber: plan.saleNumber,
        customerId: plan.customerId,
        userId: plan.userId,
        locationId: plan.locationId,
        saleChannel: plan.saleChannel,
        documentType: plan.documentType,
        physicalFolio: plan.physicalFolio,
        requiresAdministrativeInvoice: plan.requiresAdministrativeInvoice,
        commercialPolicyId: plan.commercialPolicyId,
        idempotencyKey: seedIdempotencyKey(plan.saleNumber),
        idempotencyPayloadHash: hashPayload({ saleNumber: plan.saleNumber, locationId: plan.locationId, total, channel: plan.saleChannel }),
        collectionStatus,
        subtotal,
        discount: plan.discount,
        tax: 0,
        total,
        paymentType: plan.paymentType,
        status: SaleStatus.CONFIRMED,
        createdAt: plan.saleDate,
      }

      await tx.sale.create({ data: { id: plan.id, ...salePayload } })

      await tx.saleItem.createMany({
        data: plan.items.map((item, itemIndex) => {
          const product = ctx.productsBySku.get(item.productSku ?? item.productName)
          if (!product) throw new Error(`Missing product ${item.productName}`)
          const snapshotQuantity = item.quantityKg > 0 ? item.quantityKg : item.quantityPieces
          const unitCost = Number(product.purchaseCost)
          return {
          id: seedId(`sale-item-${plan.saleNumber}-${itemIndex + 1}`),
          saleId: plan.id,
          productId: item.productId,
          quantity: item.quantityKg > 0 ? item.quantityKg : item.quantityPieces,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          unit: item.unit,
          unitPrice: item.unitPrice,
          unitEquivalentId: null,
          appliedEquivalentFactor: null,
          roundingMode: null,
          productNameSnapshot: item.productName,
          productSkuSnapshot: item.productSku,
          unitPriceSnapshot: item.unitPrice,
          quantitySnapshot: snapshotQuantity,
          subtotal: buildLineSubtotal(item),
          unitCostSnapshot: unitCost,
          costSubtotalSnapshot: roundMoney(unitCost * snapshotQuantity),
          costSnapshotSource: 'SALE_CONFIRMATION',
          createdAt: plan.saleDate,
          }
        }),
      })

      const movementRows: Prisma.InventoryMovementCreateManyInput[] = []
      for (const [itemIndex, item] of plan.items.entries()) {
        const product = ctx.productsBySku.get(item.productSku ?? item.productName)
        if (!product) {
          throw new Error(`Missing product ${item.productName}`)
        }

        const change = await applyInventoryDelta(tx, {
          product,
          locationId: plan.locationId,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          direction: -1,
        })

        movementRows.push({
          id: seedId(`sale-movement-${plan.saleNumber}-${itemIndex + 1}`),
          productId: product.id,
          locationId: plan.locationId,
          userId: plan.userId,
          type: InventoryMovementType.SALE,
          quantity: item.quantityKg > 0 ? item.quantityKg : item.quantityPieces,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          previousStock: change.previousQuantityKg,
          newStock: change.newQuantityKg,
          previousQuantityKg: change.previousQuantityKg,
          newQuantityKg: change.newQuantityKg,
          previousQuantityPieces: change.previousQuantityPieces,
          newQuantityPieces: change.newQuantityPieces,
          reason: seedNotes(`Sale ${plan.saleNumber}`),
          referenceType: 'Sale',
          referenceId: plan.id,
          saleId: plan.id,
        })
      }

      await tx.inventoryMovement.createMany({ data: movementRows })

      await tx.saleDocument.create({
        data: {
          id: seedId(`sale-document-${plan.saleNumber}`),
          saleId: plan.id,
          documentType: SaleDocumentType.INTERNAL_RECEIPT,
          operationalLocationId: plan.locationId,
          physicalFolio: plan.physicalFolio ?? plan.saleNumber,
          status: SaleDocumentStatus.ISSUED,
          requiresAdministrativeInvoice: plan.requiresAdministrativeInvoice,
          deliveredByUserId: plan.saleChannel === SaleChannel.ROUTE ? plan.userId : null,
          collectedByUserId: null,
          routeId: plan.routeId,
          customerSnapshot: plan.customerId
            ? ({ id: plan.customerId, name: plan.customerName, customerNumber: null, customerType: plan.customerType } as Prisma.InputJsonValue)
            : undefined,
          productSnapshot: {
            items: plan.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              productSku: item.productSku,
              unit: item.unit,
              quantityKg: item.quantityKg,
              quantityPieces: item.quantityPieces,
              unitPrice: item.unitPrice,
              subtotal: buildLineSubtotal(item),
              equivalentFactor: item.appliedEquivalentFactor,
              roundingMode: item.roundingMode,
            })),
          },
          priceSnapshot: {
            subtotal,
            discount: plan.discount,
            tax: 0,
            total,
            paymentType: plan.paymentType,
            saleChannel: plan.saleChannel,
            physicalFolio: plan.physicalFolio ?? plan.saleNumber,
            requiresAdministrativeInvoice: plan.requiresAdministrativeInvoice,
          },
          createdAt: plan.saleDate,
        },
      })

      if (plan.paymentType === SalePaymentType.CASH_SALE) {
        await tx.payment.create({
          data: {
            id: seedId(`payment-${plan.saleNumber}`),
            accountReceivableId: null,
            saleId: plan.id,
            customerId: plan.customerId,
            userId: plan.userId,
            collectedByUserId: plan.userId,
            amount: total,
            paymentMethod: plan.initialPaymentMethod ?? PaymentMethod.CASH,
            operationalLocationId: plan.locationId,
            status: PaymentStatus.APPLIED,
            paidAt: plan.initialPaymentAt ?? plan.saleDate,
            idempotencyKey: seedIdempotencyKey(`payment-${plan.saleNumber}`),
            idempotencyPayloadHash: hashPayload({ saleId: plan.id, amount: total, paymentMethod: plan.initialPaymentMethod ?? PaymentMethod.CASH }),
          },
        })
      } else {
        const customer = seedCustomers.find((candidate) => candidate.id === plan.customerId)
        if (!customer) {
          throw new Error(`Missing customer for sale ${plan.saleNumber}`)
        }

        const dueDate = addDays(plan.saleDate, customer.creditDays ?? 0)
        const outstanding = plan.expectedOutstanding
        const receivableId = seedId(`receivable-${plan.saleNumber}`)

        await tx.accountReceivable.create({
          data: {
            id: receivableId,
            customerId: customer.id,
            saleId: plan.id,
            originalSaleId: plan.id,
            originalAmount: outstanding,
            outstandingAmount: outstanding,
            saleDate: plan.saleDate,
            dueDate,
            paymentTermsDays: customer.creditDays ?? 0,
            lastPaymentDate: null,
            daysOverdue: calculateDaysOverdue(dueDate, plan.saleDate, outstanding),
            paidAt: null,
            cancelledAt: null,
            agingStatus: resolveAgingStatus(dueDate, plan.saleDate, outstanding),
            physicalDocumentFolio: plan.physicalFolio ?? plan.saleNumber,
            collectorUserId: ctx.collectionsUser.id,
            commercialPolicyId: customer.commercialPolicyId,
            status: CollectionStatus.UNPAID,
          },
        })

        creditReceivables.push({ salePlan: plan, receivableId, dueDate, outstanding })
      }

      if (plan.saleChannel === SaleChannel.ROUTE) {
        routeSales.push({ saleId: plan.id, routeId: plan.routeId ?? seedRoutes[0].id, amount: total, paidAt: plan.saleDate })
      }

      if (plan.saleChannel === SaleChannel.ROUTE && plan.documentType === SaleDocumentType.SCALE_TICKET && plan.scaleTicketFolio) {
        scaleTicketPlans.push({ saleId: plan.id, locationId: plan.locationId, saleDate: plan.saleDate, physicalFolio: plan.scaleTicketFolio })
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  await seedCreditCollections(prisma, ctx, creditReceivables)
  await seedDeliveryOrders(prisma, ctx, plans.filter((plan) => plan.saleChannel === SaleChannel.ROUTE))
  await seedScaleTickets(prisma, ctx, scaleTicketPlans)
  await seedRouteSettlements(prisma, ctx, routeSales)
}

async function seedCreditCollections(
  prisma: PrismaClient,
  ctx: SeedContext,
  receivables: Array<{ salePlan: SalePlan; receivableId: string; dueDate: Date; outstanding: number }>,
) {
  const collectionPayments = receivables.filter((_, index) => index % 3 !== 2)
  for (const [index, receivable] of collectionPayments.entries()) {
    const payDate = receivable.dueDate > receivable.salePlan.saleDate ? addDays(receivable.salePlan.saleDate, 3 + (index % 6)) : addDays(receivable.salePlan.saleDate, 1)
    const paymentAmount = index % 4 === 0 ? roundMoney(receivable.outstanding) : roundMoney(receivable.outstanding * 0.6)
    const paymentId = seedId(`collection-${receivable.salePlan.saleNumber}-${index + 1}`)

    await prisma.$transaction(async (tx) => {
      const current = await tx.accountReceivable.findUnique({ where: { id: receivable.receivableId } })
      if (!current) {
        throw new Error(`Receivable ${receivable.receivableId} not found`)
      }

      const newOutstandingAmount = roundMoney(toNumber(current.outstandingAmount) - paymentAmount)
      const nextStatus = newOutstandingAmount === 0 ? CollectionStatus.PAID : CollectionStatus.PARTIALLY_PAID
      const daysOverdue = calculateDaysOverdue(current.dueDate, payDate, newOutstandingAmount)
      const agingStatus = resolveAgingStatus(current.dueDate, payDate, newOutstandingAmount)

      await tx.payment.create({
        data: {
          id: paymentId,
          accountReceivableId: receivable.receivableId,
          customerId: current.customerId,
          saleId: current.saleId,
          userId: ctx.collectionsUser.id,
          collectedByUserId: ctx.collectionsUser.id,
          amount: paymentAmount,
          paymentMethod: [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.DEPOSIT, PaymentMethod.CARD][index % 4],
          bankName: index % 4 === 1 ? 'Banco Seed' : null,
          referenceNumber: index % 4 === 2 ? `REF-${index + 1}` : null,
          operationalLocationId: seedRoutes[index % seedRoutes.length].routeStockLocationId,
          routeId: seedRoutes[index % seedRoutes.length].id,
          status: PaymentStatus.APPLIED,
          paidAt: payDate,
          idempotencyKey: seedIdempotencyKey(`collection-${receivable.salePlan.saleNumber}-${index + 1}`),
          idempotencyPayloadHash: hashPayload({ receivableId: receivable.receivableId, amount: paymentAmount, paidAt: payDate.toISOString() }),
        },
      })

      await tx.accountReceivable.update({
        where: { id: receivable.receivableId },
        data: {
          outstandingAmount: newOutstandingAmount,
          lastPaymentDate: payDate,
          daysOverdue,
          agingStatus,
          status: nextStatus,
          paidAt: nextStatus === CollectionStatus.PAID ? payDate : null,
        },
      })

      await tx.sale.update({
        where: { id: receivable.salePlan.id },
        data: { collectionStatus: nextStatus },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}

async function seedDeliveryOrders(prisma: PrismaClient, ctx: SeedContext, routeSales: SalePlan[]) {
  for (const [index, sale] of routeSales.entries()) {
    const id = seedId(`delivery-order-${sale.saleNumber}`)
    await prisma.deliveryOrder.create({
      data: {
        id,
        routeId: sale.routeId ?? seedRoutes[index % seedRoutes.length].id,
        saleId: sale.id,
        accountReceivableId: sale.paymentType === SalePaymentType.CREDIT_SALE ? seedId(`receivable-${sale.saleNumber}`) : null,
        status: [DeliveryOrderStatus.DELIVERED, DeliveryOrderStatus.NOT_DELIVERED, DeliveryOrderStatus.PARTIALLY_REJECTED, DeliveryOrderStatus.RETURNED][index % 4],
        deliveryAddress: sale.customerName ? `Entrega a ${sale.customerName}` : 'Entrega ruta',
        deliveredAt: addDays(sale.saleDate, 1),
        notes: seedNotes(`Delivery order ${sale.saleNumber}`),
        collectedByUserId: ctx.collectionsUser.id,
        deliveredByUserId: ctx.driverUser.id,
        collectionPass: sale.paymentType === SalePaymentType.CREDIT_SALE ? 1 : null,
      },
    })
  }
}

async function seedScaleTickets(prisma: PrismaClient, ctx: SeedContext, scaleTickets: Array<{ saleId: string; locationId: string; saleDate: Date; physicalFolio: string }>) {
  for (const [index, ticket] of scaleTickets.entries()) {
    await prisma.scaleTicketReference.create({
      data: {
        id: seedId(`scale-ticket-${ticket.physicalFolio}`),
        operationalLocationId: ticket.locationId,
        saleId: ticket.saleId,
        physicalFolio: ticket.physicalFolio,
        capturedDate: ticket.saleDate,
        productId: Array.from(ctx.productsBySku.values())[index % 3].id,
        weightKg: roundQuantity(2 + index * 0.3),
        pieceCount: 0,
        unitPrice: roundMoney(58 + index),
        amount: roundMoney((58 + index) * (2 + index * 0.3)),
        capturedByUserId: ctx.sellerUser.id,
        capturedAt: addDays(ticket.saleDate, 0),
        notes: seedNotes(ticket.physicalFolio),
      },
    })
  }
}

async function seedRouteSettlements(prisma: PrismaClient, ctx: SeedContext, routeSales: Array<{ saleId: string; routeId: string; amount: number; paidAt: Date }>) {
  const byRoute = new Map<string, Array<{ saleId: string; amount: number; paidAt: Date }>>()
  for (const item of routeSales) {
    const list = byRoute.get(item.routeId) ?? []
    list.push({ saleId: item.saleId, amount: item.amount, paidAt: item.paidAt })
    byRoute.set(item.routeId, list)
  }

  const entries = Array.from(byRoute.entries()).slice(0, 2)
  for (const [index, [routeId, sales]] of entries.entries()) {
    const route = seedRoutes.find((candidate) => candidate.id === routeId)
    if (!route) continue
    const settlementId = seedId(`route-settlement-${routeId}`)
    const expectedCashAmount = roundMoney(sales.filter((sale) => sale.amount > 0).reduce((sum, sale) => sum + sale.amount, 0) * 0.5)
    await prisma.routeSettlement.create({
      data: {
        id: settlementId,
        routeId,
        driverId: ctx.driverUser.id,
        status: index === 0 ? RouteSettlementStatus.CLOSED : RouteSettlementStatus.OPEN,
        version: 1,
        expectedCashAmount,
        expectedTransferAmount: roundMoney(expectedCashAmount * 0.3),
        differenceAmount: 0,
        notes: seedNotes(`Route settlement ${route.name}`),
        closedAt: index === 0 ? addDays(new Date(), -1) : null,
        reopenedAt: null,
        reopenedByUserId: null,
        reopenedReason: null,
        routeCollectionsSummary: {
          route: route.name,
          sales: sales.length,
          total: sales.reduce((sum, sale) => sum + sale.amount, 0),
        },
        paidAtDeliveryAmount: roundMoney(expectedCashAmount * 0.8),
        overdueAmount: roundMoney(expectedCashAmount * 0.2),
        secondPassCollectionsAmount: roundMoney(expectedCashAmount * 0.1),
      },
    })
  }
}

async function seedDailyCloses(prisma: PrismaClient, ctx: SeedContext, dailyClosePlans: DailyClosePlan[]) {
  const products = Array.from(ctx.productsBySku.values())
  for (const [index, plan] of dailyClosePlans.entries()) {
    await prisma.$transaction(async (tx) => {
      await tx.pointOfSaleDailyClose.create({
        data: {
          id: plan.id,
          operationalLocationId: plan.locationId,
          businessDate: plan.businessDate,
          status: PointOfSaleDailyCloseStatus.REVIEWED,
          version: 1,
          openedByUserId: plan.openedByUserId,
          reviewedByUserId: ctx.collectionsUser.id,
          closedByUserId: ctx.adminUser.id,
          cancelledByUserId: null,
          reopenedByUserId: null,
          totalInputKg: roundQuantity(120 + index * 5),
          totalSoldKg: roundQuantity(85 + index * 4),
          totalRemainingKg: roundQuantity(30 + index * 2),
          totalShortageKg: roundQuantity(index % 3 === 0 ? 0.75 : 0),
          totalSurplusKg: roundQuantity(index % 4 === 0 ? 0.5 : 0),
          scaleReportedKg: roundQuantity(86 + index * 4),
          scaleDifferenceKg: roundQuantity(1 + (index % 2) * 0.25),
          cashTotal: roundMoney(6500 + index * 750),
          cardVoucherTotal: roundMoney(800 + index * 90),
          transferTotal: roundMoney(1200 + index * 100),
          expenseTotal: roundMoney(300 + index * 25),
          grossSalesTotal: roundMoney(9000 + index * 920),
          netCashExpected: roundMoney(7000 + index * 650),
          cashCountedTotal: roundMoney(7000 + index * 650 + (index % 2 === 0 ? 0 : 35)),
          cashDifferenceTotal: roundMoney(index % 2 === 0 ? 0 : 35),
          purchaseCostTotal: roundMoney(5200 + index * 620),
          grossProfitTotal: roundMoney(3800 + index * 300),
          netProfitTotal: roundMoney(3450 + index * 285),
          notes: seedNotes(`Daily close ${plan.businessDate.toISOString().slice(0, 10)}`),
          reviewedAt: addDays(plan.businessDate, 1),
          closedAt: addDays(plan.businessDate, 1),
          cancelledAt: null,
          reopenedAt: null,
          reopenedReason: null,
        },
      })

      await tx.pointOfSaleDailyCloseLine.createMany({
        data: [
          {
            id: seedId(`daily-close-line-${plan.id}-1`),
            pointOfSaleDailyCloseId: plan.id,
            operationalLocationId: plan.locationId,
            section: PointOfSaleDailyCloseLineSection.INPUT,
            conceptType: PointOfSaleDailyCloseLineConcept.PRODUCT_RECEIVED,
            productId: products[0].id,
            quantityKg: roundQuantity(50 + index * 2),
            quantityPieces: null,
            amount: roundMoney(2500 + index * 210),
            notes: seedNotes('Product received'),
            createdByUserId: ctx.warehouseUser.id,
          },
          {
            id: seedId(`daily-close-line-${plan.id}-2`),
            pointOfSaleDailyCloseId: plan.id,
            operationalLocationId: plan.locationId,
            section: PointOfSaleDailyCloseLineSection.OUTPUT,
            conceptType: PointOfSaleDailyCloseLineConcept.SALE_NOTE,
            productId: products[1].id,
            quantityKg: roundQuantity(20 + index),
            quantityPieces: null,
            amount: roundMoney(1800 + index * 120),
            notes: seedNotes('Sale note'),
            createdByUserId: ctx.sellerUser.id,
          },
          {
            id: seedId(`daily-close-line-${plan.id}-3`),
            pointOfSaleDailyCloseId: plan.id,
            operationalLocationId: plan.locationId,
            section: PointOfSaleDailyCloseLineSection.INCOME,
            conceptType: PointOfSaleDailyCloseLineConcept.CASH_INCOME,
            productId: null,
            saleId: null,
            quantityKg: null,
            quantityPieces: null,
            amount: roundMoney(6500 + index * 750),
            notes: seedNotes('Cash income'),
            createdByUserId: ctx.collectionsUser.id,
          },
          {
            id: seedId(`daily-close-line-${plan.id}-4`),
            pointOfSaleDailyCloseId: plan.id,
            operationalLocationId: plan.locationId,
            section: PointOfSaleDailyCloseLineSection.PROFIT,
            conceptType: PointOfSaleDailyCloseLineConcept.NET_PROFIT,
            productId: null,
            saleId: null,
            quantityKg: null,
            quantityPieces: null,
            amount: roundMoney(3450 + index * 285),
            notes: seedNotes('Net profit'),
            createdByUserId: ctx.adminUser.id,
          },
        ],
      })

      await tx.cashMovement.createMany({
        data: [
          {
            id: seedId(`cash-movement-${plan.id}-1`),
            operationalLocationId: plan.locationId,
            pointOfSaleDailyCloseId: plan.id,
            type: index % 2 === 0 ? CashMovementType.CASH_IN : CashMovementType.ADJUSTMENT,
            movementChannel: MovementChannel.CASH,
            amount: roundMoney(450 + index * 25),
            reason: seedNotes('Daily expense recovery'),
            reference: `DC-${plan.businessDate.toISOString().slice(0, 10)}`,
            occurredAt: addDays(plan.businessDate, 1),
            userId: ctx.adminUser.id,
          },
          {
            id: seedId(`cash-movement-${plan.id}-2`),
            operationalLocationId: plan.locationId,
            pointOfSaleDailyCloseId: plan.id,
            type: CashMovementType.EXPENSE,
            movementChannel: MovementChannel.CASH,
            amount: roundMoney(160 + index * 10),
            reason: seedNotes('Operating expense'),
            reference: `EXP-${plan.businessDate.toISOString().slice(0, 10)}`,
            occurredAt: addDays(plan.businessDate, 1),
            userId: ctx.collectionsUser.id,
          },
        ],
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}

async function runOperationalSeed(prisma: PrismaClient) {
  assertSeedEnvironment();
  const ctx = await loadSeedContext(prisma)
  const baseDate = addDays(new Date(), -29)

  const salePlans = buildSalesPlans(ctx, baseDate)
  const purchasePlans = buildPurchasePlans(ctx, baseDate)
  const transferPlans = buildTransferPlans(ctx, baseDate)
  const dailyClosePlans = buildDailyClosePlans(ctx, baseDate)

  await deleteOperationalData(prisma, ctx, salePlans, purchasePlans, transferPlans, dailyClosePlans)

  await upsertCommercialPolicies(prisma, ctx)
  await upsertSuppliers(prisma)
  await upsertOperationalLocations(prisma, ctx)
  await upsertRoutes(prisma, ctx)
  await upsertCustomers(prisma, ctx)
  await seedPurchases(prisma, ctx, baseDate, purchasePlans)
  await seedTransfers(prisma, ctx, transferPlans)
  await seedSales(prisma, ctx, salePlans)
  await seedDailyCloses(prisma, ctx, dailyClosePlans)
}

if (require.main === module) {
  const prisma = new PrismaClient()

  runOperationalSeed(prisma)
    .then(async () => {
      await prisma.$disconnect()
    })
    .catch(async (error: unknown) => {
      console.error(error)
      await prisma.$disconnect()
      process.exit(1)
    })
}
