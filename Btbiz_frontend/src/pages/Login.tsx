import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'

export const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotStep, setForgotStep] = useState<'phone' | 'otp'>('phone')
  const [forgotPhoneDigits, setForgotPhoneDigits] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    try {
      setLoading(true)
      const result = await authService.login({ email, password })
      authStorage.set(result.token, result.doctorName, result.role)
      if (result.role === 'ASSISTANT') {
        navigate('/assistant')
      } else if (result.role === 'LAB_ASSISTANT') {
        navigate('/lab')
      } else if (result.role === 'LAB_MANAGER') {
        navigate('/lab-manager')
      } else if (result.role === 'PHARMACY') {
        navigate('/medicine')
      } else {
        navigate('/dashboard')
      }
    }
    catch {
      setError('Unable to log in. Please check credentials.')
    }
    finally {
      setLoading(false)
    }
  }

  const handleStartForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotSuccess(null)

    if (!forgotPhoneDigits) {
      setForgotError('Please enter your registered WhatsApp number.')
      return
    }

    if (forgotPhoneDigits.length !== 10) {
      setForgotError('Mobile number must be 10 digits.')
      return
    }

    try {
      setForgotLoading(true)
      const normalizedPhone = `+91${forgotPhoneDigits}`
      await authService.startForgotPassword({ phone: normalizedPhone })
      setForgotSuccess('OTP sent on your WhatsApp (if number exists).')
      setForgotStep('otp')
    } catch {
      setForgotError('Could not send OTP. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleCompleteForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotSuccess(null)

    if (!forgotPhoneDigits || !forgotOtp || !forgotNewPassword) {
      setForgotError('Please fill all fields.')
      return
    }

    try {
      setForgotLoading(true)
      const normalizedPhone = `+91${forgotPhoneDigits}`
      await authService.completeForgotPassword({
        phone: normalizedPhone,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
      })
      setForgotSuccess('Password reset successful. You can now log in.')
      setTimeout(() => {
        setShowForgot(false)
        setForgotStep('phone')
        setForgotOtp('')
        setForgotNewPassword('')
        setForgotPhoneDigits('')
      }, 800)
    } catch {
      setForgotError('Invalid or expired OTP. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="page-center">
      <div className="ui-card login-layout">
        {/* Left form panel (MEDIGRAPH brand) */}
        <div className="login-panel">
          {/* Logo / brand */}
          <div className="login-brand">
            <span className="login-logo-pill">
              MEDIGRAPH
            </span>
          </div>

          {/* Heading + tagline */}
          <h1 className="login-heading">
            Login
          </h1>
          <p className="login-tagline">
            Empowering Healthcare, One Click at a Time
          </p>

          {/* Login form */}
          <form
            onSubmit={handleSubmit}
            className="login-form"
          >
            <TextField
              id="email"
              type="email"
              label="Username or Email"
              autoComplete="email"
              placeholder="doctor@medigraph.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={(
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M2.94 6.34A2 2 0 0 1 4.6 5h10.8a2 2 0 0 1 1.66 1.34l-7.06 4.12-7.06-4.12Z" />
                  <path d="M18 8.24v5.26A2.5 2.5 0 0 1 15.5 16h-11A2.5 2.5 0 0 1 2 13.5V8.24l7.06 4.12a1.5 1.5 0 0 0 1.48 0L18 8.24Z" />
                </svg>
              )}
            />
            <TextField
              id="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              canTogglePassword
              leftIcon={(
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2H8Z" />
                </svg>
              )}
            />

            {error && (
              <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                {error}
              </p>
            )}

            <div className="login-links">
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  setShowForgot(true)
                  setForgotStep('phone')
                  setForgotError(null)
                  setForgotSuccess(null)
                }}
              >
                Forgot Password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>

            <div className="login-secondary-text">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="login-link"
                onClick={() => navigate('/register')}
              >
                Create an Account
              </button>
            </div>
          </form>
        </div>

        {/* Right image / background panel */}
        <div className="login-image-panel">
          <div className="login-image-frame" />
        </div>
      </div>

      {showForgot && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">
              Reset password
            </h2>
            <p className="dialog-body">
              We&apos;ll send a one-time password (OTP) to your registered WhatsApp number.
            </p>

            {forgotStep === 'phone' && (
              <form onSubmit={handleStartForgot} className="login-form" style={{ marginTop: 12 }}>
                <TextField
                  id="forgot-phone"
                  type="tel"
                  label="Registered WhatsApp number"
                  placeholder="+91 98765 43210"
                  value={forgotPhoneDigits}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForgotPhoneDigits(onlyDigits)
                  }}
                />
                {forgotError && (
                  <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                    {forgotError}
                  </p>
                )}
                {forgotSuccess && (
                  <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                    {forgotSuccess}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="ui-button ui-button-secondary"
                    onClick={() => setShowForgot(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ui-button ui-button-primary"
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? 'Sending…' : 'Send OTP'}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 'otp' && (
              <form onSubmit={handleCompleteForgot} className="login-form" style={{ marginTop: 12 }}>
                <TextField
                  id="forgot-otp"
                  type="text"
                  label="OTP"
                  placeholder="Enter 6-digit OTP"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value)}
                />
                <TextField
                  id="forgot-new-password"
                  type="password"
                  label="New password"
                  autoComplete="new-password"
                  placeholder="Set new password"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  canTogglePassword
                />
                {forgotError && (
                  <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                    {forgotError}
                  </p>
                )}
                {forgotSuccess && (
                  <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                    {forgotSuccess}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="ui-button ui-button-secondary"
                    onClick={() => setShowForgot(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ui-button ui-button-primary"
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? 'Saving…' : 'Reset password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

