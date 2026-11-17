import { PreconditionBlocked, ScenarioScope } from './uat-scenario-scope';

describe('UAT scenario ownership', () => {
  it('drains a retained task before returning from failure cleanup', async () => {
    const scope = new ScenarioScope('failed');
    let release!: () => void;
    let completed = false;
    const task = scope.track(
      new Promise<void>((r) => {
        release = r;
      }).then(() => {
        completed = true;
      }),
    );
    scope.defer('held real-response gate', release);
    await scope.finish();
    await task;
    expect(completed).toBe(true);
    expect(scope.pendingCount).toBe(0);
    expect(scope.resources.every((r) => r.closed)).toBe(true);
  });
  it('cancels timers without cancelling another owner', async () => {
    const failed = new ScenarioScope('failed');
    const valid = new ScenarioScope('independent');
    const pending = failed.track(failed.delay(1000));
    const result = expect(pending).rejects.toThrow('cancelled');
    await failed.finish();
    await result;
    await expect(
      valid.phase('independent operation', () => Promise.resolve(42), 100),
    ).resolves.toBe(42);
    await valid.finish();
  });
  it('does not run a dependent mutation without its positive control', () => {
    const scope = new ScenarioScope('revocation');
    const mutation = jest.fn();
    expect(() => {
      scope.require('positive delivery', false, 'socket not connected');
      mutation();
    }).toThrow(PreconditionBlocked);
    expect(mutation).not.toHaveBeenCalled();
  });
  it('makes cleanup idempotent and reverse ordered', async () => {
    const scope = new ScenarioScope('ordered');
    const order: number[] = [];
    scope.defer('context', () => {
      order.push(1);
    });
    scope.defer('retained route', () => {
      order.push(2);
    });
    await scope.finish();
    await scope.finish();
    expect(order).toEqual([2, 1]);
  });
  it('fails closed if an owned resource cannot settle', async () => {
    const scope = new ScenarioScope('stuck', 20);
    scope.defer('unsettled handle', () => new Promise<void>(() => {}));
    await expect(scope.finish()).rejects.toThrow('did not settle');
    expect(scope.resources[0].closed).toBe(false);
  });
  it('records a finite phase failure and drains abortable work', async () => {
    const scope = new ScenarioScope('budget');
    await expect(
      scope.phase('held operation', () => scope.delay(1000), 10),
    ).rejects.toThrow('Budget exhausted');
    await scope.finish();
    expect(scope.phases[0].outcome).toBe('FAIL');
    expect(scope.pendingCount).toBe(0);
  });
});
