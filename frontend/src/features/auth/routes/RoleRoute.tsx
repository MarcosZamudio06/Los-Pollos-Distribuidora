import { Navigate } from 'react-router-dom'
import { useAuth } from '../useAuth'
import type { PropsWithChildren } from 'react'
import type { UserRole } from '../types'

type RoleRouteProps = PropsWithChildren<{
  roles: UserRole[]
}>

export function RoleRoute({ children, roles }: RoleRouteProps) {
  const { user } = useAuth()

  if (!user || !roles.includes(user.role)) {
    return <Navigate replace to="/403" />
  }

  return children
}
