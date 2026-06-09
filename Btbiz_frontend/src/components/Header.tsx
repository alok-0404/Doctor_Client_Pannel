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
          : role === 'PHARMACY'
            ? 'Pharmacy panel'
          : role === 'SUPER_ADMIN'
            ? 'Super Admin panel'
          : 'Doctor panel'

  const handleLogout = async () => {
    await authService.logout()
    authStorage.clear()
    navigate('/login')
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-left">
            <span className="app-header-brand" aria-hidden="true">
              BT
            </span>
            <div className="app-header-text">
              <p className="app-header-kicker">{panelLabel}</p>
              <h1 className="app-header-title">{clinicName}</h1>
            </div>
          </div>

          <div className="app-header-right">
            <div className="app-header-actions">
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
                  <span className="app-header-user-avatar" aria-hidden="true">
                    {doctorName.charAt(0).toUpperCase()}
                  </span>
                  <div className="app-header-user-text">
                    <p className="app-header-user-name">{doctorName}</p>
                    <p className="app-header-user-status">Logged in</p>
                  </div>
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
          </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <div
          className="dialog-backdrop dialog-backdrop--header"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-header-logout-title"
        >
          <div className="dialog-card dialog-card--logout">
            <div className="dialog-card-header">
              <span className="dialog-card-icon dialog-card-icon--logout" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                  <path
                    fill="currentColor"
                    d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
                  />
                </svg>
              </span>
              <div className="dialog-card-copy">
                <h2 id="app-header-logout-title" className="dialog-title">
                  Log out
                </h2>
                <p className="dialog-body">
                  Are you sure you want to log out?
                </p>
              </div>
            </div>
            <div className="dialog-actions dialog-actions--logout">
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
    </>
  )
}

