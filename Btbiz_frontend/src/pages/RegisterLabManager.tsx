import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'

export const RegisterLabManager = () => {
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
      const result = await authService.registerLabManager({
        name,
        email,
        password,
        phone: normalizedPhone,
      })
      setSuccess('Registration successful. Redirecting to your panel…')
      authStorage.set(result.token, result.doctorName, result.role)
      setTimeout(() => {
        navigate('/lab-manager')
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
    <div className="page-center">
      <div className="ui-card login-layout">
        <div className="login-panel">
          <div className="login-brand">
            <span className="login-logo-pill">MEDIGRAPH</span>
          </div>

          <h1 className="login-heading">Lab Manager – Create account</h1>
          <p className="login-tagline">
            Register as a lab manager. After this you can add lab assistants and manage tests.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <TextField
              id="name"
              type="text"
              label="Full name"
              placeholder="Lab Manager Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              id="email"
              type="email"
              label="Email"
              autoComplete="email"
              placeholder="manager@lab.com"
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

            {error && (
              <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                {success}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account…' : 'Register as Lab Manager'}
            </Button>

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
          <div className="login-image-frame" />
        </div>
      </div>
    </div>
  )
}
