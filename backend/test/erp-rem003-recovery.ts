import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { Response } from 'supertest';
import type { Rem003Harness } from './erp-rem003-harness';

export type ResistanceCommand = {
  method: 'POST' | 'PATCH';
  path: string;
  body: object;
  role: string;
  key: string | null;
};
export type RecoveryState = {
  sales: Array<{ id: string; status: string; version: number }>;
  receivables: Array<{ id: string; version: number }>;
  routes: Array<{ settlement: { status: string } | null }>;
  [key: string]: unknown;
};
type Context = { cycle: number; products: Set<string> };
export type OperationEvidence = {
  cycle: number;
  operation: number;
  attempt: number;
  method: string;
  path: string;
  role: string;
  key: string | null;
  payloadHash: string;
  expectedVersion: unknown;
  startedAt: number;
  endedAt?: number;
  http?: number;
  requestId?: string;
  error?: unknown;
  classification?: string;
  rollbackVerified?: boolean;
  before?: RecoveryState;
  after?: RecoveryState;
  concurrent: Array<{
    cycle: number;
    operation: number;
    method: string;
    path: string;
  }>;
};
const normalized = (value: unknown) => JSON.stringify(value);

// This test-only client implements the explicit recovery exercised in audit C4/C5.
// It is NOT a generic HTTP retry layer and never changes a command/key/version.
export class Rem003Recovery {
  private readonly context = new AsyncLocalStorage<Context>();
  private readonly active = new Set<OperationEvidence>();
  readonly operations: OperationEvidence[] = [];
  private sequence = 0;
  constructor(
    private readonly h: Rem003Harness,
    private readonly snapshot = (products: string[]) =>
      snapshotProducts(h, products),
    private readonly maxRecoveries = 3,
  ) {}
  cycle<T>(cycle: number, action: () => Promise<T>) {
    return this.context.run({ cycle, products: new Set() }, action);
  }
  recovered(cycle: number) {
    return this.operations.some((x) => x.cycle === cycle && x.attempt > 1);
  }
  async execute(
    command: ResistanceCommand,
    send: () => Promise<Response>,
  ): Promise<Response> {
    const context = this.context.getStore();
    if (!context) return send(); // monitoring and setup are never recovered implicitly
    const body = command.body as {
      items?: Array<{ productId?: string }>;
      expectedVersion?: number;
      accountReceivableId?: string;
    };
    for (const item of body.items ?? [])
      if (item.productId) context.products.add(item.productId);
    const payload = normalized(command.body);
    const operation = ++this.sequence;
    for (let attempt = 1; ; attempt++) {
      const before = await this.snapshot([...context.products]);
      const evidence: OperationEvidence = {
        cycle: context.cycle,
        operation,
        attempt,
        method: command.method,
        path: command.path,
        role: command.role,
        key: command.key,
        payloadHash: createHash('sha256').update(payload).digest('hex'),
        expectedVersion: body.expectedVersion ?? null,
        startedAt: Date.now(),
        before,
        concurrent: [...this.active].map((x) => ({
          cycle: x.cycle,
          operation: x.operation,
          method: x.method,
          path: x.path,
        })),
      };
      for (const active of this.active)
        active.concurrent.push({
          cycle: evidence.cycle,
          operation: evidence.operation,
          method: evidence.method,
          path: evidence.path,
        });
      this.operations.push(evidence);
      this.active.add(evidence);
      let response: Response;
      try {
        response = await send();
      } catch (error) {
        evidence.classification = 'transport-error';
        evidence.error =
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: 'Non-HTTP transport failure' };
        throw error; // never repeat an operation with an unknown commit outcome
      } finally {
        evidence.endedAt = Date.now();
        this.active.delete(evidence);
      }
      evidence.http = response.status;
      evidence.requestId = String(
        response.body?.requestId ?? response.headers['x-request-id'] ?? '',
      );
      const after = await this.snapshot([...context.products]);
      evidence.after = after;
      if (response.status >= 400) evidence.error = response.body as unknown;
      if (response.status !== 409) {
        const compact = (state: RecoveryState): RecoveryState => ({
          sales: state.sales,
          receivables: state.receivables,
          routes: state.routes,
          counts: Object.fromEntries(
            Object.entries(state)
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => [key, (value as unknown[]).length]),
          ),
        });
        evidence.before = compact(before);
        evidence.after = compact(after);
        evidence.classification =
          response.status < 400
            ? attempt > 1
              ? 'recovered-success'
              : 'direct-success'
            : 'unrecoverable-http-error';
        return response;
      }
      evidence.error = response.body as unknown;
      const classification = classifyConflict(
        command,
        response.body as Record<string, unknown>,
      );
      evidence.classification = classification;
      evidence.rollbackVerified = normalized(before) === normalized(after);
      const authoritativeVersion = /\/collections$/.test(command.path)
        ? after.receivables.find((x) => x.id === body.accountReceivableId)
            ?.version
        : /\/void$/.test(command.path)
          ? after.sales.find((x) => command.path === `sales/${x.id}/void`)
              ?.version
          : undefined;
      const versionMatches =
        body.expectedVersion === undefined ||
        authoritativeVersion === body.expectedVersion;
      const executable =
        after.sales.length > 0 &&
        after.sales.every((x) => x.status === 'CONFIRMED') &&
        after.routes.every((x) => x.settlement?.status !== 'CLOSED');
      if (!evidence.rollbackVerified)
        evidence.classification = 'effects-changed-unproven-rollback';
      else if (!versionMatches) evidence.classification = 'version-conflict';
      else if (!executable) evidence.classification = 'business-state-conflict';
      else if (
        classification === 'recoverable-rollback' &&
        attempt > this.maxRecoveries
      )
        evidence.classification = 'recovery-exhausted';
      if (
        classification !== 'recoverable-rollback' ||
        !evidence.rollbackVerified ||
        !versionMatches ||
        !executable ||
        attempt > this.maxRecoveries
      )
        return response;
      if (normalized(command.body) !== payload)
        throw new Error('Recovery must not mutate original payload');
      // Explicit bounded recovery, not a test-level retry. Every rejection remains evidence.
      await new Promise<void>((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

export function classifyConflict(
  command: ResistanceCommand,
  body: Record<string, unknown>,
): string {
  const message = typeof body.message === 'string' ? body.message : '',
    code =
      typeof body.code === 'string'
        ? body.code
        : typeof body.error === 'string'
          ? body.error
          : '';
  if (/version|expectedVersion/i.test(message)) return 'version-conflict';
  if (/Idempotency-Key was already used|different .*payload/i.test(message))
    return 'idempotency-conflict';
  // Purchases/creation/planning remain first-attempt contracts; never generalize all409.
  const allowedPath =
    command.method === 'POST'
      ? /^delivery-orders\/[^/]+\/(incidents|collections)$/.test(
          command.path,
        ) || /^sales\/[^/]+\/void$/.test(command.path)
      : /^delivery-orders\/[^/]+\/status$/.test(command.path);
  if (!allowedPath) return 'nonrecoverable-http-conflict';
  if (message === 'Sale lifecycle changed; retry with the same Idempotency-Key')
    return 'recoverable-rollback';
  if (
    /^sales\/[^/]+\/void$/.test(command.path) &&
    [
      'Concurrent sale void is still in progress; retry with the same Idempotency-Key',
      'Sale cancellation context changed; refresh and retry',
    ].includes(message)
  )
    return 'recoverable-rollback';
  if (
    /\/incidents$/.test(command.path) &&
    code === 'INCIDENT_CONCURRENCY_CONFLICT' &&
    message ===
      'The delivery incident could not be completed after concurrent retries'
  )
    return 'recoverable-rollback';
  if (
    /\/collections$/.test(command.path) &&
    code === 'COLLECTION_CONCURRENCY_CONFLICT' &&
    message ===
      'The route collection could not be completed after concurrent retries'
  )
    return 'recoverable-rollback';
  return 'nonrecoverable-http-conflict';
}

export async function snapshotProducts(
  h: Rem003Harness,
  products: string[],
): Promise<RecoveryState> {
  const sales = await h.prisma.sale.findMany({
    where: { items: { some: { productId: { in: products } } } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      status: true,
      version: true,
      total: true,
      routeId: true,
      locationId: true,
      cancellationIdempotencyKey: true,
    },
  });
  const saleIds = sales.map((x) => x.id),
    routeIds = sales.flatMap((x) => (x.routeId ? [x.routeId] : []));
  return {
    sales,
    balances: await h.prisma.inventoryBalance.findMany({
      where: { productId: { in: products } },
      orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
    }),
    receivables: await h.prisma.accountReceivable.findMany({
      where: { saleId: { in: saleIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        saleId: true,
        status: true,
        version: true,
        outstandingAmount: true,
      },
    }),
    payments: await h.prisma.payment.findMany({
      where: { saleId: { in: saleIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        saleId: true,
        status: true,
        amount: true,
        paymentMethod: true,
        idempotencyKey: true,
      },
    }),
    orders: await h.prisma.deliveryOrder.findMany({
      where: { saleId: { in: saleIds } },
      orderBy: { id: 'asc' },
      select: { id: true, saleId: true, status: true, routeId: true },
    }),
    incidents: await h.prisma.deliveryIncident.findMany({
      where: { deliveryOrder: { saleId: { in: saleIds } } },
      orderBy: { id: 'asc' },
      select: { id: true, idempotencyKey: true, statusSnapshot: true },
    }),
    evidence: await h.prisma.deliveryEvidence.findMany({
      where: { deliveryOrder: { saleId: { in: saleIds } } },
      orderBy: { id: 'asc' },
      select: { id: true, type: true },
    }),
    movements: await h.prisma.inventoryMovement.findMany({
      where: { productId: { in: products } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        type: true,
        quantityPieces: true,
        quantityKg: true,
        locationId: true,
        saleId: true,
      },
    }),
    routes: await h.prisma.deliveryRoute.findMany({
      where: { id: { in: routeIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        routeStockLocationId: true,
        settlement: { select: { id: true, status: true, version: true } },
      },
    }),
  };
}
