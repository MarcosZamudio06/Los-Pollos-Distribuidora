import { ApiClientError } from "../../lib/api";

export const DEFAULT_LOGIN_COOLDOWN_SECONDS = 30;

type LoginErrorPresentation = {
  kind: "credentials" | "rate-limited";
  message: string;
  cooldownSeconds: number;
};

function formatCooldown(seconds: number) {
  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? "segundo" : "segundos"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

export function formatCooldownTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getLoginErrorPresentation(
  error: unknown,
): LoginErrorPresentation {
  if (error instanceof ApiClientError && error.statusCode === 429) {
    const cooldownSeconds =
      error.retryAfterSeconds ?? DEFAULT_LOGIN_COOLDOWN_SECONDS;

    return {
      cooldownSeconds,
      kind: "rate-limited",
      message: `Demasiados intentos de inicio de sesión. Espera ${formatCooldown(cooldownSeconds)} antes de volver a intentarlo.`,
    };
  }

  return {
    cooldownSeconds: 0,
    kind: "credentials",
    message:
      "Revisa tu correo y contraseña. Si el usuario está inactivo, pide reactivación a un ADMIN.",
  };
}
