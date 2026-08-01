import { ApiClientError } from "../../lib/api";

const operationalMessages: Record<string, string> = {
  CASH_SHIFT_ADMINISTRATIVE_PERMISSION_REQUIRED:
    "No tienes permiso para cerrar administrativamente este turno.",
  CASH_SHIFT_ADMINISTRATIVE_REASON_REQUIRED:
    "Captura el motivo del cierre administrativo.",
  CASH_SHIFT_CASHIER_MISMATCH:
    "Este turno pertenece a otro cajero. Solicita un cierre administrativo.",
  CASH_SHIFT_NOT_OPEN: "El turno ya está cerrado. Actualiza el resumen.",
  CASH_SHIFT_NOT_FOUND: "El turno ya no está disponible. Actualiza el resumen.",
  CASH_TERMINAL_DEVICE_MISMATCH:
    "La terminal no coincide con este dispositivo.",
  CASH_TERMINAL_DEVICE_REQUIRED:
    "Selecciona el turno desde su terminal o usa el cierre administrativo.",
  DAILY_CLOSE_HAS_OPEN_SHIFTS:
    "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada.",
  DAILY_CLOSE_REVALIDATION_REQUIRED:
    "El cierre cambió. Valida nuevamente antes de finalizar la jornada.",
  DAILY_CLOSE_VERSION_CONFLICT:
    "El cierre cambió mientras lo revisabas. Actualiza el resumen e inténtalo de nuevo.",
};

function payloadCode(payload: ApiClientError["payload"]) {
  if (!payload || typeof payload === "string") return undefined;
  return payload.code ?? payload.error;
}

function isErrorCode(value: string) {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

export function dailyCloseErrorCode(error: unknown) {
  if (!(error instanceof ApiClientError)) return undefined;
  const code = payloadCode(error.payload);
  if (code) return code;
  return isErrorCode(error.message) ? error.message : undefined;
}

export function dailyCloseErrorMessage(error: unknown, fallback: string) {
  const code = dailyCloseErrorCode(error);
  if (code && operationalMessages[code]) return operationalMessages[code];
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
