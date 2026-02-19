import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicAppointmentService, type PatientSummary } from '../services/api'

type Mode = 'none' | 'old' | 'new'
type Step = 'details' | 'payment' | 'confirm'

const CONSULTATION_TYPES = ['New Consultation', 'Review Appointment']
const GENDERS = ['MALE', 'FEMALE', 'OTHER']
const TIME_SLOTS = [
  '10:00 - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 - 1:00 PM',
  '1:00 - 2:00 PM',
  '2:00 - 3:00 PM',
]

export const BookAppointment = () => {
  const [mode, setMode] = useState<Mode>('none')
  const [step, setStep] = useState<Step>('details')

  const [consultants, setConsultants] = useState<Array<{ id: string; name: string }>>([])
  const [loadingConsultants, setLoadingConsultants] = useState(false)

  // Old patient state
  const [oldMobile, setOldMobile] = useState('')
  const [oldPatient, setOldPatient] = useState<PatientSummary | null>(null)
  const [oldConsultationType, setOldConsultationType] = useState(CONSULTATION_TYPES[0])
  const [oldConsultantId, setOldConsultantId] = useState('')
  const [oldOpdNo, setOldOpdNo] = useState('')
  const [oldName, setOldName] = useState('')
  const [oldGender, setOldGender] = useState<string>('')
  const [oldAddress, setOldAddress] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [preferredSlot, setPreferredSlot] = useState('')

  // New patient state
  const [newConsultantId, setNewConsultantId] = useState('')
  const [newName, setNewName] = useState('')
  const [newAge, setNewAge] = useState('')
  const [newGender, setNewGender] = useState<string>('')
  const [newMobile, setNewMobile] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newAddress, setNewAddress] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | null>(null)

  useEffect(() => {
    setLoadingConsultants(true)
    void publicAppointmentService
      .listConsultants()
      .then((list) => {
        setConsultants(list)
        if (list.length > 0) {
          setOldConsultantId((prev) => prev || list[0].id)
          setNewConsultantId((prev) => prev || list[0].id)
        }
      })
      .catch(() => {
        setError('Unable to load consultants. Please try again later.')
      })
      .finally(() => {
        setLoadingConsultants(false)
      })
  }, [])

  const resetState = () => {
    setStep('details')
    setError(null)
    setAppointmentId(null)
  }

  const selectOld = () => {
    setMode('old')
    resetState()
  }

  const selectNew = () => {
    setMode('new')
    resetState()
  }

  const handleFetchOldPatient = async () => {
    setError(null)
    setOldPatient(null)
    if (!oldMobile || oldMobile.trim().length < 8) {
      return
    }
    try {
      const p = await publicAppointmentService.findPatientByMobile(oldMobile.trim())
      if (!p) {
        setError('No patient found with this mobile number.')
        return
      }
      setOldPatient(p)
      setOldName(`${p.firstName} ${p.lastName ?? ''}`.trim())
      setOldGender(p.gender ?? '')
      setOldAddress(p.address ?? '')
    } catch {
      setError('Failed to fetch patient details. Please try again.')
    }
  }

  const goToPayment = () => {
    setError(null)
    if (!appointmentDate) {
      setError('Please select appointment date.')
      return
    }
    if (mode === 'old') {
      if (!oldMobile || !oldConsultationType || !oldConsultantId || !oldOpdNo) {
        setError('Please fill all mandatory fields.')
        return
      }
    } else if (mode === 'new') {
      if (!newConsultantId || !newName || !newGender || !newMobile) {
        setError('Please fill all mandatory fields.')
        return
      }
    }
    setStep('payment')
  }

  const handleConfirmAndPay = async () => {
    setSubmitting(true)
    setError(null)
    try {
      let res: { appointmentId: string; patientId: string }
      if (mode === 'old') {
        res = await publicAppointmentService.bookOldPatientAppointment({
          mobileNumber: oldMobile.trim(),
          consultationType: oldConsultationType,
          consultantId: oldConsultantId,
          opdNumber: oldOpdNo,
          appointmentDate,
          preferredSlot: preferredSlot || undefined,
          patientName: oldName || undefined,
          gender: oldGender || undefined,
          address: oldAddress || undefined,
        })
      } else {
        res = await publicAppointmentService.bookNewPatientAppointment({
          consultantId: newConsultantId,
          patientName: newName,
          age: newAge ? Number(newAge) : undefined,
          gender: newGender,
          mobileNumber: newMobile.trim(),
          city: newCity || undefined,
          address: newAddress || undefined,
          appointmentDate,
          preferredSlot: preferredSlot || undefined,
        })
      }
      setAppointmentId(res.appointmentId)
      setStep('confirm')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to confirm appointment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const renderModeChooser = () => (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
      <button type="button" className="public-cta" onClick={selectOld}>
        Old Patient
      </button>
      <button type="button" className="public-cta" onClick={selectNew}>
        New Patient
      </button>
    </div>
  )

  const renderOldForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>Old Patient Appointment</h2>
      <div className="appt-field">
        <label>Mobile No *</label>
        <input
          type="tel"
          value={oldMobile}
          onChange={(e) => setOldMobile(e.target.value)}
          onBlur={handleFetchOldPatient}
          placeholder="Enter registered mobile number"
        />
      </div>
      {oldPatient && (
        <div className="appt-summary">
          <div className="appt-field">
            <label>Patient Name</label>
            <div className="appt-readonly-value">
              {oldName || '—'}
            </div>
          </div>
          <div className="appt-two-cols">
            <div className="appt-field">
              <label>Gender</label>
              <div className="appt-readonly-value">
                {oldGender || '—'}
              </div>
            </div>
            <div className="appt-field">
              <label>Address</label>
              <div className="appt-readonly-value">
                {oldAddress || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="appt-field">
        <label>Consultation Type *</label>
        <select value={oldConsultationType} onChange={(e) => setOldConsultationType(e.target.value)}>
          {CONSULTATION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Name of Consultant *</label>
          <select
            value={oldConsultantId}
            onChange={(e) => setOldConsultantId(e.target.value)}
            disabled={loadingConsultants}
          >
            {consultants.length === 0 && <option value="">Loading…</option>}
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="appt-field">
          <label>Patient OPD No *</label>
          <input
            type="text"
            value={oldOpdNo}
            onChange={(e) => setOldOpdNo(e.target.value)}
          />
        </div>
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Appointment Date *</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="appt-field">
          <label>Preferred time (approx)</label>
          <select value={preferredSlot} onChange={(e) => setPreferredSlot(e.target.value)}>
            <option value="">Select slot</option>
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="appt-timing-msg">
        You may come anytime between <strong>10 AM and 3 PM</strong>.
      </p>
      <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
        Next
      </button>
    </div>
  )

  const renderNewForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>New Patient Appointment</h2>
      <div className="appt-field">
        <label>Name of Consultant for Appointment *</label>
        <select
          value={newConsultantId}
          onChange={(e) => setNewConsultantId(e.target.value)}
          disabled={loadingConsultants}
        >
          {consultants.length === 0 && <option value="">Loading…</option>}
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="appt-field">
        <label>Name of the Patient *</label>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Age</label>
          <input
            type="number"
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
          />
        </div>
        <div className="appt-field">
          <label>Gender *</label>
          <select value={newGender} onChange={(e) => setNewGender(e.target.value)}>
            <option value="">Select Gender</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="appt-field">
        <label>Mobile No *</label>
        <input
          type="tel"
          value={newMobile}
          onChange={(e) => setNewMobile(e.target.value)}
        />
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>City Name</label>
          <input
            type="text"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
          />
        </div>
        <div className="appt-field">
          <label>Address</label>
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
        </div>
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Appointment Date *</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="appt-field">
          <label>Preferred time (approx)</label>
          <select value={preferredSlot} onChange={(e) => setPreferredSlot(e.target.value)}>
            <option value="">Select slot</option>
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="appt-timing-msg">
        You may come anytime between <strong>10 AM and 3 PM</strong>.
      </p>
      <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
        Next
      </button>
    </div>
  )

  const renderPayment = () => (
    <div className="appt-card" style={{ textAlign: 'center' }}>
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>Payment</h2>
      <p className="public-section-text" style={{ marginBottom: 16 }}>
        Consultation fee: <strong>₹500</strong>
      </p>
      <p className="public-section-text" style={{ marginBottom: 24 }}>
        (Demo: Clicking the button below will mark the appointment as paid and confirm it in the system.)
      </p>
      <button
        type="button"
        className="public-cta"
        onClick={handleConfirmAndPay}
        disabled={submitting}
      >
        {submitting ? 'Processing…' : 'Pay ₹500 & Confirm Appointment'}
      </button>
    </div>
  )

  const renderConfirm = () => (
    <div className="appt-card" style={{ textAlign: 'center' }}>
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>Appointment Confirmed</h2>
      <p className="public-section-text" style={{ marginBottom: 12 }}>
        Thank you. Your appointment has been booked.
      </p>
      {appointmentId && (
        <p className="public-section-text" style={{ marginBottom: 12 }}>
          Appointment ID: <strong>{appointmentId}</strong>
        </p>
      )}
      <p className="public-section-text" style={{ marginBottom: 24 }}>
        You will be contacted by the clinic if any changes are required.
      </p>
      <Link to="/" className="public-cta">
        Back to Home
      </Link>
    </div>
  )

  return (
    <div className="public-home">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo">MEDIGRAPH</Link>
          <nav className="public-nav" aria-label="Main">
            <Link to="/" className="public-nav-link">Home</Link>
            <Link to="/book-appointment" className="public-nav-link">Book Appointment</Link>
          </nav>
        </div>
      </header>
      <main className="public-main" style={{ paddingTop: 32 }}>
        <h1 className="public-section-title">Book Appointment</h1>
        <p className="public-section-text" style={{ marginBottom: 20 }}>
          Please choose whether you are an old patient or a new patient.
        </p>
        {step === 'details' && mode === 'none' && renderModeChooser()}
        {error && (
          <p style={{ color: '#b91c1c', marginBottom: 16, fontSize: '0.9rem' }}>
            {error}
          </p>
        )}
        {step === 'details' && mode === 'old' && renderOldForm()}
        {step === 'details' && mode === 'new' && renderNewForm()}
        {step === 'payment' && renderPayment()}
        {step === 'confirm' && renderConfirm()}
        {step !== 'confirm' && (
          <p style={{ marginTop: 24, fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>
            <Link to="/">Back to Home</Link>
          </p>
        )}
      </main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <p className="public-footer-copy">© {new Date().getFullYear()} MEDIGRAPH. All rights reserved.</p>
        </div>
      </footer>
      <style>{`
        .public-home { min-height: 100vh; display: flex; flex-direction: column; background: #f8fafc; color: #0f172a; }
        .public-header { background: #fff; border-bottom: 1px solid #e2e8f0; }
        .public-header-inner { max-width: 1100px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .public-logo { font-size: 1.35rem; font-weight: 700; color: #0f172a; text-decoration: none; }
        .public-logo:hover { color: #1e40af; }
        .public-nav { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
        .public-nav-link { padding: 8px 12px; color: #475569; text-decoration: none; font-size: 0.95rem; border-radius: 8px; }
        .public-nav-link:hover { color: #0f172a; background: #f1f5f9; }
        .public-main { flex: 1; max-width: 800px; margin: 0 auto; padding: 40px 20px 60px; width: 100%; }
        .public-section-title { font-size: 1.35rem; font-weight: 600; margin: 0 0 12px; color: #0f172a; }
        .public-section-text { font-size: 1rem; color: #475569; margin: 0; line-height: 1.6; }
        .public-cta { display: inline-block; padding: 10px 22px; background: #1e40af; color: #fff; font-weight: 600; border-radius: 10px; text-decoration: none; border: none; cursor: pointer; }
        .public-cta:hover { background: #1e3a8a; }
        .appt-card { background: #ffffff; border-radius: 16px; padding: 20px 18px 22px; border: 1px solid #e2e8f0; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); margin-bottom: 24px; }
        .appt-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .appt-field label { font-size: 0.9rem; color: #475569; }
        .appt-field input, .appt-field select { padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.95rem; }
        .appt-two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 640px) { .appt-two-cols { grid-template-columns: 1fr; } }
        .appt-readonly-value { padding: 8px 10px; border-radius: 8px; background: #f1f5f9; font-size: 0.95rem; color: #111827; }
        .appt-timing-msg { font-size: 0.9rem; color: #475569; margin: 12px 0 0; padding: 10px 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
        .public-footer { margin-top: auto; background: #0f172a; color: #94a3b8; padding: 28px 20px; }
        .public-footer-inner { max-width: 1100px; margin: 0 auto; text-align: center; }
        .public-footer-copy { font-size: 0.875rem; margin: 0; color: #64748b; }
      `}</style>
    </div>
  )
}

