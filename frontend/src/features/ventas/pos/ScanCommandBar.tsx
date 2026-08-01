import { Barcode } from "lucide-react";
import type { RefObject } from "react";

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
