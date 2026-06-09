import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { patientAuthService } from '../services/api'
import { patientStorage } from '../utils/patientStorage'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { LoginHomeLink } from '../components/LoginHomeLink'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'

type Step = 'mobile' | 'otp' | 'select'

export const PatientLogin = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('mobile')
  const [countryCode, setCountryCode] = useState('+91')
  const [mobileDigits, setMobileDigits] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectionToken, setSelectionToken] = useState<string | null>(null)
  const [patients, setPatients] = useState<Array<{ id: string; firstName: string; lastName?: string }>>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')

  const fullMobile = `${countryCode}${mobileDigits.replace(/\D/g, '').trim()}`

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mobileDigits.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    try {
      setLoading(true)
      await patientAuthService.sendOtp(fullMobile)
      setStep('otp')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Could not send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP.')
      return
    }
    try {
      setLoading(true)
      const result = await patientAuthService.verify(fullMobile, otp)
      if ('token' in result && result.patient) {
        const name = [result.patient.firstName, result.patient.lastName].filter(Boolean).join(' ')
        patientStorage.set(result.token, result.patient.id, name, 'otp')
        navigate('/patient-profile')
      } else if ('selectionToken' in result && result.patients?.length) {
        setSelectionToken(result.selectionToken)
        setPatients(result.patients)
        setSelectedPatientId(result.patients[0].id)
        setStep('select')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Invalid or expired OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectionToken || !selectedPatientId) return
    setError(null)
    try {
      setLoading(true)
      const result = await patientAuthService.selectProfile(selectionToken, selectedPatientId)
      const name = [result.patient.firstName, result.patient.lastName].filter(Boolean).join(' ')
      patientStorage.set(result.token, result.patient.id, name, 'otp')
      navigate('/patient-profile')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Could not complete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout className="patient-login-page">
      <div className="patient-login-content">
        <Card className="login-layout" elevated>
          <div className="login-panel">
            <div className="login-brand-row">
              <div className="login-brand">
                <span className="login-logo-pill">MEDIGRAPH</span>
              </div>
              <LoginHomeLink to="/" />
            </div>

            <PageHeader
              className="login-page-header"
              title="My Profile Login"
              subtitle="View your appointments, reports, and health records."
            />

            {step === 'mobile' && (
              <form onSubmit={handleSendOtp} className="login-form">
                <div className="login-form-fields">
                  <CountryCodePhoneInput
                    id="patient-mobile"
                    label="Registered mobile number"
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    phoneDigits={mobileDigits}
                    onPhoneDigitsChange={setMobileDigits}
                  />
                  <p className="login-form-note">
                    We&apos;ll send an OTP to verify. Book an appointment first if you don&apos;t have a profile.
                  </p>
                </div>
                {error && (
                  <p className="login-message login-message--error" role="alert">
                    {error}
                  </p>
                )}
                <div className="login-form-actions">
                  <Button type="submit" disabled={loading} fullWidth>
                    {loading ? 'Sending…' : 'Send OTP'}
                  </Button>
                </div>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={handleVerify} className="login-form">
                <div className="login-form-fields">
                  <p className="login-form-note">
                    OTP sent to <strong>{fullMobile}</strong>
                  </p>
                  <TextField
                    id="patient-otp"
                    type="text"
                    label="Enter 6-digit OTP"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                  />
                </div>
                {error && (
                  <p className="login-message login-message--error" role="alert">
                    {error}
                  </p>
                )}
                <div className="login-form-actions">
                  <Button type="submit" disabled={loading} fullWidth>
                    {loading ? 'Verifying…' : 'Verify'}
                  </Button>
                </div>
                <div className="login-links">
                  <button
                    type="button"
                    className="login-link"
                    onClick={() => {
                      setStep('mobile')
                      setOtp('')
                      setError(null)
                    }}
                  >
                    Change mobile number
                  </button>
                </div>
              </form>
            )}

            {step === 'select' && (
              <form onSubmit={handleSelectProfile} className="login-form">
                <div className="login-form-fields">
                  <p className="login-form-note">
                    Multiple profiles linked to this mobile. Choose one:
                  </p>
                  <div className="patient-login-profile-list">
                    {patients.map((p) => (
                      <label
                        key={p.id}
                        className={`patient-login-profile-option${
                          selectedPatientId === p.id ? ' patient-login-profile-option--selected' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="patient"
                          value={p.id}
                          checked={selectedPatientId === p.id}
                          onChange={() => setSelectedPatientId(p.id)}
                        />
                        <span>{[p.firstName, p.lastName].filter(Boolean).join(' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {error && (
                  <p className="login-message login-message--error" role="alert">
                    {error}
                  </p>
                )}
                <div className="login-form-actions">
                  <Button type="submit" disabled={loading} fullWidth>
                    {loading ? 'Loading…' : 'Open profile'}
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="login-image-panel">
            <div className="login-image-frame">
              <div className="login-image-overlay">
                <p className="login-image-kicker">Patient portal</p>
                <p className="login-image-title">Your health records, securely online</p>
                <p className="login-image-text">
                  Appointments, lab reports, and family profiles — all in one place.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PublicLayout>
  )
}
