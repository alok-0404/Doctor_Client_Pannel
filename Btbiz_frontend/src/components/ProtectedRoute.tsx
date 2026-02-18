import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { authStorage } from '../utils/authStorage'

type Role = 'DOCTOR' | 'ASSISTANT' | 'LAB_ASSISTANT' | 'LAB_MANAGER'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: Role[]
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const token = authStorage.getToken()
  const role = authStorage.getRole() as Role | null

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    if (role === 'ASSISTANT') {
      return <Navigate to="/assistant" replace />
    }
    if (role === 'LAB_ASSISTANT') {
      return <Navigate to="/lab" replace />
    }
    if (role === 'LAB_MANAGER') {
      return <Navigate to="/lab-manager" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}


