import type { PaymentMethod } from "./types";

const paymentMethodLabels: Record<string, string> = {
  CARD: "Tarjeta",
  CASH: "Efectivo",
  CHECK: "Cheque",
  DEPOSIT: "Depósito",
  OTHER: "Otro",
  TRANSFER: "Transferencia",
  VOUCHER: "Vale",
};

export function paymentMethodLabel(method?: PaymentMethod | null) {
  if (!method) return "—";
  return paymentMethodLabels[method] ?? method;
}
