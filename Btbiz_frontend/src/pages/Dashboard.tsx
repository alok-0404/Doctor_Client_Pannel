import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import {
  authService,
  notificationService,
  appointmentService,
  type AssistantSummary,
  type DoctorNotificationItem,
  type DoctorAppointmentItem,
} from '../services/api'
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

  const [todayAppointments, setTodayAppointments] = useState<DoctorAppointmentItem[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(false)
  const [upcomingAppointments, setUpcomingAppointments] = useState<DoctorAppointmentItem[]>([])
  const [upcomingAppointmentsLoading, setUpcomingAppointmentsLoading] = useState(false)

  const [availabilityStatus, setAvailabilityStatus] = useState<'available' | 'unavailable' | 'busy'>('available')
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false)
  const [unavailableReason, setUnavailableReason] = useState('')
  const [unavailableDuration, setUnavailableDuration] = useState<string>('') // '0.5' | '1' | '2' | '3' | '4' | 'custom'
  const [unavailableUntilCustom, setUnavailableUntilCustom] = useState('') // for custom: datetime-local string
  const [unavailableUntil, setUnavailableUntil] = useState<string | null>(null) // from API, to show "Until ..."
  const [availabilityUpdateSuccess, setAvailabilityUpdateSuccess] = useState<string | null>(null)
  const [availabilityUpdateError, setAvailabilityUpdateError] = useState<string | null>(null)

  const [clinicLatitude, setClinicLatitude] = useState<string>('')
  const [clinicLongitude, setClinicLongitude] = useState<string>('')
  const [clinicAddress, setClinicAddress] = useState<string>('')
  const [clinicAutoDetecting, setClinicAutoDetecting] = useState(false)
  const [clinicSaveSuccess, setClinicSaveSuccess] = useState<string | null>(null)
  const [clinicSaveError, setClinicSaveError] = useState<string | null>(null)
  const clinicAutoAttemptedRef = useRef(false)

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

  const loadTodayAppointments = async () => {
    try {
      setAppointmentsLoading(true)
      const list = await appointmentService.getTodayAppointments()
      setTodayAppointments(list)
    } catch {
      // ignore for now
    } finally {
      setAppointmentsLoading(false)
    }
  }

  const loadUpcomingAppointments = async () => {
    try {
      setUpcomingAppointmentsLoading(true)
      const { appointments } = await appointmentService.getUpcomingAppointments()
      setUpcomingAppointments(appointments)
    } catch {
      // ignore
    } finally {
      setUpcomingAppointmentsLoading(false)
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

  const loadProfileAvailability = async () => {
    if (authStorage.getRole() !== 'DOCTOR') return
    setAvailabilityLoading(true)
    try {
      const { doctor } = await authService.getProfile()
      if (doctor.availabilityStatus) setAvailabilityStatus(doctor.availabilityStatus as 'available' | 'unavailable' | 'busy')
      if (doctor.unavailableReason) setUnavailableReason(doctor.unavailableReason)
      if (doctor.unavailableUntil) setUnavailableUntil(doctor.unavailableUntil)
      else setUnavailableUntil(null)

      setClinicLatitude(doctor.clinicLatitude != null ? String(doctor.clinicLatitude) : '')
      setClinicLongitude(doctor.clinicLongitude != null ? String(doctor.clinicLongitude) : '')
      setClinicAddress(doctor.clinicAddress ?? '')
    } catch {
      // ignore
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const getUnavailableUntilISO = (): string | undefined => {
    if (availabilityStatus === 'available') return undefined
    if (unavailableDuration === 'custom' && unavailableUntilCustom) {
      const d = new Date(unavailableUntilCustom)
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
    }
    const hours = parseFloat(unavailableDuration)
    if (Number.isNaN(hours) || hours <= 0) return undefined
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  }

  const handleSetAvailability = async (status: 'available' | 'unavailable' | 'busy') => {
    setAvailabilityUpdateSuccess(null)
    setAvailabilityUpdateError(null)
    setAvailabilityUpdating(true)
    try {
      const until = status !== 'available' ? getUnavailableUntilISO() : undefined
      const res = await authService.updateDoctorAvailability({
        availabilityStatus: status,
        unavailableReason: status !== 'available' ? unavailableReason : undefined,
        unavailableUntil: until,
      })
      setAvailabilityStatus(status)
      if (status === 'available') {
        setUnavailableUntil(null)
      } else if (res.unavailableUntil) {
        setUnavailableUntil(res.unavailableUntil)
      } else {
        setUnavailableUntil(null)
      }
      setAvailabilityUpdateSuccess(status === 'available' ? 'You are now available.' : 'Reason and time period saved.')
      setTimeout(() => setAvailabilityUpdateSuccess(null), 4000)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to save. Please try again.'
      setAvailabilityUpdateError(msg)
    } finally {
      setAvailabilityUpdating(false)
    }
  }

  useEffect(() => {
    void loadAssistants()
    void loadLabAssistants()
    void loadNotifications()
    void loadTodayAppointments()
    void loadUpcomingAppointments()
    void loadProfileAvailability()
  }, [])

  // Auto-detect clinic location (no manual typing).
  useEffect(() => {
    if (authStorage.getRole() !== 'DOCTOR') return
    if (clinicAutoAttemptedRef.current) return
    // Only auto-run when clinic lat/lng are missing.
    if (clinicLatitude.trim() || clinicLongitude.trim()) return

    clinicAutoAttemptedRef.current = true
    if (!navigator.geolocation) return

    setClinicAutoDetecting(true)
    setClinicSaveError(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latNum = pos.coords.latitude
        const lngNum = pos.coords.longitude
        setClinicLatitude(String(latNum))
        setClinicLongitude(String(lngNum))
        try {
          await authService.updateDoctorClinic({
            clinicLatitude: latNum,
            clinicLongitude: lngNum,
            clinicAddress: undefined,
          })
          setClinicSaveSuccess('Clinic location updated automatically.')
        } catch {
          setClinicSaveError('Failed to auto-detect clinic location.')
        } finally {
          setClinicAutoDetecting(false)
        }
      },
      () => {
        setClinicAutoDetecting(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [clinicLatitude, clinicLongitude])

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
  const referralNotifications = pendingNotifications.filter(
    (n) => n.source === 'ASSISTANT_REFERRAL' || !n.source
  )
  const handleNotificationClick = async (n: DoctorNotificationItem) => {
    if (n.status !== 'read') {
      try {
        await notificationService.updateNotificationStatus(n.id, 'read')
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'read' as const } : x)))
      } catch {
        // ignore
      }
    }
    navigate(`/patient/${n.patientId}`)
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

          <div style={{ marginTop: 16 }}>
            <Card className="dashboard-overview-card">
              <p className="dashboard-kicker">Today's appointments</p>
              {appointmentsLoading ? (
                <p className="dashboard-body" style={{ marginTop: 8 }}>
                  Loading appointments…
                </p>
              ) : (
                <>
                  {todayAppointments.length === 0 && (
                    <p className="dashboard-body" style={{ marginTop: 8 }}>
                      No appointments scheduled for today.
                    </p>
                  )}
                  {todayAppointments.length > 0 && (
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
                      {todayAppointments.map((a) => (
                        <li
                          key={a.id}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 10,
                            backgroundColor: '#f5f9fc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            fontSize: 13,
                          }}
                        >
                          <div>
                            <strong>{a.patientName}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <span style={{ color: '#607d8b' }}>
                                {a.reason || 'Appointment'}
                              </span>
                              {a.source === 'WHATSAPP' && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                    padding: '2px 6px',
                                    borderRadius: 999,
                                    backgroundColor: '#e0f2f1',
                                    color: '#00695c',
                                    border: '1px solid #80cbc4',
                                  }}
                                >
                                  WhatsApp
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', color: '#9fb3c8', fontSize: 12 }}>
                            {new Date(a.visitDate).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>
          </div>

          <div style={{ marginTop: 16 }}>
            <Card className="dashboard-overview-card">
              <p className="dashboard-kicker">Upcoming appointments</p>
              <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 8, fontSize: 13, color: '#627d98' }}>
                Appointments booked for future dates (after today).
              </p>
              {upcomingAppointmentsLoading ? (
                <p className="dashboard-body" style={{ marginTop: 8 }}>
                  Loading…
                </p>
              ) : (
                <>
                  {upcomingAppointments.length === 0 && (
                    <p className="dashboard-body" style={{ marginTop: 8 }}>
                      No upcoming appointments.
                    </p>
                  )}
                  {upcomingAppointments.length > 0 && (
                    <>
                      <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                        {upcomingAppointments.length} appointment{upcomingAppointments.length !== 1 ? 's' : ''} scheduled
                      </p>
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          marginTop: 10,
                          marginBottom: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          maxHeight: 280,
                          overflowY: 'auto',
                        }}
                      >
                        {upcomingAppointments.map((a) => (
                          <li
                            key={a.id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              backgroundColor: '#f5f9fc',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                              fontSize: 13,
                              cursor: 'pointer',
                              border: '1px solid transparent',
                            }}
                            onClick={() => navigate(`/patient/${a.patientId}`)}
                            onKeyDown={(e) => e.key === 'Enter' && navigate(`/patient/${a.patientId}`)}
                            role="button"
                            tabIndex={0}
                          >
                            <div>
                              <strong>{a.patientName}</strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <span style={{ color: '#607d8b' }}>
                                  {a.reason || 'Appointment'}
                                </span>
                                {a.source === 'WHATSAPP' && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      textTransform: 'uppercase',
                                      letterSpacing: 0.4,
                                      padding: '2px 6px',
                                      borderRadius: 999,
                                      backgroundColor: '#e0f2f1',
                                      color: '#00695c',
                                      border: '1px solid #80cbc4',
                                    }}
                                  >
                                    WhatsApp
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', color: '#486581', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(a.visitDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </Card>
          </div>

          <div style={{ marginTop: 16 }}>
            <Card className="dashboard-overview-card">
              <p className="dashboard-kicker">Your availability</p>
              <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#627d98' }}>
                Mark yourself unavailable or busy so your assistant can inform patients in real time.
              </p>
              {availabilityLoading ? (
                <p className="dashboard-body" style={{ marginTop: 8 }}>Loading…</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {(['available', 'unavailable', 'busy'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={availabilityUpdating}
                        onClick={() => handleSetAvailability(status)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: availabilityStatus === status ? '2px solid #0d47a1' : '1px solid #e2e8f0',
                          background: availabilityStatus === status
                            ? (status === 'unavailable' ? '#fff3e0' : status === 'busy' ? '#fce4ec' : '#e3f2fd')
                            : '#fff',
                          color: availabilityStatus === status ? '#0d47a1' : '#334155',
                          fontWeight: availabilityStatus === status ? 600 : 400,
                          cursor: availabilityUpdating ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          textTransform: 'capitalize',
                        }}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  {(availabilityStatus === 'unavailable' || availabilityStatus === 'busy') && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 12, color: '#627d98', display: 'block', marginBottom: 4 }}>
                        Reason (optional)
                      </label>
                      <input
                        type="text"
                        value={unavailableReason}
                        onChange={(e) => setUnavailableReason(e.target.value)}
                        placeholder="e.g. For operation, will take 3 hours"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 13,
                          marginBottom: 10,
                        }}
                      />
                      <label style={{ fontSize: 12, color: '#627d98', display: 'block', marginBottom: 4 }}>
                        Unavailable for (time period)
                      </label>
                      <select
                        value={unavailableDuration}
                        onChange={(e) => setUnavailableDuration(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 13,
                          marginBottom: 8,
                        }}
                      >
                        <option value="">Select duration</option>
                        <option value="0.5">30 minutes</option>
                        <option value="1">1 hour</option>
                        <option value="2">2 hours</option>
                        <option value="3">3 hours</option>
                        <option value="4">4 hours</option>
                        <option value="custom">Custom (date & time)</option>
                      </select>
                      {unavailableDuration === 'custom' && (
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 12, color: '#627d98', display: 'block', marginBottom: 4 }}>
                            Available again at
                          </label>
                          <input
                            type="datetime-local"
                            value={unavailableUntilCustom}
                            onChange={(e) => setUnavailableUntilCustom(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                              fontSize: 13,
                            }}
                          />
                        </div>
                      )}
                      {unavailableUntil && (
                        <p style={{ fontSize: 12, color: '#2e7d32', marginTop: 4, marginBottom: 8 }}>
                          Unavailable until: {new Date(unavailableUntil).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      )}
                      {availabilityUpdateSuccess && (
                        <p style={{ fontSize: 12, color: '#2e7d32', marginTop: 4, marginBottom: 4 }}>
                          {availabilityUpdateSuccess}
                        </p>
                      )}
                      {availabilityUpdateError && (
                        <p style={{ fontSize: 12, color: '#c62828', marginTop: 4, marginBottom: 4 }}>
                          {availabilityUpdateError}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={availabilityUpdating}
                        onClick={() => handleSetAvailability(availabilityStatus)}
                        style={{
                          marginTop: 8,
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #0d47a1',
                          background: '#0d47a1',
                          color: '#fff',
                          cursor: availabilityUpdating ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {availabilityUpdating ? 'Saving…' : 'Save reason & time period'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          <div style={{ marginTop: 16 }}>
            <Card className="dashboard-overview-card">
              <p className="dashboard-kicker">Clinic location</p>
              <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#627d98' }}>
                Set your clinic location so patients can see distance, and you can see patient distance on your appointment list.
              </p>

              {clinicLatitude && clinicLongitude ? (
                <div style={{ marginTop: 6 }}>
                  <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 6, fontSize: 13 }}>
                    Clinic location set.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <a
                      href={`https://www.google.com/maps?q=${clinicLatitude},${clinicLongitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#0d47a1', textDecoration: 'underline' }}
                    >
                      Preview on map
                    </a>
                    {clinicAddress && (
                      <span style={{ fontSize: 12, color: '#627d98' }}>{clinicAddress}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>
                    {clinicAutoDetecting ? 'Auto-detecting clinic location…' : 'Auto-detecting clinic location…'}
                  </p>
                </div>
              )}

              {clinicSaveSuccess && (
                <p style={{ fontSize: 12, color: '#2e7d32', marginTop: 8, marginBottom: 0 }}>
                  {clinicSaveSuccess}
                </p>
              )}
              {clinicSaveError && (
                <p style={{ fontSize: 12, color: '#c62828', marginTop: 8, marginBottom: 0 }}>
                  {clinicSaveError}
                </p>
              )}
            </Card>
          </div>

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
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p className="dashboard-body" style={{ margin: 0, fontSize: 12, color: '#627d98' }}>
                      Assistant referrals
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {referralNotifications.length === 0 && (
                        <li>
                          <span style={{ fontSize: 12, color: '#9fb3c8' }}>No referred patients yet.</span>
                        </li>
                      )}
                      {referralNotifications.map((n) => (
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
                          <span style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: n.status === 'unread' ? 600 : 400, display: 'block' }}>
                              {n.status === 'unread' && (
                                <span style={{ marginRight: 6, color: '#0d47a1' }}>●</span>
                              )}
                              {n.patientName}
                            </span>
                            {(n.patientMobile || n.emergencyContactPhone) && (
                              <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#627d98' }}>
                                {n.patientMobile ? `Mobile: ${n.patientMobile}` : ''}
                                {n.patientMobile && n.emergencyContactPhone ? ' · ' : ''}
                                {n.emergencyContactPhone ? `Emergency: ${n.emergencyContactPhone}` : ''}
                              </span>
                            )}
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
                  </div>
                )}
              </Card>
            </div>

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
            onClick={() => { window.location.href = '/search-patients' }}
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

