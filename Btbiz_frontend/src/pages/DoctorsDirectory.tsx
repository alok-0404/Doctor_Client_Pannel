import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PublicLayout } from '../components/layout/PublicLayout'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { UserIcon } from '../components/ui/icons'
import { DoctorCard } from '../components/DoctorCard'
import { useDepartments } from '../utils/doctorDirectory'
import { doctorDirectoryService, type PublicDoctor } from '../services/api'

export const DoctorsDirectory = () => {
  const departments = useDepartments()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('department') ?? ''
  const [doctors, setDoctors] = useState<PublicDoctor[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    doctorDirectoryService
      .listDoctors({ sort: 'senior' })
      .then((list) => {
        if (!cancelled) setDoctors(list)
      })
      .catch(() => {
        if (!cancelled) {
          setDoctors([])
          setError('Could not load doctors right now. Please try again in a moment.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const departmentsWithDoctors = useMemo(() => {
    if (!doctors) return []
    const present = new Set(doctors.map((d) => d.department))
    return departments.filter((d) => present.has(d.id))
  }, [departments, doctors])

  const visible = useMemo(
    () => (doctors ?? []).filter((d) => !selected || d.department === selected),
    [doctors, selected]
  )

  const choose = (departmentId: string) => {
    const next = new URLSearchParams(searchParams)
    if (departmentId) next.set('department', departmentId)
    else next.delete('department')
    setSearchParams(next, { replace: true })
  }

  return (
    <PublicLayout className="public-home-landing doctors-directory-page">
      <div className="public-home-container">
        <PageHeader
          title="Our doctors"
          subtitle="Choose a department to see its doctors — speciality, degree, experience and where they practised before."
        />

        {departmentsWithDoctors.length > 1 && (
          <div className="doctors-directory-filters" role="tablist" aria-label="Departments">
            <button
              type="button"
              role="tab"
              aria-selected={!selected}
              className={`doctors-directory-chip${!selected ? ' is-active' : ''}`}
              onClick={() => choose('')}
            >
              All departments
            </button>
            {departmentsWithDoctors.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={selected === d.id}
                className={`doctors-directory-chip${selected === d.id ? ' is-active' : ''}`}
                onClick={() => choose(d.id)}
                title={d.description}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <section className="doctors-directory-section">
          {doctors === null ? (
            <div className="public-home-doctors-grid" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rect" height={320} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<UserIcon size={22} />}
              title={error ? 'Doctors unavailable' : 'No doctors in this department yet'}
              message={error ?? 'Try another department, or book a General Medicine consultation.'}
            />
          ) : (
            <div className="public-home-doctors-grid">
              {visible.map((doctor) => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
            </div>
          )}
        </section>

        <div className="public-home-doctors-more">
          <Link to="/book-appointment" className="public-cta">
            Book appointment
          </Link>
        </div>
      </div>
    </PublicLayout>
  )
}
