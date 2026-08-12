import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AUTH_UNAUTHORIZED_EVENT,
  ApiClientError,
  type AuthUnauthorizedEvent,
} from "../../lib/api";
import * as authApi from "./authApi";
import { AuthContext, type AuthContextValue } from "./authContext";
import type {
  AuthSession,
  ChangePasswordValues,
  LoginCredentials,
} from "./types";

const DEFAULT_REFRESH_DELAY_MS = 10 * 60 * 1000;
const REFRESH_EARLY_MS = 30 * 1000;
const LEGACY_AUTH_STORAGE_KEY = "pollos.auth.session";

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message || "No se pudo completar la solicitud.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un problema inesperado.";
}

function getRefreshDelay(accessToken: string) {
  try {
    const [, encodedPayload] = accessToken.split(".");
    const normalizedPayload = encodedPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    );
    const payload = JSON.parse(atob(paddedPayload)) as {
      exp?: number;
    };

    if (payload.exp) {
      return Math.max(payload.exp * 1000 - Date.now() - REFRESH_EARLY_MS, 0);
    }
  } catch {
    // Non-JWT test tokens and malformed tokens use the conservative fallback.
  }

  return DEFAULT_REFRESH_DELAY_MS;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<"authenticated" | "checking" | "guest">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);
  const accessToken = session?.accessToken ?? null;
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<AuthSession> | null>(null);
  const hasBootstrappedRef = useRef(false);
  const user = session?.user ?? null;

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setSession(null);
    setStatus("guest");
  }, []);

  const establishSession = useCallback((nextSession: AuthSession) => {
    accessTokenRef.current = nextSession.accessToken;
    setSession(nextSession);
    setStatus("authenticated");
    setError(null);
  }, []);

  const rotateSession = useCallback(
    async (expectedAccessToken: string | null) => {
      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = authApi.refreshSession().finally(() => {
          refreshPromiseRef.current = null;
        });
      }

      const nextSession = await refreshPromiseRef.current;
      if (accessTokenRef.current !== expectedAccessToken) {
        return false;
      }

      establishSession(nextSession);
      return true;
    },
    [establishSession],
  );

  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);

    void rotateSession(null).catch(() => {
      if (accessTokenRef.current === null) clearSession();
    });
  }, [clearSession, rotateSession]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const unauthorizedEvent = event as AuthUnauthorizedEvent;
      const failedToken = accessTokenRef.current;

      if (
        unauthorizedEvent.detail.statusCode === 401 &&
        unauthorizedEvent.detail.matchesAccessToken(failedToken)
      ) {
        void rotateSession(failedToken).catch(() => {
          if (accessTokenRef.current === failedToken) clearSession();
        });
      }
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () =>
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [clearSession, rotateSession]);

  useEffect(() => {
    if (!accessToken) return;

    const timer = window.setTimeout(() => {
      void rotateSession(accessToken).catch(() => {
        if (accessTokenRef.current === accessToken) clearSession();
      });
    }, getRefreshDelay(accessToken));

    return () => window.clearTimeout(timer);
  }, [accessToken, clearSession, rotateSession]);

  const refreshUser = useCallback(async () => {
    if (!accessToken) {
      clearSession();
      return;
    }

    const requestedAccessToken = accessToken;
    const currentUser = await authApi.getCurrentUser(requestedAccessToken);
    if (accessTokenRef.current !== requestedAccessToken) return;

    setSession((currentSession) =>
      currentSession?.accessToken === requestedAccessToken
        ? { ...currentSession, user: currentUser }
        : currentSession,
    );
    setError(null);
  }, [accessToken, clearSession]);

  const handleLogin = useCallback(
    async (credentials: LoginCredentials) => {
      setError(null);
      try {
        establishSession(await authApi.login(credentials));
      } catch (caughtError) {
        clearSession();
        setError(null);
        throw caughtError;
      }
    },
    [clearSession, establishSession],
  );

  const handleLogout = useCallback(async () => {
    const token = accessToken;
    clearSession();

    if (token) {
      try {
        await authApi.logout(token);
      } catch {
        // The browser session is cleared even if the server is unavailable.
      }
    }
  }, [accessToken, clearSession]);

  const handleChangePassword = useCallback(
    async (values: ChangePasswordValues) => {
      if (!accessToken) {
        clearSession();
        throw new Error("La sesión ya no está disponible.");
      }

      setError(null);
      try {
        await authApi.changePassword(accessToken, values);
        clearSession();
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
        throw caughtError;
      }
    },
    [accessToken, clearSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      changePassword: handleChangePassword,
      error,
      isAuthenticated: Boolean(session),
      login: handleLogin,
      logout: handleLogout,
      refreshUser,
      status,
      user,
    }),
    [
      accessToken,
      error,
      handleChangePassword,
      handleLogin,
      handleLogout,
      refreshUser,
      session,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
