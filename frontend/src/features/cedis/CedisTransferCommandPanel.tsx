import { useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "../../components/ui";
import { formatMoney, Money } from "../../lib/money";
import {
  getCanonicalInventoryBalance,
  isCanonicalProduct,
  type Product,
  type OperationalUnit,
} from "../inventario/types";
import { formatCoordinates } from "./cedisPresentation";
import type {
  CedisCycleCommand,
  CedisCycleItem,
  CedisDashboardLocation,
  CedisLogisticsResources,
} from "./types";

type TransferMode = "SUPPLY" | "RETURN";

type TransferLineDraft = {
  productId: string;
  unit: OperationalUnit;
  quantityKg: string;
  quantityPieces: string;
};

type ProductAvailability = {
  quantityKg: number;
  quantityPieces: number;
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
};

type AvailabilityStatus = "SUFFICIENT" | "INSUFFICIENT" | "NONE";

type CedisTransferCommandPanelProps = {
  branch: CedisDashboardLocation;
  cedis: CedisDashboardLocation;
  contextKey: string;
  expectedVersion: number;
  mode: TransferMode;
  onClose: () => void;
  onSubmit: (
    payload: CedisCycleCommand,
    idempotencyKey: string,
  ) => Promise<void>;
  products: Product[];
  productsError?: unknown;
  productsLoading: boolean;
  sourceLocationId?: string;
  cycleItems?: CedisCycleItem[];
  expectedSales?: string;
  logisticsResources: CedisLogisticsResources;
};

const unitLabels: Record<OperationalUnit, string> = {
  KG: "Kilogramos",
  PIECE: "Piezas",
  KG_AND_PIECE: "Kilogramos y piezas",
};

function emptyLine(): TransferLineDraft {
  return {
    productId: "",
    unit: "KG",
    quantityKg: "",
    quantityPieces: "",
  };
}

function productUnit(product: Product | undefined): OperationalUnit {
  return product?.unit ?? product?.operationalUnit ?? "KG";
}

function productBalance(product: Product | undefined, locationId?: string) {
  return product ? getCanonicalInventoryBalance(product, locationId) : undefined;
}

function productAvailability(
  product: Product | undefined,
  locationId?: string,
): ProductAvailability {
  const balance = productBalance(product, locationId);

  return {
    quantityKg: balance?.quantityKg ?? 0,
    quantityPieces: balance?.quantityPieces ?? 0,
    reservedQuantityKg: balance?.reservedQuantityKg ?? 0,
    reservedQuantityPieces: balance?.reservedQuantityPieces ?? 0,
    availableQuantityKg: balance?.availableQuantityKg ?? 0,
    availableQuantityPieces: balance?.availableQuantityPieces ?? 0,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatUnitQuantity(
  unit: OperationalUnit,
  quantityKg: number,
  quantityPieces: number,
) {
  const values: string[] = [];
  if (unit !== "PIECE") values.push(`${formatNumber(quantityKg)} kg`);
  if (unit !== "KG") values.push(`${formatNumber(quantityPieces)} piezas`);
  return values.join(" · ");
}

function formatDimensions(quantityKg: number, quantityPieces: number) {
  return (
    formatUnitQuantity("KG_AND_PIECE", quantityKg, quantityPieces) ||
    "0 kg · 0 piezas"
  );
}

function numberValue(value: string | number | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function cycleItemQuantities(item: CedisCycleItem) {
  return {
    deliveredKg: numberValue(item.deliveredKg),
    deliveredPieces: numberValue(item.deliveredPieces),
    returnedKg: numberValue(item.returnedKg),
    returnedPieces: numberValue(item.returnedPieces),
    actualSoldKg: numberValue(item.actualSoldKg),
    actualSoldPieces: numberValue(item.actualSoldPieces),
  };
}

function cycleItemReturnCapacity(item: CedisCycleItem) {
  const quantities = cycleItemQuantities(item);
  return {
    quantityKg: Math.max(
      quantities.deliveredKg - quantities.actualSoldKg - quantities.returnedKg,
      0,
    ),
    quantityPieces: Math.max(
      quantities.deliveredPieces -
        quantities.actualSoldPieces -
        quantities.returnedPieces,
      0,
    ),
  };
}

function valuationQuantity(
  unit: OperationalUnit,
  quantityKg: number,
  quantityPieces: number,
) {
  if (unit === "KG") return quantityKg;
  if (unit === "PIECE") return quantityPieces;
  return quantityKg > 0 ? quantityKg : quantityPieces;
}

function lineValueQuantity(line: TransferLineDraft) {
  const quantities = lineQuantities(line);
  return valuationQuantity(
    line.unit,
    quantities.quantityKg,
    quantities.quantityPieces,
  );
}

function isPositiveCycleBalance(item: CedisCycleItem) {
  const remaining = cycleItemReturnCapacity(item);
  if (item.unit === "KG") return remaining.quantityKg > 0;
  if (item.unit === "PIECE") return remaining.quantityPieces > 0;
  return remaining.quantityKg > 0 || remaining.quantityPieces > 0;
}

function hasProductAvailability(
  product: Product,
  unitOverride?: OperationalUnit,
  locationId?: string,
) {
  const unit = unitOverride ?? productUnit(product);
  const balance = productAvailability(product, locationId);
  return (
    (unit !== "PIECE" && balance.availableQuantityKg > 0) ||
    (unit !== "KG" && balance.availableQuantityPieces > 0)
  );
}

function lineQuantities(line: TransferLineDraft) {
  const quantityKg = Number(line.quantityKg);
  const quantityPieces = Number(line.quantityPieces);
  return {
    quantityKg:
      line.unit !== "PIECE" && Number.isFinite(quantityKg) ? quantityKg : 0,
    quantityPieces:
      line.unit !== "KG" && Number.isFinite(quantityPieces)
        ? quantityPieces
        : 0,
  };
}

function lineAvailability(
  product: Product | undefined,
  line: TransferLineDraft,
  locationId?: string,
) {
  const balance = productAvailability(product, locationId);
  const requested = lineQuantities(line);
  const shortageKg = Math.max(
    requested.quantityKg - balance.availableQuantityKg,
    0,
  );
  const shortagePieces = Math.max(
    requested.quantityPieces - balance.availableQuantityPieces,
    0,
  );
  const hasAvailable =
    (line.unit !== "PIECE" && balance.availableQuantityKg > 0) ||
    (line.unit !== "KG" && balance.availableQuantityPieces > 0);
  const status: AvailabilityStatus =
    shortageKg > 0 || shortagePieces > 0
      ? "INSUFFICIENT"
      : hasAvailable
        ? "SUFFICIENT"
        : "NONE";

  return {
    balance,
    requested,
    shortageKg,
    shortagePieces,
    returnAvailableKg: balance.availableQuantityKg,
    returnAvailablePieces: balance.availableQuantityPieces,
    status,
  };
}

function returnLineAvailability(
  product: Product | undefined,
  line: TransferLineDraft,
  cycleItem: CedisCycleItem | undefined,
  locationId?: string,
) {
  const details = lineAvailability(product, line, locationId);
  if (!cycleItem) {
    return {
      ...details,
      returnAvailableKg: 0,
      returnAvailablePieces: 0,
      status: "NONE" as AvailabilityStatus,
    };
  }

  const cycleCapacity = cycleItemReturnCapacity(cycleItem);
  const returnAvailableKg = Math.min(
    details.balance.availableQuantityKg,
    cycleCapacity.quantityKg,
  );
  const returnAvailablePieces = Math.min(
    details.balance.availableQuantityPieces,
    cycleCapacity.quantityPieces,
  );
  const shortageKg = Math.max(
    details.requested.quantityKg - returnAvailableKg,
    0,
  );
  const shortagePieces = Math.max(
    details.requested.quantityPieces - returnAvailablePieces,
    0,
  );
  const hasAvailable =
    (line.unit !== "PIECE" && returnAvailableKg > 0) ||
    (line.unit !== "KG" && returnAvailablePieces > 0);

  return {
    ...details,
    shortageKg,
    shortagePieces,
    returnAvailableKg,
    returnAvailablePieces,
    status:
      shortageKg > 0 || shortagePieces > 0
        ? ("INSUFFICIENT" as AvailabilityStatus)
        : hasAvailable
          ? ("SUFFICIENT" as AvailabilityStatus)
          : ("NONE" as AvailabilityStatus),
  };
}

function statusLabel(status: AvailabilityStatus, mode: TransferMode) {
  if (mode === "RETURN") {
    return {
      SUFFICIENT: "Dentro del límite",
      INSUFFICIENT: "Excede el límite",
      NONE: "Sin saldo para devolver",
    }[status];
  }
  return {
    SUFFICIENT: "Suficiente",
    INSUFFICIENT: "Insuficiente",
    NONE: "Sin disponibilidad",
  }[status];
}

function statusTone(status: AvailabilityStatus) {
  return {
    SUFFICIENT: "green",
    INSUFFICIENT: "red",
    NONE: "amber",
  }[status] as "green" | "red" | "amber";
}

function productIsActive(product: Product) {
  return product.isActive === true;
}

function isUsableInventoryProduct(
  product: Product,
  sourceLocationId: string,
) {
  return (
    isCanonicalProduct(product) &&
    productIsActive(product) &&
    Boolean(productBalance(product, sourceLocationId))
  );
}

function uniqueInventoryProducts(
  products: Product[],
  sourceLocationId: string,
) {
  const seenIds = new Set<string>();
  return products.filter((product) => {
    if (!isUsableInventoryProduct(product, sourceLocationId)) return false;
    if (seenIds.has(product.id)) return false;
    seenIds.add(product.id);
    return true;
  });
}

function quantityLabel(line: TransferLineDraft) {
  const values: string[] = [];
  if (line.quantityKg) values.push(`${line.quantityKg} kg`);
  if (line.quantityPieces) values.push(`${line.quantityPieces} piezas`);
  return values.join(" · ") || "Sin cantidad";
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function commandErrorMessage(error: unknown, mode: TransferMode) {
  if (error && typeof error === "object" && "payload" in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (record.code === "INSUFFICIENT_STOCK") {
        return `No hay disponibilidad suficiente en ${mode === "SUPPLY" ? "el CEDIS" : "la sucursal"}. Reduce la cantidad o registra primero la existencia física disponible.`;
      }
      if (record.code === "INVENTORY_CONCURRENCY_CONFLICT") {
        return "La disponibilidad cambió mientras se procesaba la operación. Revisa los saldos actualizados y reintenta.";
      }
      if (record.code === "RETURN_EXCEEDS_UNSOLD_QUANTITY") {
        return "La devolución supera la cantidad no vendida disponible en el ciclo. Revisa lo enviado, lo vendido y lo ya regresado.";
      }
      if (typeof record.message === "string") return record.message;
      if (typeof record.code === "string")
        return `El servidor rechazó el comando (${record.code}).`;
    }
  }
  return error instanceof Error
    ? error.message
    : "No fue posible registrar la operación. Puedes reintentar sin duplicarla.";
}

function LocationPair({
  branch,
  cedis,
  mode,
}: Pick<CedisTransferCommandPanelProps, "branch" | "cedis" | "mode">) {
  const origin = mode === "SUPPLY" ? cedis : branch;
  const destination = mode === "SUPPLY" ? branch : cedis;

  function renderLocation(label: string, location: CedisDashboardLocation) {
    const coordinates = formatCoordinates(
      location.latitude,
      location.longitude,
    );

    return (
      <div
        aria-label={`${label}: ${location.name}`}
        aria-readonly="true"
        className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3"
      >
        <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
          {label}
        </p>
        <p className="mt-1 font-bold">{location.name}</p>
        <p className="text-xs text-[var(--erp-muted-foreground)]">
          {location.code ?? "Sin código"}
        </p>
        <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
          {coordinates ? `Coordenadas: ${coordinates}` : "Coordenadas no disponibles"}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {renderLocation("Punto de partida", origin)}
      {renderLocation("Punto de llegada", destination)}
    </div>
  );
}

function AvailabilityPanel({
  cycleItem,
  line,
  mode,
  product,
  sourceLocationId,
}: {
  cycleItem?: CedisCycleItem;
  line: TransferLineDraft;
  mode: TransferMode;
  product: Product | undefined;
  sourceLocationId: string;
}) {
  if (!product) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-[color:var(--erp-border)] px-3 py-2 text-xs text-[var(--erp-muted-foreground)]">
        Selecciona un producto para consultar su disponibilidad.
      </p>
    );
  }

  const details =
    mode === "RETURN"
      ? returnLineAvailability(product, line, cycleItem, sourceLocationId)
      : {
          ...lineAvailability(product, line, sourceLocationId),
          returnAvailableKg: productAvailability(product, sourceLocationId)
            .availableQuantityKg,
          returnAvailablePieces:
            productAvailability(product, sourceLocationId)
              .availableQuantityPieces,
        };
  const source = mode === "SUPPLY" ? "CEDIS" : "sucursal";
  const requested = formatUnitQuantity(
    line.unit,
    details.requested.quantityKg,
    details.requested.quantityPieces,
  );
  const shortage = formatUnitQuantity(
    line.unit,
    details.shortageKg,
    details.shortagePieces,
  );

  return (
    <div
      aria-label={`Disponibilidad de ${product.name}`}
      className="mt-3 rounded-xl border border-[color:var(--erp-border)] bg-white p-3"
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
          Disponibilidad en {source}
        </p>
        <Badge tone={statusTone(details.status)}>
          {statusLabel(details.status, mode)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-[var(--erp-surface)] px-3 py-2">
          <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
            Existencia física
          </dt>
          <dd className="mt-1 text-sm font-black tabular-nums">
            {formatUnitQuantity(
              line.unit,
              details.balance.quantityKg,
              details.balance.quantityPieces,
            )}
          </dd>
        </div>
        <div className="rounded-lg bg-[var(--erp-surface)] px-3 py-2">
          <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
            Comprometido
          </dt>
          <dd className="mt-1 text-sm font-black tabular-nums">
            {formatUnitQuantity(
              line.unit,
              details.balance.reservedQuantityKg,
              details.balance.reservedQuantityPieces,
            )}
          </dd>
        </div>
        <div className="rounded-lg bg-[rgba(63,123,65,0.08)] px-3 py-2">
          <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
            {mode === "RETURN" ? "Límite de devolución" : "Disponible"}
          </dt>
          <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-success)]">
            {mode === "RETURN"
              ? formatUnitQuantity(
                  line.unit,
                  details.returnAvailableKg,
                  details.returnAvailablePieces,
                ) || "0"
              : formatUnitQuantity(
                  line.unit,
                  details.balance.availableQuantityKg,
                  details.balance.availableQuantityPieces,
                )}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--erp-muted-foreground)]">
        <span>Solicitado: {requested || "Sin cantidad"}</span>
        {details.status === "INSUFFICIENT" && (
          <span className="font-bold text-[var(--erp-danger)]">
            {mode === "RETURN" ? "Excede por" : "Faltante"}: {shortage}
          </span>
        )}
      </div>
    </div>
  );
}

function ReturnLineContext({
  cycleItem,
}: {
  cycleItem: CedisCycleItem | undefined;
}) {
  if (!cycleItem) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-[color:var(--erp-border)] px-3 py-2 text-xs text-[var(--erp-muted-foreground)]">
        Este producto no tiene suministro confirmado en el ciclo seleccionado.
      </p>
    );
  }

  const quantities = cycleItemQuantities(cycleItem);
  const returnCapacity = cycleItemReturnCapacity(cycleItem);

  return (
    <dl className="mt-3 grid gap-2 rounded-xl border border-[rgba(173,123,32,0.24)] bg-[rgba(248,239,216,0.42)] p-3 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
          Enviado en ciclo
        </dt>
        <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-foreground)]">
          {formatUnitQuantity(
            cycleItem.unit,
            quantities.deliveredKg,
            quantities.deliveredPieces,
          ) || "0"}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
          Vendido en sucursal
        </dt>
        <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-foreground)]">
          {formatUnitQuantity(
            cycleItem.unit,
            quantities.actualSoldKg,
            quantities.actualSoldPieces,
          ) || "0"}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
          Ya regresado
        </dt>
        <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-foreground)]">
          {formatUnitQuantity(
            cycleItem.unit,
            quantities.returnedKg,
            quantities.returnedPieces,
          ) || "0"}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
          Límite para devolver
        </dt>
        <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-brand-gold-deep)]">
          {formatUnitQuantity(
            cycleItem.unit,
            returnCapacity.quantityKg,
            returnCapacity.quantityPieces,
          ) || "0"}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
          Precio de venta
        </dt>
        <dd className="mt-1 text-sm font-black tabular-nums text-[var(--erp-foreground)]">
          {formatMoney(cycleItem.unitPrice)}
        </dd>
      </div>
    </dl>
  );
}

function ReturnFinancialPreview({
  cycleItems,
  expectedSales,
  lines,
}: {
  cycleItems: CedisCycleItem[];
  expectedSales?: string;
  lines: TransferLineDraft[];
}) {
  const currentReturnKg = lines.reduce(
    (total, line) => total + lineQuantities(line).quantityKg,
    0,
  );
  const currentReturnPieces = lines.reduce(
    (total, line) => total + lineQuantities(line).quantityPieces,
    0,
  );
  const sentKg = cycleItems.reduce(
    (total, item) => total + cycleItemQuantities(item).deliveredKg,
    0,
  );
  const sentPieces = cycleItems.reduce(
    (total, item) => total + cycleItemQuantities(item).deliveredPieces,
    0,
  );
  const notSoldValue = Money.sum(
    lines.map((line) => {
      const item = cycleItems.find(
        (candidate) => candidate.productId === line.productId,
      );
      return item
        ? Money.from(item.unitPrice).multiply(lineValueQuantity(line))
        : Money.zero();
    }),
  );
  const expectedAmount =
    expectedSales === undefined ? null : Money.from(expectedSales);
  const adjustedExpectedAmount = expectedAmount
    ? expectedAmount.subtract(notSoldValue).compare(Money.zero()) < 0
      ? Money.zero()
      : expectedAmount.subtract(notSoldValue)
    : null;

  return (
    <section
      aria-label="Impacto de la devolución"
      className="mt-5 overflow-hidden rounded-2xl border border-[rgba(173,123,32,0.32)] bg-[linear-gradient(135deg,rgba(248,239,216,0.7),rgba(255,255,255,0.96))]"
    >
      <div className="border-b border-[rgba(173,123,32,0.2)] px-4 py-4 sm:px-5">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--erp-brand-gold-deep)]">
          Conciliación de devolución
        </p>
        <h3 className="mt-1 text-lg font-black text-[var(--erp-foreground)]">
          El regreso reduce la venta que se esperaba cobrar
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-[var(--erp-muted-foreground)]">
          El valor se calcula con el precio de venta guardado en el ciclo, no
          con el precio actual del catálogo.
        </p>
      </div>
      <dl className="grid gap-px bg-[rgba(173,123,32,0.16)] sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white/80 px-4 py-4 sm:px-5">
          <dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">
            Enviado en ciclo
          </dt>
          <dd className="mt-1 text-lg font-black tabular-nums">
            {formatDimensions(sentKg, sentPieces)}
          </dd>
        </div>
        <div className="bg-white/80 px-4 py-4 sm:px-5">
          <dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">
            Regresado ahora
          </dt>
          <dd className="mt-1 text-lg font-black tabular-nums">
            {formatDimensions(currentReturnKg, currentReturnPieces)}
          </dd>
        </div>
        <div className="bg-white/80 px-4 py-4 sm:px-5">
          <dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">
            Venta no realizada
          </dt>
          <dd className="mt-1 text-lg font-black tabular-nums text-[var(--erp-danger)]">
            {formatMoney(notSoldValue.toString())}
          </dd>
        </div>
        <div className="bg-[rgba(63,123,65,0.1)] px-4 py-4 sm:px-5">
          <dt className="text-xs font-bold text-[var(--erp-muted-foreground)]">
            Monto esperado después
          </dt>
          <dd className="mt-1 text-lg font-black tabular-nums text-[var(--erp-success)]">
            {adjustedExpectedAmount
              ? formatMoney(adjustedExpectedAmount.toString())
              : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function CedisTransferCommandPanel({
  branch,
  cedis,
  contextKey,
  expectedVersion,
  mode,
  onClose,
  onSubmit,
  products,
  productsError,
  productsLoading,
  sourceLocationId: sourceLocationIdProp,
  cycleItems = [],
  expectedSales,
  logisticsResources,
}: CedisTransferCommandPanelProps) {
  const [lines, setLines] = useState<TransferLineDraft[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [assignedDriverId, setAssignedDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [confirmation, setConfirmation] = useState<{
    payload: CedisCycleCommand;
    idempotencyKey: string;
    contextKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const isSupply = mode === "SUPPLY";
  const sourceLocationId =
    sourceLocationIdProp ?? (isSupply ? cedis.id : branch.id);
  const hasProductsError = Boolean(productsError);
  const inventoryProducts = hasProductsError
    ? []
    : uniqueInventoryProducts(products, sourceLocationId);
  const availableProducts = inventoryProducts.filter(hasTransferAvailability);
  const sourceLabel = isSupply ? "CEDIS" : "la sucursal";
  const title = isSupply ? "Enviar producto" : "Registrar devolución";
  const submitLabel = isSupply
    ? "Confirmar suministro"
    : "Confirmar devolución";
  const currentConfirmation =
    confirmation?.contextKey === contextKey ? confirmation : null;
  const contextChanged = Boolean(
    confirmation && confirmation.contextKey !== contextKey,
  );
  const visibleError = contextChanged ? null : error;
  const logisticsLoading = logisticsResources.isLoading;
  const logisticsError = Boolean(logisticsResources.error);
  const availableDrivers = logisticsResources.drivers.filter(
    (driver) => driver.isActive && driver.role.name === "DRIVER",
  );
  const availableVehicles = logisticsResources.vehicles.filter(
    (vehicle) => vehicle.isActive,
  );

  function cycleItemForProduct(productId: string) {
    return cycleItems.find((item) => item.productId === productId);
  }

  function transferUnit(product: Product) {
    return cycleItemForProduct(product.id)?.unit ?? productUnit(product);
  }

  function hasTransferAvailability(product: Product) {
    if (isSupply || cycleItems.length === 0)
      return hasProductAvailability(product, undefined, sourceLocationId);
    const cycleItem = cycleItemForProduct(product.id);
    return (
      Boolean(cycleItem && isPositiveCycleBalance(cycleItem)) &&
      hasProductAvailability(product, cycleItem?.unit, sourceLocationId)
    );
  }

  function returnQuantityLimit(
    product: Product | undefined,
    dimension: "KG" | "PIECE",
  ) {
    const balance = productAvailability(product, sourceLocationId);
    if (isSupply) {
      return dimension === "KG"
        ? balance.availableQuantityKg
        : balance.availableQuantityPieces;
    }
    const cycleItem = product ? cycleItemForProduct(product.id) : undefined;
    if (!cycleItem) return 0;
    const remaining = cycleItemReturnCapacity(cycleItem);
    return Math.min(
      dimension === "KG"
        ? balance.availableQuantityKg
        : balance.availableQuantityPieces,
      dimension === "KG" ? remaining.quantityKg : remaining.quantityPieces,
    );
  }

  function updateLine(index: number, next: Partial<TransferLineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...next } : line,
      ),
    );
  }

  function selectProduct(index: number, productId: string) {
    const product = availableProducts.find((item) => item.id === productId);
    if (
      productId &&
      (!product ||
        !hasTransferAvailability(product) ||
        lines.some(
          (line, lineIndex) =>
            lineIndex !== index && line.productId === productId,
        ))
    ) {
      setError(
        product
          ? "Ese producto ya está seleccionado o no tiene disponibilidad."
          : "Selecciona un producto válido.",
      );
      return;
    }
    updateLine(index, {
      productId,
      unit: cycleItemForProduct(productId)?.unit ?? productUnit(product),
      quantityKg: "",
      quantityPieces: "",
    });
    setError(null);
  }

  function validateLines() {
    if (logisticsResources) {
      if (logisticsLoading) return "Cargando conductores y unidades disponibles.";
      if (logisticsError) return "No se pudo cargar el catálogo logístico.";
      if (!availableDrivers.some((driver) => driver.id === assignedDriverId))
        return "Selecciona un conductor activo autorizado.";
      if (!availableVehicles.some((vehicle) => vehicle.id === vehicleId))
        return "Selecciona una unidad activa.";
    }
    if (lines.length === 0) return "Agrega al menos un producto.";
    const selectedProductIds = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (!line.productId)
        return `Selecciona un producto en la línea ${index + 1}.`;
      if (selectedProductIds.has(line.productId))
        return `No repitas el mismo producto en la línea ${index + 1}.`;
      selectedProductIds.add(line.productId);
      const product = availableProducts.find(
        (item) => item.id === line.productId,
      );
      if (!product)
        return `El producto de la línea ${index + 1} ya no está disponible en el catálogo.`;
      const kg = Number(line.quantityKg);
      const pieces = Number(line.quantityPieces);
      const hasKg = Boolean(line.quantityKg) && Number.isFinite(kg) && kg > 0;
      const hasPieces =
        Boolean(line.quantityPieces) && Number.isInteger(pieces) && pieces > 0;
      if (line.quantityKg && !hasKg)
        return `Captura kilos positivos en la línea ${index + 1}.`;
      if (line.quantityPieces && !hasPieces)
        return `Captura piezas enteras positivas en la línea ${index + 1}.`;
      if (line.unit === "KG" && !hasKg)
        return `Captura kilos positivos en la línea ${index + 1}.`;
      if (line.unit === "PIECE" && !hasPieces)
        return `Captura piezas enteras positivas en la línea ${index + 1}.`;
      if (line.unit === "KG_AND_PIECE" && !hasKg && !hasPieces)
        return `Captura kilos o piezas en la línea ${index + 1}.`;
      const availability = isSupply
        ? lineAvailability(product, line, sourceLocationId)
        : returnLineAvailability(
            product,
            line,
            cycleItemForProduct(line.productId),
            sourceLocationId,
          );
      if (availability.status === "NONE")
        return isSupply
          ? `El producto de la línea ${index + 1} no tiene disponibilidad en ${sourceLabel}.`
          : `El producto de la línea ${index + 1} no tiene saldo para devolver.`;
      if (availability.status === "INSUFFICIENT")
        return isSupply
          ? `La cantidad de la línea ${index + 1} supera la disponibilidad. Faltan ${formatUnitQuantity(line.unit, availability.shortageKg, availability.shortagePieces)}.`
          : `La devolución de la línea ${index + 1} supera el límite de producto no vendido. Máximo: ${formatUnitQuantity(line.unit, availability.returnAvailableKg, availability.returnAvailablePieces)}.`;
    }
    return null;
  }

  function toPayload() {
    return {
      expectedVersion,
      assignedDriverId,
      vehicleId,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      items: lines.map((line) => ({
        productId: line.productId,
        unit: line.unit,
        ...(line.unit !== "PIECE" && line.quantityKg
          ? { quantityKg: Number(line.quantityKg) }
          : {}),
        ...(line.unit !== "KG" && line.quantityPieces
          ? { quantityPieces: Number(line.quantityPieces) }
          : {}),
      })),
    } satisfies CedisCycleCommand;
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasProductsError) {
      setError("No se pudo cargar el catálogo de productos.");
      return;
    }
    const validationError = validateLines();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setHasSubmitted(false);
    setConfirmation({
      payload: toPayload(),
      idempotencyKey: createIdempotencyKey(),
      contextKey,
    });
  }

  async function confirm() {
    if (
      !confirmation ||
      confirmation.contextKey !== contextKey ||
      isSubmitting ||
      hasProductsError
    ) {
      if (confirmation && confirmation.contextKey !== contextKey) {
        setConfirmation(null);
        setError("La revisión quedó invalidada por un cambio de contexto.");
      }
      return;
    }
    setIsSubmitting(true);
    setHasSubmitted(true);
    setError(null);
    try {
      await onSubmit(confirmation.payload, confirmation.idempotencyKey);
      onClose();
    } catch (submissionError) {
      setError(commandErrorMessage(submissionError, mode));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (currentConfirmation) {
    return (
      <Card
        aria-labelledby="cedis-command-confirm-title"
        aria-modal="true"
        className="border-[var(--erp-brand-gold)] p-5"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
              Confirmación requerida
            </p>
            <h2
              className="mt-2 text-xl font-black"
              id="cedis-command-confirm-title"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
              Verifica el recorrido y las cantidades antes de crear el traspaso.
            </p>
          </div>
          <Badge tone={isSupply ? "blue" : "amber"}>
            {isSupply ? "CEDIS → sucursal" : "Sucursal → CEDIS"}
          </Badge>
        </div>
        <div className="mt-5">
          <LocationPair branch={branch} cedis={cedis} mode={mode} />
        </div>
        {!isSupply && (
          <ReturnFinancialPreview
            cycleItems={cycleItems}
            expectedSales={expectedSales}
            lines={lines}
          />
        )}
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--erp-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-black">Producto</th>
                <th className="px-3 py-2 font-black">Unidad</th>
                {!isSupply && (
                  <th className="px-3 py-2 font-black">Enviado en ciclo</th>
                )}
                <th className="px-3 py-2 font-black">Cantidad</th>
                {!isSupply && (
                  <th className="px-3 py-2 font-black">Venta no realizada</th>
                )}
              </tr>
            </thead>
            <tbody>
              {currentConfirmation.payload.items.map((line, index) => {
                const product = availableProducts.find(
                  (item) => item.id === line.productId,
                );
                const cycleItem = cycleItemForProduct(line.productId);
                const sent = cycleItem ? cycleItemQuantities(cycleItem) : null;
                const lineValue = cycleItem
                  ? Money.from(cycleItem.unitPrice).multiply(
                      valuationQuantity(
                        line.unit,
                        numberValue(line.quantityKg),
                        numberValue(line.quantityPieces),
                      ),
                    )
                  : Money.zero();
                return (
                  <tr
                    className="border-t border-[color:var(--erp-border)]"
                    key={`${line.productId}-${index}`}
                  >
                    <td className="px-3 py-3 font-bold">
                      {product?.name ?? line.productId}
                    </td>
                    <td className="px-3 py-3">{unitLabels[line.unit]}</td>
                    {!isSupply && (
                      <td className="px-3 py-3 font-bold tabular-nums">
                        {sent
                          ? formatUnitQuantity(
                              cycleItem?.unit ?? line.unit,
                              sent.deliveredKg,
                              sent.deliveredPieces,
                            ) || "0"
                          : "—"}
                      </td>
                    )}
                    <td className="px-3 py-3 font-bold tabular-nums">
                      {[
                        line.quantityKg ? `${line.quantityKg} kg` : null,
                        line.quantityPieces
                          ? `${line.quantityPieces} piezas`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    {!isSupply && (
                      <td className="px-3 py-3 font-bold tabular-nums text-[var(--erp-danger)]">
                        {formatMoney(lineValue.toString())}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(visibleError || hasProductsError) && (
          <p
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
            role="alert"
          >
            {hasProductsError
              ? "No se pudo cargar el catálogo de productos."
              : visibleError}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            disabled={isSubmitting}
            onClick={() => {
              setConfirmation(null);
              setError(null);
              setHasSubmitted(false);
            }}
            variant="secondary"
          >
            Volver a editar
          </Button>
          <Button
            disabled={isSubmitting || hasProductsError}
            onClick={() => void confirm()}
          >
            {isSubmitting
              ? "Enviando…"
              : hasSubmitted && error
                ? `Reintentar ${isSupply ? "suministro" : "devolución"}`
                : submitLabel}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      aria-labelledby="cedis-command-title"
      aria-modal="true"
      className="p-5"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
            {isSupply ? (
              <ArrowUpFromLine aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
            )}
            Operación de inventario
          </p>
          <h2 className="mt-2 text-xl font-black" id="cedis-command-title">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
            El producto se toma del catálogo activo. Los snapshots financieros
            permanecen sin edición.
          </p>
        </div>
        <Button
          aria-label={`Cerrar ${title}`}
          onClick={onClose}
          variant="ghost"
        >
          Cerrar
        </Button>
      </div>
      <div className="mt-5">
        <LocationPair branch={branch} cedis={cedis} mode={mode} />
      </div>
      <section
        aria-labelledby="cedis-transport-title"
        className="mt-5 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"
      >
        <div className="rounded-lg bg-[var(--erp-brand-red)] px-3 py-2 text-white">
          <p
            className="text-xs font-black uppercase tracking-[0.16em] text-white"
            id="cedis-transport-title"
          >
            Transporte
          </p>
        </div>
        <p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">
          Asigna el conductor y la unidad antes de despachar. Los puntos del
          recorrido se toman de la ubicación operativa y no son editables.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
            <span>
              Conductor asignado <span aria-hidden="true">*</span>
            </span>
            <Select
              aria-label="Conductor asignado"
              disabled={logisticsLoading || logisticsError}
              onChange={(event) => setAssignedDriverId(event.target.value)}
              required
              value={assignedDriverId}
            >
              <option value="">
                {logisticsLoading
                  ? "Cargando conductores…"
                  : availableDrivers.length === 0
                    ? "No hay conductores disponibles"
                    : "Selecciona conductor"}
              </option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
            <span>
              Unidad asignada <span aria-hidden="true">*</span>
            </span>
            <Select
              aria-label="Unidad asignada"
              disabled={logisticsLoading || logisticsError}
              onChange={(event) => setVehicleId(event.target.value)}
              required
              value={vehicleId}
            >
              <option value="">
                {logisticsLoading
                  ? "Cargando unidades…"
                  : availableVehicles.length === 0
                    ? "No hay unidades disponibles"
                    : "Selecciona unidad"}
              </option>
              {availableVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.code} · {vehicle.displayName}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </section>
      {!isSupply && (
        <ReturnFinancialPreview
          cycleItems={cycleItems}
          expectedSales={expectedSales}
          lines={lines}
        />
      )}
      {productsError ? (
        <p
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          No se pudo cargar el catálogo de productos.
        </p>
      ) : null}
      <form className="mt-5 space-y-4" noValidate onSubmit={review}>
        {lines.map((line, index) => {
          const product = availableProducts.find(
            (item) => item.id === line.productId,
          );
          const cycleItem = cycleItemForProduct(line.productId);
          const unit = cycleItem?.unit ?? productUnit(product);
          return (
            <div
              className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"
              key={`line-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                  Producto {index + 1}
                </p>
                {lines.length > 1 && (
                  <Button
                    aria-label={`Eliminar producto ${index + 1}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, lineIndex) => lineIndex !== index),
                      )
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                  Producto
                  <Select
                    aria-label={`Producto ${index + 1}`}
                    disabled={
                      hasProductsError ||
                      productsLoading ||
                      inventoryProducts.length === 0
                    }
                    onChange={(event) =>
                      selectProduct(index, event.target.value)
                    }
                    value={line.productId}
                  >
                    <option value="">
                      {productsLoading
                        ? "Cargando catálogo…"
                        : "Selecciona producto"}
                    </option>
                    {inventoryProducts.map((item) => (
                      <option
                        disabled={
                          !hasTransferAvailability(item) ||
                          lines.some(
                            (otherLine, otherIndex) =>
                              otherIndex !== index &&
                              otherLine.productId === item.id,
                          )
                        }
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                        {item.sku ? ` · ${item.sku}` : ""} ·{" "}
                        {hasTransferAvailability(item)
                          ? formatUnitQuantity(
                              transferUnit(item),
                              productAvailability(item, sourceLocationId)
                                .availableQuantityKg,
                              productAvailability(item, sourceLocationId)
                                .availableQuantityPieces,
                            )
                          : "Sin disponibilidad"}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                  Unidad
                  <Select
                    aria-label={`Unidad ${index + 1}`}
                    disabled={!product}
                    onChange={(event) =>
                      updateLine(index, {
                        unit: event.target.value as OperationalUnit,
                        quantityKg: "",
                        quantityPieces: "",
                      })
                    }
                    value={line.unit}
                  >
                    <option value={unit}>{unitLabels[unit]}</option>
                  </Select>
                </label>
                <div className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                  Cantidad
                  <div className="grid grid-cols-2 gap-2">
                    {line.unit !== "PIECE" && (
                      <Input
                        aria-label={`Kilos ${index + 1}`}
                        max={returnQuantityLimit(product, "KG")}
                        min="0"
                        onChange={(event) =>
                          updateLine(index, { quantityKg: event.target.value })
                        }
                        placeholder="kg"
                        step="0.001"
                        type="number"
                        value={line.quantityKg}
                      />
                    )}
                    {line.unit !== "KG" && (
                      <Input
                        aria-label={`Piezas ${index + 1}`}
                        max={returnQuantityLimit(product, "PIECE")}
                        min="0"
                        onChange={(event) =>
                          updateLine(index, {
                            quantityPieces: event.target.value,
                          })
                        }
                        placeholder="piezas"
                        step="1"
                        type="number"
                        value={line.quantityPieces}
                      />
                    )}
                  </div>
                </div>
              </div>
              <AvailabilityPanel
                cycleItem={cycleItem}
                line={line}
                mode={mode}
                product={product}
                sourceLocationId={sourceLocationId}
              />
              {!isSupply && <ReturnLineContext cycleItem={cycleItem} />}
              <p className="mt-3 text-xs text-[var(--erp-muted-foreground)]">
                {product
                  ? `Unidad del catálogo: ${unitLabels[unit]}`
                  : "Selecciona un producto para conocer sus unidades."}{" "}
                · {quantityLabel(line)}
              </p>
            </div>
          );
        })}
        <Button
          onClick={() => setLines((current) => [...current, emptyLine()])}
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" /> Agregar producto
        </Button>
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
          Notas opcionales
          <Input
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Referencia operativa"
            value={notes}
          />
        </label>
        {error && (
          <p
            className="rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--erp-border)] pt-4">
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={
              hasProductsError ||
              productsLoading ||
              availableProducts.length === 0
            }
            type="submit"
          >
            Revisar antes de confirmar
          </Button>
        </div>
      </form>
    </Card>
  );
}
