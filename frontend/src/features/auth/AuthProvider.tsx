import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { ApiClientError } from '../../lib/api'
import * as authApi from './authApi'
import { AuthContext, type AuthContextValue } from './authContext'
import type { AuthSession, LoginCredentials } from './types'

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
  const user = session?.user ?? null

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    setSession(null)
    setStatus('guest')
  }, [])

  const persistSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
    setStatus('authenticated')
  }, [])

  const refreshUser = useCallback(async () => {
    if (!accessToken) {
      clearSession()
      return
    }

    try {
      const currentUser = await authApi.getCurrentUser(accessToken)
      setSession((currentSession) => {
        if (!currentSession) {
          return currentSession
        }

        const nextSession = { ...currentSession, user: currentUser }
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
        return nextSession
      })
      setStatus('authenticated')
      setError(null)
    } catch (caughtError) {
      if (
        caughtError instanceof ApiClientError &&
        [401, 403].includes(caughtError.statusCode)
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

  useEffect(() => {
    if (!accessToken) {
      return
    }

    let isCurrent = true

    void authApi.getCurrentUser(accessToken)
      .then((currentUser) => {
        if (!isCurrent) {
          return
        }

        setSession((currentSession) => {
          if (!currentSession) {
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
        if (!isCurrent) {
          return
        }

        if (
          caughtError instanceof ApiClientError &&
          [401, 403].includes(caughtError.statusCode)
        ) {
          window.localStorage.removeItem(AUTH_STORAGE_KEY)
          setSession(null)
          setStatus('guest')
          return
        }

        setError(getErrorMessage(caughtError))
      })
      .finally(() => {
        if (!isCurrent) {
          return
        }

        setStatus((currentStatus) =>
          currentStatus === 'guest' ? 'guest' : 'authenticated',
        )
      })

    return () => {
      isCurrent = false
    }
  }, [accessToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      error,
      isAuthenticated: Boolean(session),
      login: handleLogin,
      logout: handleLogout,
      refreshUser,
      status,
      user,
    }),
    [accessToken, error, handleLogin, handleLogout, refreshUser, session, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
