import type { FC } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '../components/layout/PublicLayout'
import { FestivalCelebration } from '../components/FestivalCelebration'
import { patientStorage } from '../utils/patientStorage'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/ui/StatCard'
import {
  ClockIcon,
  DocumentIcon,
  LabIcon,
  PhoneIcon,
  PharmacyIcon,
  UserIcon,
  type IconProps,
} from '../components/ui/icons'

const SERVICES: Array<{
  title: string
  description: string
  tone: string
  Icon: FC<IconProps>
}> = [
  {
    title: 'General Consultation',
    description: 'In-clinic and follow-up visits with experienced physicians for everyday health needs.',
    tone: 'consult',
    Icon: UserIcon,
  },
  {
    title: 'Lab Tests & Reports',
    description: 'Diagnostic tests with secure digital reports patients can access after processing.',
    tone: 'lab',
    Icon: LabIcon,
  },
  {
    title: 'Pharmacy & Prescriptions',
    description: 'Medicine orders, dispensing records, and receipts managed in one connected workflow.',
    tone: 'pharmacy',
    Icon: PharmacyIcon,
  },
  {
    title: 'Patient Records',
    description: 'Unified history for visits, vitals, documents, and family profiles on one portal.',
    tone: 'records',
    Icon: DocumentIcon,
  },
]

const DOCTORS = [
  { name: 'Dr. Basant Tomar', specialty: 'General Physician', experience: '15+ years', status: 'Available' },
  { name: 'Dr. Priya Sharma', specialty: 'Internal Medicine', experience: '12+ years', status: 'Available' },
  { name: 'Dr. Arjun Mehta', specialty: 'Family Medicine', experience: '10+ years', status: 'In clinic' },
]

const TRUST_POINTS = [
  { title: 'Trusted Care', description: 'Experienced clinicians and coordinated lab, pharmacy, and front-desk workflows.' },
  { title: 'Digital Records', description: 'Secure patient profiles with prescriptions, reports, and appointment history.' },
  { title: 'Easy Booking', description: 'Online appointment booking for patients and family members in a few steps.' },
]

export const PublicHome = () => {
  const hasPortalLogin = patientStorage.hasVerifiedPortalLogin()
  const myProfileTo = hasPortalLogin ? '/patient-profile' : '/patient-login'
  const myProfileLabel = hasPortalLogin ? 'My profile' : 'Patient login'

  return (
    <PublicLayout className="public-home-landing">
        <FestivalCelebration />
        <section className="public-home-hero">
          <div className="public-home-container public-home-hero-grid">
            <div className="public-home-hero-copy">
              <span className="public-home-eyebrow">Your health, our priority</span>
              <h1 className="public-hero-title public-home-hero-title">
                Compassionate care with a modern digital clinic experience
              </h1>
              <p className="public-hero-lead public-home-hero-lead">
                Book appointments, access reports, and manage family health records — all in one trusted platform built for patients and clinic staff.
              </p>
              <div className="public-home-hero-actions">
                <Link to="/book-appointment" className="public-cta public-home-cta-primary">
                  Book appointment
                </Link>
                <Link to={myProfileTo} className="public-cta public-home-cta-secondary">
                  {myProfileLabel}
                </Link>
              </div>
            </div>

            <div className="public-home-hero-visual" aria-hidden="true">
              <Card className="public-home-hero-card public-home-lift-card" elevated interactive>
                <p className="public-home-hero-card-kicker">Clinic at a glance</p>
                <h2 className="public-home-hero-card-title">Connected patient care</h2>
                <p className="public-home-hero-card-text">
                  Doctors, lab, pharmacy, and assistants work on the same secure records — so your visit is smoother from booking to report.
                </p>
                <div className="public-home-hero-mini-stats">
                  <div className="public-home-hero-mini-stat">
                    <strong>24/7</strong>
                    <span>Record access</span>
                  </div>
                  <div className="public-home-hero-mini-stat">
                    <strong>Same day</strong>
                    <span>Lab updates</span>
                  </div>
                  <div className="public-home-hero-mini-stat">
                    <strong>Family</strong>
                    <span>Profiles</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
          <div className="public-home-container public-home-hero-info">
            <div className="public-home-hero-info-item">
              <span className="public-home-hero-info-icon" aria-hidden="true">
                <PhoneIcon size={20} />
              </span>
              <div>
                <p className="public-home-hero-info-label">Appointment line</p>
                <p className="public-home-hero-info-value">Book online anytime</p>
              </div>
            </div>
            <div className="public-home-hero-info-item">
              <span className="public-home-hero-info-icon" aria-hidden="true">
                <ClockIcon size={20} />
              </span>
              <div>
                <p className="public-home-hero-info-label">Clinic hours</p>
                <p className="public-home-hero-info-value">Mon – Sat · 10 AM – 3 PM</p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-home-stats-band" aria-label="Clinic highlights">
          <div className="public-home-container public-home-stats-grid">
            <StatCard title="Happy patients" value="10k+" trend={{ label: 'Trusted locally', direction: 'up' }} className="public-home-stat" />
            <StatCard title="Expert doctors" value="25+" trend={{ label: 'Multi-specialty', direction: 'neutral' }} className="public-home-stat" />
            <StatCard title="Years of care" value="15+" trend={{ label: 'Established practice', direction: 'up' }} className="public-home-stat" />
            <StatCard title="Digital services" value="4+" trend={{ label: 'Lab · Rx · OPD', direction: 'neutral' }} className="public-home-stat" />
          </div>
        </section>

        <section id="about" className="public-home-section">
          <div className="public-home-container public-home-about-grid">
            <div className="public-home-about-copy">
              <span className="public-home-section-eyebrow">About us</span>
              <h2 className="public-section-title public-home-section-title">Healthcare that feels personal and organised</h2>
              <p className="public-section-text public-home-section-text">
                We provide quality healthcare with experienced doctors and modern facilities. Our team is dedicated to your wellbeing — from the first appointment to lab reports and pharmacy fulfilment.
              </p>
              <ul className="public-home-checklist">
                <li>Experienced doctors and coordinated clinic staff</li>
                <li>Secure digital records for every visit</li>
                <li>Lab, pharmacy, and OPD on one platform</li>
              </ul>
            </div>
            <Card className="public-home-about-card public-home-lift-card" elevated interactive>
              <p className="public-home-about-card-label">Why patients choose us</p>
              <h3 className="public-home-about-card-title">End-to-end clinic journey</h3>
              <p className="public-home-about-card-text">
                Book online, visit the clinic, receive prescriptions and diagnostics, and revisit your history anytime from your patient profile.
              </p>
              <Link to="/book-appointment" className="public-cta public-home-cta-primary public-home-about-cta">
                Start booking
              </Link>
            </Card>
          </div>
        </section>

        <section id="services" className="public-home-section public-home-section--muted">
          <div className="public-home-container">
            <div className="public-home-section-head">
              <span className="public-home-section-eyebrow">Our services</span>
              <h2 className="public-section-title public-home-section-title">Complete care under one roof</h2>
              <p className="public-section-text public-home-section-lead">
                Everything your family needs — consultation, diagnostics, medicines, and records — connected in MEDIGRAPH.
              </p>
            </div>
            <div className="public-home-services-grid">
              {SERVICES.map((service) => (
                <Card
                  key={service.title}
                  className={`public-home-service-card public-home-lift-card public-home-service-card--${service.tone}`}
                  elevated
                  interactive
                >
                  <div className={`public-home-service-media public-home-service-media--${service.tone}`} />
                  <span className="public-home-service-icon" aria-hidden="true">
                    <service.Icon size={22} />
                  </span>
                  <div className="public-home-service-body">
                    <h3 className="public-home-service-title">{service.title}</h3>
                    <p className="public-home-service-text">{service.description}</p>
                    <Link to="/book-appointment" className="public-home-learn-more">
                      Learn more <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="public-home-section">
          <div className="public-home-container">
            <div className="public-home-section-head">
              <span className="public-home-section-eyebrow">Why MEDIGRAPH</span>
              <h2 className="public-section-title public-home-section-title">Built for patients and clinic teams</h2>
            </div>
            <div className="public-home-trust-grid">
              {TRUST_POINTS.map((point) => (
                <Card key={point.title} className="public-home-trust-card public-home-lift-card" elevated interactive>
                  <span className="public-home-trust-accent" aria-hidden="true" />
                  <h3 className="public-home-trust-title">{point.title}</h3>
                  <p className="public-home-trust-text">{point.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="doctors" className="public-home-section public-home-section--muted">
          <div className="public-home-container">
            <div className="public-home-section-head">
              <span className="public-home-section-eyebrow">Our doctors</span>
              <h2 className="public-section-title public-home-section-title">Meet our medical professionals</h2>
              <p className="public-section-text public-home-section-lead">
                Experienced physicians focused on clear communication and consistent follow-up care.
              </p>
            </div>
            <div className="public-home-doctors-grid">
              {DOCTORS.map((doctor) => (
                <Card key={doctor.name} className="public-home-doctor-card public-home-lift-card" elevated interactive>
                  <div className="public-home-doctor-media">
                    <span className="public-home-doctor-badge">{doctor.status}</span>
                    <div className="public-home-doctor-avatar" aria-hidden="true">
                      {doctor.name.replace(/^Dr\.\s*/, '').charAt(0)}
                    </div>
                  </div>
                  <div className="public-home-doctor-body">
                    <h3 className="public-home-doctor-name">{doctor.name}</h3>
                    <p className="public-home-doctor-specialty">{doctor.specialty}</p>
                    <p className="public-home-doctor-exp">{doctor.experience} experience</p>
                    <div className="public-home-doctor-actions">
                      <Link to="/book-appointment" className="public-home-doctor-btn public-home-doctor-btn--ghost">
                        View profile
                      </Link>
                      <Link to="/book-appointment" className="public-home-doctor-btn public-home-doctor-btn--primary">
                        Book appointment
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="public-home-cta-band">
          <div className="public-home-container public-home-cta-band-inner">
            <div>
              <h2 className="public-home-cta-band-title">Ready to book your visit?</h2>
              <p className="public-home-cta-band-text">
                Choose a family member, pick a date, and confirm — online booking takes only a few minutes.
              </p>
            </div>
            <Link to="/book-appointment" className="public-cta public-home-cta-primary public-home-cta-band-btn">
              Book appointment
            </Link>
          </div>
        </section>

        <section id="contact" className="public-home-section">
          <div className="public-home-container public-home-contact-grid">
            <div>
              <span className="public-home-section-eyebrow">Contact us</span>
              <h2 className="public-section-title public-home-section-title">We&apos;re here to help</h2>
              <p className="public-section-text public-home-section-text">
                Reach out for appointments and enquiries. For the fastest response, use online booking or your patient profile.
              </p>
            </div>
            <div className="public-home-contact-cards">
              <Card className="public-home-contact-card public-home-lift-card" elevated interactive>
                <p className="public-home-contact-label">Appointments</p>
                <p className="public-home-contact-value">Mon – Sat · 10 AM – 3 PM</p>
              </Card>
              <Card className="public-home-contact-card public-home-lift-card" elevated interactive>
                <p className="public-home-contact-label">Online booking</p>
                <Link to="/book-appointment" className="public-home-contact-link">
                  Go to book appointment →
                </Link>
              </Card>
              <Card className="public-home-contact-card public-home-lift-card" elevated interactive>
                <p className="public-home-contact-label">Patient portal</p>
                <Link to={myProfileTo} className="public-home-contact-link">
                  {hasPortalLogin ? 'Open my profile →' : 'Patient login →'}
                </Link>
              </Card>
            </div>
          </div>
        </section>
    </PublicLayout>
  )
}
