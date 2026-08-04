import type { FC, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { MenuIcon } from '../ui/icons'
import { patientStorage } from '../../utils/patientStorage'

/** MediGraph WhatsApp bot — opens chat on click */
const WHATSAPP_BOT_E164 = '919625887227'
const WHATSAPP_BOT_URL = `https://wa.me/${WHATSAPP_BOT_E164}`

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

      <a
        className="public-whatsapp-fab"
        href={WHATSAPP_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with MediGraph on WhatsApp"
        title="Chat on WhatsApp"
      >
        <svg
          className="public-whatsapp-fab-icon"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"
          />
        </svg>
      </a>
    </div>
  )
}
