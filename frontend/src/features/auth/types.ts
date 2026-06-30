export type UserRole = 'ADMIN' | 'USER' | string

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  mustChangePassword?: boolean
}

export type LoginCredentials = {
  email: string
  password: string
}

export type LoginResult = {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export type ApiEnvelope<T> = {
  success: boolean
  message: string
  data: T
}

export type AuthSession = LoginResult
