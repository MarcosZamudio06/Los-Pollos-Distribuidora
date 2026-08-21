import { describe, expect, it } from "vitest";
import {
  getPendingNavigationCandidate,
  hasNavigationCoordinates,
} from "../../rutas-reparto/navigationTarget";

describe("driver navigation target", () => {
  it("selects the lowest pending stopSequence and ignores final orders", () => {
    const target = getPendingNavigationCandidate({
      id: "route-1",
      name: "Ruta comercial",
      status: "IN_PROGRESS",
      type: "SALE_DELIVERY",
      orders: [
        {
          id: "final",
          status: "DELIVERED",
          stopSequence: 1,
          latitude: 19.1,
          longitude: -96.1,
        },
        {
          id: "later",
          status: "PENDING",
          stopSequence: 5,
          latitude: 19.15,
          longitude: -96.15,
        },
        {
          id: "next",
          status: "IN_ROUTE",
          stopSequence: 2,
          latitude: 19.12,
          longitude: -96.12,
        },
      ],
    });

    expect(target).toEqual(
      expect.objectContaining({ id: "next", stopSequence: 2 }),
    );
  });

  it("uses the physical destination for pending logistics routes", () => {
    const target = getPendingNavigationCandidate({
      id: "route-2",
      name: "Ruta logística",
      status: "IN_PROGRESS",
      type: "CEDIS_SUPPLY",
      logisticsStop: {
        status: "PENDING",
        inventoryTransferId: "transfer-1",
        transferNumber: "TR-1",
        transferStatus: "IN_TRANSIT",
        origin: { id: "branch-1", name: "Sucursal" },
        destination: {
          id: "cedis-1",
          name: "CEDIS",
          latitude: 19.2,
          longitude: -96.2,
        },
        items: [],
      },
    });

    expect(target).toEqual(
      expect.objectContaining({
        id: "transfer-1",
        kind: "LOGISTICS_STOP",
        label: "CEDIS",
        latitude: 19.2,
        longitude: -96.2,
      }),
    );
    expect(hasNavigationCoordinates(target)).toBe(true);
  });

  it("returns no target when every domain stop is final", () => {
    expect(
      getPendingNavigationCandidate({
        id: "route-3",
        name: "Ruta cerrada",
        status: "IN_PROGRESS",
        type: "SALE_DELIVERY",
        orders: [
          {
            id: "order-1",
            status: "RETURNED",
            latitude: 19.1,
            longitude: -96.1,
          },
        ],
      }),
    ).toBeNull();
  });
});
