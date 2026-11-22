// Imported only by the opt-in harness transform in an isolated source copy.
type DiagnosticSocket = {
  connected: boolean;
  active?: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  io: {
    _readyState?: string;
    engine?: { readyState?: string; transport?: { name?: string } };
    on(event: string, handler: (...args: unknown[]) => void): unknown;
  };
};
const installed = new WeakSet<object>();
export function traceRealtime(value: Record<string, unknown>) {
  const g = globalThis as unknown as { __uatRealtime?: unknown[] };
  g.__uatRealtime?.push({ ...value, at: Date.now() });
}
export function instrumentRealtime(
  candidate: unknown,
  name: string,
  scope: string | undefined,
  tokenPresent: boolean,
) {
  const socket = candidate as DiagnosticSocket;
  const state = () => ({
    name,
    scope,
    tokenPresent,
    connected: socket.connected,
    active: socket.active,
    manager: socket.io._readyState,
    engine: socket.io.engine?.readyState,
    transport: socket.io.engine?.transport?.name,
  });
  traceRealtime({ ...state(), phase: "subscribe" });
  if (installed.has(socket)) return;
  installed.add(socket);
  for (const method of ["connect", "disconnect"] as const) {
    const original = socket[method].bind(socket);
    socket[method] = () => {
      traceRealtime({ ...state(), phase: method });
      return original();
    };
  }
  for (const event of ["connect", "disconnect", "connect_error"])
    socket.on(event, (reason) =>
      traceRealtime({
        ...state(),
        phase: event,
        reason:
          typeof reason === "string"
            ? reason
            : reason instanceof Error
              ? reason.message
              : undefined,
      }),
    );
  for (const event of [
    "open",
    "close",
    "error",
    "reconnect_attempt",
    "reconnect",
    "reconnect_error",
    "reconnect_failed",
  ])
    socket.io.on(event, (reason) =>
      traceRealtime({
        ...state(),
        phase: "manager-" + event,
        reason: typeof reason === "string" ? reason : undefined,
      }),
    );
}
