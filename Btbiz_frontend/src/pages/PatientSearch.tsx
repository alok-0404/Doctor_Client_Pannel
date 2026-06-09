import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'
import { patientService } from '../services/api'

export const PatientSearch = () => {
  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [matches, setMatches] = useState<Array<{ id: string; firstName: string; lastName?: string; mobileNumber: string }>>([])
  const navigate = useNavigate()

  const doctorName = authStorage.getName() ?? 'Doctor'

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotFound(false)
    setMatches([])

    const digits = mobile.replace(/\D/g, '')
    if (digits.length < 10) {
      setNotFound(true)
      return
    }

    setLoading(true)
    try {
      const patients = await patientService.searchByMobileOptions(digits)
      if (patients.length === 1) {
        navigate(`/patient/${patients[0].id}`)
      } else if (patients.length > 1) {
        setMatches(patients)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout
      showSidebar
      header={<Header doctorName={doctorName} />}
      breadcrumb={(
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Search Patients' },
          ]}
        />
      )}
    >
      <main className="search-main patient-search-main">
        <section className="patient-search-section">
          <PageHeader
            className="patient-search-page-header"
            title="Search Patients"
            subtitle="Find the correct patient by registered mobile number and open their clinical record."
          />

          <Card className="search-card patient-search-card">
            <p className="dashboard-kicker patient-search-card-kicker">Search workspace</p>
            <h2 className="patient-search-card-title">Patient by mobile number</h2>
            <p className="patient-search-card-intro">
              One field, one action — no clutter. Ideal for quick lookup at the desk or between appointments.
            </p>

            <form onSubmit={handleSearch} className="search-form patient-search-form">
              <TextField
                id="mobile"
                type="tel"
                inputMode="numeric"
                label="Registered mobile number"
                placeholder="e.g. 9876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />

              {notFound && (
                <p className="search-error patient-search-error" role="alert">
                  Patient not found. Please check the number and try again.
                </p>
              )}

              {matches.length > 1 && (
                <Card className="patient-search-matches-card">
                  <p className="patient-search-matches-label">
                    Multiple family members found. Select a profile:
                  </p>
                  <div className="patient-search-matches-list">
                    {matches.map((m) => (
                      <Button
                        key={m.id}
                        type="button"
                        variant="secondary"
                        fullWidth
                        className="patient-search-match-btn"
                        onClick={() => navigate(`/patient/${m.id}`)}
                      >
                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || 'Patient'} ({m.mobileNumber})
                      </Button>
                    ))}
                  </div>
                </Card>
              )}

              <div className="search-footer patient-search-footer">
                <p className="search-hint patient-search-hint">
                  Enter the patient&apos;s registered 10-digit mobile number to open their record.
                </p>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Searching…' : 'Search'}
                </Button>
              </div>

              {loading && (
                <div className="patient-search-loading" aria-busy="true" aria-label="Searching patient">
                  <Skeleton lines={2} />
                  <Skeleton variant="rect" height={44} />
                </div>
              )}
            </form>
          </Card>
        </section>
      </main>
    </AppLayout>
  )
}
