import * as QRCode from "qrcode";
import { Download, Printer, QrCode, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buildProductQrPayload } from "../../../../../shared/product-qr";
import type { Product } from "../types";

type ProductQrModalProps = {
  product: Product;
  onClose: () => void;
};

type GeneratedQr = {
  payload: string;
  pngDataUrl: string;
  svgMarkup: string;
};

type GenerationError = {
  payload: string;
  message: string;
};

const QR_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  width: 320,
};

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPE_MAP[character] ?? character,
  );
}

function downloadFile(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

export function ProductQrModal({ product, onClose }: ProductQrModalProps) {
  const payload = buildProductQrPayload(product.id);
  const [generatedQr, setGeneratedQr] = useState<GeneratedQr | null>(null);
  const [generationError, setGenerationError] =
    useState<GenerationError | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      QRCode.toDataURL(payload, QR_OPTIONS),
      QRCode.toString(payload, { ...QR_OPTIONS, type: "svg" }),
    ])
      .then(([pngDataUrl, svgMarkup]) => {
        if (cancelled) return;
        setGeneratedQr({ payload, pngDataUrl, svgMarkup });
      })
      .catch(() => {
        if (!cancelled) {
          setGenerationError({
            payload,
            message: "No se pudo generar el código QR.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  const currentGeneratedQr =
    generatedQr?.payload === payload ? generatedQr : null;
  const currentGenerationError =
    generationError?.payload === payload ? generationError.message : null;
  const svgDataUrl = currentGeneratedQr
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentGeneratedQr.svgMarkup)}`
    : undefined;

  function downloadPng() {
    if (!currentGeneratedQr) return;
    downloadFile(currentGeneratedQr.pngDataUrl, `producto-${product.id}.png`);
  }

  function downloadSvg() {
    if (!currentGeneratedQr) return;
    const blobUrl = URL.createObjectURL(
      new Blob([currentGeneratedQr.svgMarkup], { type: "image/svg+xml" }),
    );
    downloadFile(blobUrl, `producto-${product.id}.svg`);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }

  function printLabel() {
    if (!currentGeneratedQr) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setGenerationError({
        payload,
        message: "El navegador bloqueó la ventana de impresión.",
      });
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Etiqueta QR · ${escapeHtml(product.name)}</title>
          <style>
            body { display: grid; place-items: center; min-height: 100vh; margin: 0; font-family: Arial, sans-serif; }
            main { display: grid; gap: 8px; justify-items: center; width: 320px; text-align: center; }
            img { width: 320px; height: 320px; }
            h1 { margin: 0; font-size: 20px; }
            p { margin: 0; font-size: 12px; }
            .identifier { font-family: monospace; overflow-wrap: anywhere; }
          </style>
        </head>
        <body>
          <main>
            <img src="${currentGeneratedQr.pngDataUrl}" alt="Código QR de ${escapeHtml(product.name)}" />
            <h1>${escapeHtml(product.name)}</h1>
            ${product.sku ? `<p>SKU: ${escapeHtml(product.sku)}</p>` : ""}
            ${product.barcode ? `<p>Código de barras: ${escapeHtml(product.barcode)}</p>` : ""}
            <p class="identifier">ID: ${escapeHtml(product.id)}</p>
          </main>
        </body>
      </html>
    `);
    printWindow.document.close();
    const print = () => {
      printWindow.focus();
      printWindow.print();
    };
    const printImage = printWindow.document.querySelector("img");
    if (printImage && !printImage.complete) {
      printImage.addEventListener("load", print, { once: true });
    } else {
      printWindow.setTimeout(print, 0);
    }
  }

  return (
    <div
      aria-labelledby="product-qr-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(16,24,32,0.64)] p-4"
      role="dialog"
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] shadow-[0_24px_80px_rgba(16,24,32,0.28)]">
        <header className="flex items-start justify-between gap-4 bg-[var(--erp-brand-red)] px-5 py-4 text-white">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
              <QrCode aria-hidden="true" className="h-4 w-4" />
              Identificador de producto
            </p>
            <h2
              className="mt-1 text-xl font-bold text-white"
              id="product-qr-modal-title"
            >
              Generar QR
            </h2>
          </div>
          <button
            aria-label="Cerrar generador QR"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
          <div className="grid min-h-80 place-items-center rounded-xl border border-[var(--erp-border)] bg-white p-4">
            {svgDataUrl ? (
              <img
                alt={`Código QR de ${product.name}`}
                className="h-72 w-72 max-w-full object-contain"
                src={svgDataUrl}
              />
            ) : (
              <p className="text-sm font-semibold text-[var(--erp-muted-foreground)]">
                Generando código QR…
              </p>
            )}
          </div>

          <div className="grid content-start gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                Producto
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--erp-foreground)]">
                {product.name}
              </p>
            </div>
            <dl className="grid gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm">
              {product.sku && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
                    SKU
                  </dt>
                  <dd className="mt-1 font-mono font-semibold text-[var(--erp-foreground)]">
                    {product.sku}
                  </dd>
                </div>
              )}
              {product.barcode && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
                    Código de barras
                  </dt>
                  <dd className="mt-1 break-all font-mono font-semibold text-[var(--erp-foreground)]">
                    {product.barcode}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--erp-muted-foreground)]">
                  Identificador del producto
                </dt>
                <dd className="mt-1 break-all font-mono text-xs font-semibold text-[var(--erp-foreground)]">
                  {product.id}
                </dd>
              </div>
            </dl>
            <p className="break-all rounded-lg bg-[var(--erp-surface-muted)] p-3 font-mono text-[11px] text-[var(--erp-muted-foreground)]">
              {payload}
            </p>
            {currentGenerationError && (
              <p className="text-sm font-semibold text-[var(--erp-danger)]" role="alert">
                {currentGenerationError}
              </p>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-5 py-4">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm font-semibold text-[var(--erp-foreground)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!currentGeneratedQr}
            onClick={downloadPng}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Descargar PNG
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm font-semibold text-[var(--erp-foreground)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!currentGeneratedQr}
            onClick={downloadSvg}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Descargar SVG
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--erp-brand-red)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--erp-brand-red-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!currentGeneratedQr}
            onClick={printLabel}
            type="button"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Imprimir etiqueta
          </button>
        </footer>
      </section>
    </div>
  );
}
