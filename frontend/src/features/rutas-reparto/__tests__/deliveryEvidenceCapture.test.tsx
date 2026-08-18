// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryEvidenceCapture } from "../components/DeliveryEvidenceCapture";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  createEvidence: vi.fn(),
  error: null as Error | null,
}));

vi.mock("../hooks", () => ({
  useCreateDeliveryEvidence: () => ({
    error: mockState.error,
    isPending: false,
    mutateAsync: mockState.createEvidence,
  }),
}));

vi.mock("../components/deliveryEvidencePhoto", () => ({
  isPhotoDataUrl: (value?: string | null) => Boolean(value),
  preparePhotoEvidence: vi
    .fn()
    .mockResolvedValue("data:image/jpeg;base64,photo"),
}));

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
  mockState.createEvidence.mockReset();
  mockState.error = null;
});

describe("DeliveryEvidenceCapture", () => {
  it("offers a device photo input for PHOTO evidence", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DeliveryEvidenceCapture
          onClose={vi.fn()}
          order={{
            id: "order-1",
            saleNumber: "SALE-000001",
            status: "DELIVERED",
          }}
          routeId="route-1"
        />,
      );
    });

    const photoInput = container.querySelector('input[type="file"]');
    expect(photoInput).toBeTruthy();
    expect(photoInput?.getAttribute("accept")).toBe("image/*");
    expect(photoInput?.getAttribute("capture")).toBe("environment");
  });

  it("sends the selected photo as persisted evidence", async () => {
    mockState.createEvidence.mockResolvedValue({});
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DeliveryEvidenceCapture
          onClose={vi.fn()}
          order={{ id: "order-1", status: "DELIVERED" }}
          routeId="route-1"
        />,
      );
    });

    const photoInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["photo"], "entrega.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      photoInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("entrega.jpg");
    expect(
      container.querySelector(
        'img[alt="Vista previa de la evidencia fotográfica"]',
      ),
    ).toBeTruthy();

    const form = container.querySelector("form");
    await act(async () =>
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );

    expect(mockState.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        payload: expect.objectContaining({
          type: "PHOTO",
          value: "data:image/jpeg;base64,photo",
        }),
      }),
    );
  });

  it("shows the backend reason when evidence validation fails", async () => {
    mockState.error = new Error(
      "capturedAt cannot be more than 5 minutes in the future",
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DeliveryEvidenceCapture
          onClose={vi.fn()}
          order={{ id: "order-1", status: "IN_ROUTE" }}
          routeId="route-1"
        />,
      );
    });

    expect(container.textContent).toContain(
      "capturedAt cannot be more than 5 minutes in the future",
    );
  });
});
