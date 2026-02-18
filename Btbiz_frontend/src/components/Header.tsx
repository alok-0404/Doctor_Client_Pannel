import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'

import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'

interface HeaderProps {
  clinicName?: string
  doctorName?: string
  onAddAssistantClick?: () => void
}

export const Header: FC<HeaderProps> = ({
  clinicName = 'Btbiz Clinic Suite',
  doctorName,
  onAddAssistantClick,
}) => {
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const role = authStorage.getRole()
  const panelLabel =
    role === 'ASSISTANT'
      ? 'Assistant panel'
      : role === 'LAB_ASSISTANT'
        ? 'Lab panel'
        : role === 'LAB_MANAGER'
          ? 'Lab Manager panel'
          : 'Doctor panel'

  const handleLogout = async () => {
    await authService.logout()
    authStorage.clear()
    navigate('/login')
  }

  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="app-back-button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M11.78 4.22a.75.75 0 0 1 0 1.06L7.06 10l4.72 4.72a.75.75 0 0 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </button>
        <div className="app-header-text">
          <p className="app-header-kicker">
            {panelLabel}
          </p>
          <h1 className="app-header-title">
            {clinicName}
          </h1>
        </div>
      </div>
      <div className="app-header-right">
        {onAddAssistantClick && (
          <button
            type="button"
            className="app-header-add-assistant"
            onClick={onAddAssistantClick}
          >
            Add assistant
          </button>
        )}
        {doctorName && (
          <div className="app-header-user">
            <p className="app-header-user-name">
              {doctorName}
            </p>
            <p className="app-header-user-status">
              Logged in
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="app-header-logout"
        >
          Logout
        </button>
      </div>
      {showLogoutConfirm && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">
              Log out
            </h2>
            <p className="dialog-body">
              Are you sure you want to log out?
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="ui-button ui-button-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-button ui-button-primary"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

