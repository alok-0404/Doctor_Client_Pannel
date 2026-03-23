import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'

export const GlobalBackButton = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const dashboardRoots = new Set([
    '/dashboard',
    '/assistant',
    '/lab',
    '/lab-manager',
    '/medicine',
    '/super-admin',
  ])

  const handleBack = () => {
    if (dashboardRoots.has(location.pathname)) {
      setShowLogoutConfirm(true)
      return
    }
    navigate(-1)
  }

  const handleConfirmLogout = async () => {
    try {
      await authService.logout()
    } catch {
      // ignore logout API errors; still clear local session
    } finally {
      authStorage.clear()
      setShowLogoutConfirm(false)
      navigate('/login', { replace: true })
    }
  }

  if (location.pathname === '/') return null

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 1000,
          width: 30,
          height: 30,
          borderRadius: 999,
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#0f172a',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
          <path d="M11.78 4.22a.75.75 0 0 1 0 1.06L7.06 10l4.72 4.72a.75.75 0 0 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" />
        </svg>
      </button>

      {showLogoutConfirm && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">Log out</h2>
            <p className="dialog-body">Are you sure you want to log out?</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="ui-button ui-button-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                No
              </button>
              <button
                type="button"
                className="ui-button ui-button-primary"
                onClick={() => void handleConfirmLogout()}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

