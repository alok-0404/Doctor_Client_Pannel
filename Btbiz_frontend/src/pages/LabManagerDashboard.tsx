import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { ClinicLocationSetup } from '../components/ClinicLocationSetup'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { authService, type AssistantSummary } from '../services/api'

export const LabManagerDashboard = () => {
  const navigate = useNavigate()
  const name = authStorage.getName() ?? 'Lab Manager'

  const [showAddLabAssistant, setShowAddLabAssistant] = useState(false)
  const [labName, setLabName] = useState('')
  const [labEmail, setLabEmail] = useState('')
  const [labCountryCode, setLabCountryCode] = useState('+91')
  const [labPhoneDigits, setLabPhoneDigits] = useState('')
  const [labPassword, setLabPassword] = useState('')
  const [labLoading, setLabLoading] = useState(false)
  const [labError, setLabError] = useState<string | null>(null)
  const [labSuccess, setLabSuccess] = useState<string | null>(null)
  const [labAssistants, setLabAssistants] = useState<AssistantSummary[]>([])
  const [labAssistantsOpen, setLabAssistantsOpen] = useState(true)
  const [deletingAssistantId, setDeletingAssistantId] = useState<string | null>(null)

  const loadLabAssistants = async () => {
    try {
      const list = await authService.listLabAssistants()
      setLabAssistants(list)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadLabAssistants()
  }, [])

  const handleCreateLabAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    setLabError(null)
    setLabSuccess(null)
    if (!labName || !labEmail || !labPhoneDigits || !labPassword) {
      setLabError('Please fill all fields.')
      return
    }
    if (labPhoneDigits.length < 6) {
      setLabError('Please enter a valid mobile number.')
      return
    }
    try {
      setLabLoading(true)
      const normalizedPhone = `${labCountryCode}${labPhoneDigits}`
      await authService.createLabAssistant({
        name: labName,
        email: labEmail,
        phone: normalizedPhone,
        password: labPassword,
      })
      setLabSuccess('Lab assistant created successfully.')
      setLabName('')
      setLabEmail('')
      setLabPhoneDigits('')
      setLabPassword('')
      await loadLabAssistants()
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        'Unable to create lab assistant. Email/phone may already be used.'
      setLabError(msg)
    } finally {
      setLabLoading(false)
    }
  }

  const handleDeleteLabAssistant = async (assistantId: string) => {
    try {
      setDeletingAssistantId(assistantId)
      await authService.deleteLabAssistant(assistantId)
      setLabSuccess('Lab assistant deleted successfully.')
      await loadLabAssistants()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to delete lab assistant.'
      setLabError(msg)
    } finally {
      setDeletingAssistantId(null)
    }
  }

  return (
    <div className="app-shell">
      <Header doctorName={name} />
      <div style={{ maxWidth: 640, margin: '12px auto 0', padding: '0 16px' }}>
        <ClinicLocationSetup />
      </div>
      <main className="dashboard-main">
        <section className="dashboard-left" style={{ maxWidth: 640 }}>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Lab Manager panel</p>
            <h2 className="dashboard-heading">Good day, {name}</h2>
            <p
              className="dashboard-body"
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#065f46',
                fontWeight: 500,
              }}
            >
              Your lab is already registered (Super Admin onboarding). You are logged in as the lab owner — no need to
              Register again on the home page.
            </p>
            <p className="dashboard-body">
              Open the lab workspace to search patients, record tests, and handle incoming orders — same as your lab
              assistants. Optionally add assistants below so they can sign in under Assistant / Lab.
            </p>
            <button
              type="button"
              className="ui-button ui-button-primary"
              style={{ marginTop: 8 }}
              onClick={() => navigate('/lab')}
            >
              Open lab workspace
            </button>
          </Card>

          <div style={{ marginTop: 16 }}>
            <Card className="dashboard-overview-card">
              <button
                type="button"
                onClick={() => setLabAssistantsOpen((o) => !o)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  margin: 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <p className="dashboard-kicker">Lab assistants</p>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 16,
                    transform: labAssistantsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.16s ease',
                    color: '#9fb3c8',
                  }}
                >
                  ▾
                </span>
              </button>
              {labAssistantsOpen && (
                <>
                  {labAssistants.length === 0 && (
                    <p className="dashboard-body" style={{ marginTop: 8 }}>
                      No lab assistants yet (optional). You can work from the lab workspace yourself, or add assistants
                      here for extra staff logins.
                    </p>
                  )}
                  {labAssistants.length > 0 && (
                    <>
                      <p className="dashboard-body" style={{ marginTop: 8, marginBottom: 4 }}>
                        {labAssistants.length} lab assistant{labAssistants.length !== 1 ? 's' : ''} added
                      </p>
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          marginTop: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        {labAssistants.map((c) => (
                          <li
                            key={c.id}
                            style={{
                              fontSize: 12,
                              padding: '8px 10px',
                              borderRadius: 12,
                              backgroundColor: '#f5f9fc',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <div>
                              <strong>{c.name}</strong>
                              <div style={{ color: '#607d8b' }}>{c.phone}</div>
                              {c.createdAt && (
                                <div style={{ fontSize: 11, color: '#9fb3c8', marginTop: 2 }}>
                                  Added: {new Date(c.createdAt).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              )}
                            </div>
                            <div>
                              <button
                                type="button"
                                className="ui-button ui-button-danger-outline ui-button-sm"
                                disabled={deletingAssistantId === c.id}
                                onClick={() => void handleDeleteLabAssistant(c.id)}
                              >
                                {deletingAssistantId === c.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setShowAddLabAssistant(true)
                      setLabError(null)
                      setLabSuccess(null)
                    }}
                  >
                    Add lab assistant
                  </button>
                </>
              )}
            </Card>
          </div>
        </section>
      </main>

      {showAddLabAssistant && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">Add lab assistant</h2>
            <p className="dialog-body">
              Create a lab assistant account. They can search patients by mobile and add diagnostic tests for visits.
            </p>
            <form
              onSubmit={handleCreateLabAssistant}
              className="login-form"
              style={{ marginTop: 12 }}
            >
              <TextField
                id="lab-name"
                label="Full name"
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
              />
              <TextField
                id="lab-email"
                label="Email"
                type="email"
                value={labEmail}
                onChange={(e) => setLabEmail(e.target.value)}
              />
              <CountryCodePhoneInput
                id="lab-phone"
                label="WhatsApp number"
                countryCode={labCountryCode}
                onCountryCodeChange={setLabCountryCode}
                phoneDigits={labPhoneDigits}
                onPhoneDigitsChange={setLabPhoneDigits}
              />
              <TextField
                id="lab-password"
                label="Temporary password"
                type="password"
                value={labPassword}
                onChange={(e) => setLabPassword(e.target.value)}
                canTogglePassword
              />
              {labError && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                  {labError}
                </p>
              )}
              {labSuccess && (
                <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                  {labSuccess}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => setShowAddLabAssistant(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="ui-button ui-button-primary"
                  disabled={labLoading}
                >
                  {labLoading ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
