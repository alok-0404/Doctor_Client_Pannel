import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { authService, notificationService, type AssistantSummary, type DoctorNotificationItem } from '../services/api'
import { authStorage } from '../utils/authStorage'

export const Dashboard = () => {
  const navigate = useNavigate()
  const doctorName = authStorage.getName() ?? 'Doctor'

  const [notifications, setNotifications] = useState<DoctorNotificationItem[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(true)
  const [showAddAssistant, setShowAddAssistant] = useState(false)
  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhoneDigits, setCPhoneDigits] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cLoading, setCLoading] = useState(false)
  const [cError, setCError] = useState<string | null>(null)
  const [cSuccess, setCSuccess] = useState<string | null>(null)
  const [assistants, setAssistants] = useState<AssistantSummary[]>([])
  const [assistantsOpen, setAssistantsOpen] = useState(false)

  const [showAddLabAssistant, setShowAddLabAssistant] = useState(false)
  const [labName, setLabName] = useState('')
  const [labEmail, setLabEmail] = useState('')
  const [labPhoneDigits, setLabPhoneDigits] = useState('')
  const [labPassword, setLabPassword] = useState('')
  const [labLoading, setLabLoading] = useState(false)
  const [labError, setLabError] = useState<string | null>(null)
  const [labSuccess, setLabSuccess] = useState<string | null>(null)
  const [labAssistants, setLabAssistants] = useState<AssistantSummary[]>([])
  const [labAssistantsOpen, setLabAssistantsOpen] = useState(false)

  const loadAssistants = async () => {
    try {
      const list = await authService.listAssistants()
      setAssistants(list)
    } catch {
      // ignore list errors in UI for now
    }
  }

  const loadLabAssistants = async () => {
    try {
      const list = await authService.listLabAssistants()
      setLabAssistants(list)
    } catch {
      // ignore
    }
  }

  const loadNotifications = async () => {
    try {
      const list = await notificationService.getNotifications()
      setNotifications(list)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadAssistants()
    void loadLabAssistants()
    void loadNotifications()
  }, [])

  useEffect(() => {
    const onFocus = () => void loadNotifications()
    const onDismissed = () => void loadNotifications()
    window.addEventListener('focus', onFocus)
    window.addEventListener('doctor-notification-dismissed', onDismissed)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('doctor-notification-dismissed', onDismissed)
    }
  }, [])

  const pendingNotifications = notifications.filter((n) => n.status === 'unread' || n.status === 'dismissed')
  const handleNotificationClick = async (n: DoctorNotificationItem) => {
    if (n.status !== 'read') {
      try {
        await notificationService.updateNotificationStatus(n.id, 'read')
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'read' as const } : x)))
      } catch {
        // ignore
      }
    }
    navigate(`/patients/${n.patientId}`)
  }

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    setCError(null)
    setCSuccess(null)

    if (!cName || !cEmail || !cPhoneDigits || !cPassword) {
      setCError('Please fill all fields.')
      return
    }

    if (cPhoneDigits.length !== 10) {
      setCError('Mobile number must be 10 digits.')
      return
    }

    try {
      setCLoading(true)
      const normalizedPhone = `+91${cPhoneDigits}`
      await authService.createAssistant({
        name: cName,
        email: cEmail,
        phone: normalizedPhone,
        password: cPassword,
      })
      setCSuccess('Assistant created successfully.')
      setCName('')
      setCEmail('')
      setCPhoneDigits('')
      setCPassword('')
      await loadAssistants()
    } catch (err: any) {
      const msg: string =
        err?.response?.data?.message ?? 'Unable to create assistant. Email/phone may already be used.'
      setCError(msg)
    } finally {
      setCLoading(false)
    }
  }

  const handleCreateLabAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    setLabError(null)
    setLabSuccess(null)
    if (!labName || !labEmail || !labPhoneDigits || !labPassword) {
      setLabError('Please fill all fields.')
      return
    }
    if (labPhoneDigits.length !== 10) {
      setLabError('Mobile number must be 10 digits.')
      return
    }
    try {
      setLabLoading(true)
      const normalizedPhone = `+91${labPhoneDigits}`
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

  return (
    <div className="app-shell">
      <Header
        doctorName={doctorName}
        onAddAssistantClick={() => {
          setShowAddAssistant(true)
          setCError(null)
          setCSuccess(null)
        }}
      />
      <main className="dashboard-main">
        {/* Left: Summary + cards */}
        <section className="dashboard-left">
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">
              Overview
            </p>
            <h2 className="dashboard-heading">
              Good day, {doctorName}
            </h2>
            <p className="dashboard-body">
              This panel is designed for calm clinical work. Quickly move between
              patients, review medications, and check investigations without visual
              noise or distractions.
            </p>
          </Card>

          {pendingNotifications.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card className="dashboard-overview-card">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((o) => !o)}
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
                  <p className="dashboard-kicker">New patient notifications</p>
                  <span style={{ fontSize: 12, color: '#627d98' }}>
                    {pendingNotifications.filter((n) => n.status === 'unread').length} new
                    {pendingNotifications.filter((n) => n.status === 'dismissed').length > 0 &&
                      ` · ${pendingNotifications.filter((n) => n.status === 'dismissed').length} dismissed`}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 16,
                      transform: notificationsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.16s ease',
                      color: '#9fb3c8',
                    }}
                  >
                    ▾
                  </span>
                </button>
                {notificationsOpen && (
                  <ul style={{ listStyle: 'none', padding: 0, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pendingNotifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            background: n.status === 'unread' ? '#ebf5fa' : '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontWeight: n.status === 'unread' ? 600 : 400 }}>
                            {n.status === 'unread' && (
                              <span style={{ marginRight: 6, color: '#0d47a1' }}>●</span>
                            )}
                            {n.patientName}
                          </span>
                          <span style={{ fontSize: 12, color: '#627d98' }}>
                            {new Date(n.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <Card className="dashboard-overview-card">
            <button
              type="button"
              onClick={() => setAssistantsOpen((o) => !o)}
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
              <p className="dashboard-kicker">
                Assistants
              </p>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 16,
                  transform: assistantsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.16s ease',
                  color: '#9fb3c8',
                }}
              >
                ▾
              </span>
            </button>

              {assistantsOpen && (
                <>
                  {assistants.length === 0 && (
                    <p className="dashboard-body" style={{ marginTop: 8 }}>
                      No assistants created yet.
                    </p>
                  )}
                  {assistants.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {assistants.map((c) => (
                        <li
                          key={c.id}
                          style={{
                            fontSize: 12,
                            padding: '6px 8px',
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
                          </div>
                          <div style={{ textAlign: 'right', color: '#9fb3c8' }}>
                            <div style={{ fontSize: 11 }}>Created by</div>
                            <div style={{ fontSize: 11 }}>
                              {c.createdBy ? c.createdBy.name : '—'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>
          </div>

          <div style={{ marginTop: 8 }}>
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
                      No lab assistants created yet.
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
                            <div style={{ textAlign: 'right', color: '#9fb3c8' }}>
                              <div style={{ fontSize: 11 }}>Created by</div>
                              <div style={{ fontSize: 11 }}>
                                {c.createdBy ? c.createdBy.name : '—'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <button
                    type="button"
                    className="ui-button ui-button-secondary"
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

          <div className="dashboard-stat-row">
            <Card className="dashboard-stat-card">
              <p className="dashboard-stat-label">
                Today&apos;s focus
              </p>
              <p className="dashboard-stat-text">
                Stable follow‑up patients and medicine review.
              </p>
            </Card>
            <Card className="dashboard-stat-card">
              <p className="dashboard-stat-label">
                Medicines
              </p>
              <p className="dashboard-stat-text">
                Clearly mark which medicines worked vs. not worked.
              </p>
            </Card>
            <Card className="dashboard-stat-card">
              <p className="dashboard-stat-label">
                Tests
              </p>
              <p className="dashboard-stat-text">
                Keep an eye on key labs and imaging in one place.
              </p>
            </Card>
          </div>
        </section>

        {/* Right: Search CTA */}
        <section className="dashboard-search-panel">
          <div className="dashboard-search-copy">
            <p className="dashboard-kicker">
              Patient search
            </p>
            <h3 className="dashboard-search-title">
              Find a patient by mobile
            </h3>
            <p className="dashboard-search-text">
              Ideal for reception and nursing stations. One field, one search
              action – nothing else on screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { window.location.href = '/patients/search' }}
            className="ui-button ui-button-primary dashboard-search-button"
          >
            Open search workspace
          </button>
        </section>
      </main>

      {showAddAssistant && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">
              Add assistant
            </h2>
            <p className="dialog-body">
              Create an assistant account that can help you manage patient basics and visits.
            </p>
            <form
              onSubmit={handleCreateAssistant}
              className="login-form"
              style={{ marginTop: 12 }}
            >
              <TextField
                id="assistant-name"
                label="Full name"
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
              <TextField
                id="assistant-email"
                label="Email"
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
              />
              <TextField
                id="assistant-phone"
                label="WhatsApp number"
                type="tel"
                placeholder="+91 98765 43210"
                value={cPhoneDigits}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setCPhoneDigits(onlyDigits)
                }}
              />
              <TextField
                id="assistant-password"
                label="Temporary password"
                type="password"
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
                canTogglePassword
              />

              {cError && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                  {cError}
                </p>
              )}
              {cSuccess && (
                <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                  {cSuccess}
                </p>
              )}

              <div className="dialog-actions">
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => setShowAddAssistant(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="ui-button ui-button-primary"
                  disabled={cLoading}
                >
                  {cLoading ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddLabAssistant && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">Add lab assistant</h2>
            <p className="dialog-body">
              Create a lab assistant account. They can search patients by mobile
              and add diagnostic tests for visits.
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
              <TextField
                id="lab-phone"
                label="WhatsApp number"
                type="tel"
                placeholder="+91 98765 43210"
                value={labPhoneDigits}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setLabPhoneDigits(onlyDigits)
                }}
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

