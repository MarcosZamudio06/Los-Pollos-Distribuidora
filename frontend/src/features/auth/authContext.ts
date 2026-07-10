import { createContext } from 'react'
import type { AuthUser, ChangePasswordValues, LoginCredentials } from './types'

type AuthStatus = 'authenticated' | 'checking' | 'guest'

export type AuthContextValue = {
  accessToken: string | null
  changePassword: (values: ChangePasswordValues) => Promise<void>
  error: string | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  status: AuthStatus
  user: AuthUser | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
