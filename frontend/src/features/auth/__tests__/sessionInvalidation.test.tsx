// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiClientError } from '../../../lib/api'
import { AuthProvider } from '../AuthProvider'
import { ProtectedRoute } from '../routes/ProtectedRoute'

const user = {
  email: 'admin@pollos.local',
  id: 'admin-1',
  name: 'Admin',
  role: 'ADMIN',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

async function renderProtected() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Login screen</p>} />
            <Route
              path="/private"
              element={<ProtectedRoute><p>Private screen</p></ProtectedRoute>}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('auth session storage and rotation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    document.body.replaceChildren()
  })

  it('rehydrates from the HttpOnly cookie and removes legacy localStorage tokens', async () => {
    window.localStorage.setItem(
      'pollos.auth.session',
      JSON.stringify({ accessToken: 'stolen-access', refreshToken: 'stolen-refresh' }),
    )
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe('include')
      return jsonResponse({
        data: { accessToken: 'memory-only-token', user },
        success: true,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, root } = await renderProtected()

    expect(container.textContent).toContain('Private screen')
    expect(window.localStorage.getItem('pollos.auth.session')).toBeNull()
    expect(JSON.stringify(window.localStorage)).not.toContain('memory-only-token')
    await act(async () => root.unmount())
  })

  it('returns to login when the refresh cookie is missing or revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'Invalid token' }, 401)),
    )

    const { container, root } = await renderProtected()

    expect(container.textContent).toContain('Login screen')
    expect(window.localStorage.length).toBe(0)
    await act(async () => root.unmount())
  })

  it('serializes concurrent refresh attempts after access-token failures', async () => {
    let refreshCalls = 0
    let resolveRotation: ((response: Response) => void) | undefined
    const pendingRotation = new Promise<Response>((resolve) => {
      resolveRotation = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          refreshCalls += 1
          return refreshCalls === 1
            ? jsonResponse({ data: { accessToken: 'access-1', user }, success: true })
            : pendingRotation
        }
        return jsonResponse({ message: 'Expired token' }, 401)
      }),
    )
    const { root } = await renderProtected()

    let failures: PromiseSettledResult<unknown>[] = []
    await act(async () => {
      const requests = [
        apiClient.get('/protected', {
          headers: { authorization: 'Bearer access-1' },
        }),
        apiClient.get('/protected', {
          headers: { authorization: 'Bearer access-1' },
        }),
      ]
      failures = await Promise.allSettled(requests)
      await Promise.resolve()
    })

    expect(failures.every((failure) =>
      failure.status === 'rejected' && failure.reason instanceof ApiClientError,
    )).toBe(true)
    expect(refreshCalls).toBe(2)

    await act(async () => {
      resolveRotation?.(
        jsonResponse({ data: { accessToken: 'access-2', user }, success: true }),
      )
      await pendingRotation
    })
    expect(refreshCalls).toBe(2)
    await act(async () => root.unmount())
  })
})
