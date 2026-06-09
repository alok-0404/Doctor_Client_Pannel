import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'

type LandingRole = {
  title: string
  description: string
  path: string
  cta: string
  registerPath: string | null
  registerHint?: string
}

const socialLinks = [
  { name: 'Facebook', href: 'https://facebook.com', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  { name: 'Instagram', href: 'https://instagram.com', icon: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.14 2.811 1.025 2.811 2.865v6.319c0 1.84-.967 2.81-2.81 2.81H2.81C.967 14.219 0 13.25 0 11.41V5.091C0 3.25.967 2.282 2.81 2.282h6.319c.537 0 1.021.005 1.507.022V2.163zM12 0C8.741 0 8.333.014 7.053.072 2.695.272 2.258.667 2.258 2.157v6.686c0 1.49.764 2.258 2.258 2.258h6.686c1.494 0 2.258-.768 2.258-2.258V2.157C18.258.668 17.837.272 13.947.072 12.667.014 12.259 0 12 0zm0 5.838a3.162 3.162 0 100 6.324 3.162 3.162 0 000-6.324zM12 9a3 3 0 110 6 3 3 0 010-6zm4.5 1.5a.75.75 0 110 1.5.75.75 0 010-1.5z' },
  { name: 'LinkedIn', href: 'https://linkedin.com', icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
  { name: 'Twitter', href: 'https://twitter.com', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
]

const roles: LandingRole[] = [
  {
    title: 'Doctor',
    description: 'Manage patients, prescriptions and view diagnostic reports.',
    path: '/login',
    cta: 'Login as doctor',
    registerPath: '/register',
    registerHint: 'Self-registration requires Super Admin approval before account activation.',
  },
  {
    title: 'Lab Manager',
    description:
      'Run your lab: patient search, tests, and orders.',
    path: '/login',
    cta: 'Login as lab manager',
    registerPath: '/register-lab-manager',
  },
  { title: 'Assistant / Lab', description: 'Check-in patients, upload documents, or record lab tests.', path: '/login', cta: 'Login as assistant / lab', registerPath: null },
  {
    title: 'Pharmacy',
    description:
      'Dispense medicines, search patients by mobile, and manage orders.',
    path: '/login',
    cta: 'Login as medicine',
    registerPath: '/register-medicine',
  },
  { title: 'Super Admin', description: 'Platform-level dashboard for users and system overview.', path: '/login?role=super-admin', cta: 'Login as super admin', registerPath: null },
]

export const Landing = () => {
  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-brand">
          <span className="login-logo-pill">MEDIGRAPH</span>
        </div>

        <PageHeader
          className="landing-page-header"
          title="Welcome"
          subtitle="A simple clinical workspace for doctors, lab managers and assistants. Manage patients, visits, prescriptions and diagnostic tests in one place."
        />

        <section className="landing-roles" aria-label="App roles">
          <p className="landing-roles-intro">Choose your role and sign in:</p>
          <div className="landing-role-cards">
            {roles.map((r) => (
              <Card key={r.title} className="landing-role-card" interactive>
                <h2 className="landing-role-title">{r.title}</h2>
                <p className="landing-role-desc">{r.description}</p>
                <div className="landing-role-actions">
                  <Link to={r.path} className="ui-button ui-button-primary ui-button--full-width">
                    {r.cta}
                  </Link>
                  {r.registerPath && (
                    <>
                      <Link to={r.registerPath} className="landing-register-link">
                        Register (self-signup)
                      </Link>
                      {r.registerHint && (
                        <p className="landing-role-register-hint">{r.registerHint}</p>
                      )}
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <footer className="landing-footer">
        <div className="landing-social">
          {socialLinks.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-social-icon"
              aria-label={s.name}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                <path d={s.icon} />
              </svg>
            </a>
          ))}
        </div>
        <p className="landing-copy">
          © {new Date().getFullYear()} MEDIGRAPH. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
