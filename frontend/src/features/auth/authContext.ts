import { createContext } from 'react'
import type { AuthUser, LoginCredentials } from './types'

type AuthStatus = 'authenticated' | 'checking' | 'guest'

export type AuthContextValue = {
  accessToken: string | null
  error: string | null
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  status: AuthStatus
  user: AuthUser | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
