import { Link } from 'react-router-dom'

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '#about' },
  { label: 'Services', to: '#services' },
  { label: 'Doctors', to: '#doctors' },
  { label: 'Contact', to: '#contact' },
  { label: 'Book Appointment', to: '/book-appointment' },
]
// Staff Login intentionally not linked here - only staff get /login URL privately

export const PublicHome = () => {
  return (
    <div className="public-home">
      {/* Header + Navbar */}
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo">
            MEDIGRAPH
          </Link>
          <nav className="public-nav" aria-label="Main">
            {navLinks.map((item) => (
              <Link key={item.to} to={item.to} className="public-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="public-main">
        <section className="public-hero">
          <h1 className="public-hero-title">Welcome to MEDIGRAPH</h1>
          <p className="public-hero-lead">
            Your health, our priority. Book appointments, meet our doctors, and get the care you deserve.
          </p>
          <Link to="/book-appointment" className="public-cta">
            Book Appointment
          </Link>
        </section>

        <section id="about" className="public-section">
          <h2 className="public-section-title">About Us</h2>
          <p className="public-section-text">
            We provide quality healthcare with experienced doctors and modern facilities. Our team is dedicated to your wellbeing.
          </p>
        </section>

        <section id="services" className="public-section">
          <h2 className="public-section-title">Our Services</h2>
          <ul className="public-list">
            <li>General consultation</li>
            <li>Lab tests & reports</li>
            <li>Prescriptions & follow-ups</li>
            <li>Patient records & history</li>
          </ul>
        </section>

        <section id="doctors" className="public-section">
          <h2 className="public-section-title">Our Doctors</h2>
          <p className="public-section-text">
            Experienced medical professionals for your care. Login as staff to manage patients and appointments.
          </p>
        </section>

        <section id="contact" className="public-section">
          <h2 className="public-section-title">Contact Us</h2>
          <p className="public-section-text">
            Reach out for appointments and enquiries. Use &quot;Book Appointment&quot; for online booking.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-links">
            <Link to="/">Home</Link>
            <Link to="/#about">About</Link>
            <Link to="/#services">Services</Link>
            <Link to="/book-appointment">Book Appointment</Link>
          </div>
          <p className="public-footer-copy">
            © {new Date().getFullYear()} MEDIGRAPH. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        .public-home {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          color: #0f172a;
        }
        .public-header {
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .public-header-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .public-logo {
          font-size: 1.35rem;
          font-weight: 700;
          color: #0f172a;
          text-decoration: none;
          letter-spacing: 0.02em;
        }
        .public-logo:hover {
          color: #1e40af;
        }
        .public-nav {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .public-nav-link {
          padding: 8px 12px;
          color: #475569;
          text-decoration: none;
          font-size: 0.95rem;
          border-radius: 8px;
          transition: color 0.15s, background 0.15s;
        }
        .public-nav-link:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
        .public-main {
          flex: 1;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px 60px;
          width: 100%;
        }
        .public-hero {
          text-align: center;
          padding: 48px 24px 56px;
          background: linear-gradient(135deg, #e0e7ff 0%, #f0f9ff 100%);
          border-radius: 16px;
          margin-bottom: 48px;
        }
        .public-hero-title {
          font-size: 2rem;
          font-weight: 700;
          margin: 0 0 12px;
          color: #0f172a;
        }
        .public-hero-lead {
          font-size: 1.1rem;
          color: #475569;
          margin: 0 0 24px;
          line-height: 1.6;
        }
        .public-cta {
          display: inline-block;
          padding: 12px 24px;
          background: #1e40af;
          color: #fff;
          text-decoration: none;
          font-weight: 600;
          border-radius: 10px;
          transition: background 0.15s;
        }
        .public-cta:hover {
          background: #1e3a8a;
        }
        .public-section {
          margin-bottom: 40px;
          padding: 24px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .public-section:last-of-type {
          border-bottom: none;
        }
        .public-section-title {
          font-size: 1.35rem;
          font-weight: 600;
          margin: 0 0 12px;
          color: #0f172a;
        }
        .public-section-text {
          font-size: 1rem;
          color: #475569;
          margin: 0;
          line-height: 1.6;
        }
        .public-list {
          margin: 0;
          padding-left: 20px;
          color: #475569;
          line-height: 1.8;
        }
        .public-footer {
          margin-top: auto;
          background: #0f172a;
          color: #94a3b8;
          padding: 28px 20px;
        }
        .public-footer-inner {
          max-width: 1100px;
          margin: 0 auto;
          text-align: center;
        }
        .public-footer-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px 24px;
          margin-bottom: 16px;
        }
        .public-footer-links a {
          color: #cbd5e1;
          text-decoration: none;
          font-size: 0.95rem;
        }
        .public-footer-links a:hover {
          color: #fff;
        }
        .public-footer-copy {
          font-size: 0.875rem;
          margin: 0;
          color: #64748b;
        }
      `}</style>
    </div>
  )
}
