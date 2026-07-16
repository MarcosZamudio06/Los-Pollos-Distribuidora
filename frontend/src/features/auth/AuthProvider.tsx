import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  AUTH_UNAUTHORIZED_EVENT,
  ApiClientError,
  type AuthUnauthorizedEvent,
} from '../../lib/api'
import * as authApi from './authApi'
import { AuthContext, type AuthContextValue } from './authContext'
import type { AuthSession, ChangePasswordValues, LoginCredentials } from './types'

const AUTH_STORAGE_KEY = 'pollos.auth.session'

function readStoredSession(): AuthSession | null {
  const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(rawSession) as AuthSession
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message || 'No se pudo completar la solicitud.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocurrió un problema inesperado.'
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession())
  const [status, setStatus] = useState<'authenticated' | 'checking' | 'guest'>(() =>
    readStoredSession() ? 'checking' : 'guest',
  )
  const [error, setError] = useState<string | null>(null)
  const accessToken = session?.accessToken ?? null
  const accessTokenRef = useRef(accessToken)
  const user = session?.user ?? null

  const clearSession = useCallback(() => {
    accessTokenRef.current = null
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    setSession(null)
    setStatus('guest')
  }, [])

  const persistSession = useCallback((nextSession: AuthSession) => {
    accessTokenRef.current = nextSession.accessToken
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const unauthorizedEvent = event as AuthUnauthorizedEvent

      if (
        unauthorizedEvent.detail.statusCode === 401 &&
        unauthorizedEvent.detail.matchesAccessToken(accessTokenRef.current)
      ) {
        clearSession()
      }
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [clearSession])

  const refreshUser = useCallback(async () => {
    if (!accessToken) {
      clearSession()
      return
    }

    const requestedAccessToken = accessToken

    try {
      const currentUser = await authApi.getCurrentUser(requestedAccessToken)

      if (accessTokenRef.current !== requestedAccessToken) {
        return
      }

      setSession((currentSession) => {
        if (!currentSession || currentSession.accessToken !== requestedAccessToken) {
          return currentSession
        }

        const nextSession = { ...currentSession, user: currentUser }
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
        return nextSession
      })
      setStatus('authenticated')
      setError(null)
    } catch (caughtError) {
      if (accessTokenRef.current !== requestedAccessToken) {
        return
      }

      if (
        caughtError instanceof ApiClientError &&
        caughtError.statusCode === 401
      ) {
        clearSession()
        return
      }

      throw caughtError
    }
  }, [accessToken, clearSession])

  const handleLogin = useCallback(
    async (credentials: LoginCredentials) => {
      setError(null)
      try {
        const nextSession = await authApi.login(credentials)
        persistSession(nextSession)
        setStatus('authenticated')
      } catch (caughtError) {
        clearSession()
        setError(getErrorMessage(caughtError))
        throw caughtError
      }
    },
    [clearSession, persistSession],
  )

  const handleLogout = useCallback(async () => {
    const token = accessToken
    clearSession()

    if (token) {
      try {
        await authApi.logout(token)
      } catch {
        // Local logout is authoritative for the browser session.
      }
    }
  }, [accessToken, clearSession])

  const handleChangePassword = useCallback(
    async (values: ChangePasswordValues) => {
      if (!accessToken) {
        clearSession()
        throw new Error('La sesión ya no está disponible.')
      }

      setError(null)

      try {
        const updatedUser = await authApi.changePassword(accessToken, values)
        setSession((currentSession) => {
          if (!currentSession) return currentSession

          const nextSession = { ...currentSession, user: updatedUser }
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
          return nextSession
        })
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        throw caughtError
      }
    },
    [accessToken, clearSession],
  )

  useEffect(() => {
    if (!accessToken) {
      return
    }

    let isCurrent = true
    const requestedAccessToken = accessToken

    void authApi.getCurrentUser(requestedAccessToken)
      .then((currentUser) => {
        if (!isCurrent || accessTokenRef.current !== requestedAccessToken) {
          return
        }

        setSession((currentSession) => {
          if (!currentSession || currentSession.accessToken !== requestedAccessToken) {
            return currentSession
          }

          const nextSession = { ...currentSession, user: currentUser }
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
          return nextSession
        })
        setStatus('authenticated')
        setError(null)
      })
      .catch((caughtError) => {
        if (!isCurrent || accessTokenRef.current !== requestedAccessToken) {
          return
        }

        if (
          caughtError instanceof ApiClientError &&
          caughtError.statusCode === 401
        ) {
          clearSession()
          return
        }

        setError(getErrorMessage(caughtError))
      })
      .finally(() => {
        if (!isCurrent || accessTokenRef.current !== requestedAccessToken) {
          return
        }

        setStatus((currentStatus) =>
          currentStatus === 'guest' ? 'guest' : 'authenticated',
        )
      })

    return () => {
      isCurrent = false
    }
  }, [accessToken, clearSession])

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
    [accessToken, error, handleChangePassword, handleLogin, handleLogout, refreshUser, session, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
