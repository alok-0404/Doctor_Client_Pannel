import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { patientService } from '../services/api'

export const PatientSearch = () => {
  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const navigate = useNavigate()

  const doctorName = authStorage.getName() ?? 'Doctor'

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotFound(false)

    const digits = mobile.replace(/\D/g, '')
    if (digits.length < 10) {
      setNotFound(true)
      return
    }

    setLoading(true)
    try {
      const patient = await patientService.searchByMobile(digits)
      if (patient) {
        navigate(`/patient/${patient.id}`)
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
    <div className="app-shell">
      <Header doctorName={doctorName} />
      <main className="search-main">
        <Card className="search-card">
          <header className="search-header">
            <p className="dashboard-kicker">
              Search workspace
            </p>
            <h2 className="search-title">
              Patient by mobile number
            </h2>
            <p className="search-subtitle">
              Keep the focus on one task: find the correct patient and open their
              details. No extra fields, no clutter.
            </p>
          </header>

          <form
            onSubmit={handleSearch}
            className="search-form"
          >
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
              <p className="search-error">
                Patient not found. Please check the number and try again.
              </p>
            )}

            <div className="search-footer">
              <p className="search-hint">
                Enter the patient&apos;s registered 10-digit mobile number to open their record.
              </p>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  )
}

