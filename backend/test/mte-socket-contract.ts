// Test harness only. Never infer authorization from a transport timeout/close.
export function fleetNamespaceRejected(packets: string[]): boolean {
  if (packets.some((packet) => packet.startsWith('40/fleet,'))) return false;
  return packets.some((packet) => {
    if (!packet.startsWith('44/fleet,')) return false;
    try {
      const data = JSON.parse(packet.slice('44/fleet,'.length)) as {
        message?: unknown;
      };
      return data.message === 'Unauthorized socket session';
    } catch {
      return false;
    }
  });
}

export function transportDiagnostic(
  error: unknown,
  phase: string,
  durationMs: number,
): string {
  const e = error as { name?: unknown; cause?: { code?: unknown } } | null;
  const name = ['TimeoutError', 'AbortError', 'TypeError'].includes(
    String(e?.name),
  )
    ? String(e?.name)
    : 'UnknownError';
  const code = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(String(e?.cause?.code))
    ? String(e?.cause?.code)
    : 'UNKNOWN';
  return JSON.stringify({
    phase,
    durationMs: Math.max(0, Math.round(durationMs)),
    name,
    code,
  });
}
