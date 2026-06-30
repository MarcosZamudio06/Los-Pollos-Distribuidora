import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../useAuth'

export function LogoutPage() {
  const { logout } = useAuth()

  useEffect(() => {
    void logout()
  }, [logout])

  return <Navigate replace to="/login" />
}
