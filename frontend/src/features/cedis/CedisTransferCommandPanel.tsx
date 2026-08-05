import { useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "../../components/ui";
import type { Product, OperationalUnit } from "../inventario/types";
import type { CedisCycleCommand, CedisDashboardLocation } from "./types";

type TransferMode = "SUPPLY" | "RETURN";

type TransferLineDraft = {
  productId: string;
  unit: OperationalUnit;
  quantityKg: string;
  quantityPieces: string;
};

type CedisTransferCommandPanelProps = {
  branch: CedisDashboardLocation;
  cedis: CedisDashboardLocation;
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

function productIsActive(product: Product) {
  return (
    product.isActive !== false &&
    product.active !== false &&
    product.status !== "INACTIVE"
  );
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

function commandErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "payload" in error) {
    const payload = (error as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
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
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
          Origen
        </p>
        <p className="mt-1 font-bold">{origin.name}</p>
        <p className="text-xs text-[var(--erp-muted-foreground)]">
          {origin.code ?? "Sin código"}
        </p>
      </div>
      <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
          Destino
        </p>
        <p className="mt-1 font-bold">{destination.name}</p>
        <p className="text-xs text-[var(--erp-muted-foreground)]">
          {destination.code ?? "Sin código"}
        </p>
      </div>
    </div>
  );
}

export function CedisTransferCommandPanel({
  branch,
  cedis,
  expectedVersion,
  mode,
  onClose,
  onSubmit,
  products,
  productsError,
  productsLoading,
}: CedisTransferCommandPanelProps) {
  const [lines, setLines] = useState<TransferLineDraft[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<{
    payload: CedisCycleCommand;
    idempotencyKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const activeProducts = products.filter(productIsActive);
  const isSupply = mode === "SUPPLY";
  const title = isSupply ? "Enviar producto" : "Registrar devolución";
  const submitLabel = isSupply
    ? "Confirmar suministro"
    : "Confirmar devolución";

  function updateLine(index: number, next: Partial<TransferLineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...next } : line,
      ),
    );
  }

  function selectProduct(index: number, productId: string) {
    const product = activeProducts.find((item) => item.id === productId);
    updateLine(index, {
      productId,
      unit: productUnit(product),
      quantityKg: "",
      quantityPieces: "",
    });
  }

  function validateLines() {
    if (lines.length === 0) return "Agrega al menos un producto.";
    for (const [index, line] of lines.entries()) {
      if (!line.productId)
        return `Selecciona un producto en la línea ${index + 1}.`;
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
    }
    return null;
  }

  function toPayload() {
    return {
      expectedVersion,
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
    });
  }

  async function confirm() {
    if (!confirmation || isSubmitting) return;
    setIsSubmitting(true);
    setHasSubmitted(true);
    setError(null);
    try {
      await onSubmit(confirmation.payload, confirmation.idempotencyKey);
      onClose();
    } catch (submissionError) {
      setError(commandErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <Card
        aria-labelledby="cedis-command-confirm-title"
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
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--erp-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-black">Producto</th>
                <th className="px-3 py-2 font-black">Unidad</th>
                <th className="px-3 py-2 font-black">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {confirmation.payload.items.map((line, index) => {
                const product = activeProducts.find(
                  (item) => item.id === line.productId,
                );
                return (
                  <tr
                    className="border-t border-[color:var(--erp-border)]"
                    key={`${line.productId}-${index}`}
                  >
                    <td className="px-3 py-3 font-bold">
                      {product?.name ?? line.productId}
                    </td>
                    <td className="px-3 py-3">{unitLabels[line.unit]}</td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && (
          <p
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
            role="alert"
          >
            {error}
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
          <Button disabled={isSubmitting} onClick={() => void confirm()}>
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
    <Card aria-labelledby="cedis-command-title" className="p-5" role="dialog">
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
      {productsError ? (
        <p
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          No se pudo cargar el catálogo de productos.
        </p>
      ) : null}
      <form className="mt-5 space-y-4" onSubmit={review}>
        {lines.map((line, index) => {
          const product = activeProducts.find(
            (item) => item.id === line.productId,
          );
          const unit = productUnit(product);
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
                    disabled={productsLoading || activeProducts.length === 0}
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
                    {activeProducts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.sku ? ` · ${item.sku}` : ""}
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
            disabled={productsLoading || activeProducts.length === 0}
            type="submit"
          >
            Revisar antes de confirmar
          </Button>
        </div>
      </form>
    </Card>
  );
}
