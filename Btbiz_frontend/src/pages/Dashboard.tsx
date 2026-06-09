import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { EmptyState } from '../components/ui/EmptyState'
import { BellIcon, CalendarIcon, UserIcon } from '../components/ui/icons'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import {
  authService,
  notificationService,
  appointmentService,
  type AssistantSummary,
  type DoctorNotificationItem,
  type DoctorAppointmentItem,
} from '../services/api'
import { authStorage } from '../utils/authStorage'

/** Online / portal / bot bookings — API returns reason & notes, not always source: WHATSAPP. */
function isWhatsappOrOnlineBooking(a: DoctorAppointmentItem): boolean {
  const source = String(a.source ?? '').toUpperCase()
  if (source.includes('WHATSAPP') || source.includes('BOT')) return true

  const reason = String(a.reason ?? '').toUpperCase().replace(/\s+/g, '_')
  if (
    reason === 'NEW_CONSULTATION' ||
    reason === 'REVIEW_APPOINTMENT' ||
    reason === 'NEW_APPOINTMENT' ||
    reason === 'FAMILY_APPOINTMENT'
  ) {
    return true
  }

  const notes = String(a.notes ?? '').toUpperCase()
  return notes.includes('OPD NO:') || notes.includes('PREFERRED TIME:')
}

export const Dashboard = () => {
  const navigate = useNavigate()
  const doctorName = authStorage.getName() ?? 'Doctor'

  const [notifications, setNotifications] = useState<DoctorNotificationItem[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(true)
  const [showAddAssistant, setShowAddAssistant] = useState(false)
  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cCountryCode, setCCountryCode] = useState('+91')
  const [cPhoneDigits, setCPhoneDigits] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cLoading, setCLoading] = useState(false)
  const [cError, setCError] = useState<string | null>(null)
  const [cSuccess, setCSuccess] = useState<string | null>(null)
  const [assistants, setAssistants] = useState<AssistantSummary[]>([])
  const [assistantsOpen, setAssistantsOpen] = useState(false)


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

  const [dailyOnlineLimit, setDailyOnlineLimit] = useState('')
  const [dailyWalkInLimit, setDailyWalkInLimit] = useState('')
  const [limitsSaving, setLimitsSaving] = useState(false)
  const [limitsMsg, setLimitsMsg] = useState<string | null>(null)

  const loadAssistants = async () => {
    try {
      const list = await authService.listAssistants()
      setAssistants(list)
    } catch {
      // ignore list errors in UI for now
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
      if (typeof doctor.dailyOnlineAppointmentLimit === 'number') {
        setDailyOnlineLimit(String(doctor.dailyOnlineAppointmentLimit))
      } else {
        setDailyOnlineLimit('')
      }
      if (typeof doctor.dailyWalkInAppointmentLimit === 'number') {
        setDailyWalkInLimit(String(doctor.dailyWalkInAppointmentLimit))
      } else {
        setDailyWalkInLimit('')
      }
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
      // Only "unavailable" requires a reason and time period. "busy" is a simple status.
      const until = status === 'unavailable' ? getUnavailableUntilISO() : undefined
      const res = await authService.updateDoctorAvailability({
        availabilityStatus: status,
        unavailableReason: status === 'unavailable' ? unavailableReason : undefined,
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
      setAvailabilityUpdateSuccess(
        status === 'available'
          ? 'You are now available.'
          : status === 'unavailable'
            ? 'Reason and time period saved.'
            : 'You are now marked as busy.'
      )
      setTimeout(() => setAvailabilityUpdateSuccess(null), 4000)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to save. Please try again.'
      setAvailabilityUpdateError(msg)
    } finally {
      setAvailabilityUpdating(false)
    }
  }

  const parseDailyLimitInput = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Math.floor(Number(t))
    if (!Number.isFinite(n) || n < 0) throw new Error('invalid')
    return n
  }

  const handleSaveAppointmentLimits = async (e: React.FormEvent) => {
    e.preventDefault()
    setLimitsMsg(null)
    let online: number | null
    let walk: number | null
    try {
      online = parseDailyLimitInput(dailyOnlineLimit)
      walk = parseDailyLimitInput(dailyWalkInLimit)
    } catch {
      setLimitsMsg('Enter whole numbers ≥ 0, or leave blank for unlimited.')
      return
    }
    try {
      setLimitsSaving(true)
      await authService.updateDoctorAppointmentLimits({
        dailyOnlineAppointmentLimit: online,
        dailyWalkInAppointmentLimit: walk,
      })
      setLimitsMsg('Daily limits saved.')
      setTimeout(() => setLimitsMsg(null), 4000)
    } catch (err: any) {
      setLimitsMsg(err?.response?.data?.message ?? 'Failed to save limits.')
    } finally {
      setLimitsSaving(false)
    }
  }

  useEffect(() => {
    void loadAssistants()
    void loadNotifications()
    void loadTodayAppointments()
    void loadUpcomingAppointments()
    void loadProfileAvailability()
  }, [])

  useEffect(() => {
    const onFocus = () => void loadNotifications()
    const onDismissed = () => void loadNotifications()
    const onReferred = () => void loadNotifications()
    window.addEventListener('focus', onFocus)
    window.addEventListener('doctor-notification-dismissed', onDismissed)
    window.addEventListener('doctor-patient-referred', onReferred)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('doctor-notification-dismissed', onDismissed)
      window.removeEventListener('doctor-patient-referred', onReferred)
    }
  }, [])

  // Real-time sync when assistant updates doctor availability
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ availabilityStatus?: string; unavailableReason?: string; unavailableUntil?: string }>).detail
      if (d?.availabilityStatus) setAvailabilityStatus(d.availabilityStatus as 'available' | 'unavailable' | 'busy')
      if (d?.unavailableReason !== undefined) setUnavailableReason(d.unavailableReason ?? '')
      if (d?.unavailableUntil !== undefined) setUnavailableUntil(d.unavailableUntil ?? null)
    }
    window.addEventListener('doctor-availability-changed', handler)
    return () => window.removeEventListener('doctor-availability-changed', handler)
  }, [])

  const pendingNotifications = notifications.filter((n) => n.status === 'unread' || n.status === 'dismissed')
  /** Include assistant referrals and online/family bookings so the doctor opens the same patient as the visit. */
  const referralNotifications = pendingNotifications
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

    if (cPhoneDigits.length < 6) {
      setCError('Please enter a valid mobile number.')
      return
    }

    try {
      setCLoading(true)
      const normalizedPhone = `${cCountryCode}${cPhoneDigits}`
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


  return (
    <>
      <AppLayout
        showSidebar
        header={(
          <Header
            doctorName={doctorName}
            onAddAssistantClick={() => {
              setShowAddAssistant(true)
              setCError(null)
              setCSuccess(null)
            }}
          />
        )}
        breadcrumb={(
          <Breadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Doctor Dashboard' },
            ]}
          />
        )}
      >
        <main className="dashboard-main doctor-dashboard-main">
          <div className="doctor-dashboard-shell">
            <PageHeader
              className="doctor-dashboard-page-header"
              title="Doctor Dashboard"
              subtitle={`Good day, ${doctorName}. Review appointments, availability, and patient alerts in one place.`}
            />

          <div className="doctor-dashboard-stats">
            <StatCard
              title="Today's appointments"
              value={appointmentsLoading ? <Skeleton width={48} height={30} /> : todayAppointments.length}
            />
            <StatCard
              title="Assistants"
              value={assistants.length}
            />
            <StatCard
              title="Upcoming"
              value={upcomingAppointmentsLoading ? <Skeleton width={40} height={30} /> : upcomingAppointments.length}
            />
            <StatCard
              title="New notifications"
              value={pendingNotifications.filter((n) => n.status === 'unread').length}
              trend={{
                label: `${referralNotifications.length} total alerts`,
                direction: 'neutral',
              }}
            />
          </div>

          <div className="doctor-dashboard-content">
        <section className="dashboard-left">
          <Card className="dashboard-overview-card doctor-dashboard-overview-card">
            <p className="dashboard-kicker">
              Overview
            </p>
            <h2 className="dashboard-heading">
              Clinical workspace
            </h2>
            <p className="dashboard-body">
              This panel is designed for calm clinical work. Quickly move between
              patients, review medications, and check investigations without visual
              noise or distractions.
            </p>
          </Card>

          <div className="doctor-dashboard-section-spacer">
            <Card className="dashboard-overview-card doctor-dashboard-section-card">
              <p className="dashboard-kicker">Today's appointments</p>
              {appointmentsLoading ? (
                <div className="doctor-dashboard-skeleton-stack" aria-busy="true" aria-label="Loading appointments">
                  <Skeleton lines={3} />
                  <Skeleton variant="rect" height={56} />
                  <Skeleton variant="rect" height={56} />
                </div>
              ) : (
                <>
                  {todayAppointments.length === 0 && (
                    <EmptyState
                      className="doctor-dashboard-empty-state"
                      icon={<CalendarIcon size={22} />}
                      title="No appointments today"
                      message="When patients are booked for today, they will appear here."
                    />
                  )}
                  {todayAppointments.length > 0 && (
                    <ul
                      className={
                        todayAppointments.length > 5
                          ? 'doctor-dashboard-appointment-list doctor-dashboard-appointment-list--scroll'
                          : 'doctor-dashboard-appointment-list'
                      }
                    >
                      {todayAppointments.map((a) => (
                        <li key={a.id} className="doctor-dashboard-appointment-item">
                          <div>
                            <strong>{a.patientName}</strong>
                            <div className="doctor-dashboard-appointment-meta">
                              <span className="doctor-dashboard-appointment-reason">
                                {a.reason || 'Appointment'}
                              </span>
                              {isWhatsappOrOnlineBooking(a) && (
                                <span className="doctor-dashboard-badge doctor-dashboard-badge--whatsapp">
                                  WhatsApp
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="doctor-dashboard-appointment-time">
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

          <div className="doctor-dashboard-section-spacer">
            <Card className="dashboard-overview-card doctor-dashboard-section-card">
              <p className="dashboard-kicker">Upcoming appointments</p>
              <p className="dashboard-body doctor-dashboard-section-hint">
                Appointments booked for future dates (after today).
              </p>
              {upcomingAppointmentsLoading ? (
                <div className="doctor-dashboard-skeleton-stack" aria-busy="true" aria-label="Loading upcoming appointments">
                  <Skeleton lines={2} />
                  <Skeleton variant="rect" height={56} />
                  <Skeleton variant="rect" height={56} />
                </div>
              ) : (
                <>
                  {upcomingAppointments.length === 0 && (
                    <EmptyState
                      className="doctor-dashboard-empty-state"
                      icon={<CalendarIcon size={22} />}
                      title="No upcoming appointments"
                      message="Future bookings will show up in this list."
                    />
                  )}
                  {upcomingAppointments.length > 0 && (
                    <>
                      <p className="dashboard-body doctor-dashboard-section-count">
                        {upcomingAppointments.length} appointment{upcomingAppointments.length !== 1 ? 's' : ''} scheduled
                      </p>
                      <ul
                        className={
                          upcomingAppointments.length > 5
                            ? 'doctor-dashboard-appointment-list doctor-dashboard-appointment-list--scroll'
                            : 'doctor-dashboard-appointment-list'
                        }
                      >
                        {upcomingAppointments.map((a) => (
                          <li
                            key={a.id}
                            className="doctor-dashboard-appointment-item doctor-dashboard-appointment-item--clickable"
                            onClick={() => navigate(`/patient/${a.patientId}`)}
                            onKeyDown={(e) => e.key === 'Enter' && navigate(`/patient/${a.patientId}`)}
                            role="button"
                            tabIndex={0}
                          >
                            <div>
                              <strong>{a.patientName}</strong>
                              <div className="doctor-dashboard-appointment-meta">
                                <span className="doctor-dashboard-appointment-reason">
                                  {a.reason || 'Appointment'}
                                </span>
                                {isWhatsappOrOnlineBooking(a) && (
                                  <span className="doctor-dashboard-badge doctor-dashboard-badge--whatsapp">
                                    WhatsApp
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="doctor-dashboard-appointment-datetime">
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

          <div className="doctor-dashboard-section-spacer">
            <Card className="dashboard-overview-card doctor-dashboard-section-card doctor-dashboard-availability-card">
              <p className="dashboard-kicker">Your availability</p>
              <p className="dashboard-body doctor-dashboard-section-hint">
                Mark yourself unavailable or busy so your assistant can inform patients in real time.
              </p>
              {availabilityLoading ? (
                <div className="doctor-dashboard-skeleton-stack" aria-busy="true" aria-label="Loading availability">
                  <Skeleton lines={2} />
                  <div className="doctor-dashboard-skeleton-row">
                    <Skeleton variant="rect" height={36} />
                    <Skeleton variant="rect" height={36} />
                    <Skeleton variant="rect" height={36} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="doctor-dashboard-availability-actions">
                    {(['available', 'unavailable', 'busy'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={availabilityUpdating}
                        onClick={() => handleSetAvailability(status)}
                        className={`doctor-dashboard-availability-btn doctor-dashboard-availability-btn--${status}${
                          availabilityStatus === status ? ' doctor-dashboard-availability-btn--selected' : ''
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  {availabilityStatus === 'unavailable' && (
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

          <div className="doctor-dashboard-section-spacer">
            <Card className="dashboard-overview-card doctor-dashboard-section-card doctor-dashboard-notifications-card">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((o) => !o)}
                  className="doctor-dashboard-collapsible-header"
                >
                  <div className="doctor-dashboard-collapsible-title">
                    <p className="dashboard-kicker">New patient notifications</p>
                    <span className="doctor-dashboard-collapsible-meta">
                      {pendingNotifications.filter((n) => n.status === 'unread').length} new
                      {pendingNotifications.filter((n) => n.status === 'dismissed').length > 0 &&
                        ` · ${pendingNotifications.filter((n) => n.status === 'dismissed').length} dismissed`}
                    </span>
                  </div>
                  <span
                    className={`doctor-dashboard-collapsible-chevron${
                      notificationsOpen ? ' doctor-dashboard-collapsible-chevron--open' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {notificationsOpen && (
                  <div className="doctor-dashboard-collapsible-body">
                    <p className="dashboard-body doctor-dashboard-section-hint doctor-dashboard-section-hint--flush">
                      Referrals &amp; appointment alerts
                    </p>
                    <ul
                      className={
                        referralNotifications.length > 5
                          ? 'doctor-dashboard-notification-list doctor-dashboard-notification-list--scroll'
                          : 'doctor-dashboard-notification-list'
                      }
                    >
                      {referralNotifications.length === 0 && (
                        <li className="doctor-dashboard-empty-list-item">
                          <EmptyState
                            className="doctor-dashboard-empty-state"
                            icon={<BellIcon size={22} />}
                            title="No patient alerts"
                            message="Referrals and new notifications will appear here."
                          />
                        </li>
                      )}
                      {referralNotifications.map((n) => (
                        <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`doctor-dashboard-notification-item${
                            n.status === 'unread' ? ' doctor-dashboard-notification-item--unread' : ''
                          }`}
                        >
                          <span className="doctor-dashboard-notification-copy">
                            <span className={`doctor-dashboard-notification-name${
                              n.status === 'unread' ? ' doctor-dashboard-notification-name--unread' : ''
                            }`}>
                              {n.status === 'unread' && (
                                <span className="doctor-dashboard-notification-dot">●</span>
                              )}
                              {n.patientName}
                            </span>
                            {(n.patientMobile || n.emergencyContactPhone) && (
                              <span className="doctor-dashboard-notification-sub">
                                {n.patientMobile ? `Mobile: ${n.patientMobile}` : ''}
                                {n.patientMobile && n.emergencyContactPhone ? ' · ' : ''}
                                {n.emergencyContactPhone ? `Emergency: ${n.emergencyContactPhone}` : ''}
                              </span>
                            )}
                          </span>
                          <span className="doctor-dashboard-notification-time">
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

          <div className="doctor-dashboard-section-spacer doctor-dashboard-section-spacer--tight">
            <Card className="dashboard-overview-card doctor-dashboard-section-card doctor-dashboard-assistants-card">
            <button
              type="button"
              onClick={() => setAssistantsOpen((o) => !o)}
              className="doctor-dashboard-collapsible-header"
            >
              <p className="dashboard-kicker">
                Assistants
              </p>
              <span
                className={`doctor-dashboard-collapsible-chevron${
                  assistantsOpen ? ' doctor-dashboard-collapsible-chevron--open' : ''
                }`}
              >
                ▾
              </span>
            </button>

              {assistantsOpen && (
                <div className="doctor-dashboard-collapsible-body">
                  {assistants.length === 0 && (
                    <EmptyState
                      className="doctor-dashboard-empty-state"
                      icon={<UserIcon size={22} />}
                      title="No assistants yet"
                      message="Use Add assistant in the header to create staff logins."
                    />
                  )}
                  {assistants.length > 0 && (
                    <ul
                      className={
                        assistants.length > 5
                          ? 'doctor-dashboard-assistant-list doctor-dashboard-assistant-list--scroll'
                          : 'doctor-dashboard-assistant-list'
                      }
                    >
                      {assistants.map((c) => (
                        <li key={c.id} className="doctor-dashboard-assistant-item">
                          <div>
                            <strong>{c.name}</strong>
                            <div className="doctor-dashboard-assistant-phone">{c.phone}</div>
                          </div>
                          <div className="doctor-dashboard-assistant-meta">
                            <div>Created by</div>
                            <div>
                              {c.createdBy ? c.createdBy.name : '—'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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

        <div className="dashboard-sidebar doctor-dashboard-sidebar">
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
          {authStorage.getRole() === 'DOCTOR' && (
            <Card className="dashboard-overview-card dashboard-daily-caps-card">
              <p className="dashboard-kicker">Daily caps (IST)</p>
              <p className="dashboard-daily-caps-hint">
                Online portal vs walk-in limits per day. Leave blank for unlimited.
              </p>
              <form onSubmit={handleSaveAppointmentLimits} className="dashboard-daily-caps-form">
                <label className="dashboard-daily-caps-label">
                  Online / day
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={dailyOnlineLimit}
                    onChange={(e) => setDailyOnlineLimit(e.target.value)}
                    placeholder="e.g. 25"
                    className="dashboard-daily-caps-input"
                  />
                </label>
                <label className="dashboard-daily-caps-label">
                  Walk-in / day
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={dailyWalkInLimit}
                    onChange={(e) => setDailyWalkInLimit(e.target.value)}
                    placeholder="e.g. 20"
                    className="dashboard-daily-caps-input"
                  />
                </label>
                <button
                  type="submit"
                  disabled={limitsSaving}
                  className="ui-button ui-button-primary dashboard-daily-caps-save"
                >
                  {limitsSaving ? 'Saving…' : 'Save limits'}
                </button>
                {limitsMsg && (
                  <p
                    className={`dashboard-daily-caps-msg ${limitsMsg.startsWith('Daily') ? 'dashboard-daily-caps-msg--ok' : 'dashboard-daily-caps-msg--err'}`}
                  >
                    {limitsMsg}
                  </p>
                )}
              </form>
            </Card>
          )}
        </div>
          </div>
        </div>
        </main>
      </AppLayout>

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
              <CountryCodePhoneInput
                id="assistant-phone"
                label="WhatsApp number"
                countryCode={cCountryCode}
                onCountryCodeChange={setCCountryCode}
                phoneDigits={cPhoneDigits}
                onPhoneDigitsChange={setCPhoneDigits}
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

    </>
  )
}

