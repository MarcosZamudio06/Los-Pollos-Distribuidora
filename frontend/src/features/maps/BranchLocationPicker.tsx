import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "../../components/ui";
import { ApiClientError } from "../../lib/api";
import { LazyMapCanvas } from "./LazyMapCanvas";
import { mapsService } from "./mapsService";
import { MapUnavailableState } from "./MapUnavailableState";
import type {
  MapClientConfig,
  MapCoordinates,
  MapGeocodingClient,
  MapGeocodingResult,
} from "./types";

const SEARCH_DEBOUNCE_MS = 300;

type CoordinateDrafts = {
  latitude: string;
  longitude: string;
};

type SearchStatus = "idle" | "loading" | "results" | "empty" | "error" | "unavailable";
type ReverseStatus = "idle" | "loading" | "error" | "unavailable" | "empty";

export type BranchLocationGeocodingClient = MapGeocodingClient;

export type BranchLocationPickerProps = {
  address: string;
  config: MapClientConfig | null;
  coordinates: MapCoordinates | null;
  accessToken?: string | null;
  disabled?: boolean;
  geocodingClient?: BranchLocationGeocodingClient;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (coordinates: MapCoordinates) => void;
};

function formatCoordinate(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function toCoordinateDrafts(coordinates: MapCoordinates | null): CoordinateDrafts {
  return {
    latitude: formatCoordinate(coordinates?.latitude),
    longitude: formatCoordinate(coordinates?.longitude),
  };
}

function isValidCoordinatePair(coordinates: CoordinateDrafts): MapCoordinates | null {
  if (!coordinates.latitude.trim() || !coordinates.longitude.trim()) return null;

  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function errorStatus(error: unknown) {
  if (error instanceof ApiClientError) return error.statusCode;
  if (typeof error === "object" && error !== null) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? statusCode : null;
  }
  return null;
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

function attributionLabel(result: MapGeocodingResult) {
  const metadata = [result.osmType, result.osmId].filter(Boolean).join(" ");
  return metadata ? `${result.label} · ${metadata}` : result.label;
}

export function BranchLocationPicker({
  accessToken,
  address,
  config,
  coordinates,
  disabled = false,
  geocodingClient,
  onAddressChange,
  onCoordinatesChange,
}: BranchLocationPickerProps) {
  const [coordinateDrafts, setCoordinateDrafts] = useState(() =>
    toCoordinateDrafts(coordinates),
  );
  const [hasLocalCoordinateDraft, setHasLocalCoordinateDraft] = useState(false);
  const [proposedAddress, setProposedAddress] = useState<MapGeocodingResult | null>(null);
  const [reverseStatus, setReverseStatus] = useState<ReverseStatus>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapGeocodingResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [initialCoordinates] = useState<MapCoordinates | undefined>(
    () => coordinates ?? undefined,
  );
  const reverseAbortRef = useRef<AbortController | null>(null);
  const reverseRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const skipNextSearchRef = useRef(false);

  const defaultGeocodingClient = useMemo<BranchLocationGeocodingClient>(
    () => ({
      reverse: (point, options) =>
        mapsService.reverseAddress(point, accessToken, options),
      search: (query, options) =>
        mapsService.searchAddresses(query, accessToken, options),
    }),
    [accessToken],
  );
  const client = geocodingClient ?? defaultGeocodingClient;
  const geocodingEnabled = Boolean(config?.capabilities.geocoding) && !disabled;
  const clientRef = useRef(client);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => {
    const query = searchQuery.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    if (!geocodingEnabled || query.length < 3) {
      return undefined;
    }
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return undefined;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      setSearchStatus("loading");
      void clientRef.current
        .search(query, { limit: 5, signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted || searchRequestIdRef.current !== requestId) return;
          setSearchResults(results);
          setSearchStatus(results.length > 0 ? "results" : "empty");
        })
        .catch((error: unknown) => {
          if (isAbortError(error, controller.signal) || searchRequestIdRef.current !== requestId) return;
          setSearchStatus(errorStatus(error) === 503 ? "unavailable" : "error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    };
  }, [geocodingEnabled, searchQuery]);

  useEffect(() => {
    return () => {
      reverseAbortRef.current?.abort();
      searchAbortRef.current?.abort();
    };
  }, []);

  function updateCoordinates(nextCoordinates: MapCoordinates, reverse = false) {
    const nextDrafts = toCoordinateDrafts(nextCoordinates);
    setCoordinateDrafts(nextDrafts);
    setHasLocalCoordinateDraft(true);
    onCoordinatesChange(nextCoordinates);
    if (reverse) void reverseGeocode(nextCoordinates);
  }

  async function reverseGeocode(nextCoordinates: MapCoordinates) {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    const requestId = reverseRequestIdRef.current + 1;
    reverseRequestIdRef.current = requestId;
    setProposedAddress(null);
    setReverseStatus("loading");

    try {
      const result = await client.reverse(nextCoordinates, { signal: controller.signal });
      if (controller.signal.aborted || reverseRequestIdRef.current !== requestId) return;
      setProposedAddress(result);
      setReverseStatus("idle");
    } catch (error: unknown) {
      if (isAbortError(error, controller.signal) || reverseRequestIdRef.current !== requestId) return;
      const status = errorStatus(error);
      setReverseStatus(
        status === 503 ? "unavailable" : status === 422 ? "empty" : "error",
      );
    }
  }

  function handleManualCoordinateChange(
    field: keyof CoordinateDrafts,
    value: string,
  ) {
    setCoordinateDrafts((current) => {
      const next = { ...current, [field]: value };
      const parsed = isValidCoordinatePair(next);
      if (parsed) onCoordinatesChange(parsed);
      return next;
    });
    setHasLocalCoordinateDraft(true);
  }

  function handleSearchQueryChange(value: string) {
    skipNextSearchRef.current = false;
    setSearchQuery(value);
    setSearchResults([]);
    setSearchStatus("idle");
  }

  function handleSearchResultSelect(result: MapGeocodingResult) {
    skipNextSearchRef.current = true;
    setSearchQuery(result.label);
    setSearchResults([]);
    setSearchStatus("idle");
    setProposedAddress(result);
    updateCoordinates({ latitude: result.latitude, longitude: result.longitude });
  }

  const mapMarker = coordinates
    ? {
        coordinates,
        draggable: true,
        onDragEnd: (nextCoordinates: MapCoordinates) =>
          updateCoordinates(nextCoordinates, true),
      }
    : undefined;
  const visibleSearchStatus =
    !geocodingEnabled || searchQuery.trim().length < 3 ? "idle" : searchStatus;

  return (
    <section
      aria-label="Selector de ubicación de sucursal"
      className="grid gap-4 rounded-[1.75rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow-card)] sm:p-6"
    >
      <header className="rounded-2xl bg-[var(--erp-graphite)] p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-soft)]">
          Ubicación
        </p>
        <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">
          Captura manual y asistencia cartográfica
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/70">
          El mapa propone coordenadas y direcciones; los campos manuales siguen siendo la fuente de verdad.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid content-start gap-4">
          <label
            className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
            htmlFor="branch-picker-address"
          >
            Dirección operativa
            <Input
              autoComplete="street-address"
              data-testid="branch-address"
              disabled={disabled}
              id="branch-picker-address"
              onChange={(event) => onAddressChange(event.target.value)}
              value={address}
            />
          </label>

          <label
            className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
            htmlFor="branch-address-search"
          >
            Buscar dirección
            <Input
              aria-describedby="branch-address-search-help"
              data-testid="address-search"
              disabled={!geocodingEnabled}
              id="branch-address-search"
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              placeholder="Escribe al menos 3 caracteres"
              value={searchQuery}
            />
            <span
              className="text-xs font-normal text-[var(--erp-muted-foreground)]"
              id="branch-address-search-help"
            >
              Selecciona un resultado para mover el marcador.
            </span>
          </label>

          {visibleSearchStatus === "loading" ? (
            <p aria-live="polite" className="text-sm text-[var(--erp-muted-foreground)]" role="status">
              Buscando dirección…
            </p>
          ) : null}
          {visibleSearchStatus === "empty" ? (
            <p className="text-sm text-[var(--erp-muted-foreground)]" role="status">
              No se encontraron direcciones para esa búsqueda.
            </p>
          ) : null}
          {visibleSearchStatus === "unavailable" ? (
            <p className="text-sm font-semibold text-[var(--erp-danger)]" role="alert">
              La geocodificación no está disponible temporalmente. La captura manual continúa disponible.
            </p>
          ) : null}
          {visibleSearchStatus === "error" ? (
            <p className="text-sm font-semibold text-[var(--erp-danger)]" role="alert">
              No se pudo buscar la dirección. Continúa con la captura manual.
            </p>
          ) : null}
          {searchResults.length > 0 ? (
            <ul aria-label="Resultados de dirección" className="grid gap-2">
              {searchResults.map((result, index) => (
                <li key={`${result.latitude}-${result.longitude}-${index}`}>
                  <button
                    className="w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 py-2 text-left text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-gold)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.2)]"
                    data-testid={`search-result-${index}`}
                    onClick={() => handleSearchResultSelect(result)}
                    type="button"
                  >
                    {attributionLabel(result)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-picker-latitude"
            >
              Latitud
              <Input
                data-testid="branch-latitude"
                disabled={disabled}
                id="branch-picker-latitude"
                inputMode="decimal"
                onChange={(event) => handleManualCoordinateChange("latitude", event.target.value)}
                type="number"
                value={
                  hasLocalCoordinateDraft
                    ? coordinateDrafts.latitude
                    : formatCoordinate(coordinates?.latitude)
                }
              />
            </label>
            <label
              className="grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]"
              htmlFor="branch-picker-longitude"
            >
              Longitud
              <Input
                data-testid="branch-longitude"
                disabled={disabled}
                id="branch-picker-longitude"
                inputMode="decimal"
                onChange={(event) => handleManualCoordinateChange("longitude", event.target.value)}
                type="number"
                value={
                  hasLocalCoordinateDraft
                    ? coordinateDrafts.longitude
                    : formatCoordinate(coordinates?.longitude)
                }
              />
            </label>
          </div>
        </div>

        <div className="grid content-start gap-3">
          {config ? (
            <LazyMapCanvas
              ariaLabel="Mapa para seleccionar la ubicación de la sucursal"
              className="min-h-[22rem]"
              config={config}
              initialCoordinates={initialCoordinates}
              marker={mapMarker}
              onCoordinateChange={(nextCoordinates) =>
                updateCoordinates(nextCoordinates, true)
              }
            />
          ) : (
            <MapUnavailableState className="min-h-[22rem]" reason="config" />
          )}

          <div
            aria-label="Atribución cartográfica"
            className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--erp-muted-foreground)]"
            data-testid="map-attribution"
          >
            {config?.attribution.length ? (
              <>
                <span className="font-semibold">Atribución:</span>{" "}
                {config.attribution.map((item, index) => (
                  <span key={`${item.label}-${index}`}>
                    {index > 0 ? " · " : ""}
                    {item.url ? (
                      <a
                        className="underline underline-offset-2"
                        href={item.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.label}
                      </a>
                    ) : (
                      item.label
                    )}
                  </span>
                ))}
              </>
            ) : (
              "Atribución cartográfica pendiente de configuración."
            )}
          </div>

          {reverseStatus === "loading" ? (
            <p aria-live="polite" className="text-sm text-[var(--erp-muted-foreground)]" role="status">
              Proponiendo una dirección…
            </p>
          ) : null}
          {reverseStatus === "unavailable" ? (
            <p className="text-sm font-semibold text-[var(--erp-danger)]" role="alert">
              La geocodificación no está disponible temporalmente. Se conservaron tus campos manuales.
            </p>
          ) : null}
          {reverseStatus === "empty" ? (
            <p className="text-sm font-semibold text-[var(--erp-muted-foreground)]" role="status">
              No se encontró una dirección para esas coordenadas. Puedes conservar la captura manual.
            </p>
          ) : null}
          {reverseStatus === "error" ? (
            <p className="text-sm font-semibold text-[var(--erp-danger)]" role="alert">
              No se pudo proponer una dirección. Puedes conservar la captura manual.
            </p>
          ) : null}
          {proposedAddress ? (
            <div
              aria-live="polite"
              className="grid gap-3 rounded-2xl border border-[rgba(47,111,115,0.22)] bg-[rgba(47,111,115,0.07)] p-4"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-info)]">
                  Dirección propuesta
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--erp-foreground)]">
                  {proposedAddress.label}
                </p>
              </div>
              <Button
                data-testid="apply-proposed-address"
                disabled={disabled}
                onClick={() => {
                  onAddressChange(proposedAddress.label);
                  setProposedAddress(null);
                }}
                size="sm"
                variant="secondary"
              >
                Usar esta dirección
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default BranchLocationPicker;
