import { createHash, randomUUID } from 'node:crypto';
import { request, type IncomingMessage, type ServerResponse } from 'node:http';

type Gate = {
  id: string;
  mode: 'headers' | 'body';
  captured: Promise<void>;
  release(): void;
  trace: Array<Record<string, unknown>>;
};
type InternalGate = Gate & { done(): void; wait: Promise<void> };
/** Test-only reverse proxy: authorization/controller/DB remain the real AppModule. */
export class PedidosDeliveryGates {
  private gates = new Map<string, InternalGate>();
  origin = '';
  create(mode: 'headers' | 'body'): Gate {
    let release!: () => void, done!: () => void;
    const wait = new Promise<void>((r) => (release = r));
    const captured = new Promise<void>((r) => (done = r));
    const gate: InternalGate = {
      id: randomUUID(),
      mode,
      wait,
      captured,
      release,
      done,
      trace: [],
    };
    this.gates.set(gate.id, gate);
    return gate;
  }
  middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const id = req.headers['x-uat-orders-gate'];
    const gate = typeof id === 'string' ? this.gates.get(id) : undefined;
    if (
      !gate ||
      req.method !== 'GET' ||
      !req.url?.startsWith('/api/sales/orders?')
    )
      return next();
    const headers = { ...req.headers, 'accept-encoding': 'identity' };
    delete headers['x-uat-orders-gate'];
    const upstream = request(
      new URL(req.url, this.origin),
      { headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          gate.trace.push({
            phase: 'upstream-body-complete',
            at: Date.now(),
            status: response.statusCode,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
          const sendHeaders = () => {
            const safe = {
              ...response.headers,
              'cache-control': 'no-transform',
            };
            delete safe['transfer-encoding'];
            res.writeHead(response.statusCode ?? 502, safe);
          };
          if (gate.mode === 'body' && !res.destroyed) {
            sendHeaders();
            res.flushHeaders();
            res.write(bytes.subarray(0, 16));
            gate.trace.push({
              phase: 'headers-and-partial-body-sent',
              at: Date.now(),
            });
          }
          gate.done();
          void gate.wait.then(() => {
            gate.trace.push({ phase: 'delivery-released', at: Date.now() });
            if (!res.destroyed) {
              if (gate.mode === 'headers') {
                sendHeaders();
                res.end(bytes);
              } else res.end(bytes.subarray(16));
            }
            this.gates.delete(gate.id);
          });
        });
      },
    );
    upstream.setTimeout(18000, () => upstream.destroy());
    upstream.on('error', () => {
      gate.trace.push({ phase: 'upstream-error', at: Date.now() });
      gate.done();
      if (!res.destroyed) {
        res.statusCode = 502;
        res.end();
      }
    });
    upstream.end();
  };
}
