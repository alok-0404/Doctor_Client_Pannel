import type { FC, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { authStorage } from '../../utils/authStorage'

type StaffRole =
  | 'DOCTOR'
  | 'ASSISTANT'
  | 'PHARMACY'
  | 'LAB_ASSISTANT'
  | 'LAB_MANAGER'
  | 'SUPER_ADMIN'

interface AppNavItem {
  label: string
  path: string
  roles: StaffRole[]
}

/** Nav paths must match App.tsx routes exactly — do not add new routes here. */
const APP_NAV_ITEMS: AppNavItem[] = [
  { label: 'Doctor Dashboard', path: '/dashboard', roles: ['DOCTOR'] },
  { label: 'Search Patients', path: '/search-patients', roles: ['DOCTOR'] },
  { label: 'Handwriting OCR', path: '/ocr', roles: ['DOCTOR'] },
  { label: 'Assistant Desk', path: '/assistant', roles: ['ASSISTANT'] },
  { label: 'Pharmacy', path: '/medicine', roles: ['PHARMACY'] },
  { label: 'Lab', path: '/lab', roles: ['LAB_ASSISTANT', 'LAB_MANAGER'] },
  { label: 'Lab Assistants', path: '/lab-manager', roles: ['LAB_MANAGER'] },
  { label: 'Super Admin', path: '/super-admin', roles: ['SUPER_ADMIN'] },
  { label: 'Intelligence', path: '/super-admin/intelligence', roles: ['SUPER_ADMIN'] },
]

export interface AppLayoutProps {
  children: ReactNode
  /** Top bar — typically `<Header />`. */
  header?: ReactNode
  /** Optional breadcrumb row below the header. */
  breadcrumb?: ReactNode
  /** When true, shows role-filtered sidebar links. Defaults to false. */
  showSidebar?: boolean
  className?: string
}

function getNavItemsForRole(role: string | null): AppNavItem[] {
  if (!role) return []
  return APP_NAV_ITEMS.filter((item) => item.roles.includes(role as StaffRole))
}

function getPanelLabel(role: string | null): string {
  switch (role) {
    case 'ASSISTANT':
      return 'Assistant panel'
    case 'LAB_ASSISTANT':
      return 'Lab panel'
    case 'LAB_MANAGER':
      return 'Lab Manager panel'
    case 'PHARMACY':
      return 'Pharmacy panel'
    case 'SUPER_ADMIN':
      return 'Super Admin panel'
    case 'DOCTOR':
      return 'Doctor panel'
    default:
      return 'Staff panel'
  }
}

export const AppLayout: FC<AppLayoutProps> = ({
  children,
  header,
  breadcrumb,
  showSidebar = false,
  className = '',
}) => {
  const role = authStorage.getRole()
  const navItems = showSidebar ? getNavItemsForRole(role) : []

  const shellClass = [
    'app-shell',
    'app-layout',
    showSidebar && navItems.length > 0 ? 'app-layout--with-sidebar' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      {showSidebar && navItems.length > 0 ? (
        <aside className="app-layout-sidebar" aria-label="Staff navigation">
          <div className="app-layout-sidebar-brand">
            <span className="app-layout-sidebar-brand-mark" aria-hidden="true">
              MG
            </span>
            <span className="app-layout-sidebar-brand-text">MEDIGRAPH</span>
          </div>
          <nav className="app-layout-sidebar-nav" aria-label="Page navigation">
            <p className="app-layout-sidebar-nav-label">Menu</p>
            <ul className="app-layout-sidebar-list">
              {navItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `app-layout-sidebar-link${isActive ? ' app-layout-sidebar-link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="app-layout-sidebar-footer">
            <p className="app-layout-sidebar-footer-kicker">{getPanelLabel(role)}</p>
            <p className="app-layout-sidebar-footer-title">Btbiz Clinic Suite</p>
            <p className="app-layout-sidebar-footer-copy">Secure staff workspace</p>
          </div>
        </aside>
      ) : null}

      <div className="app-layout-body">
        {header ? <div className="app-layout-header">{header}</div> : null}
        {breadcrumb ? (
          <div className="app-layout-breadcrumb">{breadcrumb}</div>
        ) : null}
        <div className="app-layout-content">{children}</div>
      </div>
    </div>
  )
}
