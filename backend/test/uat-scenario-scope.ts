// Test infrastructure only. No business requests are retried.
export class PreconditionBlocked extends Error {
  readonly code = 'BLOCKED_BY_PRECONDITION';
  constructor(
    readonly dependency: string,
    readonly primaryCause: string,
  ) {
    super(`${dependency}: ${primaryCause}`);
  }
}
export type PhaseRecord = {
  owner: string;
  phase: string;
  budgetMs: number;
  elapsedMs: number;
  outcome: string;
};
export class ScenarioScope {
  readonly controller = new AbortController();
  readonly phases: PhaseRecord[] = [];
  readonly resources: Array<{ name: string; closed: boolean }> = [];
  private cleanup: Array<() => Promise<void>> = [];
  private pending = new Set<Promise<unknown>>();
  private finishing?: Promise<void>;
  constructor(
    readonly owner: string,
    readonly teardownMs = 5000,
  ) {}
  get signal() {
    return this.controller.signal;
  }
  defer(name: string, close: () => Promise<void> | void) {
    if (this.signal.aborted) throw new Error('Owner already cancelled');
    const resource = { name, closed: false };
    this.resources.push(resource);
    this.cleanup.push(async () => {
      await close();
      resource.closed = true;
    });
  }
  track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task),
    );
    return task;
  }
  async phase<T>(
    phase: string,
    work: () => Promise<T>,
    budgetMs = 18000,
  ): Promise<T> {
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    let outcome = 'PASS';
    try {
      this.signal.throwIfAborted();
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error(`Cancelled owner: ${this.owner}`));
        this.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          () => reject(new Error(`Budget exhausted: ${phase} (${budgetMs}ms)`)),
          budgetMs,
        );
      });
      return await Promise.race([
        this.track(Promise.resolve().then(work)),
        interrupted,
      ]);
    } catch (error) {
      outcome = 'FAIL';
      throw error;
    } finally {
      clearTimeout(timer);
      this.signal.removeEventListener('abort', onAbort);
      this.phases.push({
        owner: this.owner,
        phase,
        budgetMs,
        elapsedMs: performance.now() - started,
        outcome,
      });
    }
  }
  async delay(ms: number) {
    this.signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Owned delay cancelled'));
      };
      const timer = setTimeout(() => {
        this.signal.removeEventListener('abort', abort);
        resolve();
      }, ms);
      this.signal.addEventListener('abort', abort, { once: true });
    });
  }
  require(dependency: string, satisfied: boolean, primaryCause: string) {
    if (!satisfied) throw new PreconditionBlocked(dependency, primaryCause);
  }
  finish() {
    if (!this.finishing) this.finishing = this.close();
    return this.finishing;
  }
  private async close() {
    const started = performance.now();
    this.controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const errors: unknown[] = [];
    const close = async () => {
      for (const action of this.cleanup.reverse()) {
        try {
          await action();
        } catch (error) {
          errors.push(error);
        }
      }
      await Promise.allSettled([...this.pending]);
      if (errors.length) throw new Error('Owned resource cleanup failed');
    };
    try {
      await Promise.race([
        close(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Owned teardown did not settle')),
            this.teardownMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.phases.push({
        owner: this.owner,
        phase: 'teardown',
        budgetMs: this.teardownMs,
        elapsedMs: performance.now() - started,
        outcome:
          this.resources.every((r) => r.closed) && this.pending.size === 0
            ? 'PASS'
            : 'FAIL',
      });
    }
  }
  get pendingCount() {
    return this.pending.size;
  }
}
