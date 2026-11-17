/** Sanitized test evidence only. Never accepts business payloads or credentials. */
export type RecoveryEvent = {
  seq: number;
  at: number;
  phase: string;
  id?: string;
  key?: string;
  filters?: Record<string, string>;
  ids?: string[];
  locations?: string[];
  status?: number;
  queryStatus?: string;
  fetchStatus?: string;
  dataUpdatedAt?: number;
  observers?: number;
};
export type RecoveryCache = {
  key: string;
  filters: Record<string, string>;
  ids: string[];
  observers: number;
  status: string;
  fetchStatus: string;
  dataUpdatedAt: number;
};
export type RecoverySnapshot = {
  events: RecoveryEvent[];
  cache: RecoveryCache[];
  visible: string[];
  selectedLocationId: string;
  pageClosed: boolean;
  browserConnected: boolean;
};
export type RecoveryExpected = {
  saleId: string;
  saleNumber: string;
  locationId: string;
  committedSeq: number;
  previouslyVerified?: boolean;
  lateReleaseSeq?: number;
};
export function recoveryViolations(
  s: RecoverySnapshot,
  e: RecoveryExpected,
): string[] {
  const failures: string[] = [];
  if (s.pageClosed || !s.browserConnected) failures.push("BROWSER_CLOSED");
  const q = s.cache.find(
    (x) => x.observers > 0 && x.filters.locationId === e.locationId,
  );
  if (!q || s.selectedLocationId !== e.locationId)
    failures.push("NO_ACTIVE_QUERY");
  const connected = s.events.findLast(
    (x) =>
      x.phase === "onConnected" && x.seq > e.committedSeq && x.key === q?.key,
  );
  if (!connected) failures.push("NO_CONNECTION");
  const afterConnect = (x: RecoveryEvent) =>
    Boolean(connected && x.seq > connected.seq && x.key === q?.key);
  if (!s.events.some((x) => x.phase === "cancelQueries-end" && afterConnect(x)))
    failures.push("NO_CANCEL_COMPLETE");
  if (
    !s.events.some(
      (x) => x.phase === "invalidateQueries-end" && afterConnect(x),
    )
  )
    failures.push("NO_INVALIDATION_COMPLETE");
  const requests = s.events.filter(
    (x) =>
      x.phase === "http-start" &&
      connected &&
      x.seq > connected.seq &&
      x.seq > e.committedSeq &&
      q &&
      Object.keys(q.filters).length === Object.keys(x.filters ?? {}).length &&
      Object.entries(q.filters).every(([k, v]) => x.filters?.[k] === v),
  );
  if (!requests.length) failures.push("NO_POST_CONNECT_GET");
  const complete = s.events.find(
    (x) =>
      x.phase === "http-json-complete" &&
      x.ids?.includes(e.saleId) &&
      x.locations?.every((loc) => loc === e.locationId) &&
      requests.some((r) => r.id === x.id && r.seq < x.seq) &&
      s.events.some(
        (h) =>
          h.phase === "http-headers" &&
          h.id === x.id &&
          h.status === 200 &&
          h.seq < x.seq,
      ),
  );
  if (!complete) failures.push("NO_COMPLETED_AUTHORITATIVE_BODY");
  const cached = Boolean(
    q?.ids.includes(e.saleId) && q.status === "success" && q.dataUpdatedAt > 0,
  );
  if (
    !cached ||
    !s.events.some(
      (x) =>
        x.phase === "cache-updated" &&
        x.key === q?.key &&
        x.ids?.includes(e.saleId) &&
        complete &&
        x.seq > complete.seq,
    )
  )
    failures.push("CACHE_MISSING_SALE");
  const count = s.visible.filter((n) => n === e.saleNumber).length;
  if (!count) failures.push("DOM_MISSING_SALE");
  if (count > 1) failures.push("DOM_DUPLICATE");
  if (cached && count !== 1) failures.push("DOM_CACHE_DIVERGENCE");
  if (e.previouslyVerified && (!cached || count !== 1))
    failures.push("STALE_REVERSION");
  if (
    e.lateReleaseSeq !== undefined &&
    !s.events.some(
      (x) =>
        x.phase === "http-json-complete" &&
        x.seq > e.lateReleaseSeq! &&
        !x.ids?.includes(e.saleId) &&
        s.events.some(
          (start) =>
            start.phase === "http-start" &&
            start.id === x.id &&
            start.seq < e.committedSeq &&
            start.filters?.locationId === e.locationId,
        ),
    )
  )
    failures.push("OLD_REPLY_NOT_DELIVERED_LATE");
  return failures;
}

export function readVisibleSaleNumbers(root: {
  querySelectorAll(selector: string): Iterable<{ textContent: string | null }>;
}): string[] {
  return [...root.querySelectorAll("article p")]
    .map((x) => x.textContent?.trim() ?? "")
    .filter((text) => /^SALE-[A-Z0-9-]+$/.test(text));
}
