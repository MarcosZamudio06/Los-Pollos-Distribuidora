// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../../lib/api";
import type { AuthContextValue } from "../authContext";
import { LoginPage } from "../pages/LoginPage";
import { useAuth } from "../useAuth";

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderLogin(login: AuthContextValue["login"]) {
  mockedUseAuth.mockReturnValue({
    accessToken: null,
    changePassword: vi.fn(),
    error: null,
    isAuthenticated: false,
    login,
    logout: vi.fn(),
    refreshUser: vi.fn(),
    status: "guest",
    user: null,
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
  });

  return { container, root };
}

async function submitLogin(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) throw new Error("Login form was not rendered");

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("login rate-limit feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("keeps unknown-account failures generic without starting a cooldown", async () => {
    const login = vi.fn<AuthContextValue["login"]>();
    login.mockRejectedValue(
      new ApiClientError("User not found", 401, {
        error: "UNAUTHORIZED",
        message: "User not found",
        statusCode: 401,
      }),
    );
    const { container, root } = renderLogin(login);

    await submitLogin(container);

    const alert = container.querySelector('[role="alert"]');
    const button = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );

    expect(login).toHaveBeenCalledOnce();
    expect(alert?.textContent).toContain("Revisa tu correo y contraseña");
    expect(alert?.textContent).not.toContain("Demasiados intentos");
    expect(button?.disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it("shows a specific 429 message, honors Retry-After, and exposes the cooldown accessibly", async () => {
    const error = new ApiClientError(
      "ThrottlerException: Too Many Requests",
      429,
      {
        error: "RATE_LIMIT_EXCEEDED",
        message: "ThrottlerException: Too Many Requests",
        statusCode: 429,
      },
      3,
    );

    const login = vi.fn<AuthContextValue["login"]>();
    login.mockRejectedValue(error);
    const { container, root } = renderLogin(login);

    await submitLogin(container);

    const alert = container.querySelector('[role="alert"]');
    const status = container.querySelector('[role="status"]');
    const button = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const email = container.querySelector<HTMLInputElement>("#email");
    const password = container.querySelector<HTMLInputElement>("#password");

    expect(alert?.textContent).toContain("Demasiados intentos");
    expect(alert?.textContent).toContain("3 segundos");
    expect(alert?.textContent).not.toContain("correo y contraseña");
    expect(status?.textContent).toContain("0:03");
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain("0:03");
    expect(button?.getAttribute("aria-describedby")).toBe(
      "login-rate-limit-status",
    );
    expect(email?.getAttribute("aria-describedby")).toBe("login-error");
    expect(password?.getAttribute("aria-describedby")).toBe("login-error");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain("0:01");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toContain("Entrar al sistema");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
