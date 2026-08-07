import { Prisma, PrismaClient } from '@prisma/client';

type DecimalInput = Prisma.Decimal | number | string | null | undefined;

export type CedisPreflightLocation = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  isActive: boolean;
};

export type CedisPreflightBalance = {
  productId: string;
  locationId: string;
  quantityKg: DecimalInput;
  quantityPieces: number | null;
};

export type CedisPreflightTransferItem = {
  id: string;
  productId: string;
  quantityKg: DecimalInput;
  quantityPieces: number | null;
  unit: string;
  product: {
    id: string;
    name: string;
    unit: string;
    isActive: boolean;
  } | null;
};

export type CedisPreflightCycleLink = {
  role: string;
  branchSupplyCycle: {
    id: string;
    distributionCenterLocationId: string;
    branchLocationId: string;
    status: string;
  } | null;
} | null;

export type CedisPreflightTransfer = {
  id: string;
  transferNumber: string;
  originLocationId: string;
  destinationLocationId: string;
  status: string;
  items: CedisPreflightTransferItem[];
  branchSupplyCycleTransfer: CedisPreflightCycleLink;
};

export type CedisInventoryPreflightData = {
  locations: CedisPreflightLocation[];
  balances: CedisPreflightBalance[];
  transfers: CedisPreflightTransfer[];
};

export type CedisInventoryPreflightFinding = {
  code: string;
  entity: 'LOCATION' | 'BALANCE' | 'TRANSFER' | 'TRANSFER_ITEM';
  entityId: string;
  message: string;
  details: Record<string, unknown>;
};

export type CedisInventoryPreflightReport = {
  mode: 'READ_ONLY';
  status: 'PASS' | 'FAIL';
  generatedAt: string;
  commitmentStatuses: string[];
  summary: {
    locationCount: number;
    balanceCount: number;
    transferCount: number;
    commitmentTransferCount: number;
    findingCount: number;
    findingsByCode: Record<string, number>;
  };
  findings: CedisInventoryPreflightFinding[];
};

const COMMITMENT_STATUSES = new Set(['REQUESTED', 'IN_TRANSIT']);
const PENDING_STATUSES = new Set(['DRAFT', 'REQUESTED', 'IN_TRANSIT']);

function toDecimal(value: DecimalInput): Prisma.Decimal | null {
  try {
    const decimal = new Prisma.Decimal(value ?? 0);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function toPieces(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

function toTransferPieces(value: number | null): number | null {
  if (value === null) return 0;
  return toPieces(value);
}

function formatKg(value: Prisma.Decimal): string {
  return value.toFixed(3);
}

function formatDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details);
  if (entries.length === 0) return '';

  return ` ${JSON.stringify(Object.fromEntries(entries))}`;
}

function addFinding(
  findings: CedisInventoryPreflightFinding[],
  finding: CedisInventoryPreflightFinding,
): void {
  findings.push(finding);
}

function validateHierarchy(
  locations: CedisPreflightLocation[],
  findings: CedisInventoryPreflightFinding[],
): Map<string, CedisPreflightLocation> {
  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );

  for (const location of locations) {
    if (location.type === 'DISTRIBUTION_CENTER' && location.parentId !== null) {
      addFinding(findings, {
        code: 'CEDIS_PARENT_INVALID',
        entity: 'LOCATION',
        entityId: location.id,
        message: 'A distribution center must not have a parent location.',
        details: { parentId: location.parentId, locationName: location.name },
      });
    }

    if (location.type === 'DISTRIBUTION_CENTER' && !location.isActive) {
      addFinding(findings, {
        code: 'CEDIS_INACTIVE',
        entity: 'LOCATION',
        entityId: location.id,
        message:
          'A distribution center used by the inventory hierarchy is inactive.',
        details: { locationName: location.name },
      });
    }

    if (location.type !== 'BRANCH') continue;

    const parent = location.parentId
      ? locationsById.get(location.parentId)
      : undefined;
    if (!parent || parent.type !== 'DISTRIBUTION_CENTER' || !parent.isActive) {
      addFinding(findings, {
        code: 'BRANCH_PARENT_INVALID',
        entity: 'LOCATION',
        entityId: location.id,
        message:
          'A branch must have an active distribution center as its direct parent.',
        details: {
          locationName: location.name,
          parentId: location.parentId,
          parentType: parent?.type ?? null,
          parentIsActive: parent?.isActive ?? null,
        },
      });
    }
  }

  return locationsById;
}

function validateBalance(
  balance: CedisPreflightBalance,
  findings: CedisInventoryPreflightFinding[],
): void {
  const quantityKg = toDecimal(balance.quantityKg);
  const quantityPieces = toPieces(balance.quantityPieces);

  if (!quantityKg) {
    addFinding(findings, {
      code: 'BALANCE_QUANTITY_KG_INVALID',
      entity: 'BALANCE',
      entityId: `${balance.productId}:${balance.locationId}`,
      message: 'The balance has a non-finite kilogram quantity.',
      details: { productId: balance.productId, locationId: balance.locationId },
    });
  } else if (quantityKg.lessThan(0)) {
    addFinding(findings, {
      code: 'BALANCE_NEGATIVE_KG',
      entity: 'BALANCE',
      entityId: `${balance.productId}:${balance.locationId}`,
      message: 'The balance has a negative kilogram quantity.',
      details: {
        productId: balance.productId,
        locationId: balance.locationId,
        quantityKg: formatKg(quantityKg),
      },
    });
  }

  if (quantityPieces === null) {
    addFinding(findings, {
      code: 'BALANCE_QUANTITY_PIECES_INVALID',
      entity: 'BALANCE',
      entityId: `${balance.productId}:${balance.locationId}`,
      message: 'The balance has a non-integer piece quantity.',
      details: { productId: balance.productId, locationId: balance.locationId },
    });
  } else if (quantityPieces < 0) {
    addFinding(findings, {
      code: 'BALANCE_NEGATIVE_PIECES',
      entity: 'BALANCE',
      entityId: `${balance.productId}:${balance.locationId}`,
      message: 'The balance has a negative piece quantity.',
      details: {
        productId: balance.productId,
        locationId: balance.locationId,
        quantityPieces,
      },
    });
  }
}

function validateTransferItemQuantity(
  transfer: CedisPreflightTransfer,
  item: CedisPreflightTransferItem,
  findings: CedisInventoryPreflightFinding[],
): void {
  const quantityKg = toDecimal(item.quantityKg);
  const quantityPieces = toTransferPieces(item.quantityPieces);
  const entityId = `${transfer.id}:${item.id}`;

  if (!quantityKg || quantityPieces === null) {
    addFinding(findings, {
      code: 'TRANSFER_ITEM_QUANTITY_INVALID',
      entity: 'TRANSFER_ITEM',
      entityId,
      message: 'A transfer item has an invalid physical quantity.',
      details: {
        transferNumber: transfer.transferNumber,
        productId: item.productId,
        quantityKg: item.quantityKg ?? null,
        quantityPieces: item.quantityPieces,
      },
    });
    return;
  }

  if (quantityKg.lessThan(0) || quantityPieces < 0) {
    addFinding(findings, {
      code: 'TRANSFER_ITEM_QUANTITY_NEGATIVE',
      entity: 'TRANSFER_ITEM',
      entityId,
      message: 'A transfer item has a negative physical quantity.',
      details: {
        transferNumber: transfer.transferNumber,
        productId: item.productId,
        quantityKg: formatKg(quantityKg),
        quantityPieces,
      },
    });
    return;
  }

  const productUnit = item.product?.unit;
  const valid =
    productUnit === 'KG'
      ? item.unit === 'KG' && quantityKg.greaterThan(0) && quantityPieces === 0
      : productUnit === 'PIECE'
        ? item.unit === 'PIECE' && quantityPieces > 0 && quantityKg.isZero()
        : productUnit === 'KG_AND_PIECE'
          ? (item.unit === 'KG' &&
              quantityKg.greaterThan(0) &&
              quantityPieces === 0) ||
            (item.unit === 'PIECE' &&
              quantityPieces > 0 &&
              quantityKg.isZero()) ||
            (item.unit === 'KG_AND_PIECE' &&
              (quantityKg.greaterThan(0) || quantityPieces > 0))
          : false;

  if (!valid) {
    addFinding(findings, {
      code: 'TRANSFER_ITEM_UNIT_MISMATCH',
      entity: 'TRANSFER_ITEM',
      entityId,
      message: 'A transfer item quantity does not match the product unit.',
      details: {
        transferNumber: transfer.transferNumber,
        productId: item.productId,
        productUnit: productUnit ?? null,
        itemUnit: item.unit,
        quantityKg: formatKg(quantityKg),
        quantityPieces,
      },
    });
  }
}

function validateTransferStructure(
  transfer: CedisPreflightTransfer,
  locationsById: Map<string, CedisPreflightLocation>,
  findings: CedisInventoryPreflightFinding[],
): void {
  const origin = locationsById.get(transfer.originLocationId);
  const destination = locationsById.get(transfer.destinationLocationId);
  const isPending = PENDING_STATUSES.has(transfer.status);

  if (transfer.items.length === 0) {
    addFinding(findings, {
      code: 'TRANSFER_WITHOUT_ITEMS',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A transfer has no items.',
      details: {
        transferNumber: transfer.transferNumber,
        status: transfer.status,
      },
    });
  }

  if (!origin || !destination) {
    addFinding(findings, {
      code: 'TRANSFER_LOCATION_MISSING',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message:
        'A transfer references a location that is not present in the catalog.',
      details: {
        transferNumber: transfer.transferNumber,
        originLocationId: transfer.originLocationId,
        destinationLocationId: transfer.destinationLocationId,
        originFound: Boolean(origin),
        destinationFound: Boolean(destination),
      },
    });
  }

  if (
    isPending &&
    ((!origin?.isActive && origin !== undefined) ||
      (!destination?.isActive && destination !== undefined))
  ) {
    addFinding(findings, {
      code: 'TRANSFER_LOCATION_INACTIVE',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A pending transfer references an inactive location.',
      details: {
        transferNumber: transfer.transferNumber,
        originLocationId: transfer.originLocationId,
        originIsActive: origin?.isActive ?? null,
        destinationLocationId: transfer.destinationLocationId,
        destinationIsActive: destination?.isActive ?? null,
      },
    });
  }

  const productIds = new Map<string, string[]>();
  for (const item of transfer.items) {
    const itemIds = productIds.get(item.productId) ?? [];
    itemIds.push(item.id);
    productIds.set(item.productId, itemIds);

    if (!item.product) {
      addFinding(findings, {
        code: 'TRANSFER_PRODUCT_MISSING',
        entity: 'TRANSFER_ITEM',
        entityId: `${transfer.id}:${item.id}`,
        message: 'A transfer item references a product that is not present.',
        details: {
          transferNumber: transfer.transferNumber,
          productId: item.productId,
        },
      });
    } else if (isPending && !item.product.isActive) {
      addFinding(findings, {
        code: 'TRANSFER_PRODUCT_INACTIVE',
        entity: 'TRANSFER_ITEM',
        entityId: `${transfer.id}:${item.id}`,
        message: 'A pending transfer references an inactive product.',
        details: {
          transferNumber: transfer.transferNumber,
          productId: item.productId,
          productName: item.product.name,
        },
      });
    }

    validateTransferItemQuantity(transfer, item, findings);
  }

  for (const [productId, itemIds] of productIds) {
    if (itemIds.length <= 1) continue;

    addFinding(findings, {
      code: 'TRANSFER_DUPLICATE_PRODUCT',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A transfer contains more than one item for the same product.',
      details: {
        transferNumber: transfer.transferNumber,
        productId,
        itemIds,
      },
    });
  }

  if (!origin || !destination) return;

  const isSupplyPair =
    origin.type === 'DISTRIBUTION_CENTER' &&
    destination.type === 'BRANCH' &&
    destination.parentId === origin.id;
  const isReturnPair =
    origin.type === 'BRANCH' &&
    destination.type === 'DISTRIBUTION_CENTER' &&
    origin.parentId === destination.id;

  if (destination.type === 'BRANCH') {
    if (!isSupplyPair) {
      addFinding(findings, {
        code: 'TRANSFER_BRANCH_ORIGIN_INVALID',
        entity: 'TRANSFER',
        entityId: transfer.id,
        message: 'A branch transfer must originate in its direct parent CEDIS.',
        details: {
          transferNumber: transfer.transferNumber,
          originLocationId: origin.id,
          originType: origin.type,
          destinationLocationId: destination.id,
          destinationParentId: destination.parentId,
        },
      });
    }

    if (
      !transfer.branchSupplyCycleTransfer ||
      transfer.branchSupplyCycleTransfer.role !== 'SUPPLY'
    ) {
      addFinding(findings, {
        code: 'TRANSFER_BRANCH_SUPPLY_NOT_LINKED',
        entity: 'TRANSFER',
        entityId: transfer.id,
        message:
          'A transfer to a branch must be linked to a SUPPLY cycle transfer.',
        details: {
          transferNumber: transfer.transferNumber,
          status: transfer.status,
        },
      });
    }
  }

  if (origin.type === 'BRANCH' && destination.type === 'DISTRIBUTION_CENTER') {
    if (!isReturnPair) {
      addFinding(findings, {
        code: 'TRANSFER_BRANCH_RETURN_DESTINATION_INVALID',
        entity: 'TRANSFER',
        entityId: transfer.id,
        message: 'A branch return must arrive at the branch parent CEDIS.',
        details: {
          transferNumber: transfer.transferNumber,
          originLocationId: origin.id,
          originParentId: origin.parentId,
          destinationLocationId: destination.id,
        },
      });
    }

    if (
      !transfer.branchSupplyCycleTransfer ||
      transfer.branchSupplyCycleTransfer.role !== 'RETURN'
    ) {
      addFinding(findings, {
        code: 'TRANSFER_BRANCH_RETURN_NOT_LINKED',
        entity: 'TRANSFER',
        entityId: transfer.id,
        message: 'A branch return must be linked to a RETURN cycle transfer.',
        details: {
          transferNumber: transfer.transferNumber,
          status: transfer.status,
        },
      });
    }
  }

  const link = transfer.branchSupplyCycleTransfer;
  if (!link) return;

  const cycle = link.branchSupplyCycle;
  if (!cycle) {
    addFinding(findings, {
      code: 'TRANSFER_CYCLE_MISSING',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A linked transfer does not have a supply cycle record.',
      details: { transferNumber: transfer.transferNumber, role: link.role },
    });
    return;
  }

  if (link.role !== 'SUPPLY' && link.role !== 'RETURN') {
    addFinding(findings, {
      code: 'TRANSFER_CYCLE_ROLE_INVALID',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A linked transfer has an unsupported cycle role.',
      details: { transferNumber: transfer.transferNumber, role: link.role },
    });
    return;
  }

  const expectedOrigin =
    link.role === 'SUPPLY'
      ? cycle.distributionCenterLocationId
      : cycle.branchLocationId;
  const expectedDestination =
    link.role === 'SUPPLY'
      ? cycle.branchLocationId
      : cycle.distributionCenterLocationId;

  if (
    transfer.originLocationId !== expectedOrigin ||
    transfer.destinationLocationId !== expectedDestination
  ) {
    addFinding(findings, {
      code: 'TRANSFER_CYCLE_DIRECTION_INVALID',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message: 'A linked transfer direction does not match its cycle role.',
      details: {
        transferNumber: transfer.transferNumber,
        role: link.role,
        originLocationId: transfer.originLocationId,
        expectedOrigin,
        destinationLocationId: transfer.destinationLocationId,
        expectedDestination,
      },
    });
  }

  const cycleCedis = locationsById.get(cycle.distributionCenterLocationId);
  const cycleBranch = locationsById.get(cycle.branchLocationId);
  if (
    !cycleCedis ||
    !cycleBranch ||
    cycleCedis.type !== 'DISTRIBUTION_CENTER' ||
    !cycleCedis.isActive ||
    cycleBranch.type !== 'BRANCH' ||
    !cycleBranch.isActive ||
    cycleBranch.parentId !== cycleCedis.id
  ) {
    addFinding(findings, {
      code: 'TRANSFER_CYCLE_LOCATION_INVALID',
      entity: 'TRANSFER',
      entityId: transfer.id,
      message:
        'A linked cycle does not reference an active direct CEDIS-branch pair.',
      details: {
        transferNumber: transfer.transferNumber,
        cycleId: cycle.id,
        distributionCenterLocationId: cycle.distributionCenterLocationId,
        branchLocationId: cycle.branchLocationId,
      },
    });
  }
}

type PendingCommitment = {
  originLocationId: string;
  productId: string;
  requestedKg: Prisma.Decimal;
  requestedPieces: number;
  transferIds: string[];
};

function findPendingCommitmentFindings(
  transfers: CedisPreflightTransfer[],
  balances: CedisPreflightBalance[],
  findings: CedisInventoryPreflightFinding[],
): void {
  const commitments = new Map<string, PendingCommitment>();
  for (const transfer of transfers) {
    if (!COMMITMENT_STATUSES.has(transfer.status)) continue;

    for (const item of transfer.items) {
      const quantityKg = toDecimal(item.quantityKg);
      const quantityPieces = toTransferPieces(item.quantityPieces);
      if (!quantityKg || quantityPieces === null) continue;

      const key = `${transfer.originLocationId}:${item.productId}`;
      const current = commitments.get(key) ?? {
        originLocationId: transfer.originLocationId,
        productId: item.productId,
        requestedKg: new Prisma.Decimal(0),
        requestedPieces: 0,
        transferIds: [],
      };
      current.requestedKg = current.requestedKg.plus(quantityKg);
      current.requestedPieces += quantityPieces;
      if (!current.transferIds.includes(transfer.id)) {
        current.transferIds.push(transfer.id);
      }
      commitments.set(key, current);
    }
  }

  const balancesByKey = new Map(
    balances.map((balance) => [
      `${balance.locationId}:${balance.productId}`,
      balance,
    ]),
  );

  for (const commitment of commitments.values()) {
    const balance = balancesByKey.get(
      `${commitment.originLocationId}:${commitment.productId}`,
    );
    const onHandKg = toDecimal(balance?.quantityKg);
    const onHandPieces = toPieces(balance?.quantityPieces ?? 0);
    if (!onHandKg || onHandPieces === null) continue;

    const shortageKg = commitment.requestedKg.minus(onHandKg);
    const shortagePieces = commitment.requestedPieces - onHandPieces;
    if (!shortageKg.greaterThan(0) && shortagePieces <= 0) continue;

    addFinding(findings, {
      code: 'PENDING_TRANSFER_EXCEEDS_BALANCE',
      entity: 'BALANCE',
      entityId: `${commitment.productId}:${commitment.originLocationId}`,
      message:
        'The sum of pending transfer quantities exceeds the physical origin balance.',
      details: {
        productId: commitment.productId,
        originLocationId: commitment.originLocationId,
        transferIds: commitment.transferIds,
        requestedKg: formatKg(commitment.requestedKg),
        onHandKg: formatKg(onHandKg),
        shortageKg: formatKg(
          shortageKg.greaterThan(0) ? shortageKg : new Prisma.Decimal(0),
        ),
        requestedPieces: commitment.requestedPieces,
        onHandPieces,
        shortagePieces: Math.max(shortagePieces, 0),
      },
    });
  }
}

export function auditCedisInventoryData(
  data: CedisInventoryPreflightData,
  generatedAt = new Date(),
): CedisInventoryPreflightReport {
  const findings: CedisInventoryPreflightFinding[] = [];
  const locationsById = validateHierarchy(data.locations, findings);

  for (const balance of data.balances) {
    validateBalance(balance, findings);
  }

  for (const transfer of data.transfers) {
    validateTransferStructure(transfer, locationsById, findings);
  }

  findPendingCommitmentFindings(data.transfers, data.balances, findings);

  findings.sort((left, right) =>
    `${left.code}:${left.entityId}`.localeCompare(
      `${right.code}:${right.entityId}`,
    ),
  );

  const findingsByCode = findings.reduce<Record<string, number>>(
    (counts, finding) => {
      counts[finding.code] = (counts[finding.code] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    mode: 'READ_ONLY',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    generatedAt: generatedAt.toISOString(),
    commitmentStatuses: [...COMMITMENT_STATUSES],
    summary: {
      locationCount: data.locations.length,
      balanceCount: data.balances.length,
      transferCount: data.transfers.length,
      commitmentTransferCount: data.transfers.filter((transfer) =>
        COMMITMENT_STATUSES.has(transfer.status),
      ).length,
      findingCount: findings.length,
      findingsByCode,
    },
    findings,
  };
}

export async function loadCedisInventoryPreflightData(
  prisma: PrismaClient,
): Promise<CedisInventoryPreflightData> {
  const [locations, balances, transfers] = await Promise.all([
    prisma.operationalLocation.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        isActive: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryBalance.findMany({
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
      },
      orderBy: [{ locationId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.inventoryTransfer.findMany({
      select: {
        id: true,
        transferNumber: true,
        originLocationId: true,
        destinationLocationId: true,
        status: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantityKg: true,
            quantityPieces: true,
            unit: true,
            product: {
              select: { id: true, name: true, unit: true, isActive: true },
            },
          },
          orderBy: { id: 'asc' },
        },
        branchSupplyCycleTransfer: {
          select: {
            role: true,
            branchSupplyCycle: {
              select: {
                id: true,
                distributionCenterLocationId: true,
                branchLocationId: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  return {
    locations,
    balances,
    transfers,
  };
}

export function formatCedisInventoryPreflightReport(
  report: CedisInventoryPreflightReport,
): string {
  const lines = [
    'CEDIS inventory preflight',
    'Mode: READ_ONLY',
    `Status: ${report.status}`,
    `Generated at: ${report.generatedAt}`,
    `Locations: ${report.summary.locationCount}`,
    `Balances: ${report.summary.balanceCount}`,
    `Transfers: ${report.summary.transferCount}`,
    `Commitment transfers (${report.commitmentStatuses.join(', ')}): ${report.summary.commitmentTransferCount}`,
    `Findings: ${report.summary.findingCount}`,
  ];

  if (report.findings.length === 0) {
    lines.push('No data integrity findings were detected.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('', 'Findings:');
  for (const finding of report.findings) {
    lines.push(
      `- [${finding.code}] ${finding.entity} ${finding.entityId}: ${finding.message}${formatDetails(finding.details)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
