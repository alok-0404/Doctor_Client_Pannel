import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/api'
import { authStorage } from '../utils/authStorage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { LoginHomeLink } from '../components/LoginHomeLink'

/** Must match backend default SUPER_ADMIN_EMAIL in Btbiz_backend/.env */
const SUPER_ADMIN_EMAIL = 'superadmin@medigraph.com'

export const Login = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    authStorage.clear()
  }, [])
  const isSuperAdminLogin = searchParams.get('role') === 'super-admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const isSuperAdminEmail =
    email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
  const useSuperAdminFlow = isSuperAdminLogin || isSuperAdminEmail
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotStep, setForgotStep] = useState<'phone' | 'otp'>('phone')
  const [forgotCountryCode, setForgotCountryCode] = useState('+91')
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
      const result = useSuperAdminFlow
        ? await authService.superAdminLogin({ email, password })
        : await authService.login({ email, password })
      authStorage.set(result.token, result.doctorName, result.role)
      if (result.role === 'ASSISTANT') {
        navigate('/assistant')
      } else if (result.role === 'LAB_ASSISTANT') {
        navigate('/lab')
      } else if (result.role === 'LAB_MANAGER') {
        navigate('/lab-manager')
      } else if (result.role === 'PHARMACY') {
        navigate('/medicine')
      } else if (result.role === 'SUPER_ADMIN') {
        navigate('/super-admin')
      } else {
        navigate('/dashboard')
      }
    }
    catch (err: unknown) {
      const apiMsg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data &&
        typeof (err.response.data as { message?: string }).message === 'string'
          ? (err.response.data as { message: string }).message
          : null
      setError(
        apiMsg ??
          (useSuperAdminFlow
            ? 'Super admin login failed. Check password in Btbiz_backend/.env (SUPER_ADMIN_PASSWORD).'
            : 'Unable to log in. Please check credentials.'),
      )
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

    if (forgotPhoneDigits.length < 6) {
      setForgotError('Please enter a valid mobile number.')
      return
    }

    try {
      setForgotLoading(true)
      const normalizedPhone = `${forgotCountryCode}${forgotPhoneDigits}`
      await authService.startForgotPassword({ phone: normalizedPhone })
      setForgotSuccess('OTP flow temporarily bypassed. Continue to reset password.')
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
      const normalizedPhone = `${forgotCountryCode}${forgotPhoneDigits}`
      await authService.completeForgotPassword({
        phone: normalizedPhone,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
      })
      setForgotSuccess('Password reset successful. You can now log in.')
      setTimeout(() => {
        setShowForgot(false)
        setForgotStep('phone')
        setForgotCountryCode('+91')
        setForgotOtp('')
        setForgotNewPassword('')
        setForgotPhoneDigits('')
      }, 800)
    } catch {
      setForgotError('Could not reset password. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <>
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
              title="Login"
              subtitle="Empowering Healthcare, One Click at a Time"
            />

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-fields">
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
              </div>

              {error && (
                <p className="login-message login-message--error" role="alert">
                  {error}
                </p>
              )}

              {!useSuperAdminFlow && (
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
              )}

              <div className="login-form-actions">
                <Button type="submit" disabled={loading} fullWidth>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </div>

              <div className="login-secondary-text">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  className="login-link"
                  onClick={() => navigate('/register')}
                >
                  Create an account
                </button>
              </div>
            </form>
          </div>

          <div className="login-image-panel">
            <div className="login-image-frame">
              <div className="login-image-overlay">
                <p className="login-image-kicker">Healthcare SaaS</p>
                <p className="login-image-title">Secure access for your clinic team</p>
                <p className="login-image-text">
                  Doctors, assistants, labs, and pharmacy — one unified workspace.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {showForgot && (
        <div
          className="dialog-backdrop dialog-backdrop--header"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-forgot-title"
        >
          <div className="dialog-card dialog-card--forgot">
            <div className="dialog-card-header">
              <span className="dialog-card-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2Z"
                  />
                </svg>
              </span>
              <div className="dialog-card-copy">
                <h2 id="login-forgot-title" className="dialog-title">
                  Reset password
                </h2>
                <p className="dialog-body">
                  OTP service is under integration right now. Abhi temporary bypass mode enabled hai.
                </p>
              </div>
            </div>

            {forgotStep === 'phone' && (
              <form onSubmit={handleStartForgot} className="login-form login-form--dialog">
                <CountryCodePhoneInput
                  id="forgot-phone"
                  label="Registered WhatsApp number"
                  countryCode={forgotCountryCode}
                  onCountryCodeChange={setForgotCountryCode}
                  phoneDigits={forgotPhoneDigits}
                  onPhoneDigitsChange={setForgotPhoneDigits}
                />
                {forgotError && (
                  <p className="login-message login-message--error" role="alert">
                    {forgotError}
                  </p>
                )}
                {forgotSuccess && (
                  <p className="login-message login-message--success" role="status">
                    {forgotSuccess}
                  </p>
                )}
                <div className="dialog-actions dialog-actions--logout">
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
              <form onSubmit={handleCompleteForgot} className="login-form login-form--dialog">
                <TextField
                  id="forgot-otp"
                  type="text"
                  label="OTP (temporary bypass)"
                  placeholder="Enter 123456 (temporary)"
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
                  <p className="login-message login-message--error" role="alert">
                    {forgotError}
                  </p>
                )}
                {forgotSuccess && (
                  <p className="login-message login-message--success" role="status">
                    {forgotSuccess}
                  </p>
                )}
                <div className="dialog-actions dialog-actions--logout">
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
    </>
  )
}

