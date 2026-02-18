import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'

export const Register = () => {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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

    if (phoneDigits.length !== 10) {
      setError('Mobile number must be 10 digits.')
      return
    }

    try {
      setLoading(true)
      const normalizedPhone = `+91${phoneDigits}`
      await authService.register({ name, email, password, phone: normalizedPhone })
      setSuccess('Registration successful. Redirecting to login…')

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
    <div className="page-center">
      <div className="ui-card login-layout">
        <div className="login-panel">
          <div className="login-brand">
            <span className="login-logo-pill">
              MEDIGRAPH
            </span>
          </div>

          <h1 className="login-heading">
            Create account
          </h1>
          <p className="login-tagline">
            Register a doctor profile to start using the workspace.
          </p>

          <form
            onSubmit={handleSubmit}
            className="login-form"
          >
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
            <TextField
              id="phone"
              type="tel"
              label="Registered WhatsApp number"
              placeholder="+91 98765 43210"
              value={phoneDigits}
              onChange={(e) => {
                const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
                setPhoneDigits(onlyDigits)
              }}
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Creating account…' : 'Register'}
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

