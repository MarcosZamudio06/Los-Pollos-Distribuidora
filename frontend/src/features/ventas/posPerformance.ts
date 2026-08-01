type PosOperation =
  | "cart-update"
  | "checkout"
  | "checkout-registration"
  | "print"
  | "scan-feedback"
  | "search";

function metricName(operation: PosOperation) {
  return `pos:${operation}`;
}

export function startPosMeasurement(operation: PosOperation) {
  if (typeof performance === "undefined") return;
  const name = metricName(operation);
  performance.clearMarks(`${name}:start`);
  performance.mark(`${name}:start`);
}

export function finishPosMeasurement(
  operation: PosOperation,
  targetMs?: number,
) {
  if (typeof performance === "undefined") return;
  const name = metricName(operation);
  const start = `${name}:start`;
  if (!performance.getEntriesByName(start, "mark").length) return;

  performance.clearMeasures(name);
  performance.measure(name, start);
  performance.clearMarks(start);

  const duration = performance
    .getEntriesByName(name, "measure")
    .at(-1)?.duration;
  if (targetMs && duration && duration > targetMs && import.meta.env.DEV) {
    console.warn(
      `POS ${operation} exceeded ${targetMs} ms: ${duration.toFixed(1)} ms`,
    );
  }
}

export type { PosOperation };
