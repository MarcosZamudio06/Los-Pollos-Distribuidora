// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  recoveryViolations,
  readVisibleSaleNumbers,
  type RecoverySnapshot,
} from "../../../../shared/pedidos-recovery-contract";
const expected = {
  saleId: "synthetic-sale",
  saleNumber: "SALE-SYNTHETIC",
  locationId: "branch",
  committedSeq: 1,
};
function evidence(): RecoverySnapshot {
  const filters = { locationId: "branch", limit: "2" };
  return {
    pageClosed: false,
    browserConnected: true,
    selectedLocationId: "branch",
    visible: [expected.saleNumber],
    cache: [
      {
        key: "orders-key",
        filters,
        ids: [expected.saleId],
        observers: 1,
        status: "success",
        fetchStatus: "idle",
        dataUpdatedAt: 10,
      },
    ],
    events: [
      { seq: 2, at: 2, phase: "onConnected", key: "orders-key" },
      { seq: 3, at: 3, phase: "cancelQueries-end", key: "orders-key" },
      { seq: 4, at: 4, phase: "invalidateQueries-start", key: "orders-key" },
      { seq: 5, at: 5, phase: "http-start", id: "request-1", filters },
      { seq: 6, at: 6, phase: "http-headers", id: "request-1", status: 200 },
      {
        seq: 7,
        at: 7,
        phase: "http-json-complete",
        id: "request-1",
        ids: [expected.saleId],
        locations: ["branch"],
      },
      {
        seq: 8,
        at: 8,
        phase: "cache-updated",
        key: "orders-key",
        ids: [expected.saleId],
      },
      { seq: 9, at: 9, phase: "invalidateQueries-end", key: "orders-key" },
    ],
  };
}
describe("permanent Pedidos recovery evidence oracle", () => {
  it("accepts the complete scoped body/cache/DOM chain", () =>
    expect(recoveryViolations(evidence(), expected)).toEqual([]));
  it("rejects headers without completed JSON", () => {
    const s = evidence();
    s.events = s.events.filter((x) => x.phase !== "http-json-complete");
    expect(recoveryViolations(s, expected)).toContain(
      "NO_COMPLETED_AUTHORITATIVE_BODY",
    );
  });
  it("does not count a preconnection GET just because headers arrived later", () => {
    const s = evidence();
    s.events.find((x) => x.phase === "http-start")!.seq = 1;
    expect(recoveryViolations(s, expected)).toContain("NO_POST_CONNECT_GET");
  });
  it("rejects an old response accepted after verified recovery", () => {
    const s = evidence();
    s.cache[0].ids = [];
    s.visible = [];
    expect(
      recoveryViolations(s, { ...expected, previouslyVerified: true }),
    ).toContain("STALE_REVERSION");
  });
  it("detects cache updated without a DOM update", () => {
    const s = evidence();
    s.visible = [];
    expect(recoveryViolations(s, expected)).toContain("DOM_CACHE_DIVERGENCE");
  });
  it("rejects another branch or different filters", () => {
    const s = evidence();
    s.events.find((x) => x.phase === "http-start")!.filters = {
      locationId: "other",
    };
    expect(recoveryViolations(s, expected)).toContain("NO_POST_CONNECT_GET");
  });
  it("rejects an unobserved cache or closed browser", () => {
    const s = evidence();
    s.cache[0].observers = 0;
    s.pageClosed = true;
    expect(recoveryViolations(s, expected)).toContain("NO_ACTIVE_QUERY");
    expect(recoveryViolations(s, expected)).toContain("BROWSER_CLOSED");
  });
  it("rejects duplicates and missing invalidation completion", () => {
    const s = evidence();
    s.visible.push(expected.saleNumber);
    s.events = s.events.filter((x) => x.phase !== "invalidateQueries-end");
    expect(recoveryViolations(s, expected)).toContain("DOM_DUPLICATE");
    expect(recoveryViolations(s, expected)).toContain(
      "NO_INVALIDATION_COMPLETE",
    );
  });
  it("reads the sale paragraph instead of concatenated article customer text", () => {
    document.body.innerHTML =
      "<article><p>SALE-000001</p><p>UAT synthetic</p></article>";
    expect(readVisibleSaleNumbers(document)).toEqual(["SALE-000001"]);
  });
  it("requires proof that the retained old JSON actually completed after release", () => {
    expect(
      recoveryViolations(evidence(), { ...expected, lateReleaseSeq: 10 }),
    ).toContain("OLD_REPLY_NOT_DELIVERED_LATE");
  });
  it("rejects an unexpected extra request filter", () => {
    const s = evidence();
    s.events.find((x) => x.phase === "http-start")!.filters = {
      locationId: "branch",
      limit: "2",
      paymentType: "CREDIT_SALE",
    };
    expect(recoveryViolations(s, expected)).toContain("NO_POST_CONNECT_GET");
  });
});
