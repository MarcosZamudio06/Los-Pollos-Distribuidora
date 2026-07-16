// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_UNAUTHORIZED_EVENT,
  apiClient,
  ApiClientError,
} from '../../../lib/api'
import { AuthProvider } from '../AuthProvider'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { useAuth } from '../useAuth'

const storedSession = {
  accessToken: 'expired-token',
  refreshToken: 'refresh-token',
  user: {
    email: 'admin@pollos.local',
    id: 'admin-1',
    name: 'Admin',
    role: 'ADMIN',
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function SessionControls() {
  const { login, refreshUser, user } = useAuth()

  return (
    <>
      <p>{user?.email}</p>
      <button type="button" onClick={() => void login({ email: 'new@pollos.local', password: 'password' })}>
        Start new session
      </button>
      <button type="button" onClick={() => void refreshUser()}>
        Refresh user
      </button>
    </>
  )
}

describe('auth session invalidation', () => {
  beforeEach(() => {
    window.localStorage.setItem('pollos.auth.session', JSON.stringify(storedSession))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('returns to login when an authenticated request receives 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/me')) {
        return jsonResponse({ data: { user: storedSession.user }, success: true })
      }

      return jsonResponse({ message: 'Token inválido', statusCode: 401 }, 401)
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/private']}>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<p>Login screen</p>} />
                <Route path="/private" element={<ProtectedRoute><p>Private screen</p></ProtectedRoute>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>,
        )
      })

      expect(container.textContent).toContain('Private screen')

      await act(async () => {
        await expect(apiClient.get('/protected', {
          headers: { authorization: 'Bearer expired-token' },
        })).rejects.toBeInstanceOf(ApiClientError)
      })

      expect(container.textContent).toContain('Login screen')
      expect(window.localStorage.getItem('pollos.auth.session')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('keeps a new session when a delayed 401 belongs to the previous token', async () => {
    let resolveOldRequest: ((response: Response) => void) | undefined
    const oldRequest = new Promise<Response>((resolve) => {
      resolveOldRequest = resolve
    })
    const newSession = {
      ...storedSession,
      accessToken: 'new-token',
      user: { ...storedSession.user, email: 'new@pollos.local' },
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/auth/me')) {
        return jsonResponse({ data: { user: storedSession.user }, success: true })
      }

      if (url.endsWith('/auth/login')) {
        return jsonResponse({ data: newSession, success: true })
      }

      return oldRequest
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/private']}>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<p>Login screen</p>} />
                <Route path="/private" element={<ProtectedRoute><SessionControls /></ProtectedRoute>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>,
        )
      })

      const delayedFailure = apiClient.get('/slow-request', {
        headers: { authorization: 'Bearer expired-token' },
      })
      const loginButton = container.querySelector('button')
      if (!loginButton) throw new Error('Login control not found')

      await act(async () => loginButton.click())
      expect(JSON.parse(window.localStorage.getItem('pollos.auth.session') ?? '{}').accessToken).toBe('new-token')

      await act(async () => {
        resolveOldRequest?.(jsonResponse({ message: 'Token inválido', statusCode: 401 }, 401))
        await expect(delayedFailure).rejects.toBeInstanceOf(ApiClientError)
      })

      expect(container.textContent).toContain('Start new session')
      expect(JSON.parse(window.localStorage.getItem('pollos.auth.session') ?? '{}').accessToken).toBe('new-token')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it.each([
    { responseStatus: 200, staleUserEmail: 'stale@pollos.local' },
    { responseStatus: 401, staleUserEmail: undefined },
  ])('ignores a delayed refreshUser response with status $responseStatus after a new login', async ({ responseStatus, staleUserEmail }) => {
    let authMeCalls = 0
    let resolveRefresh: ((response: Response) => void) | undefined
    const delayedRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve
    })
    const newSession = {
      ...storedSession,
      accessToken: 'new-token',
      user: { ...storedSession.user, email: 'new@pollos.local' },
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith('/auth/me')) {
        authMeCalls += 1
        const authorization = new Headers(init?.headers).get('authorization')

        if (authorization === 'Bearer new-token') {
          return jsonResponse({ data: { user: newSession.user }, success: true })
        }

        return authMeCalls === 1
          ? jsonResponse({ data: { user: storedSession.user }, success: true })
          : delayedRefresh
      }

      if (url.endsWith('/auth/login')) {
        return jsonResponse({ data: newSession, success: true })
      }

      throw new Error(`Unexpected request: ${url}`)
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/private']}>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<p>Login screen</p>} />
                <Route path="/private" element={<ProtectedRoute><SessionControls /></ProtectedRoute>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>,
        )
      })

      const buttons = Array.from(container.querySelectorAll('button'))
      const refreshButton = buttons.find((button) => button.textContent === 'Refresh user')
      const loginButton = buttons.find((button) => button.textContent === 'Start new session')
      if (!refreshButton || !loginButton) throw new Error('Session controls not found')

      await act(async () => refreshButton.click())
      await act(async () => loginButton.click())

      await act(async () => {
        resolveRefresh?.(
          responseStatus === 401
            ? jsonResponse({ message: 'Token inválido', statusCode: 401 }, 401)
            : jsonResponse({ data: { user: { ...storedSession.user, email: staleUserEmail } }, success: true }),
        )
        await Promise.resolve()
      })

      expect(container.textContent).toContain('new@pollos.local')
      expect(container.textContent).not.toContain('Login screen')
      const persisted = JSON.parse(window.localStorage.getItem('pollos.auth.session') ?? '{}')
      expect(persisted.accessToken).toBe('new-token')
      expect(persisted.user.email).toBe('new@pollos.local')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it.each([
    { headers: undefined, status: 401 },
    { headers: { authorization: 'Bearer valid-token' }, status: 403 },
  ])('does not invalidate the session for status $status without an expired bearer session', async ({ headers, status }) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Rejected' }, status)))
    const listener = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener)

    try {
      await expect(apiClient.get('/protected', { headers })).rejects.toBeInstanceOf(ApiClientError)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener)
    }
  })
})
