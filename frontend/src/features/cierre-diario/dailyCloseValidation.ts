import type { DailyCloseValidationResult } from "./types";

type ValidationItem = { code: string; message: string };

const differenceLabel: Record<string, string> = {
  CASH_DIFFERENCE: "Diferencia de efectivo",
  SCALE_DIFFERENCE: "Diferencia de báscula",
  SHORTAGE: "Faltante de inventario",
  SURPLUS: "Sobrante de inventario",
};

export function validationDifferences(
  result: DailyCloseValidationResult,
): ValidationItem[] {
  const differences = result.differences.map((difference) => {
    const unresolved =
      difference.status !== undefined
        ? difference.status !== "AUTHORIZED"
        : result.errors.some(
            (error) =>
              error.code === "DAILY_CLOSE_DIFFERENCE_UNRESOLVED" &&
              (error.referenceKey === difference.referenceKey ||
                error.referenceKey === difference.code),
          );
    const resolutionSuffix = unresolved
      ? " · Requiere justificación y autorización"
      : "";
    return {
      code: difference.code,
      message:
        difference.expectedValue === undefined
          ? `${differenceLabel[difference.code] ?? difference.code}: ${difference.value.toFixed(3)} ${difference.unit}${resolutionSuffix}`
          : `${differenceLabel[difference.code] ?? difference.code}: esperado ${difference.expectedValue.toFixed(3)} ${difference.unit}, registrado ${difference.recordedValue === null || difference.recordedValue === undefined ? "pendiente" : `${difference.recordedValue.toFixed(3)} ${difference.unit}`}, diferencia ${difference.value.toFixed(3)} ${difference.unit} (${difference.differenceType === "SURPLUS" ? "sobrante" : "faltante"})${resolutionSuffix}.`,
    };
  });
  if (Number(result.close.totalShortageKg) !== 0)
    differences.push({
      code: "SHORTAGE",
      message: `Faltante de inventario: ${Number(result.close.totalShortageKg).toFixed(3)} kg`,
    });
  if (Number(result.close.totalSurplusKg) !== 0)
    differences.push({
      code: "SURPLUS",
      message: `Sobrante de inventario: ${Number(result.close.totalSurplusKg).toFixed(3)} kg`,
    });
  return differences;
}

export function validationWarnings(
  close: DailyCloseValidationResult["close"],
  canViewProfit = true,
): ValidationItem[] {
  return [
    ...(canViewProfit && close.costQuality === "ESTIMATED"
      ? [
          {
            code: "ESTIMATED_COST",
            message: "El costo del producto es estimado.",
          },
        ]
      : []),
    ...(close.sales ?? [])
      .filter((sale) => !sale.physicalFolio?.trim())
      .map((sale) => ({
        code: `MISSING_FOLIO_${sale.saleNumber}`,
        message: `La venta ${sale.saleNumber} no tiene folio físico.`,
      })),
    ...(close.scaleTicketReferences ?? [])
      .filter(
        (ticket) =>
          (ticket.weightKg === null ||
            ticket.weightKg === undefined ||
            ticket.weightKg === "") &&
          (ticket.pieceCount === null || ticket.pieceCount === undefined),
      )
      .map((ticket) => ({
        code: `INCOMPLETE_SCALE_REFERENCE_${ticket.id}`,
        message: `La referencia de báscula ${ticket.physicalFolio} no tiene kilos ni piezas.`,
      })),
  ];
}
