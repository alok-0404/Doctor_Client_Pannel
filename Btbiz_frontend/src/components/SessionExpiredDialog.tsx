import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from './ui/Button'
import { authStorage } from '../utils/authStorage'
import { patientStorage } from '../utils/patientStorage'
import { getJwtExpiryMs, sessionExpiry, type SessionKind } from '../utils/sessionExpiry'

const STAFF_ROUTE_PREFIXES = [
  '/dashboard',
  '/assistant',
  '/lab',
  '/lab-manager',
  '/medicine',
  '/super-admin',
  '/ocr',
  '/search-patients',
  '/patient/',
]
const PATIENT_ROUTE_PREFIXES = ['/patient-profile']
const EXPIRY_CHECK_INTERVAL_MS = 15_000
const PATIENT_PROFILE_CACHE_KEY = 'patient_profile_cache_v1'

function routeKind(pathname: string): SessionKind | null {
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
  if (PATIENT_ROUTE_PREFIXES.some(matches)) return 'patient'
  if (STAFF_ROUTE_PREFIXES.some(matches)) return 'staff'
  return null
}

function tokenFor(kind: SessionKind): string | null {
  return kind === 'patient' ? patientStorage.getToken() : authStorage.getToken()
}

export const SessionExpiredDialog = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expired, setExpired] = useState<{ kind: SessionKind; role: string | null } | null>(null)

  useEffect(
    () =>
      sessionExpiry.subscribe((kind) => {
        setExpired({ kind, role: kind === 'staff' ? authStorage.getRole() : null })
      }),
    [],
  )

  useEffect(() => {
    const kind = routeKind(pathname)
    if (!kind) return undefined
    const check = () => {
      const exp = getJwtExpiryMs(tokenFor(kind))
      if (exp !== null && Date.now() >= exp) sessionExpiry.notify(kind)
    }
    check()
    const id = window.setInterval(check, EXPIRY_CHECK_INTERVAL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [pathname])

  if (!expired) return null

  const handleLoginAgain = () => {
    if (expired.kind === 'patient') {
      patientStorage.clear()
      try {
        window.sessionStorage.removeItem(PATIENT_PROFILE_CACHE_KEY)
      } catch {
        // ignore cache cleanup errors
      }
    } else {
      authStorage.clear()
    }
    const target =
      expired.kind === 'patient'
        ? '/patient-login'
        : expired.role === 'SUPER_ADMIN'
          ? '/login?role=super-admin'
          : '/login'
    setExpired(null)
    sessionExpiry.reset()
    navigate(target, { replace: true })
  }

  return (
    <div className="dialog-backdrop dialog-backdrop--header dialog-backdrop--session">
      <div
        className="dialog-card dialog-card--logout"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-body"
      >
        <h2 className="dialog-title" id="session-expired-title">
          Session expired
        </h2>
        <p className="dialog-body" id="session-expired-body">
          Your session has expired. Kindly login again to continue.
        </p>
        <div className="dialog-actions">
          <Button type="button" onClick={handleLoginAgain} autoFocus>
            Login again
          </Button>
        </div>
      </div>
    </div>
  )
}
