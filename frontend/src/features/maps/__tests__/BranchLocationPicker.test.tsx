// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../../lib/api";
import { BranchLocationPicker } from "../BranchLocationPicker";
import type {
  BranchLocationGeocodingClient,
  BranchLocationPickerProps,
} from "../BranchLocationPicker";
import type { MapCanvasProps, MapClientConfig } from "../types";

const mapHarness = vi.hoisted(() => ({
  latestProps: null as (MapCanvasProps & { marker?: MapCanvasProps["marker"] }) | null,
}));

vi.mock("../LazyMapCanvas", () => ({
  LazyMapCanvas: (props: MapCanvasProps) => {
    mapHarness.latestProps = props;
    return (
      <div data-testid="map-canvas">
        <button
          data-testid="map-click"
          onClick={() =>
            props.onCoordinateChange?.({ latitude: 19.432608, longitude: -96.1342 })
          }
          type="button"
        >
          Simulate map click
        </button>
        {props.marker?.onDragEnd ? (
          <button
            data-testid="marker-drag"
            onClick={() =>
              props.marker?.onDragEnd?.({ latitude: 19.44, longitude: -96.14 })
            }
            type="button"
          >
            Simulate marker drag
          </button>
        ) : null}
      </div>
    );
  },
}));

const config: MapClientConfig = {
  renderer: "maplibre",
  available: true,
  style: "/maps/styles/operations/style.json",
  revision: "test-revision",
  attribution: [{ label: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" }],
  defaultViewport: { latitude: 19.1738, longitude: -96.1342, zoom: 11 },
  capabilities: { geocoding: true, routing: true, optimization: true },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function renderPicker(
  overrides: Partial<BranchLocationPickerProps> = {},
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.appendChild(container);
  const onCoordinatesChange = overrides.onCoordinatesChange ?? vi.fn();
  const onAddressChange = overrides.onAddressChange ?? vi.fn();
  const geocodingClient: BranchLocationGeocodingClient =
    overrides.geocodingClient ?? {
      reverse: vi.fn().mockResolvedValue({
        label: "Av. Propuesta 10, Centro",
        latitude: 19.432608,
        longitude: -96.1342,
      }),
      search: vi.fn().mockResolvedValue([]),
    };
  const props: BranchLocationPickerProps = {
    address: "",
    config,
    coordinates: null,
    geocodingClient,
    onAddressChange,
    onCoordinatesChange,
    ...overrides,
  };

  return {
    container,
    geocodingClient,
    onAddressChange,
    onCoordinatesChange,
    render: async (nextProps: Partial<BranchLocationPickerProps> = {}) => {
      await act(async () => {
        root.render(<BranchLocationPicker {...props} {...nextProps} />);
        await Promise.resolve();
      });
    },
    root,
  };
}

async function click(container: HTMLElement, selector: string) {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLButtonElement || element instanceof HTMLInputElement)) {
    throw new Error(`Element ${selector} was not rendered.`);
  }
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function setInput(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input ${selector} was not rendered.`);
  }
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("BranchLocationPicker", () => {
  let rendered: ReturnType<typeof renderPicker> | null = null;

  beforeEach(() => {
    mapHarness.latestProps = null;
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (rendered) {
      await act(async () => rendered?.root.unmount());
      rendered.container.remove();
    }
    rendered = null;
  });

  it("updates coordinates atomically and reverse-geocodes map clicks and marker drags", async () => {
    rendered = renderPicker();
    await rendered.render();

    await click(rendered.container, '[data-testid="map-click"]');
    expect(rendered.onCoordinatesChange).toHaveBeenCalledOnce();
    expect(rendered.onCoordinatesChange).toHaveBeenCalledWith({
      latitude: 19.432608,
      longitude: -96.1342,
    });
    expect(rendered.geocodingClient.reverse).toHaveBeenCalledWith(
      { latitude: 19.432608, longitude: -96.1342 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(rendered.container.textContent).toContain("Av. Propuesta 10, Centro");

    await rendered.render({
      coordinates: { latitude: 19.432608, longitude: -96.1342 },
    });
    await click(rendered.container, '[data-testid="marker-drag"]');

    expect(rendered.onCoordinatesChange).toHaveBeenCalledTimes(2);
    expect(rendered.onCoordinatesChange).toHaveBeenLastCalledWith({
      latitude: 19.44,
      longitude: -96.14,
    });
    expect(rendered.geocodingClient.reverse).toHaveBeenCalledTimes(2);
  });

  it("keeps edited address text until the proposed reverse result is explicitly confirmed", async () => {
    const onAddressChange = vi.fn();
    rendered = renderPicker({ onAddressChange });
    await rendered.render();
    await setInput(rendered.container, '[data-testid="branch-address"]', "Texto capturado por el usuario");
    onAddressChange.mockClear();
    await rendered.render({ address: "Texto capturado por el usuario" });
    await click(rendered.container, '[data-testid="map-click"]');

    expect(onAddressChange).not.toHaveBeenCalled();
    expect(rendered.container.querySelector<HTMLInputElement>("[data-testid=branch-address]")?.value).toBe(
      "Texto capturado por el usuario",
    );
    expect(rendered.container.textContent).toContain("Dirección propuesta");

    await click(rendered.container, '[data-testid="apply-proposed-address"]');
    expect(onAddressChange).toHaveBeenCalledWith("Av. Propuesta 10, Centro");
  });

  it("debounces searches, aborts obsolete requests, and applies results only after selection", async () => {
    const firstSearch = deferred<[{ label: string; latitude: number; longitude: number }]>();
    const secondSearch = deferred<[{ label: string; latitude: number; longitude: number }]>();
    const search = vi
      .fn<BranchLocationGeocodingClient["search"]>()
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);
    rendered = renderPicker({ geocodingClient: { reverse: vi.fn(), search } });
    await rendered.render();

    await setInput(rendered.container, '[data-testid="address-search"]', "Avenida Primera");
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(search).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(search).toHaveBeenCalledOnce();

    await setInput(rendered.container, '[data-testid="address-search"]', "Avenida Segunda");
    expect(
      (search.mock.calls[0]?.[1]?.signal as AbortSignal | undefined)?.aborted,
    ).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(search).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstSearch.resolve([
        { label: "Resultado obsoleto", latitude: 1, longitude: 2 },
      ]);
      await Promise.resolve();
    });
    expect(rendered.container.textContent).not.toContain("Resultado obsoleto");

    await act(async () => {
      secondSearch.resolve([
        { label: "Resultado vigente", latitude: 19.5, longitude: -96.2 },
      ]);
      await Promise.resolve();
    });
    expect(rendered.container.textContent).toContain("Resultado vigente");
    expect(rendered.onCoordinatesChange).not.toHaveBeenCalled();

    await click(rendered.container, '[data-testid="search-result-0"]');
    expect(rendered.onCoordinatesChange).toHaveBeenCalledOnce();
    expect(rendered.onCoordinatesChange).toHaveBeenCalledWith({
      latitude: 19.5,
      longitude: -96.2,
    });
  });

  it("preserves manual coordinates and address when reverse geocoding returns 503", async () => {
    const reverse = vi
      .fn<BranchLocationGeocodingClient["reverse"]>()
      .mockRejectedValue(new ApiClientError("Geocoder unavailable", 503, null));
    rendered = renderPicker({
      address: "Dirección manual",
      geocodingClient: { reverse, search: vi.fn() },
    });
    await rendered.render();
    await click(rendered.container, '[data-testid="map-click"]');

    expect(rendered.onCoordinatesChange).toHaveBeenCalledWith({
      latitude: 19.432608,
      longitude: -96.1342,
    });
    expect(rendered.container.querySelector<HTMLInputElement>("[data-testid=branch-address]")?.value).toBe(
      "Dirección manual",
    );
    expect(rendered.container.querySelector<HTMLInputElement>("[data-testid=branch-latitude]")?.value).toBe(
      "19.432608",
    );
    expect(rendered.container.textContent).toContain("geocodificación no está disponible");
  });

  it("keeps the manual search state when forward geocoding returns 503", async () => {
    const search = vi
      .fn<BranchLocationGeocodingClient["search"]>()
      .mockRejectedValue(new ApiClientError("Geocoder unavailable", 503, null));
    rendered = renderPicker({
      address: "Dirección manual",
      coordinates: { latitude: 19.4, longitude: -96.1 },
      geocodingClient: { reverse: vi.fn(), search },
    });
    await rendered.render();
    await setInput(rendered.container, '[data-testid="address-search"]', "Avenida Centro");
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => {
      await Promise.resolve();
    });

    expect(search).toHaveBeenCalledOnce();
    expect(rendered.onCoordinatesChange).not.toHaveBeenCalled();
    expect(rendered.container.querySelector<HTMLInputElement>("[data-testid=branch-address]")?.value).toBe(
      "Dirección manual",
    );
    expect(rendered.container.querySelector<HTMLInputElement>("[data-testid=branch-latitude]")?.value).toBe(
      "19.4",
    );
    expect(rendered.container.textContent).toContain("geocodificación no está disponible");
  });

  it("keeps all manual fields available when map configuration is unavailable and shows attribution", async () => {
    rendered = renderPicker({ config: null, coordinates: null, address: "Manual" });
    await rendered.render();

    expect(rendered.container.querySelector('[data-testid="map-click"]')).toBeNull();
    expect(rendered.container.querySelector('[data-testid="branch-address"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="branch-latitude"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="branch-longitude"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="map-attribution"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain("Mapa no disponible");
    expect(rendered.container.textContent).toContain("OpenMapTiles");
    expect(rendered.container.textContent).toContain("OpenStreetMap contributors");
  });
});
