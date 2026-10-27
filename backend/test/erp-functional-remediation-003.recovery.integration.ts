import {
  Rem003Recovery,
  classifyConflict,
  type ResistanceCommand,
  type RecoveryState,
} from './erp-rem003-recovery';
import type { Rem003Harness } from './erp-rem003-harness';
import type { Response } from 'supertest';
const command: ResistanceCommand = {
  method: 'POST',
  path: 'sales/sale/void',
  body: { expectedVersion: 1 },
  role: 'admin',
  key: 'original-command',
};
const transient = {
  message: 'Sale lifecycle changed; retry with the same Idempotency-Key',
  error: 'CONFLICT',
};
const state: RecoveryState = {
  sales: [{ id: 'sale', status: 'CONFIRMED', version: 1 }],
  receivables: [],
  routes: [],
};
const response = (status: number, body: object = {}) =>
  ({ status, body, headers: {} }) as Response;
describe('REM003 explicit recovery contract (unit fixtures, not GIS/runtime acceptance)', () => {
  it('replays only a proven rollback with unchanged key/payload and records both responses', async () => {
    const run = new Rem003Recovery({} as Rem003Harness, () =>
      Promise.resolve(state),
    );
    const send = jest
      .fn()
      .mockResolvedValueOnce(response(409, transient))
      .mockResolvedValue(response(201));
    expect((await run.cycle(0, () => run.execute(command, send))).status).toBe(
      201,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(run.operations.map((x) => [x.http, x.key, x.payloadHash])).toEqual([
      [409, command.key, run.operations[0].payloadHash],
      [201, command.key, run.operations[0].payloadHash],
    ]);
    expect(run.operations[0].rollbackVerified).toBe(true);
  });
  it.each([
    [
      409,
      { message: 'Account receivable version does not match expectedVersion' },
    ],
    [
      409,
      {
        message:
          'Idempotency-Key was already used for a different payment payload',
      },
    ],
    [409, { message: 'ROUTE_SETTLEMENT_REOPEN_REQUIRED' }],
    [409, { message: 'unknown conflict' }],
    [500, { message: 'Internal server error' }],
  ])('never retries unapproved response %s %j', async (status, body) => {
    const run = new Rem003Recovery({} as Rem003Harness, () =>
      Promise.resolve(state),
    );
    const send = jest.fn().mockResolvedValue(response(status, body));
    expect((await run.cycle(0, () => run.execute(command, send))).status).toBe(
      status,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('refuses changed effects/versions after rejection', async () => {
    let calls = 0;
    const run = new Rem003Recovery({} as Rem003Harness, () =>
      Promise.resolve(
        ++calls === 1
          ? state
          : {
              ...state,
              sales: [{ id: 'sale', status: 'CONFIRMED', version: 2 }],
            },
      ),
    );
    const send = jest.fn().mockResolvedValue(response(409, transient));
    expect((await run.cycle(0, () => run.execute(command, send))).status).toBe(
      409,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(run.operations[0].rollbackVerified).toBe(false);
  });
  it('bounds recoveries and preserves an exhausted conflict as failure', async () => {
    const run = new Rem003Recovery(
      {} as Rem003Harness,
      () => Promise.resolve(state),
      2,
    );
    const send = jest.fn().mockResolvedValue(response(409, transient));
    expect((await run.cycle(0, () => run.execute(command, send))).status).toBe(
      409,
    );
    expect(send).toHaveBeenCalledTimes(3);
    expect(run.operations[2].classification).toBe('recovery-exhausted');
  });
  it('records transport failure and never reissues an unknown commit outcome', async () => {
    const run = new Rem003Recovery({} as Rem003Harness, () =>
      Promise.resolve(state),
    );
    const send = jest.fn().mockRejectedValue(new Error('connection aborted'));
    await expect(
      run.cycle(0, () => run.execute(command, send)),
    ).rejects.toThrow('connection aborted');
    expect(send).toHaveBeenCalledTimes(1);
    expect(run.operations[0].classification).toBe('transport-error');
  });
  it('matches the route collection contract, not an unrelated receivable error', () => {
    const collection = {
      ...command,
      path: 'delivery-orders/order/collections',
    };
    expect(
      classifyConflict(collection, {
        code: 'COLLECTION_CONCURRENCY_CONFLICT',
        message:
          'The route collection could not be completed after concurrent retries',
      }),
    ).toBe('recoverable-rollback');
    expect(
      classifyConflict(collection, {
        code: 'COLLECTION_CONCURRENCY_CONFLICT',
        message: 'unapproved message',
      }),
    ).toBe('nonrecoverable-http-conflict');
  });
  it('keeps purchase first-attempt and PATCH without invented idempotency keys', () => {
    expect(classifyConflict({ ...command, path: 'purchases' }, transient)).toBe(
      'nonrecoverable-http-conflict',
    );
    expect(
      classifyConflict(
        {
          ...command,
          method: 'PATCH',
          key: null,
          path: 'delivery-orders/order/status',
        },
        transient,
      ),
    ).toBe('recoverable-rollback');
  });
});
