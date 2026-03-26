import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { patientAuthService } from '../services/api'
import { patientStorage } from '../utils/patientStorage'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'

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
        patientStorage.set(result.token, result.patient.id, name)
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
      patientStorage.set(result.token, result.patient.id, name)
      navigate('/patient-profile')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Could not complete. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="ui-card login-layout">
        <div className="login-panel">
          <div className="login-brand">
            <span className="login-logo-pill">MEDIGRAPH</span>
          </div>
          <h1 className="login-heading">My Profile Login</h1>
          <p className="login-tagline">
            View your appointments, reports, and health records.
          </p>

          {step === 'mobile' && (
            <form onSubmit={handleSendOtp} className="login-form">
              <CountryCodePhoneInput
                id="patient-mobile"
                label="Registered mobile number"
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                phoneDigits={mobileDigits}
                onPhoneDigitsChange={setMobileDigits}
              />
              <p className="text-sm" style={{ color: '#64748b', marginTop: 4 }}>
                We&apos;ll send an OTP to verify. Book an appointment first if you don&apos;t have a profile.
              </p>
              {error && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>{error}</p>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending…' : 'Send OTP'}
              </Button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerify} className="login-form">
              <p className="text-sm" style={{ color: '#64748b', marginBottom: 8 }}>
                OTP sent to {fullMobile}
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
              {error && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>{error}</p>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
              <button
                type="button"
                className="login-link"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setStep('mobile')
                  setOtp('')
                  setError(null)
                }}
              >
                Change mobile number
              </button>
            </form>
          )}

          {step === 'select' && (
            <form onSubmit={handleSelectProfile} className="login-form">
              <p className="text-sm" style={{ color: '#64748b', marginBottom: 12 }}>
                Multiple profiles linked to this mobile. Choose one:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {patients.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 12,
                      border: selectedPatientId === p.id ? '2px solid #1e40af' : '1px solid #e2e8f0',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: selectedPatientId === p.id ? '#eff6ff' : '#fff',
                    }}
                  >
                    <input
                      type="radio"
                      name="patient"
                      value={p.id}
                      checked={selectedPatientId === p.id}
                      onChange={() => setSelectedPatientId(p.id)}
                    />
                    <span>
                      {[p.firstName, p.lastName].filter(Boolean).join(' ')}
                    </span>
                  </label>
                ))}
              </div>
              {error && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>{error}</p>
              )}
              <Button type="submit" disabled={loading} className="w-full" style={{ marginTop: 12 }}>
                {loading ? 'Loading…' : 'Open Profile'}
              </Button>
            </form>
          )}

          <div className="login-secondary-text" style={{ marginTop: 20 }}>
            <Link to="/" className="login-link">
              ← Back to Home
            </Link>
          </div>
        </div>
        <div className="login-image-panel">
          <div className="login-image-frame" />
        </div>
      </div>
    </div>
  )
}
