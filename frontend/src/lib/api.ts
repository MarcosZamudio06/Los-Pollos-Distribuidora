export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export type ApiErrorPayload = {
  code?: string
  error?: string
  message?: string
  statusCode?: number
  success?: false
}

export class ApiClientError extends Error {
  readonly statusCode: number
  readonly payload: ApiErrorPayload | string | null

  constructor(
    message: string,
    statusCode: number,
    payload: ApiErrorPayload | string | null,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

export const AUTH_UNAUTHORIZED_EVENT = 'pollos:auth-unauthorized' as const

export type AuthUnauthorizedEvent = CustomEvent<{
  matchesAccessToken: (accessToken: string | null) => boolean
  statusCode: 401
}>

type RequestOptions<TBody> = {
  body?: TBody
  headers?: HeadersInit
  method?: HttpMethod
  signal?: AbortSignal
}

function getDefaultApiBaseUrl() {
  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL
  )?.trim()

  return baseUrl && baseUrl.length > 0 ? baseUrl : '/api'
}

function isJsonSerializableBody(body: unknown) {
  return (
    body !== undefined &&
    body !== null &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)
  )
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  return (await response.text()) as T
}

export function createApiClient(baseUrl = getDefaultApiBaseUrl()) {
  async function request<TResponse, TBody = unknown>(
    path: string,
    options: RequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const { body, headers, method = 'GET', signal } = options
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const requestHeaders = new Headers(headers)
    const init: RequestInit = {
      method,
      headers: requestHeaders,
      signal,
    }

    if (isJsonSerializableBody(body)) {
      requestHeaders.set('content-type', 'application/json')
      init.body = JSON.stringify(body)
    } else if (body !== undefined) {
      init.body = body as BodyInit
    }

    const response = await fetch(`${baseUrl}${normalizedPath}`, init)

    if (!response.ok) {
      let errorPayload: ApiErrorPayload | string | null

      try {
        errorPayload = await parseResponseBody<ApiErrorPayload | string>(response)
      } catch {
        errorPayload = null
      }

      const message =
        typeof errorPayload === 'string'
          ? errorPayload
          : errorPayload?.message ?? response.statusText

      const authorization = requestHeaders.get('authorization')

      if (
        response.status === 401 &&
        authorization !== null &&
        /^Bearer\s+\S+/i.test(authorization)
      ) {
        const failedAccessToken = authorization.replace(/^Bearer\s+/i, '')

        window.dispatchEvent(
          new CustomEvent(AUTH_UNAUTHORIZED_EVENT, {
            detail: {
              matchesAccessToken: (accessToken) => accessToken === failedAccessToken,
              statusCode: 401,
            },
          }) satisfies AuthUnauthorizedEvent,
        )
      }

      throw new ApiClientError(message, response.status, errorPayload)
    }

    return parseResponseBody<TResponse>(response)
  }

  return {
    delete: <TResponse>(path: string, options?: Omit<RequestOptions<never>, 'method'>) =>
      request<TResponse>(path, { ...options, method: 'DELETE' }),
    get: <TResponse>(path: string, options?: Omit<RequestOptions<never>, 'method' | 'body'>) =>
      request<TResponse>(path, { ...options, method: 'GET' }),
    patch: <TResponse, TBody = unknown>(
      path: string,
      options?: Omit<RequestOptions<TBody>, 'method'>,
    ) => request<TResponse, TBody>(path, { ...options, method: 'PATCH' }),
    post: <TResponse, TBody = unknown>(
      path: string,
      options?: Omit<RequestOptions<TBody>, 'method'>,
    ) => request<TResponse, TBody>(path, { ...options, method: 'POST' }),
    put: <TResponse, TBody = unknown>(
      path: string,
      options?: Omit<RequestOptions<TBody>, 'method'>,
    ) => request<TResponse, TBody>(path, { ...options, method: 'PUT' }),
    request,
  }
}

export const apiClient = createApiClient()
