import type { FC, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { MenuIcon } from '../ui/icons'
import { patientStorage } from '../../utils/patientStorage'

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '#about' },
  { label: 'Services', to: '#services' },
  { label: 'Doctors', to: '#doctors' },
  { label: 'Contact', to: '#contact' },
  { label: 'Book appointment', to: '/book-appointment' },
]

export interface PublicLayoutProps {
  children: ReactNode
  /** Optional wrapper class, e.g. `public-home-landing` or `book-appointment-page`. */
  className?: string
}

export const PublicLayout: FC<PublicLayoutProps> = ({ children, className = '' }) => {
  const hasPortalLogin = patientStorage.hasVerifiedPortalLogin()
  const myProfileTo = hasPortalLogin ? '/patient-profile' : '/patient-login'
  const myProfileLabel = hasPortalLogin ? 'My profile' : 'Patient login'

  const shellClass = ['public-layout', 'public-home', className].filter(Boolean).join(' ')

  return (
    <div className={shellClass}>
      <header className="public-header public-home-header">
        <div className="public-header-inner public-home-header-inner">
          <Link to="/" className="public-logo public-home-logo">
            <span className="public-home-logo-mark" aria-hidden="true">MG</span>
            <span>MEDIGRAPH</span>
          </Link>

          <details className="public-home-nav-drawer">
            <summary className="public-home-nav-toggle" aria-label="Open menu">
              <span className="public-home-nav-toggle-icon" aria-hidden="true">
                <MenuIcon size={22} />
              </span>
            </summary>
            <div className="public-home-nav-panel">
              <nav className="public-nav public-home-nav" aria-label="Main">
                {navLinks.map((item) => (
                  <Link key={item.to} to={item.to} className="public-nav-link">
                    {item.label}
                  </Link>
                ))}
                <Link to={myProfileTo} className="public-nav-link">
                  {myProfileLabel}
                </Link>
              </nav>
              <Link to="/book-appointment" className="public-cta public-home-nav-cta public-home-nav-cta--drawer">
                Appointment
              </Link>
              <Link to="/portal" className="public-nav-staff public-home-staff-btn">
                For staff only
              </Link>
            </div>
          </details>

          <div className="public-header-right public-home-header-desktop">
            <nav className="public-nav public-home-nav" aria-label="Main">
              {navLinks.map((item) => (
                <Link key={item.to} to={item.to} className="public-nav-link">
                  {item.label}
                </Link>
              ))}
              <Link to={myProfileTo} className="public-nav-link">
                {myProfileLabel}
              </Link>
            </nav>
            <Link to="/book-appointment" className="public-cta public-home-nav-cta">
              Appointment
            </Link>
            <Link to="/portal" className="public-nav-staff public-home-staff-btn">
              For staff only
            </Link>
          </div>
        </div>
      </header>

      <main className="public-main public-layout-main">{children}</main>

      <footer className="public-footer public-home-footer">
        <div className="public-footer-inner public-home-footer-inner">
          <div className="public-home-footer-brand">
            <span className="public-home-logo-mark" aria-hidden="true">MG</span>
            <div>
              <p className="public-home-footer-name">MEDIGRAPH</p>
              <p className="public-home-footer-tagline">Digital healthcare for modern clinics</p>
            </div>
          </div>
          <div className="public-footer-links public-home-footer-links">
            <Link to="/">Home</Link>
            <Link to="/#about">About</Link>
            <Link to="/#services">Services</Link>
            <Link to="/book-appointment">Book appointment</Link>
            <Link to={myProfileTo}>{myProfileLabel}</Link>
            <Link to="/portal">Staff portal</Link>
          </div>
          <p className="public-footer-copy">
            © {new Date().getFullYear()} MEDIGRAPH. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
