import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { LoginHomeLink } from '../components/LoginHomeLink'

export const RegisterMedicine = () => {
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
      const result = await authService.registerPharmacy({
        name,
        email,
        password,
        phone: normalizedPhone,
      })
      setSuccess('Registration successful. Redirecting to Medicine dashboard…')
      authStorage.set(result.token, result.doctorName, result.role)
      setTimeout(() => {
        navigate('/medicine')
      }, 600)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? 'Unable to register. Email or phone may already be in use.'
      setError(msg)
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
            title="Medicine – Create account"
            subtitle="Register your medical shop. Search patients, add medicines with MRP and discount, collect payment and generate receipts."
          />

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-fields">
              <TextField
                id="name"
                type="text"
                label="Full name / Shop name"
                placeholder="Medical Shop Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                id="email"
                type="email"
                label="Email"
                autoComplete="email"
                placeholder="shop@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <CountryCodePhoneInput
                id="phone"
                label="Mobile number"
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
                {loading ? 'Creating account…' : 'Register as medicine'}
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
              <p className="login-image-kicker">Pharmacy workspace</p>
              <p className="login-image-title">Dispense with confidence</p>
              <p className="login-image-text">
                Fulfill patient medicine orders, manage bills, and print receipts in one place.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
