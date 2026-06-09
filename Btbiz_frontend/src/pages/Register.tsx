import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { LoginHomeLink } from '../components/LoginHomeLink'

export const Register = () => {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name || !email || !phoneDigits || !password) {
      setError('Please fill all fields (name, email, mobile, password).')
      return
    }

    if (phoneDigits.length < 6) {
      setError('Please enter a valid mobile number.')
      return
    }

    try {
      setLoading(true)
      const normalizedPhone = `${countryCode}${phoneDigits}`
      await authService.register({ name, email, password, phone: normalizedPhone })
      setSuccess('Registration request submitted. Super Admin approval ke baad hi login hoga. Redirecting to login…')

      setTimeout(() => {
        navigate('/login')
      }, 800)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      setError('Unable to register. Please try a different email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-center login-page">
      <Card className="login-layout" elevated>
        <div className="login-panel">
          <div className="login-brand-row">
            <div className="login-brand">
              <span className="login-logo-pill">MEDIGRAPH</span>
            </div>
            <LoginHomeLink />
          </div>

          <PageHeader
            className="login-page-header"
            title="Create account"
            subtitle="Register your doctor profile. Account activates after Super Admin approval."
          />

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-fields">
              <TextField
                id="name"
                type="text"
                label="Full name"
                placeholder="Dr. Basant Tomar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                id="email"
                type="email"
                label="Email"
                autoComplete="email"
                placeholder="doctor@medigraph.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <CountryCodePhoneInput
                id="phone"
                label="Registered WhatsApp number"
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                phoneDigits={phoneDigits}
                onPhoneDigitsChange={setPhoneDigits}
              />
              <TextField
                id="password"
                type="password"
                label="Password"
                autoComplete="new-password"
                placeholder="Choose a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                canTogglePassword
              />
            </div>

            {error && (
              <p className="login-message login-message--error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="login-message login-message--success" role="status">
                {success}
              </p>
            )}

            <div className="login-form-actions">
              <Button type="submit" disabled={loading} fullWidth>
                {loading ? 'Creating account…' : 'Register'}
              </Button>
            </div>

            <div className="login-secondary-text">
              Already have an account?{' '}
              <button
                type="button"
                className="login-link"
                onClick={() => navigate('/login')}
              >
                Back to login
              </button>
            </div>
          </form>
        </div>

        <div className="login-image-panel">
          <div className="login-image-frame">
            <div className="login-image-overlay">
              <p className="login-image-kicker">Doctor onboarding</p>
              <p className="login-image-title">Join the clinical workspace</p>
              <p className="login-image-text">
                Manage patients, visits, and prescriptions once your account is approved.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
