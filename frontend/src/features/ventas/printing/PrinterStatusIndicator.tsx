import { Printer } from "lucide-react";
import { PosPrinterStatus, posPrinterStatusLabel } from "./posPrinter";
import type { PosPrinterStatus as PosPrinterStatusType } from "./posPrinter";

export function PrinterStatusIndicator({
  status,
}: {
  status: PosPrinterStatusType;
}) {
  const label = posPrinterStatusLabel(status);
  const tone =
    status === PosPrinterStatus.AVAILABLE
      ? "text-[var(--pos-green)]"
      : status === PosPrinterStatus.OFFLINE
        ? "text-[var(--pos-red)]"
        : "text-[var(--pos-muted)]";

  return (
    <span
      aria-label={`Estado de impresora: ${label}`}
      className={`ml-3 inline-flex items-center gap-1.5 font-bold ${tone}`}
      role="status"
    >
      <Printer aria-hidden="true" className="h-4 w-4" />
      <span className="hidden lg:inline">{label}</span>
    </span>
  );
}
