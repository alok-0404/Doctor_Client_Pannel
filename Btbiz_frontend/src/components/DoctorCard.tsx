import { useState, type FC } from 'react'
import { Link } from 'react-router-dom'

import { Card } from './ui/Card'
import { doctorInitials } from '../utils/doctorDirectory'
import type { PublicDoctor } from '../services/api'

const AVAILABILITY_LABEL: Record<string, string> = {
  available: 'Available',
  busy: 'Busy',
  unavailable: 'Unavailable',
}

export const DoctorCard: FC<{ doctor: PublicDoctor }> = ({ doctor }) => {
  const [expanded, setExpanded] = useState(false)
  const status = AVAILABILITY_LABEL[doctor.availabilityStatus ?? 'available'] ?? 'Available'
  const specialty = doctor.specialization || doctor.departmentLabel
  const hasDetails = Boolean(doctor.bio || doctor.previousHospital || doctor.qualification)

  return (
    <Card className="public-home-doctor-card public-home-lift-card" elevated interactive>
      <div className="public-home-doctor-media">
        <span
          className={`public-home-doctor-badge${
            doctor.availabilityStatus && doctor.availabilityStatus !== 'available' ? ' public-home-doctor-badge--muted' : ''
          }`}
        >
          {status}
        </span>
        <div className="public-home-doctor-avatar" aria-hidden={!doctor.photoUrl}>
          {doctor.photoUrl ? (
            <img className="public-home-doctor-photo" src={doctor.photoUrl} alt={doctor.name} loading="lazy" />
          ) : (
            doctorInitials(doctor.name)
          )}
        </div>
      </div>
      <div className="public-home-doctor-body">
        <h3 className="public-home-doctor-name">{doctor.name}</h3>
        <p className="public-home-doctor-specialty">{specialty}</p>
        {doctor.qualification && <p className="public-home-doctor-degree">{doctor.qualification}</p>}
        {typeof doctor.experienceYears === 'number' && (
          <p className="public-home-doctor-exp">{doctor.experienceYears}+ years experience</p>
        )}
        {expanded && hasDetails && (
          <div className="public-home-doctor-details">
            {doctor.previousHospital && (
              <p>
                <strong>Previously:</strong> {doctor.previousHospital}
              </p>
            )}
            <p>
              <strong>Department:</strong> {doctor.departmentLabel}
            </p>
            {doctor.bio && <p>{doctor.bio}</p>}
          </div>
        )}
        <div className="public-home-doctor-actions">
          {hasDetails ? (
            <button
              type="button"
              className="public-home-doctor-btn public-home-doctor-btn--ghost"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'Hide profile' : 'View profile'}
            </button>
          ) : (
            <Link to="/doctors" className="public-home-doctor-btn public-home-doctor-btn--ghost">
              View profile
            </Link>
          )}
          <Link to="/book-appointment" className="public-home-doctor-btn public-home-doctor-btn--primary">
            Book appointment
          </Link>
        </div>
      </div>
    </Card>
  )
}
