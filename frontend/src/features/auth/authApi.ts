import { apiClient } from '../../lib/api'
import type { ApiEnvelope, AuthUser, ChangePasswordValues, LoginCredentials, LoginResult } from './types'

export async function login(credentials: LoginCredentials) {
  const response = await apiClient.post<ApiEnvelope<LoginResult>, LoginCredentials>(
    '/auth/login',
    { body: credentials },
  )

  return response.data
}

export async function logout(accessToken: string) {
  await apiClient.post<ApiEnvelope<{ success: true }>>('/auth/logout', {
    headers: { authorization: `Bearer ${accessToken}` },
  })
}

export async function getCurrentUser(accessToken: string) {
  const response = await apiClient.get<ApiEnvelope<{ user: AuthUser }>>('/auth/me', {
    headers: { authorization: `Bearer ${accessToken}` },
  })

  return response.data.user
}

export async function changePassword(accessToken: string, values: ChangePasswordValues) {
  const response = await apiClient.post<ApiEnvelope<AuthUser>, ChangePasswordValues>(
    '/auth/change-password',
    {
      body: values,
      headers: { authorization: `Bearer ${accessToken}` },
    },
  )

  return response.data
}
