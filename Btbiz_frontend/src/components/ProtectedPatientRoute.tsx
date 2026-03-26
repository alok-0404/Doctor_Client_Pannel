import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { patientStorage } from '../utils/patientStorage'

interface ProtectedPatientRouteProps {
  children: ReactNode
}

export const ProtectedPatientRoute = ({ children }: ProtectedPatientRouteProps) => {
  const token = patientStorage.getToken()

  if (!token) {
    return <Navigate to="/patient-login" replace />
  }

  return <>{children}</>
}
