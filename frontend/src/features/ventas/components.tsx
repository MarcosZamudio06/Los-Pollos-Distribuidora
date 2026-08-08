import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  PackageSearch,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { OperationalLocation } from "../compras/types";
import type {
  CartItem,
  CustomerOption,
  PaymentMethod,
  PaymentType,
  PosTransactionState,
  ProductOption,
  SalePaymentInput,
  TicketData,
} from "./types";
import {
  calculateCartTotal,
  calculateCashChange,
  calculateItemSubtotal,
  calculatePaymentsTotal,
  getQuantityValidationError,
  toMoney,
  type CreditRestrictionOptions,
} from "./posLogic";
import { Money } from "../../lib/money";
import {
  operationalUnitLabel,
  paymentMethodLabel,
  paymentTypeLabel,
} from "./saleLabels";

type ProductSearchProps = {
  error: unknown;
  frequentProducts: ProductOption[];
  isLoading: boolean;
  locationDisabled?: boolean;
  locationWarning?: string;
  locations: OperationalLocation[];
  locationsError: unknown;
  locationsLoading: boolean;
  locationId: string;
  onAdd: (product: ProductOption) => void;
  onLocationChange: (locationId: string) => void;
  products: ProductOption[];
  search: string;
  showLocationSelector?: boolean;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return String(error.message);
  return fallback;
}

const panelClass = "border border-[var(--pos-steel)] bg-white";
const inputClass =
  "h-11 rounded-lg border border-[var(--pos-steel)] bg-white px-3 text-[var(--pos-ink)] outline-none transition focus:border-[var(--pos-focus)] focus:ring-2 focus:ring-[rgba(37,99,235,0.18)]";

export function OperationalBar({ children }: { children: ReactNode }) {
  return (
    <header
      className="flex h-[52px] shrink-0 items-center border-b border-[var(--pos-steel)] px-3 text-xs"
      aria-label="Estado operativo del POS"
    >
      {children}
    </header>
  );
}

function effectiveCreditLabel(customer: CustomerOption) {
  const status =
    customer.creditSummary?.effectiveCreditStatus ??
    customer.effectiveCreditStatus;
  if (status === "BLOCKED") return "Crédito bloqueado";
  if (status === "WARNING") return "Advertencia de crédito";
  return "Crédito disponible";
}

function overduePolicyLabel(customer: CustomerOption) {
  const mode = customer.creditSummary?.overdueBlockingMode;
  if (mode === "BLOCK_NEW_CREDIT") return "Bloquea crédito nuevo";
  if (mode === "WARN_ONLY") return "Solo advertencia";
  return "Sin bloqueo automático";
}

type ScanCommandBarProps = {
  onSearchChange: (search: string) => void;
  onSearchSubmit: (search: string) => void;
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

export function ScanCommandBar({
  onSearchChange,
  onSearchSubmit,
  search,
  searchInputRef,
}: ScanCommandBarProps) {
  return (
    <section
      className="flex h-16 shrink-0 items-center border-y border-[var(--pos-steel)] bg-white px-4"
      aria-label="Escáner y búsqueda"
    >
      <div className="relative mx-auto flex w-full max-w-[112rem] items-center">
        <label className="sr-only" htmlFor="pos-product-search">
          Búsqueda de productos por código de barras, SKU o nombre
        </label>
        <Barcode className="pointer-events-none absolute left-3 h-5 w-5 text-[var(--pos-green)]" />
        <input
          autoComplete="off"
          autoFocus
          className="h-11 w-full border-0 bg-[var(--pos-porcelain)] pl-11 pr-28 text-base font-semibold text-[var(--pos-ink)] outline-none ring-1 ring-[var(--pos-steel)] transition focus:ring-2 focus:ring-[var(--pos-focus)]"
          id="pos-product-search"
          inputMode="search"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearchSubmit(search);
            }
          }}
          placeholder="Escanea código, SKU o busca producto"
          ref={searchInputRef}
          value={search}
        />
        <span className="pointer-events-none absolute right-3 inline-flex items-center gap-1 font-[var(--pos-mono)] text-[0.68rem] font-bold text-[var(--pos-muted)]">
          Listo · F2
        </span>
      </div>
    </section>
  );
}

export function ProductSearch({
  error,
  frequentProducts,
  isLoading,
  locationDisabled = false,
  locationWarning,
  locations,
  locationsError,
  locationsLoading,
  locationId,
  onAdd,
  onLocationChange,
  products,
  search,
  showLocationSelector = true,
}: ProductSearchProps) {
  const [activeView, setActiveView] = useState<"frequent" | "all">("all");
  const [activeCategory, setActiveCategory] = useState("");
  const categoryOptions = Array.from(
    new Set(
      products
        .map((product) => product.categoryName)
        .filter((category): category is string => Boolean(category)),
    ),
  );
  const sourceProducts =
    search.trim() || activeView === "all" ? products : frequentProducts;
  const visibleProducts = activeCategory
    ? sourceProducts.filter(
        (product) => product.categoryName === activeCategory,
      )
    : sourceProducts;

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pos-steel)] px-3">
        <span className="font-[var(--pos-mono)] text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
          Resultados
        </span>
        <PackageSearch className="h-4 w-4 text-[var(--pos-muted)]" />
      </div>
      <div className="grid shrink-0 gap-2 border-b border-[var(--pos-steel)] p-3">
        {showLocationSelector && (
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pos-muted)]">
            Ubicación operativa
            <select
              className={`${inputClass} font-semibold normal-case tracking-normal`}
              disabled={locationDisabled}
              onChange={(event) => onLocationChange(event.target.value)}
              value={locationId}
            >
              <option value="">Selecciona ubicación operativa</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.code ? ` · ${location.code}` : ""}
                </option>
              ))}
            </select>
            {locationDisabled && (
              <span className="text-[0.68rem] font-semibold normal-case tracking-normal text-[var(--pos-green)]">
                La ubicación se deriva de tu usuario.
              </span>
            )}
          </label>
        )}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
          aria-label="Vistas rápidas de productos"
        >
          <button
            aria-pressed={activeView === "frequent"}
            className={`text-xs font-bold transition ${activeView === "frequent" ? "text-[var(--pos-green)]" : "text-[var(--pos-muted)] hover:text-[var(--pos-ink)]"}`}
            onClick={() => {
              setActiveView("frequent");
              setActiveCategory("");
            }}
            type="button"
          >
            Frecuentes recientes
          </button>
          <button
            aria-pressed={activeView === "all"}
            className={`text-xs font-bold transition ${activeView === "all" ? "text-[var(--pos-green)]" : "text-[var(--pos-muted)] hover:text-[var(--pos-ink)]"}`}
            onClick={() => setActiveView("all")}
            type="button"
          >
            Todos
          </button>
          {categoryOptions.map((category) => (
            <button
              aria-pressed={activeCategory === category}
              className={`border-l pl-3 text-xs font-bold transition ${activeCategory === category ? "border-[var(--pos-green)] text-[var(--pos-green)]" : "border-[var(--pos-steel)] text-[var(--pos-muted)] hover:text-[var(--pos-ink)]"}`}
              key={category}
              onClick={() => {
                setActiveView("all");
                setActiveCategory(activeCategory === category ? "" : category);
              }}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {locationWarning && (
        <p
          role="status"
          className="border-b border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] px-3 py-2 text-xs font-bold text-[var(--erp-brand-gold-deep)]"
        >
          {locationWarning}
        </p>
      )}

      {!locationId && (
        <p className="border-b border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] px-3 py-2 text-xs font-bold text-[var(--erp-brand-gold-deep)]">
          Selecciona una ubicación operativa antes de agregar productos. El
          inventario del POS nunca es global.
        </p>
      )}
      {locationsLoading && (
        <p className="border-b bg-[rgba(35,113,90,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-green)]">
          Cargando ubicaciones operativas...
        </p>
      )}
      {Boolean(locationsError) && (
        <p
          role="alert"
          className="border-b border-[rgba(182,42,34,0.20)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]"
        >
          {errorMessage(
            locationsError,
            "No se pudieron cargar las ubicaciones operativas.",
          )}
        </p>
      )}
      {isLoading && (
        <p className="border-b bg-[rgba(35,113,90,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-green)]">
          Cargando productos...
        </p>
      )}
      {Boolean(error) && (
        <p
          role="alert"
          className="border-b border-[rgba(182,42,34,0.20)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]"
        >
          {errorMessage(error, "La búsqueda de productos falló.")}
        </p>
      )}
      {locationId && !isLoading && !error && visibleProducts.length === 0 && (
        <p className="m-3 border border-dashed border-[var(--pos-steel)] p-4 text-sm text-[var(--pos-muted)]">
          {activeView === "frequent" && !search
            ? "Aún no hay productos frecuentes en esta sesión. Cambia a Todos para ver el catálogo."
            : "No se encontraron productos para esta ubicación y búsqueda."}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">
            Productos disponibles en la ubicación operativa seleccionada
          </caption>
          <thead className="sticky top-0 z-10 h-9 bg-[var(--pos-porcelain)] font-[var(--pos-mono)] text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">
            <tr>
              <th className="px-3" scope="col">
                Producto
              </th>
              <th scope="col">SKU</th>
              <th scope="col">Unidad</th>
              <th className="text-right" scope="col">
                Precio
              </th>
              <th className="text-right" scope="col">
                Existencia
              </th>
              <th className="w-20 px-3 text-right" scope="col">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => {
              const hasNoStock =
                product.availableKg <= 0 && product.availablePieces <= 0;
              return (
                <tr
                  className="h-[52px] border-b border-[var(--pos-steel)] transition hover:bg-[var(--pos-porcelain)]"
                  key={product.id}
                >
                  <td className="max-w-0 px-3">
                    <p className="truncate text-sm font-bold">{product.name}</p>
                    {product.isLowStock && (
                      <p className="text-[0.62rem] font-bold text-[var(--pos-warning)]">
                        Stock bajo
                      </p>
                    )}
                  </td>
                  <td className="font-[var(--pos-mono)] text-[0.65rem] text-[var(--pos-muted)]">
                    {product.sku ?? product.barcode ?? "Sin código"}
                  </td>
                  <td className="font-[var(--pos-mono)] text-xs font-bold">
                    {product.unit}
                  </td>
                  <td className="text-right font-[var(--pos-mono)] text-sm font-bold">
                    {toMoney(product.salePrice)}
                  </td>
                  <td
                    className={`text-right font-[var(--pos-mono)] text-xs font-bold ${hasNoStock ? "text-[var(--pos-red)]" : product.isLowStock ? "text-[#7d5a12]" : "text-[var(--pos-muted)]"}`}
                  >
                    {hasNoStock
                      ? "Sin stock"
                      : `${product.availableKg} kg · ${product.availablePieces} pz`}
                  </td>
                  <td className="px-3 text-right">
                    <button
                      className="h-9 border border-[var(--pos-ink)] px-2 text-xs font-bold text-[var(--pos-ink)] transition hover:bg-[var(--pos-ink)] hover:text-white disabled:cursor-not-allowed disabled:border-[var(--pos-steel)] disabled:text-[var(--pos-muted)]"
                      disabled={
                        !locationId ||
                        product.locationId !== locationId ||
                        hasNoStock
                      }
                      onClick={() => onAdd(product)}
                      type="button"
                    >
                      Agregar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProductResultsTable(props: ProductSearchProps) {
  return <ProductSearch {...props} />;
}

type CartProps = {
  activeItemId?: string;
  items: CartItem[];
  onActivate?: (productId: string) => void;
  onQuantityFocus?: (productId: string, field: "kg" | "pieces") => void;
  onRemove: (productId: string) => void;
  onQuantityChange: (
    productId: string,
    quantityKg: number,
    quantityPieces: number,
  ) => void;
};

export function Cart({
  activeItemId,
  items,
  onActivate,
  onQuantityChange,
  onQuantityFocus,
  onRemove,
}: CartProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pos-steel)] px-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold">Carrito</h2>
          <span className="font-[var(--pos-mono)] text-[0.65rem] font-bold text-[var(--pos-muted)]">
            {items.length} en carrito
          </span>
        </div>
        <ShoppingCart className="h-4 w-4 text-[var(--pos-muted)]" />
      </div>
      {items.length === 0 ? (
        <p className="m-3 border border-dashed border-[var(--pos-steel)] p-4 text-sm text-[var(--pos-muted)]">
          Agrega productos para iniciar una venta. Los carritos vacíos no se
          pueden confirmar.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <caption className="sr-only">Partidas activas de la venta</caption>
            <thead className="sticky top-0 z-10 h-9 bg-[var(--pos-porcelain)] font-[var(--pos-mono)] text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">
              <tr>
                <th className="px-3" scope="col">
                  Producto
                </th>
                <th scope="col">Cantidad</th>
                <th className="text-right" scope="col">
                  Precio
                </th>
                <th className="text-right" scope="col">
                  Importe
                </th>
                <th className="w-10" scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const validation = getQuantityValidationError(item);
                return (
                  <tr
                    className={`h-14 border-b border-[var(--pos-steel)] transition ${activeItemId === item.productId ? "bg-[rgba(35,113,90,0.08)] shadow-[inset_3px_0_0_var(--pos-green)]" : "hover:bg-[var(--pos-porcelain)]"}`}
                    key={item.productId}
                    onClick={() => onActivate?.(item.productId)}
                  >
                    <td className="max-w-0 px-3 align-middle">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      <p className="font-[var(--pos-mono)] text-[0.65rem] font-bold text-[var(--pos-muted)]">
                        {item.unit} · Stock {item.availableKg} kg /{" "}
                        {item.availablePieces} pz
                      </p>
                      {item.unit === "KG_AND_PIECE" && (
                        <p className="text-[0.62rem] text-[var(--pos-muted)]">
                          Equivalencia activa
                        </p>
                      )}
                    </td>
                    <td className="align-middle">
                      <div className="flex gap-1.5">
                        {(item.unit === "KG" ||
                          item.unit === "KG_AND_PIECE") && (
                          <label className="grid gap-0.5 text-[0.6rem] font-bold text-[var(--pos-muted)]">
                            Kg
                            <input
                              aria-label={`Kilos capturados de ${item.name}`}
                              className="h-8 w-20 border border-[var(--pos-steel)] bg-white px-2 font-[var(--pos-mono)] text-sm text-[var(--pos-ink)] outline-none focus:border-[var(--pos-focus)]"
                              min="0"
                              onChange={(event) =>
                                onQuantityChange(
                                  item.productId,
                                  Number(event.target.value),
                                  item.quantityPieces,
                                )
                              }
                              onFocus={() => {
                                onActivate?.(item.productId);
                                onQuantityFocus?.(item.productId, "kg");
                              }}
                              step="0.01"
                              type="number"
                              value={item.quantityKg || ""}
                            />
                          </label>
                        )}
                        {(item.unit === "PIECE" ||
                          item.unit === "KG_AND_PIECE") && (
                          <label className="grid gap-0.5 text-[0.6rem] font-bold text-[var(--pos-muted)]">
                            Pzas.
                            <input
                              aria-label={`Piezas capturadas de ${item.name}`}
                              className="h-8 w-20 border border-[var(--pos-steel)] bg-white px-2 font-[var(--pos-mono)] text-sm text-[var(--pos-ink)] outline-none focus:border-[var(--pos-focus)]"
                              min="0"
                              onChange={(event) =>
                                onQuantityChange(
                                  item.productId,
                                  item.quantityKg,
                                  Number(event.target.value),
                                )
                              }
                              onFocus={() => {
                                onActivate?.(item.productId);
                                onQuantityFocus?.(item.productId, "pieces");
                              }}
                              step="1"
                              type="number"
                              value={item.quantityPieces || ""}
                            />
                          </label>
                        )}
                      </div>
                      {validation && (
                        <p
                          role="alert"
                          className="mt-1 max-w-48 text-[0.62rem] font-bold text-[var(--pos-red)]"
                        >
                          {validation}
                        </p>
                      )}
                    </td>
                    <td className="text-right align-middle font-[var(--pos-mono)] text-sm font-bold">
                      {toMoney(item.unitPrice)}
                    </td>
                    <td className="text-right align-middle font-[var(--pos-mono)] text-base font-black">
                      {toMoney(calculateItemSubtotal(item))}
                    </td>
                    <td className="px-2 text-right align-middle">
                      <button
                        aria-label={`Eliminar ${item.name}`}
                        className="p-2 text-[var(--pos-red)] transition hover:bg-[rgba(182,42,34,0.08)]"
                        onClick={() => onRemove(item.productId)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function CartPanel(props: CartProps) {
  return <Cart {...props} />;
}

type CustomerSelectorProps = {
  customers: CustomerOption[];
  error: unknown;
  isLoading: boolean;
  onSearchChange: (search: string) => void;
  onSelect: (customer: CustomerOption | null) => void;
  search: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  selectedCustomer: CustomerOption | null;
  compact?: boolean;
};

export function CustomerSelector({
  customers,
  compact = false,
  error,
  isLoading,
  onSearchChange,
  onSelect,
  search,
  searchInputRef,
  selectedCustomer,
}: CustomerSelectorProps) {
  const errorId = "customer-search-error";
  return (
    <section
      className={
        compact ? "min-w-0 overflow-x-hidden overflow-y-auto p-3" : panelClass
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={`${compact ? "text-[0.6rem]" : "text-[0.62rem]"} font-mono font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]`}
          >
            Cliente
          </p>
          <h2
            className={`${compact ? "mt-1 text-sm" : "mt-1 text-xl"} font-[var(--pos-display)] font-bold uppercase tracking-[-0.02em]`}
          >
            Cliente
          </h2>
        </div>
        <span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">
          F4
        </span>
      </div>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-label="Buscar cliente registrado"
        className={`${inputClass} mt-2 w-full ${compact ? "px-2.5 py-2 text-sm" : ""}`}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Público general o cliente registrado"
        ref={searchInputRef}
        value={search}
      />
      {isLoading && (
        <p className="mt-3 text-xs font-bold text-[var(--pos-green)]">
          Cargando clientes...
        </p>
      )}
      {Boolean(error) && (
        <p
          className="mt-3 text-xs font-bold text-[var(--pos-red)]"
          id={errorId}
          role="alert"
        >
          {errorMessage(error, "La búsqueda de clientes falló.")}
        </p>
      )}
      {selectedCustomer && (
        <article
          className={`${compact ? "mt-2 px-2 py-1.5" : "mt-3 px-3 py-2"} border-l-2 border-[var(--pos-action)] bg-[var(--pos-surface-secondary)] text-[var(--pos-ink)]`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{selectedCustomer.name}</p>
              <p className="font-mono text-[0.65rem] text-[var(--pos-muted)]">
                {selectedCustomer.customerType} ·{" "}
                {selectedCustomer.creditStatus ?? "Estado sin dato"}
              </p>
            </div>
            <span className="shrink-0 px-2 py-1 text-[0.65rem] font-bold text-[var(--pos-action)]">
              {effectiveCreditLabel(selectedCustomer)}
            </span>
          </div>
          <div
            className={`${compact ? "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" : "mt-2 grid gap-1"} text-xs text-[var(--pos-muted)]`}
          >
            <p>
              Vencido {toMoney(selectedCustomer.creditSummary?.overdueAmount)}
            </p>
            <p>
              {selectedCustomer.creditSummary?.maximumDaysOverdue ??
                selectedCustomer.creditSummary?.daysOverdue ??
                0}{" "}
              días de atraso
            </p>
            <p className={compact ? "hidden" : undefined}>
              {overduePolicyLabel(selectedCustomer)}
            </p>
          </div>
          <button
            className="mt-1 inline-flex h-11 items-center text-xs font-bold text-[var(--pos-amber)]"
            onClick={() => onSelect(null)}
            type="button"
          >
            Limpiar cliente
          </button>
        </article>
      )}
      <div
        className={`${compact ? "mt-2 max-h-24 gap-1.5" : "mt-3 max-h-40 gap-2"} grid overflow-auto`}
      >
        {customers.map((customer) => (
          <button
            className={`${compact ? "border-x-0 border-t-0 border-b p-2" : "rounded-xl p-2.5"} min-h-11 border border-[var(--pos-steel)] bg-[var(--pos-porcelain)] text-left transition hover:border-[var(--pos-green)] disabled:opacity-50`}
            disabled={customer.isActive === false || customer.active === false}
            key={customer.id}
            onClick={() => onSelect(customer)}
            type="button"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold">
                {customer.name}
              </span>
              <span className="text-[0.65rem] font-bold text-[var(--pos-muted)]">
                {effectiveCreditLabel(customer)}
              </span>
            </span>
            <span className="text-xs text-[var(--pos-muted)]">
              {customer.customerType} ·{" "}
              {customer.creditSummary?.availableCredit !== undefined
                ? `Disponible ${toMoney(customer.creditSummary.availableCredit)}`
                : customer.creditLimit !== undefined &&
                    customer.creditLimit !== null
                  ? `Límite ${toMoney(customer.creditLimit)}`
                  : "Límite —"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

type PaymentTypeControlProps = {
  compact?: boolean;
  onPaymentTypeChange: (type: PaymentType) => void;
  paymentType: PaymentType;
};

export function PaymentTypeControl({
  compact = false,
  onPaymentTypeChange,
  paymentType,
}: PaymentTypeControlProps) {
  return (
    <section
      className={
        compact ? "min-w-0 overflow-x-hidden overflow-y-auto p-3" : panelClass
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">
            Condición de pago
          </p>
          <h2
            className={`${compact ? "mt-1 text-sm" : "mt-1 text-xl"} font-[var(--pos-display)] font-bold uppercase tracking-[-0.02em]`}
          >
            Contado / Crédito
          </h2>
          <span className="sr-only">Tipo de venta y pago</span>
        </div>
        <span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">
          F7
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          aria-pressed={paymentType === "CASH_SALE"}
          className={`min-h-11 ${compact ? "rounded-none" : "rounded-lg"} px-2 text-xs font-black transition ${paymentType === "CASH_SALE" ? "bg-[var(--pos-ink)] text-white" : "bg-[var(--pos-porcelain)] text-[var(--pos-muted)] hover:bg-[var(--pos-steel)]"}`}
          onClick={() => onPaymentTypeChange("CASH_SALE")}
          type="button"
        >
          Venta de contado
        </button>
        <button
          aria-pressed={paymentType === "CREDIT_SALE"}
          className={`min-h-11 ${compact ? "rounded-none" : "rounded-lg"} px-2 text-xs font-black transition ${paymentType === "CREDIT_SALE" ? "bg-[var(--pos-ink)] text-white" : "bg-[var(--pos-porcelain)] text-[var(--pos-muted)] hover:bg-[var(--pos-steel)]"}`}
          onClick={() => onPaymentTypeChange("CREDIT_SALE")}
          type="button"
        >
          Venta a crédito
        </button>
      </div>
      <span className="sr-only">Venta de contado Venta a crédito</span>
    </section>
  );
}

type PaymentEntryControlProps = {
  compact?: boolean;
  firstCashInputRef?: RefObject<HTMLInputElement | null>;
  onCashTenderedSelect?: () => void;
  onPaymentsChange: (payments: SalePaymentInput[]) => void;
  panelRef?: RefObject<HTMLElement | null>;
  payments: SalePaymentInput[];
  paymentType?: PaymentType;
  total: Money;
};

const CASH_DENOMINATIONS = [50, 100, 200, 500, 1000];

export function PaymentEntryControl({
  compact = false,
  firstCashInputRef,
  onCashTenderedSelect,
  onPaymentsChange,
  panelRef,
  payments,
  paymentType = "CASH_SALE",
  total,
}: PaymentEntryControlProps) {
  const isCreditSale = paymentType === "CREDIT_SALE";
  const appliedAmountLabel = isCreditSale ? "Monto del adelanto" : "Monto";
  const appliedAmountAriaLabel = (index: number) =>
    isCreditSale
      ? `Monto del adelanto ${index + 1}`
      : `Monto aplicado del pago ${index + 1}`;
  const cashReceivedLabel = isCreditSale
    ? "Dinero entregado"
    : "Efectivo entregado";
  const cashReceivedAriaLabel = (index: number) =>
    isCreditSale
      ? `Dinero entregado del adelanto ${index + 1}`
      : `Efectivo entregado del pago ${index + 1}`;
  const totalPaid = calculatePaymentsTotal(payments);
  const remaining =
    total.subtract(totalPaid).compare(Money.zero()) > 0
      ? total.subtract(totalPaid)
      : Money.zero();
  const updatePayment = (index: number, update: Partial<SalePaymentInput>) => {
    onPaymentsChange(
      payments.map((payment, currentIndex) =>
        currentIndex === index ? { ...payment, ...update } : payment,
      ),
    );
  };
  const selectCashTendered = (index: number, cashTendered: string | number) => {
    updatePayment(index, { cashTendered });
    onCashTenderedSelect?.();
  };

  return (
    <section
      className={
        compact ? "min-w-0 overflow-x-hidden overflow-y-auto p-3" : panelClass
      }
      data-pos-payment
      ref={panelRef}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-amber)]">
            {isCreditSale ? "Adelanto" : "Pago"}
          </p>
          <h2
            className={`${compact ? "mt-1 text-sm" : "mt-1 text-xl"} font-[var(--pos-display)] font-bold uppercase tracking-[-0.02em]`}
          >
            {isCreditSale ? "Adelanto recibido" : "Pago recibido"}
          </h2>
        </div>
        <span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">
          {toMoney(totalPaid)} / {toMoney(total)}
        </span>
      </div>
      <div className="mt-2 grid gap-2">
        {payments.map((payment, index) => (
          <article
            className={`${compact ? "px-2 py-1.5" : "px-3 py-2"} border-l-2 border-[var(--pos-steel)] bg-[var(--pos-surface-secondary)]`}
            key={`${payment.paymentMethod}-${index}`}
          >
            <div
              className={`${compact ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]" : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"}`}
            >
              <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                Método
                <select
                  className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                  onChange={(event) =>
                    updatePayment(index, {
                      paymentMethod: event.target.value as PaymentMethod,
                      cashTendered: undefined,
                      bankName: "",
                      referenceNumber: "",
                      cardLastFour: "",
                    })
                  }
                  value={payment.paymentMethod}
                >
                  <option value="">Selecciona un método</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="DEPOSIT">Depósito</option>
                  <option value="CHECK">Cheque</option>
                  <option value="VOUCHER">Voucher</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                {appliedAmountLabel}
                <input
                  aria-label={appliedAmountAriaLabel(index)}
                  className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                  min="0.01"
                  onChange={(event) =>
                    updatePayment(index, {
                      amount:
                        event.target.value === "" ? 0 : event.target.value,
                    })
                  }
                  step="0.01"
                  type="number"
                  value={payment.amount || ""}
                />
              </label>
              <button
                className="h-11 self-end rounded-lg px-2 text-xs font-black text-[var(--pos-red)] hover:bg-white"
                onClick={() =>
                  onPaymentsChange(
                    payments.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  )
                }
                type="button"
              >
                Quitar
              </button>
            </div>
            {payment.paymentMethod === "CASH" && (
              <div
                className={`${compact ? "mt-2" : "mt-3"} grid gap-2 sm:grid-cols-2`}
              >
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  {cashReceivedLabel}
                  <input
                    aria-label={cashReceivedAriaLabel(index)}
                    className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                    data-pos-cash-tendered
                    min={Money.from(payment.amount).toString()}
                    onChange={(event) =>
                      updatePayment(index, {
                        cashTendered:
                          event.target.value === ""
                            ? undefined
                            : event.target.value,
                      })
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    ref={index === 0 ? firstCashInputRef : undefined}
                    step="0.01"
                    type="number"
                    value={payment.cashTendered ?? ""}
                  />
                </label>
                <div className="grid content-end gap-1 text-xs font-bold text-[var(--pos-muted)]">
                  <span>Cambio a entregar</span>
                  <output
                    aria-atomic="true"
                    aria-live="polite"
                    className={`${inputClass} ${compact ? "px-2 py-2" : ""} ${Money.from(payment.amount).isPositive() && payment.cashTendered !== undefined && Money.from(payment.cashTendered).compare(payment.amount) >= 0 ? "border-[rgba(22,117,82,0.45)] bg-[rgba(22,117,82,0.10)] text-lg font-black text-[var(--pos-success)]" : "bg-[var(--pos-porcelain)] text-[var(--pos-muted)]"} font-mono tabular-nums`}
                    data-pos-cash-change
                  >
                    {toMoney(
                      Money.from(payment.amount).isPositive() &&
                        payment.cashTendered !== undefined &&
                        Money.from(payment.cashTendered).compare(
                          payment.amount,
                        ) >= 0
                        ? calculateCashChange(
                            payment.cashTendered,
                            payment.amount,
                          )
                        : Money.zero(),
                    )}
                  </output>
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className="text-xs font-bold text-[var(--pos-muted)]">
                    Efectivo rápido
                  </legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    <button
                      aria-label={`Usar importe exacto de ${toMoney(payment.amount)}`}
                      className="min-h-11 border border-[var(--pos-action)] bg-[rgba(18,61,50,0.08)] px-2 text-xs font-black text-[var(--pos-action)] transition hover:bg-[rgba(18,61,50,0.16)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!Money.from(payment.amount).isPositive()}
                      onClick={() =>
                        selectCashTendered(
                          index,
                          Money.from(payment.amount).toString(),
                        )
                      }
                      type="button"
                    >
                      Exacto
                    </button>
                    {CASH_DENOMINATIONS.map((denomination) => (
                      <button
                        aria-label={`Usar ${toMoney(denomination)} de efectivo entregado`}
                        className="min-h-11 border border-[var(--pos-steel)] bg-white px-1 font-mono text-xs font-black tabular-nums text-[var(--pos-ink)] transition hover:border-[var(--pos-action)] hover:bg-[var(--pos-porcelain)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] disabled:cursor-not-allowed disabled:bg-[var(--pos-porcelain)] disabled:text-[var(--pos-muted)] disabled:opacity-50"
                        disabled={
                          !Money.from(payment.amount).isPositive() ||
                          Money.from(String(denomination)).compare(
                            payment.amount,
                          ) < 0
                        }
                        key={denomination}
                        onClick={() =>
                          selectCashTendered(index, String(denomination))
                        }
                        title={
                          Money.from(String(denomination)).compare(
                            payment.amount,
                          ) < 0
                            ? "La denominación es menor al monto aplicado."
                            : undefined
                        }
                        type="button"
                      >
                        ${denomination.toLocaleString("es-MX")}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
            {(payment.paymentMethod === "TRANSFER" ||
              payment.paymentMethod === "DEPOSIT" ||
              payment.paymentMethod === "CHECK") && (
              <div
                className={`${compact ? "mt-2" : "mt-3"} grid gap-2 sm:grid-cols-2`}
              >
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Banco
                  <input
                    className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                    onChange={(event) =>
                      updatePayment(index, { bankName: event.target.value })
                    }
                    value={payment.bankName ?? ""}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  {payment.paymentMethod === "CHECK"
                    ? "Número de cheque"
                    : "Referencia"}
                  <input
                    className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                    onChange={(event) =>
                      updatePayment(index, {
                        referenceNumber: event.target.value,
                      })
                    }
                    value={payment.referenceNumber ?? ""}
                  />
                </label>
              </div>
            )}
            {(payment.paymentMethod === "CARD" ||
              payment.paymentMethod === "VOUCHER") && (
              <div
                className={`${compact ? "mt-2" : "mt-3"} grid gap-2 sm:grid-cols-2`}
              >
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Autorización
                  <input
                    className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                    onChange={(event) =>
                      updatePayment(index, {
                        referenceNumber: event.target.value,
                      })
                    }
                    value={payment.referenceNumber ?? ""}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Últimos cuatro dígitos
                  <input
                    className={`${inputClass} ${compact ? "px-2 py-2 text-xs" : ""}`}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) =>
                      updatePayment(index, {
                        cardLastFour: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 4),
                      })
                    }
                    value={payment.cardLastFour ?? ""}
                  />
                </label>
              </div>
            )}
          </article>
        ))}
        <button
          className={`${compact ? "rounded-none px-2 text-xs" : "rounded-xl px-4 text-sm"} min-h-11 border border-dashed border-[var(--pos-green)] font-black text-[var(--pos-green)] transition hover:bg-[rgba(35,113,90,0.06)] disabled:cursor-not-allowed disabled:border-[var(--pos-steel)] disabled:text-[var(--pos-muted)] disabled:opacity-50`}
          disabled={!remaining.isPositive()}
          onClick={() =>
            onPaymentsChange([
              ...payments,
              { amount: remaining.toString(), paymentMethod: "CASH" },
            ])
          }
          type="button"
        >
          Agregar {isCreditSale ? "adelanto" : "pago"}
        </button>
      </div>
    </section>
  );
}

type PaymentMethodSelectorProps = {
  onPaymentTypeChange: (type: PaymentType) => void;
  onPaymentsChange: (payments: SalePaymentInput[]) => void;
  panelRef?: RefObject<HTMLElement | null>;
  paymentType: PaymentType;
  payments: SalePaymentInput[];
  total: Money | string | number;
};

export function PaymentMethodSelector({
  onPaymentTypeChange,
  onPaymentsChange,
  panelRef,
  paymentType,
  payments,
  total,
}: PaymentMethodSelectorProps) {
  return (
    <section className={panelClass} data-pos-payment>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-amber)]">
            Cobro
          </p>
          <h2 className="mt-1 font-[var(--pos-display)] text-xl font-bold uppercase tracking-[-0.02em]">
            Tipo de venta y pago
          </h2>
        </div>
        <AlertTriangle className="h-5 w-5 text-[var(--pos-amber)]" />
      </div>
      <div className="mt-3 grid gap-3">
        <PaymentTypeControl
          onPaymentTypeChange={onPaymentTypeChange}
          paymentType={paymentType}
        />
        <PaymentEntryControl
          onPaymentsChange={onPaymentsChange}
          panelRef={panelRef}
          payments={payments}
          paymentType={paymentType}
          total={Money.from(total)}
        />
      </div>
      {paymentType === "CREDIT_SALE" && (
        <p className="mt-3 text-xs text-[var(--pos-muted)]">
          Las ventas a crédito generan cuentas por cobrar. La cobranza se
          mantiene en su propio flujo.
        </p>
      )}
    </section>
  );
}

type BillingRequestPanelProps = {
  hasCustomer: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  onReasonChange: (reason: string) => void;
  onRequiresAdministrativeInvoiceChange: (
    requiresAdministrativeInvoice: boolean,
  ) => void;
  reason: string;
  requiresAdministrativeInvoice: boolean;
};

export function BillingRequestPanel({
  hasCustomer,
  notes,
  onNotesChange,
  onReasonChange,
  onRequiresAdministrativeInvoiceChange,
  reason,
  requiresAdministrativeInvoice,
}: BillingRequestPanelProps) {
  return (
    <section className={panelClass}>
      <div>
        <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">
          Seguimiento interno
        </p>
        <h2 className="mt-1 font-[var(--pos-display)] text-xl font-bold uppercase tracking-[-0.02em]">
          Solicitud administrativa
        </h2>
      </div>
      <div className="mt-3 grid gap-3">
        <label className="flex items-start gap-3 rounded-xl bg-[var(--pos-porcelain)] p-3 text-sm font-bold text-[var(--pos-muted)]">
          <input
            checked={requiresAdministrativeInvoice}
            disabled={!hasCustomer}
            onChange={(event) =>
              onRequiresAdministrativeInvoiceChange(event.target.checked)
            }
            type="checkbox"
          />
          Vincula esta venta con una solicitud administrativa interna.
        </label>
        {!hasCustomer && (
          <p className="text-xs font-semibold text-[var(--pos-red)]">
            Selecciona un cliente antes de solicitar seguimiento administrativo.
          </p>
        )}
        {requiresAdministrativeInvoice && (
          <>
            <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
              Motivo obligatorio
              <input
                className={inputClass}
                onChange={(event) => onReasonChange(event.target.value)}
                placeholder="Describe por qué requiere seguimiento"
                required
                value={reason}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
              Notas opcionales
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Indicaciones para administración"
                value={notes}
              />
            </label>
          </>
        )}
        <p className="rounded-xl border border-[rgba(35,113,90,0.20)] bg-[rgba(35,113,90,0.08)] p-3 text-xs font-bold text-[var(--pos-green)]">
          Solo relación administrativa interna. Esto no emite CFDI, UUID SAT,
          timbrado ni ninguna factura fiscal.
        </p>
      </div>
    </section>
  );
}

type SaleSummaryProps = {
  cart: CartItem[];
  compact?: boolean;
  creditOptions?: CreditRestrictionOptions;
  creditRestriction?: string | null;
  customer: CustomerOption | null;
  payments?: SalePaymentInput[];
  paymentType: PaymentType;
  summaryOnly?: boolean;
};

export function SaleSummary({
  cart,
  compact = false,
  creditOptions,
  creditRestriction,
  customer,
  payments = [],
  paymentType,
  summaryOnly = false,
}: SaleSummaryProps) {
  const total = calculateCartTotal(cart);
  const paid = calculatePaymentsTotal(payments);
  const pending =
    total.subtract(paid).compare(Money.zero()) > 0
      ? total.subtract(paid)
      : Money.zero();
  const previousTotal = useRef(total.toString());
  const [isTotalUpdating, setIsTotalUpdating] = useState(false);

  useEffect(() => {
    if (previousTotal.current === total.toString()) return;
    previousTotal.current = total.toString();
    setIsTotalUpdating(true);
    const timer = window.setTimeout(() => setIsTotalUpdating(false), 140);
    return () => window.clearTimeout(timer);
  }, [total]);

  if (compact && summaryOnly) {
    return (
      <section className="min-w-0 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-green)]">
            Resumen de venta
          </p>
          <span className="shrink-0 font-mono text-[0.68rem] font-bold text-[var(--pos-muted)]">
            {cart.length} partidas
          </span>
        </div>
        <dl className="mt-2 grid grid-cols-3 divide-x divide-[var(--pos-steel)] text-xs">
          <div className="min-w-0 pr-3">
            <dt className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
              Condición
            </dt>
            <dd className="mt-0.5 truncate font-bold">
              {paymentTypeLabel(paymentType)}
            </dd>
          </div>
          <div className="min-w-0 px-3">
            <dt className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
              Pagado
            </dt>
            <dd className="mt-0.5 truncate font-mono font-bold">
              {toMoney(paid)}
            </dd>
          </div>
          <div className="min-w-0 pl-3">
            <dt className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
              Pendiente
            </dt>
            <dd className="mt-0.5 truncate font-mono font-bold">
              {toMoney(pending)}
            </dd>
          </div>
        </dl>
        <span className="sr-only">{`Límite de crédito${customer ? toMoney(customer.creditSummary?.creditLimit ?? customer.creditLimit) : "—"} Crédito disponible${customer?.creditSummary?.availableCredit !== undefined ? toMoney(customer.creditSummary.availableCredit) : "—"} Saldo pendiente${customer?.creditSummary?.outstandingAmount !== undefined ? toMoney(customer.creditSummary.outstandingAmount) : "—"}`}</span>
        {creditRestriction && (
          <p
            className="mt-2 truncate text-[0.68rem] font-bold text-[var(--pos-red)]"
            role="alert"
          >
            {creditRestriction}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={compact ? "min-w-0" : panelClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-green)]">
            Total
          </p>
          <output
            aria-atomic="true"
            aria-live="polite"
            className={`${compact ? "mt-1 text-[2rem]" : "mt-1 text-xl"} ${isTotalUpdating ? "pos-total-updated" : ""} block font-[var(--pos-display)] font-bold uppercase leading-none tracking-[-0.03em]`}
          >
            {toMoney(total)}
          </output>
          <span className="sr-only">
            Total en vivo Resumen sticky Resumen de la venta
          </span>
        </div>
        <CheckCircle2 className="h-5 w-5 text-[var(--pos-green)]" />
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-bold text-[var(--pos-muted)]">
          Ver validación · {cart.length} partidas
        </summary>
        <dl className="mt-2 grid gap-1.5 border-t border-[var(--pos-steel)] pt-2">
          <div className="flex justify-between">
            <dt>Partidas</dt>
            <dd className="font-mono font-bold">{cart.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Subtotal previo</dt>
            <dd className="font-mono font-bold">{toMoney(total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Descuento autorizado</dt>
            <dd className="font-mono font-bold">No aplicado</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tipo de venta</dt>
            <dd className="font-mono font-bold">
              {paymentTypeLabel(paymentType)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Límite de crédito</dt>
            <dd className="font-mono font-bold">
              {customer
                ? toMoney(
                    customer.creditSummary?.creditLimit ?? customer.creditLimit,
                  )
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Crédito disponible</dt>
            <dd className="font-mono font-bold">
              {customer?.creditSummary?.availableCredit !== undefined
                ? toMoney(customer.creditSummary.availableCredit)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Saldo pendiente</dt>
            <dd className="font-mono font-bold">
              {customer?.creditSummary?.outstandingAmount !== undefined
                ? toMoney(customer.creditSummary.outstandingAmount)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Saldo vencido</dt>
            <dd className="font-mono font-bold text-[var(--pos-red)]">
              {customer ? toMoney(customer.creditSummary?.overdueAmount) : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Días máximos de atraso</dt>
            <dd className="font-mono font-bold">
              {customer?.creditSummary?.maximumDaysOverdue ??
                customer?.creditSummary?.daysOverdue ??
                "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Política de mora</dt>
            <dd className="font-mono font-bold">
              {customer ? overduePolicyLabel(customer) : "—"}
            </dd>
          </div>
        </dl>
      </details>
      {creditRestriction && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-[rgba(182,42,34,0.20)] bg-[rgba(182,42,34,0.08)] p-2.5 text-xs font-bold text-[var(--pos-red)]"
        >
          {creditRestriction}
        </p>
      )}
      {paymentType === "CREDIT_SALE" &&
        customer?.creditSummary?.effectiveCreditStatus === "WARNING" && (
          <p className="mt-3 rounded-xl border border-[rgba(233,167,47,0.42)] bg-[rgba(233,167,47,0.14)] p-2.5 text-xs font-bold text-[#7d5a12]">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            El cliente tiene saldo vencido. La política permite continuar con
            advertencia.
          </p>
        )}
      {creditOptions?.overrideEnabled && !creditRestriction && (
        <p className="mt-3 rounded-xl border border-[rgba(233,167,47,0.42)] bg-[rgba(233,167,47,0.14)] p-2.5 text-xs font-bold text-[#7d5a12]">
          La venta continuará con autorización administrativa y motivo
          auditable.
        </p>
      )}
      {paymentType === "CREDIT_SALE" && !creditRestriction && (
        <p className="mt-3 rounded-xl border border-[rgba(35,113,90,0.20)] bg-[rgba(35,113,90,0.08)] p-2.5 text-xs font-bold text-[var(--pos-green)]">
          Esta venta generará una cuenta por cobrar por el saldo pendiente.
        </p>
      )}
    </section>
  );
}

type ConfirmSaleButtonProps = {
  disabledReason?: string | null;
  compact?: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  total?: number;
  pendingAmount?: number;
  transactionState?: PosTransactionState;
  buttonRef?: RefObject<HTMLButtonElement | null>;
};

export function ConfirmSaleButton({
  buttonRef,
  compact = false,
  disabledReason,
  isSubmitting,
  onConfirm,
  pendingAmount,
  transactionState,
}: ConfirmSaleButtonProps) {
  const actionLabel =
    transactionState === "EMPTY"
      ? "Confirmar venta"
      : transactionState === "CART_ACTIVE"
        ? "Registra el pago"
        : transactionState === "WEIGHT_PENDING"
          ? "Captura el peso"
          : transactionState === "CUSTOMER_REQUIRED"
            ? "Selecciona cliente"
            : transactionState === "CREDIT_BLOCKED"
              ? "Crédito no disponible"
              : transactionState === "PAYMENT_PENDING"
                ? pendingAmount && pendingAmount > 0
                  ? `Pendiente: ${toMoney(pendingAmount)}`
                  : "Registra el pago"
                : transactionState === "PROCESSING" || isSubmitting
                  ? "Procesando..."
                  : transactionState === "SUCCESS"
                    ? "Venta registrada"
                    : transactionState === "BLOCKED"
                      ? "Resolver incidencia"
                      : disabledReason?.includes("producto")
                        ? "Confirmar venta"
                        : disabledReason?.includes("cliente") ||
                            disabledReason?.includes("crédito")
                          ? "Selecciona cliente"
                          : disabledReason?.includes("pago") ||
                              disabledReason?.includes("liquidarse")
                            ? "Registra el pago"
                            : "Confirmar venta · F8";
  return (
    <div className="grid gap-2">
      <button
        aria-describedby={disabledReason ? "checkout-blocker" : undefined}
        aria-keyshortcuts="F8 Enter"
        aria-live="polite"
        className={`${compact ? "h-14 rounded-none px-3 shadow-none" : "rounded-xl px-4 py-3.5 shadow-[0_12px_26px_rgba(18,61,50,0.24)]"} bg-[var(--pos-action)] text-sm font-black text-white transition hover:bg-[#0d2e25] disabled:cursor-not-allowed disabled:bg-[rgba(96,112,107,0.40)] disabled:shadow-none`}
        disabled={Boolean(disabledReason) || isSubmitting}
        onClick={onConfirm}
        ref={buttonRef}
        type="button"
      >
        {actionLabel}
      </button>
      {disabledReason && (
        <p
          className="text-[0.68rem] font-bold leading-tight text-[var(--pos-red)]"
          id="checkout-blocker"
          role="status"
        >
          {disabledReason}
        </p>
      )}
    </div>
  );
}

type TicketModalProps = {
  fallback?: TicketData | null;
  isProvisional?: boolean;
  isLoading: boolean;
  onClose: () => void;
  ticket?: TicketData;
};

type SaleRegisteredScreenProps = {
  customerName: string;
  onClose: () => void;
  onNewSale: () => void;
  onOpenHistory: () => void;
  onRetryPrint: () => void;
  saleNumber: string;
  total: number | string;
  printStatus?: "loading" | "ready" | "error" | "unavailable";
};

export function SaleRegisteredScreen({
  customerName,
  onClose,
  onNewSale,
  onOpenHistory,
  onRetryPrint,
  saleNumber,
  total,
  printStatus = "ready",
}: SaleRegisteredScreenProps) {
  return (
    <aside
      aria-labelledby="sale-registered-title"
      aria-modal="true"
      className="fixed inset-0 z-30 grid place-items-center bg-[rgba(23,33,30,0.62)] p-4 sm:p-6"
      role="dialog"
    >
      <section className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-[var(--pos-steel)] bg-white shadow-[0_28px_80px_rgba(23,33,30,0.28)]">
        <header className="bg-[var(--pos-ink)] p-6 text-white sm:p-8">
          <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--pos-amber)]">
            Resultado de la operación
          </p>
          <h2
            className="mt-2 font-[var(--pos-display)] text-3xl font-bold uppercase tracking-[-0.03em]"
            id="sale-registered-title"
          >
            Venta registrada
          </h2>
          <p className="mt-2 text-sm text-white/70">
            La venta quedó confirmada. Puedes imprimir el comprobante interno o
            continuar con la siguiente operación.
          </p>
        </header>
        <div className="grid gap-5 p-6 sm:p-8">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[var(--pos-porcelain)] p-4 sm:col-span-1">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
                Número de venta
              </dt>
              <dd className="mt-2 break-words font-mono text-lg font-black text-[var(--pos-ink)]">
                {saleNumber}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--pos-porcelain)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
                Total
              </dt>
              <dd className="mt-2 font-mono text-lg font-black text-[var(--pos-ink)]">
                {toMoney(total)}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--pos-porcelain)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">
                Cliente
              </dt>
              <dd className="mt-2 break-words text-sm font-black text-[var(--pos-ink)]">
                {customerName}
              </dd>
            </div>
          </dl>
          {printStatus === "loading" && (
            <p
              className="rounded-xl border border-[rgba(35,113,90,0.22)] bg-[rgba(35,113,90,0.08)] p-3 text-sm font-bold text-[var(--pos-green)]"
              role="status"
            >
              Imprimiendo... preparando el documento.
            </p>
          )}
          {printStatus === "ready" && (
            <p
              className="rounded-xl border border-[rgba(35,113,90,0.22)] bg-[rgba(35,113,90,0.08)] p-3 text-sm font-bold text-[var(--pos-green)]"
              role="status"
            >
              Impreso · documento listo para reimprimir.
            </p>
          )}
          {printStatus === "error" && (
            <p
              className="rounded-xl border border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] p-3 text-sm font-bold text-[var(--pos-red)]"
              role="alert"
            >
              Error de impresión. No se pudo consultar el documento; puedes
              reimprimir o usar la impresión provisional.
            </p>
          )}
          {printStatus === "unavailable" && (
            <p
              className="rounded-xl border border-[rgba(233,167,47,0.35)] bg-[rgba(233,167,47,0.14)] p-3 text-sm font-bold text-[#7d5a12]"
              role="status"
            >
              Impresión pendiente. Se conservaron los datos para una impresión
              provisional.
            </p>
          )}
          <p className="text-xs font-semibold text-[var(--pos-muted)]">
            Esta confirmación permanecerá visible hasta que elijas una acción.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-xl bg-[var(--pos-red)] px-4 py-3 text-sm font-black text-white transition hover:bg-[var(--pos-red-dark)]"
              onClick={onRetryPrint}
              type="button"
            >
              Reimprimir
            </button>
            <button
              className="rounded-xl border border-[var(--pos-ink)] px-4 py-3 text-sm font-black text-[var(--pos-ink)] transition hover:bg-[var(--pos-ink)] hover:text-white"
              onClick={onNewSale}
              type="button"
            >
              Nueva venta
            </button>
            <button
              className="rounded-xl border border-[var(--pos-steel)] px-4 py-3 text-sm font-black text-[var(--pos-ink)] transition hover:border-[var(--pos-green)] hover:text-[var(--pos-green)]"
              onClick={onOpenHistory}
              type="button"
            >
              Ir al historial
            </button>
            <button
              className="rounded-xl border border-[var(--pos-steel)] px-4 py-3 text-sm font-black text-[var(--pos-muted)] transition hover:border-[var(--pos-ink)] hover:text-[var(--pos-ink)]"
              onClick={onClose}
              type="button"
            >
              Cerrar ventana
            </button>
          </div>
        </div>
      </section>
    </aside>
  );
}

function receiptDate(value?: string) {
  return value
    ? new Date(value).toLocaleString("es-MX", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Generado al confirmar la venta";
}

function receiptNumber(data: TicketData) {
  return (
    data.physicalFolio ??
    data.ticketNumber ??
    data.saleNumber ??
    data.ticketId ??
    "Venta confirmada"
  );
}

function receiptPaid(data: TicketData) {
  if (data.paid !== undefined && data.paid !== null) return Number(data.paid);
  return (
    data.payments?.reduce(
      (total, payment) => total + Number(payment.amount ?? 0),
      0,
    ) ?? 0
  );
}

function receiptOutstanding(data: TicketData, paid: number) {
  return data.outstanding !== undefined && data.outstanding !== null
    ? Number(data.outstanding)
    : Math.max(Number(data.total ?? 0) - paid, 0);
}

function ReceiptItems({
  data,
  detailed = false,
}: {
  data: TicketData;
  detailed?: boolean;
}) {
  return (
    <div className="receipt-items">
      {detailed && (
        <div className="receipt-item receipt-item-header">
          <span>Cant.</span>
          <span>Unidad</span>
          <span>Descripción</span>
          <span>P. unitario</span>
          <span>Importe</span>
        </div>
      )}
      {data.items?.map((item, index) => {
        const quantity =
          Number(item.quantityKg ?? item.kilos ?? 0) ||
          Number(item.quantityPieces ?? item.pieces ?? 0);
        return detailed ? (
          <div
            className="receipt-item"
            key={`${item.productName ?? item.product ?? "item"}-${index}`}
          >
            <span>
              {quantity.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
            </span>
            <span>{operationalUnitLabel(item.unit)}</span>
            <strong>{item.productName ?? item.product}</strong>
            <span>{toMoney(item.unitPrice)}</span>
            <span>{toMoney(item.subtotal)}</span>
          </div>
        ) : (
          <article
            className="receipt-simple-item"
            key={`${item.productName ?? item.product ?? "item"}-${index}`}
          >
            <span>
              {quantity.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
            </span>
            <strong>{item.productName ?? item.product}</strong>
            <span>{toMoney(item.subtotal)}</span>
          </article>
        );
      })}
    </div>
  );
}

function ReceiptTotals({
  data,
  includeBalance = false,
}: {
  data: TicketData;
  includeBalance?: boolean;
}) {
  const paid = receiptPaid(data);
  const balance = receiptOutstanding(data, paid);
  return (
    <dl className="receipt-totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{toMoney(data.subtotal)}</dd>
      </div>
      <div>
        <dt>Descuento</dt>
        <dd>{toMoney(data.discount)}</dd>
      </div>
      <div className="receipt-grand-total">
        <dt>TOTAL</dt>
        <dd>{toMoney(data.total)}</dd>
      </div>
      {includeBalance && (
        <>
          <div>
            <dt>Pagado</dt>
            <dd>{toMoney(paid)}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd>{toMoney(balance)}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

function receiptPaymentMethods(data: TicketData) {
  if (data.payments && data.payments.length > 1) {
    return data.payments
      .map((payment) => paymentMethodLabel(payment.paymentMethod))
      .join(" · ");
  }
  return paymentMethodLabel(
    data.paymentMethod ?? data.payments?.[0]?.paymentMethod,
  );
}

function ReceiptCashEvidence({ data }: { data: TicketData }) {
  const cashPayments =
    data.payments?.filter(
      (payment) =>
        payment.paymentMethod === "CASH" &&
        payment.cashTendered !== null &&
        payment.cashTendered !== undefined &&
        payment.changeGiven !== null &&
        payment.changeGiven !== undefined,
    ) ?? [];
  if (cashPayments.length === 0) return null;
  return (
    <dl className="receipt-payment">
      {cashPayments.map((payment, index) => (
        <div key={`cash-evidence-${index}`}>
          <dt>Efectivo entregado</dt>
          <dd>{toMoney(payment.cashTendered)}</dd>
          <dt>Cambio</dt>
          <dd>{toMoney(payment.changeGiven)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleNote({ data }: { data: TicketData }) {
  const paid = receiptPaid(data);
  return (
    <div className="receipt-document receipt-format-simple">
      <header className="receipt-brand receipt-brand-centered">
        <img
          alt="El Pollo de Los Pollos"
          src="/477123481_10232415903693976_8230121272963336539_n.svg"
        />
        <strong>El Pollo de Los Pollos</strong>
        <span>{data.locationName ?? data.locationId ?? "Punto de venta"}</span>
      </header>
      <section className="receipt-section">
        <h2>NOTA DE VENTA</h2>
        <p>
          <b>Folio:</b> {receiptNumber(data)}
        </p>
        <p>
          <b>Fecha:</b> {receiptDate(data.createdAt)}
        </p>
        <p>
          <b>Vendedor:</b> {data.sellerName ?? "—"}
        </p>
        <p>
          <b>Cliente:</b> {data.customerName ?? "Público general"}
        </p>
      </section>
      <div className="receipt-simple-head">
        <span>CANT.</span>
        <span>PRODUCTO</span>
        <span>IMPORTE</span>
      </div>
      <ReceiptItems data={data} />
      <ReceiptTotals data={data} />
      <dl className="receipt-payment">
        <div>
          <dt>Pago: {receiptPaymentMethods(data)}</dt>
          <dd>{toMoney(paid)}</dd>
        </div>
      </dl>
      <ReceiptCashEvidence data={data} />
      <footer className="receipt-footer">
        <strong>Gracias por su compra</strong>
        <span>No es comprobante fiscal</span>
      </footer>
    </div>
  );
}

function LargeNote({ data }: { data: TicketData }) {
  return (
    <div className="receipt-document receipt-format-large">
      <header className="receipt-brand">
        <img
          alt="El Pollo de Los Pollos"
          src="/477123481_10232415903693976_8230121272963336539_n.svg"
        />
        <div>
          <strong>El Pollo de Los Pollos</strong>
          <span>
            {data.locationName ?? data.locationId ?? "Punto de venta"}
          </span>
        </div>
      </header>
      <section className="receipt-title-row">
        <div>
          <h2>NOTA DE VENTA</h2>
          <p>
            <b>Fecha:</b> {receiptDate(data.createdAt)}
          </p>
        </div>
        <p>
          <b>Folio:</b> {receiptNumber(data)}
        </p>
      </section>
      <section className="receipt-section">
        <h3>DATOS DEL CLIENTE</h3>
        <p>
          <b>Nombre:</b> {data.customerName ?? "Público general"}
        </p>
        {data.customerAddress && (
          <p>
            <b>Dirección:</b> {data.customerAddress}
          </p>
        )}
        {data.customerPhone && (
          <p>
            <b>Teléfono:</b> {data.customerPhone}
          </p>
        )}
        {data.customerTaxId && (
          <p>
            <b>RFC:</b> {data.customerTaxId}
          </p>
        )}
        <p>
          <b>Condición:</b>{" "}
          {data.paymentType === "CREDIT_SALE"
            ? `Crédito${data.customerCreditDays ? ` a ${data.customerCreditDays} días` : ""}`
            : "Contado"}
        </p>
      </section>
      <ReceiptItems data={data} detailed />
      <ReceiptTotals data={data} includeBalance />
      <ReceiptCashEvidence data={data} />
      <section className="receipt-signatures">
        <span>Entregó: ______________</span>
        <span>Recibió: ______________</span>
        <span>Firma: ________________</span>
        <span>Firma: _________________</span>
      </section>
      <footer className="receipt-footer">
        Documento comercial no válido como comprobante fiscal
      </footer>
    </div>
  );
}

function InternalReceipt({ data }: { data: TicketData }) {
  const paid = receiptPaid(data);
  const outstanding = receiptOutstanding(data, paid);
  return (
    <div className="receipt-document receipt-format-internal">
      <header className="receipt-brand">
        <img
          alt="El Pollo de Los Pollos"
          src="/477123481_10232415903693976_8230121272963336539_n.svg"
        />
        <div>
          <strong>El Pollo de Los Pollos</strong>
          <h2>RECIBO INTERNO</h2>
          <span>NO VÁLIDO COMO COMPROBANTE FISCAL</span>
        </div>
      </header>
      <section className="receipt-section">
        <p>
          <b>Folio:</b> {receiptNumber(data)}
        </p>
        <p>
          <b>Fecha:</b> {receiptDate(data.createdAt)}
        </p>
        <p>
          <b>Sucursal:</b> {data.locationName ?? data.locationId ?? "—"}
        </p>
      </section>
      <section className="receipt-section">
        <h3>TIPO DE MOVIMIENTO</h3>
        <strong>Registro interno de venta</strong>
        <p>
          <b>Se recibió de:</b> {data.customerName ?? "Público general"}
        </p>
        <p>
          <b>Total de venta:</b> {toMoney(data.total)}
        </p>
        <p className="receipt-amount">
          <b>Pago recibido:</b> {toMoney(paid)}
        </p>
        <p>
          <b>Saldo pendiente:</b> {toMoney(outstanding)}
        </p>
        {data.paymentType === "CREDIT_SALE" && (
          <p>
            <b>Fecha de vencimiento:</b>{" "}
            {data.dueDate ? receiptDate(data.dueDate) : "—"}
          </p>
        )}
        <p>
          <b>Concepto:</b> Cobro de venta{" "}
          {data.saleNumber ?? receiptNumber(data)}
        </p>
        <p>
          <b>Referencia:</b> {receiptNumber(data)}
        </p>
      </section>
      <ReceiptCashEvidence data={data} />
      <section className="receipt-signatures receipt-signatures-three">
        <span>Entregó: ______________</span>
        <span>Recibió: ______________</span>
        <span>Autorizó: ______________</span>
      </section>
      <footer className="receipt-footer">
        <strong>DOCUMENTO DE CONTROL INTERNO</strong>
      </footer>
    </div>
  );
}

function scaleQuantity(
  value: number | string | null | undefined,
  suffix: string,
) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("es-MX", { maximumFractionDigits: 3 })} ${suffix}`;
}

function ScaleTicket({ data }: { data: TicketData }) {
  const scale = data.scaleTicket;
  const productName =
    scale?.productName ??
    data.items
      ?.map((item) => item.productName ?? item.product)
      .filter(Boolean)
      .join(", ") ??
    "—";
  const netWeightKg =
    scale?.netWeightKg ??
    data.items?.reduce(
      (total, item) => total + Number(item.quantityKg ?? item.kilos ?? 0),
      0,
    );
  const pieceCount =
    scale?.pieceCount ??
    data.items?.reduce(
      (total, item) => total + Number(item.quantityPieces ?? item.pieces ?? 0),
      0,
    );
  const unit = scale?.productUnit ?? data.items?.[0]?.unit;
  const priceLabel =
    unit === "PIECE"
      ? "Precio por pieza"
      : unit === "KG"
        ? "Precio por kg"
        : "Precio por kg o pieza";
  const amount = scale?.amount ?? data.total;

  return (
    <div className="receipt-document receipt-format-scale">
      <header className="receipt-brand receipt-brand-centered">
        <img
          alt="El Pollo de Los Pollos"
          src="/477123481_10232415903693976_8230121272963336539_n.svg"
        />
        <strong>El Pollo de Los Pollos</strong>
        <span>{data.locationName ?? data.locationId ?? "Punto de venta"}</span>
      </header>
      <section className="receipt-section">
        <h2>TICKET DE BÁSCULA</h2>
        <p>
          <b>Folio de báscula:</b> {scale?.physicalFolio ?? receiptNumber(data)}
        </p>
        <p>
          <b>Fecha y hora:</b>{" "}
          {receiptDate(scale?.capturedAt ?? data.createdAt)}
        </p>
        <p>
          <b>Producto:</b> {productName}
        </p>
      </section>
      <dl className="receipt-totals">
        <div>
          <dt>Peso bruto</dt>
          <dd>{scaleQuantity(scale?.grossWeightKg, "kg")}</dd>
        </div>
        <div>
          <dt>Peso tara</dt>
          <dd>{scaleQuantity(scale?.tareWeightKg, "kg")}</dd>
        </div>
        <div>
          <dt>Peso neto</dt>
          <dd>{scaleQuantity(netWeightKg, "kg")}</dd>
        </div>
        <div>
          <dt>Piezas</dt>
          <dd>{scaleQuantity(pieceCount, "pzas")}</dd>
        </div>
        <div>
          <dt>{priceLabel}</dt>
          <dd>{toMoney(scale?.unitPrice ?? data.items?.[0]?.unitPrice)}</dd>
        </div>
        <div className="receipt-grand-total">
          <dt>IMPORTE</dt>
          <dd>{toMoney(amount)}</dd>
        </div>
      </dl>
      <section className="receipt-section">
        <p>
          <b>Operador:</b> {scale?.operatorName ?? data.sellerName ?? "—"}
        </p>
        <p>
          <b>Punto de venta:</b> {data.locationName ?? data.locationId ?? "—"}
        </p>
      </section>
      <section className="receipt-signatures">
        <span>Firma o validación: ________________</span>
      </section>
      <footer className="receipt-footer">
        <strong>DOCUMENTO OPERATIVO DE BÁSCULA</strong>
        <span>No es comprobante fiscal</span>
      </footer>
    </div>
  );
}

function ReceiptDocument({ data }: { data: TicketData }) {
  if (data.documentType === "SCALE_TICKET") return <ScaleTicket data={data} />;
  if (data.documentType === "LARGE_NOTE") return <LargeNote data={data} />;
  if (data.documentType === "INTERNAL_RECEIPT")
    return <InternalReceipt data={data} />;
  return <SimpleNote data={data} />;
}

export function TicketModal({
  fallback,
  isLoading,
  isProvisional = false,
  onClose,
  ticket,
}: TicketModalProps) {
  const portalReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const data = ticket ?? fallback;
  if (!data && !isLoading) return null;
  const modal = (
    <aside
      aria-label="Documento de venta"
      aria-modal="true"
      className="ticket-print-root pos-modal-enter fixed inset-0 z-40 grid place-items-center bg-black/55 p-3 sm:p-6"
      role="dialog"
    >
      <section
        className={`ticket-print-content max-h-[94vh] w-full overflow-y-auto bg-white text-[#171717] shadow-2xl sm:rounded-md ${data?.documentType === "SIMPLE_NOTE" || data?.documentType === "SCALE_TICKET" ? "max-w-[25rem]" : "max-w-[52rem]"}`}
      >
        <div className="ticket-actions sticky top-0 z-10 flex justify-end gap-5 border-b border-[#ececec] bg-white/95 px-6 py-4 backdrop-blur sm:px-10">
          <button
            className="text-sm font-bold text-[#292929] transition hover:text-black"
            onClick={() => window.print()}
            type="button"
          >
            Imprimir
          </button>
          <button
            className="text-sm font-bold text-[#686868] transition hover:text-black"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
        </div>
        <div className="p-5 sm:p-8">
          {isLoading && (
            <p className="mb-4 rounded-lg bg-[#f5f3ee] p-3 text-sm font-bold text-[#39798b]">
              Cargando datos del documento...
            </p>
          )}
          {isProvisional && (
            <p
              className="mb-4 rounded-lg border border-[#e5c36a] bg-[#fff8df] p-3 text-sm font-bold text-[#7d5a12]"
              role="status"
            >
              Impresión provisional: se muestran los datos devueltos al
              registrar la venta porque el documento no pudo consultarse.
            </p>
          )}
          {data && <ReceiptDocument data={data} />}
        </div>
      </section>
    </aside>
  );

  return portalReady ? createPortal(modal, document.body) : modal;
}
