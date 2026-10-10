import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '../components/layout/PublicLayout'
import { PageHeader } from '../components/ui/PageHeader'

const ROLE_USPS: Array<{
  role: string
  title: string
  kicker: string
  tagline: string
  tone: string
  image: string
  points: string[]
  note?: string
}> = [
  {
    role: 'Patient',
    title: 'Family profiles & booking',
    kicker: 'What you get',
    tagline: 'Book, switch members, and keep last tests, bills and reports in one place.',
    tone: 'patient',
    image: '/images/how-it-works/patient.jpg',
    points: [
      'Book an appointment from the website or WhatsApp (type hi)',
      'One mobile number for the whole family — switch member and book',
      'Full profile: visits, prescriptions, and uploaded documents',
      'Last lab test / report and last bill / receipt in one place',
      'Request lab tests (home collection or lab visit)',
      'Order medicines (pickup or home delivery)',
      'Live status when a report or medicine order is ready',
    ],
  },
  {
    role: 'Doctor',
    title: 'Live dashboard & alerts',
    kicker: 'What you can do',
    tagline: 'Blue alerts, number search, and today’s list on one screen.',
    tone: 'doctor',
    image: '/images/how-it-works/doctor.jpg',
    points: [
      'New booking appears live on the dashboard — blue notification, no refresh',
      'Search any patient anytime by mobile number (your clinic only)',
      'Today’s appointments and upcoming list in one screen',
      'Separate daily limits for online vs walk-in',
      'Mark Available / Busy / Unavailable with reason and duration',
      'Add assistants and keep the desk on the same record',
      'Prescription OCR for faster consult notes',
    ],
    note: 'Live alert when a new patient is booked',
  },
  {
    role: 'Assistant',
    title: 'Front desk & check-in',
    kicker: 'Front desk',
    tagline: 'Check-in, vitals, distance, and document release before files go out.',
    tone: 'assistant',
    image: '/images/how-it-works/assistant.jpg',
    points: [
      'Register walk-in patients into the same flow',
      'Check-in + vitals before the doctor sees the patient',
      'See how far the arriving patient is (distance on the desk)',
      'Verify every document first, then release it',
      'Update doctor status and message that day’s patients',
    ],
  },
  {
    role: 'Lab',
    title: 'Tests & reports',
    kicker: 'Diagnostics',
    tagline: 'Patient requests land in your queue. Reports return to their profile.',
    tone: 'lab',
    image: '/images/how-it-works/lab.jpg',
    points: [
      'Patient-raised test requests land in your queue',
      'Home collection or lab visit — as the patient chose',
      'Report goes back to the patient profile when ready',
    ],
  },
  {
    role: 'Pharmacy',
    title: 'Pickup & home delivery',
    kicker: 'Medicines',
    tagline: 'Pickup or home delivery, with receipts back on the patient profile.',
    tone: 'pharmacy',
    image: '/images/how-it-works/pharmacy.jpg',
    points: [
      'Incoming medicine orders in your own login',
      'Pickup or home delivery based on the patient choice',
      'Receipt / status updates reach the patient profile',
    ],
  },
]

function stackOffset(index: number, active: number, length: number) {
  let offset = index - active
  const half = Math.floor(length / 2)
  if (offset > half) offset -= length
  if (offset < -half) offset += length
  return offset
}

export const HowItWorks = () => {
  const [activeIndex, setActiveIndex] = useState(1)
  const activeRole = ROLE_USPS[activeIndex]

  const go = (dir: -1 | 1) => {
    setActiveIndex((current) => (current + dir + ROLE_USPS.length) % ROLE_USPS.length)
  }

  return (
    <PublicLayout className="public-home-landing how-it-works-page">
      <div className="public-home-container">
        <PageHeader
          className="how-it-works-page-header"
          title="How it works"
          subtitle="See what each role gets when an appointment is created."
        />
      </div>

      <section className="public-home-section how-stack-section">
        <div className="public-home-container">
          <p className="how-stack-kicker">We focus on</p>
          <h2 className="how-stack-headline">Book . Connect . Care</h2>

          <div className="how-stack-stage">
            <button type="button" className="how-stack-nav how-stack-nav--prev" onClick={() => go(-1)} aria-label="Previous role">
              ‹
            </button>

            <div className="how-stack" aria-label="Role cards">
              {ROLE_USPS.map((role, index) => {
                const offset = stackOffset(index, activeIndex, ROLE_USPS.length)
                const isActive = offset === 0
                return (
                  <button
                    key={role.role}
                    type="button"
                    className={`how-stack-card how-stack-card--${role.tone}`}
                    data-offset={offset}
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={isActive}
                    aria-label={`${role.role}: ${role.tagline}`}
                  >
                    <div className={`how-stack-media how-stack-media--${role.tone}`}>
                      <img className="how-stack-photo" src={role.image} alt="" />
                    </div>
                    <div className="how-stack-body">
                      <h3 className="how-stack-card-title">{role.title}</h3>
                      <p className="how-stack-card-text">{role.tagline}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <button type="button" className="how-stack-nav how-stack-nav--next" onClick={() => go(1)} aria-label="Next role">
              ›
            </button>
          </div>

          <div className="how-stack-dots" role="tablist" aria-label="Choose a role">
            {ROLE_USPS.map((role, index) => (
              <button
                key={role.role}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                className={`how-stack-dot${index === activeIndex ? ' is-active' : ''}`}
                onClick={() => setActiveIndex(index)}
                aria-label={role.role}
              />
            ))}
          </div>

          <div className="how-stack-detail">
            <p className="how-stack-detail-kicker">{activeRole.kicker}</p>
            <h3 className="how-stack-detail-title">{activeRole.role}</h3>
            {activeRole.note ? (
              <p className="public-home-role-notify">
                <span className="public-home-role-notify-dot" aria-hidden="true" />
                {activeRole.note}
              </p>
            ) : null}
            <ul className="public-home-role-points how-stack-detail-points">
              {activeRole.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
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
    </PublicLayout>
  )
}
