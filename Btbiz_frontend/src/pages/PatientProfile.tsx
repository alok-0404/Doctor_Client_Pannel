import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  patientPortalService,
  type FullPatientHistory,
  type DiagnosticTestItem,
} from '../services/api'
import { patientStorage } from '../utils/patientStorage'

function formatDate(d: string | Date | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(d: string | Date | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTestPaymentLabel(
  paymentMode: 'ONLINE' | 'OFFLINE' | undefined,
  serviceType: 'LAB_VISIT' | 'HOME_SERVICE' | undefined
): string {
  if (paymentMode === 'ONLINE') return 'Pay online'
  if (serviceType === 'HOME_SERVICE') return 'Cash on service'
  return 'Pay at lab (offline)'
}

function formatMedicinePaymentLabel(
  paymentMode: 'ONLINE' | 'OFFLINE' | undefined,
  serviceType: 'PICKUP' | 'HOME_DELIVERY' | undefined
): string {
  if (serviceType === 'HOME_DELIVERY') return 'Pay online'
  if (paymentMode === 'ONLINE') return 'Pay online'
  return 'Pay at medical (offline)'
}

export const PatientProfile = () => {
  const [data, setData] = useState<FullPatientHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [addingMedicine, setAddingMedicine] = useState(false)
  const [addingTest, setAddingTest] = useState(false)
  const [addMedicineName, setAddMedicineName] = useState('')
  const [addMedicineDosage, setAddMedicineDosage] = useState('')
  const [addMedicineNotes, setAddMedicineNotes] = useState('')
  const [addMedicineServiceType, setAddMedicineServiceType] = useState<'PICKUP' | 'HOME_DELIVERY'>('PICKUP')
  const [addMedicinePaymentMode, setAddMedicinePaymentMode] = useState<'ONLINE' | 'OFFLINE'>('OFFLINE')
  const [addMedicineEtaMinutes, setAddMedicineEtaMinutes] = useState('')
  const [addTestName, setAddTestName] = useState('')
  const [addTestNotes, setAddTestNotes] = useState('')
  const [addTestServiceType, setAddTestServiceType] = useState<'LAB_VISIT' | 'HOME_SERVICE'>('LAB_VISIT')
  const [addTestPaymentMode, setAddTestPaymentMode] = useState<'ONLINE' | 'OFFLINE'>('OFFLINE')
  const [addTestPreferredDateTime, setAddTestPreferredDateTime] = useState('')
  const [addTestEtaMinutes, setAddTestEtaMinutes] = useState('')

  const loadProfile = useCallback(() => {
    setLoading(true)
    patientPortalService
      .getProfile()
      .then(setData)
      .catch(() => setError('Unable to load profile.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const handleLogout = () => {
    patientStorage.clear()
    window.location.href = '/'
  }

  const patientName = patientStorage.getPatientName() ?? data?.patient?.firstName ?? 'Patient'

  if (loading) {
    return (
      <div className="patient-profile">
        <div className="patient-profile-loading">Loading your profile…</div>
        <style>{patientProfileStyles}</style>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="patient-profile">
        <div className="patient-profile-error">
          <p>{error ?? 'Profile not found.'}</p>
          <Link to="/">Back to Home</Link>
        </div>
        <style>{patientProfileStyles}</style>
      </div>
    )
  }

  const {
    patient,
    visits,
    pharmacyDispensations,
    documents,
    medicineRequests = [],
    testRequests = [],
  } = data

  const readyAndPaidMedicine = medicineRequests.filter(
    (m) => m.status === 'COMPLETED' && m.paymentStatus === 'PAID'
  )
  const paidLabTestsNotify = testRequests.filter((t) => t.paymentStatus === 'PAID')

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await patientPortalService.uploadDocument(file)
      loadProfile()
      e.target.value = ''
    } catch {
      // eslint-disable-next-line no-alert
      alert('Failed to upload document.')
    } finally {
      setUploading(false)
    }
  }

  const handleAddMedicine = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!addMedicineName.trim()) return
    setAddingMedicine(true)
    try {
      await patientPortalService.addMedicine({
        medicineName: addMedicineName.trim(),
        dosage: addMedicineDosage.trim() || undefined,
        notes: addMedicineNotes.trim() || undefined,
        serviceType: addMedicineServiceType,
        paymentMode: addMedicinePaymentMode,
        expectedFulfillmentMinutes: addMedicineEtaMinutes.trim()
          ? Number(addMedicineEtaMinutes)
          : undefined,
      })
      setAddMedicineName('')
      setAddMedicineDosage('')
      setAddMedicineNotes('')
      setAddMedicineEtaMinutes('')
      loadProfile()
    } catch {
      // eslint-disable-next-line no-alert
      alert('Failed to add medicine.')
    } finally {
      setAddingMedicine(false)
    }
  }

  const handleAddTest = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!addTestName.trim()) return
    setAddingTest(true)
    try {
      await patientPortalService.addTest({
        testName: addTestName.trim(),
        notes: addTestNotes.trim() || undefined,
        serviceType: addTestServiceType,
        paymentMode: addTestPaymentMode,
        preferredDateTime: addTestPreferredDateTime || undefined,
        expectedFulfillmentMinutes: addTestEtaMinutes.trim() ? Number(addTestEtaMinutes) : undefined,
      })
      setAddTestName('')
      setAddTestNotes('')
      setAddTestPreferredDateTime('')
      setAddTestEtaMinutes('')
      loadProfile()
    } catch {
      // eslint-disable-next-line no-alert
      alert('Failed to add test.')
    } finally {
      setAddingTest(false)
    }
  }

  const allDiagnosticTests: Array<{
    visitId: string
    visitDate: string
    doctorName?: string
    test: DiagnosticTestItem
  }> = []
  visits.forEach((v) => {
    v.diagnosticTests?.forEach((t) => {
      allDiagnosticTests.push({
        visitId: v._id,
        visitDate: v.visitDate,
        doctorName: v.doctor?.name,
        test: t,
      })
    })
  })

  return (
    <div className="patient-profile">
      <header className="patient-profile-header">
        <div className="patient-profile-header-inner">
          <Link to="/" className="patient-profile-logo">
            MEDIGRAPH
          </Link>
          <div className="patient-profile-header-right">
            <span className="patient-profile-greeting">Hello, {patientName}</span>
            <Link to="/book-appointment" className="patient-profile-nav-link">
              Book Appointment
            </Link>
            <button
              type="button"
              className="patient-profile-logout"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="patient-profile-main">
        <h1 className="patient-profile-title">My Health Profile</h1>

        {(readyAndPaidMedicine.length > 0 || paidLabTestsNotify.length > 0) && (
          <section className="patient-profile-section">
            <h2>Notifications</h2>
            <div className="patient-profile-notification-box">
              {readyAndPaidMedicine.map((m) => (
                <p key={`med-notify-${m.id}`} style={{ margin: '0 0 8px' }}>
                  Your medicine order <strong>{m.medicineName}</strong> is ready. Please collect now.
                </p>
              ))}
              {paidLabTestsNotify.map((t) => (
                <p key={`test-notify-${t.id}`} style={{ margin: '0 0 8px' }}>
                  Payment received for <strong>{t.testName}</strong>
                  {t.receiptNumber && (
                    <>
                      {' '}— receipt no. <strong>{t.receiptNumber}</strong>
                    </>
                  )}
                  . Please follow lab instructions for sample collection or visit.
                </p>
              ))}
            </div>
          </section>
        )}

        <section className="patient-profile-section">
          <h2>My Details</h2>
          <div className="patient-profile-details">
            <p><strong>Name:</strong> {[patient.firstName, patient.lastName].filter(Boolean).join(' ')}</p>
            <p><strong>Mobile:</strong> {patient.mobileNumber}</p>
            {patient.gender && <p><strong>Gender:</strong> {patient.gender}</p>}
            {patient.dateOfBirth && <p><strong>Date of birth:</strong> {formatDate(patient.dateOfBirth)}</p>}
            {patient.bloodGroup && <p><strong>Blood group:</strong> {patient.bloodGroup}</p>}
            {patient.address && <p><strong>Address:</strong> {patient.address}</p>}
          </div>
        </section>

        <section className="patient-profile-section">
          <h2>Appointments</h2>
          {visits.length === 0 ? (
            <p className="patient-profile-empty">No appointments yet.</p>
          ) : (
            <ul className="patient-profile-list">
              {visits.map((v) => (
                <li key={v._id} className="patient-profile-card">
                  <div>
                    <strong>{formatDate(v.visitDate)}</strong>
                    {v.doctor?.name && <span> — Dr. {v.doctor.name}</span>}
                  </div>
                  {v.reason && <p className="patient-profile-muted">{v.reason}</p>}
                  {v.notes && <p className="patient-profile-muted">{v.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="patient-profile-section">
          <h2>Lab Tests</h2>
          <form onSubmit={handleAddTest} className="patient-profile-add-form">
            <input
              type="text"
              placeholder="Add test request (e.g. CBC, Sugar)"
              value={addTestName}
              onChange={(e) => setAddTestName(e.target.value)}
              className="patient-profile-input"
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={addTestNotes}
              onChange={(e) => setAddTestNotes(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <select
              value={addTestServiceType}
              onChange={(e) => setAddTestServiceType(e.target.value as 'LAB_VISIT' | 'HOME_SERVICE')}
              className="patient-profile-input patient-profile-input-small"
            >
              <option value="LAB_VISIT">Lab visit</option>
              <option value="HOME_SERVICE">Home service</option>
            </select>
            {addTestServiceType === 'HOME_SERVICE' ? (
              <select
                value={addTestPaymentMode}
                onChange={(e) => setAddTestPaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                className="patient-profile-input patient-profile-input-small"
              >
                <option value="ONLINE">Pay online</option>
                <option value="OFFLINE">Cash on service</option>
              </select>
            ) : (
              <select
                value={addTestPaymentMode}
                onChange={(e) => setAddTestPaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                className="patient-profile-input patient-profile-input-small"
              >
                <option value="OFFLINE">Pay at lab (offline)</option>
                <option value="ONLINE">Pay online</option>
              </select>
            )}
            <input
              type="datetime-local"
              value={addTestPreferredDateTime}
              onChange={(e) => setAddTestPreferredDateTime(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <input
              type="number"
              min={15}
              step={5}
              placeholder="Need in minutes (optional)"
              value={addTestEtaMinutes}
              onChange={(e) => setAddTestEtaMinutes(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <button
              type="submit"
              disabled={addingTest || !addTestName.trim()}
              className="patient-profile-add-btn"
            >
              {addingTest ? 'Adding…' : 'Add Test'}
            </button>
          </form>
          {testRequests.length > 0 && (
            <div className="patient-profile-subsection">
              <h3 className="patient-profile-subtitle">My test requests</h3>
              <ul className="patient-profile-list">
                {testRequests.map((t) => {
                  const paymentLabel = formatTestPaymentLabel(t.paymentMode, t.serviceType)
                  const showHomeAcceptMsg =
                    t.serviceType === 'HOME_SERVICE' &&
                    (t.status === 'ACCEPTED' || t.status === 'COMPLETED') &&
                    t.paymentStatus === 'PENDING'
                  return (
                  <li key={t.id} className="patient-profile-card patient-profile-request-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <strong>{t.testName}</strong>
                      {t.notes && <span className="patient-profile-muted"> — {t.notes}</span>}
                      <span className="patient-profile-badge">Requested by me</span>
                    </div>
                    <span className="patient-profile-muted" style={{ marginTop: 6 }}>
                      {t.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'}
                      {' · '}
                      {paymentLabel}
                      {t.preferredDateTime && ` · Preferred ${formatDateTime(t.preferredDateTime)}`}
                      {t.expectedFulfillmentMinutes ? ` · Need in ${t.expectedFulfillmentMinutes} min` : ''}
                    </span>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span className="patient-profile-status-chip">
                        Order:{' '}
                        {t.status === 'PENDING' && 'Waiting for lab'}
                        {t.status === 'ACCEPTED' && 'Accepted by lab'}
                        {t.status === 'COMPLETED' && 'Ready'}
                        {t.status === 'CANCELLED' && 'Cancelled'}
                      </span>
                      <span className="patient-profile-status-chip" style={{ background: '#f1f5f9', color: '#334155' }}>
                        Payment: {t.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                    {showHomeAcceptMsg && (
                      <p className="patient-profile-home-strip">
                        Our representative will call you shortly, or reach your address in your preferred time window.
                      </p>
                    )}
                    {t.paymentStatus === 'PAID' && (
                      <div className="patient-profile-receipt-box">
                        <strong>Receipt</strong>
                        {t.receiptNumber && (
                          <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
                            No. <strong>{t.receiptNumber}</strong>
                            {t.paidAt && <span className="patient-profile-muted"> · {formatDateTime(t.paidAt)}</span>}
                          </p>
                        )}
                        <button
                          type="button"
                          className="patient-profile-link-btn"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            const w = window.open('', '_blank', 'noopener,noreferrer')
                            if (!w) return
                            const body = `
                              <html><head><title>Lab receipt</title></head><body style="font-family:system-ui;padding:24px;">
                              <h2 style="margin:0 0 12px;">Lab test — payment receipt</h2>
                              <p><strong>Test:</strong> ${t.testName}</p>
                              <p><strong>Receipt no.:</strong> ${t.receiptNumber ?? '—'}</p>
                              <p><strong>Paid at:</strong> ${t.paidAt ? formatDateTime(t.paidAt) : '—'}</p>
                              <p><strong>Service:</strong> ${t.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'}</p>
                              <script>window.onload=function(){window.print()}</script>
                              </body></html>`
                            w.document.write(body)
                            w.document.close()
                          }}
                        >
                          View / print receipt
                        </button>
                      </div>
                    )}
                  </li>
                  )
                })}
              </ul>
            </div>
          )}
          {allDiagnosticTests.length === 0 && testRequests.length === 0 ? (
            <p className="patient-profile-empty">No lab tests yet.</p>
          ) : allDiagnosticTests.length > 0 ? (
            <ul className="patient-profile-list">
              {allDiagnosticTests.map(({ visitId, visitDate, doctorName, test }) => (
                <li key={test._id} className="patient-profile-card">
                  <div>
                    <strong>{test.testName}</strong>
                    <span> — {formatDate(visitDate)}</span>
                    {doctorName && <span> (Dr. {doctorName})</span>}
                  </div>
                  {test.hasReport && (
                    <button
                      type="button"
                      className="patient-profile-link-btn"
                      onClick={() =>
                        patientPortalService.openDiagnosticReport(visitId, test._id)
                      }
                    >
                      View Report
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="patient-profile-section">
          <h2>Medicine Requests</h2>
          <form onSubmit={handleAddMedicine} className="patient-profile-add-form">
            <input
              type="text"
              placeholder="Medicine name"
              value={addMedicineName}
              onChange={(e) => setAddMedicineName(e.target.value)}
              className="patient-profile-input"
            />
            <input
              type="text"
              placeholder="Dosage (optional)"
              value={addMedicineDosage}
              onChange={(e) => setAddMedicineDosage(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={addMedicineNotes}
              onChange={(e) => setAddMedicineNotes(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <select
              value={addMedicineServiceType}
              onChange={(e) => {
                const next = e.target.value as 'PICKUP' | 'HOME_DELIVERY'
                setAddMedicineServiceType(next)
                // Rule: Home delivery always uses ONLINE payment in UI.
                if (next === 'HOME_DELIVERY') setAddMedicinePaymentMode('ONLINE')
              }}
              className="patient-profile-input patient-profile-input-small"
            >
              <option value="PICKUP">Pickup from medical</option>
              <option value="HOME_DELIVERY">Home delivery</option>
            </select>
            {addMedicineServiceType === 'HOME_DELIVERY' ? (
              <select
                value="ONLINE"
                onChange={() => setAddMedicinePaymentMode('ONLINE')}
                disabled
                className="patient-profile-input patient-profile-input-small"
              >
                <option value="ONLINE">Pay online</option>
              </select>
            ) : (
              <select
                value={addMedicinePaymentMode}
                onChange={(e) => setAddMedicinePaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                className="patient-profile-input patient-profile-input-small"
              >
                <option value="OFFLINE">Pay at medical (offline)</option>
                <option value="ONLINE">Pay online</option>
              </select>
            )}
            <input
              type="number"
              min={15}
              step={5}
              placeholder="Need in minutes (optional)"
              value={addMedicineEtaMinutes}
              onChange={(e) => setAddMedicineEtaMinutes(e.target.value)}
              className="patient-profile-input patient-profile-input-small"
            />
            <button
              type="submit"
              disabled={addingMedicine || !addMedicineName.trim()}
              className="patient-profile-add-btn"
            >
              {addingMedicine ? 'Adding…' : 'Add Medicine'}
            </button>
          </form>
          {medicineRequests.length > 0 ? (
            <ul className="patient-profile-list">
              {medicineRequests.map((m) => (
                <li
                  key={m.id}
                  className="patient-profile-card patient-profile-request-card"
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <strong>{m.medicineName}</strong>
                    {m.dosage && <span> — {m.dosage}</span>}
                    {m.notes && <span className="patient-profile-muted"> — {m.notes}</span>}
                    <span className="patient-profile-badge">Requested by me</span>
                  </div>
                  <span className="patient-profile-muted" style={{ marginTop: 6 }}>
                    {m.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup'} ·{' '}
                    {formatMedicinePaymentLabel(m.paymentMode, m.serviceType)}
                    {m.expectedFulfillmentMinutes ? ` · Need in ${m.expectedFulfillmentMinutes} min` : ''}
                  </span>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span className="patient-profile-status-chip">
                      Order:{' '}
                      {m.status === 'PENDING' && 'Waiting for pharmacy'}
                      {m.status === 'ACCEPTED' && 'Accepted by chemist'}
                      {m.status === 'COMPLETED' && 'Ready'}
                      {m.status === 'CANCELLED' && 'Cancelled'}
                    </span>
                    <span className="patient-profile-status-chip" style={{ background: '#f1f5f9', color: '#334155' }}>
                      Payment: {m.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                  {m.paymentStatus === 'PAID' && (
                    <div className="patient-profile-receipt-box">
                      <strong>Receipt</strong>
                      {(m.receiptNumber || m.paidAt) && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
                          {m.receiptNumber && (
                            <>
                              No. <strong>{m.receiptNumber}</strong>
                            </>
                          )}
                          {m.paidAt && (
                            <span className="patient-profile-muted">
                              {m.receiptNumber ? ' · ' : ''}
                              {formatDateTime(m.paidAt)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="patient-profile-empty">No medicine requests yet. Add above and doctor will see.</p>
          )}
        </section>

        <section className="patient-profile-section">
          <h2>Pharmacy (Dispensed)</h2>
          {!pharmacyDispensations?.length ? (
            <p className="patient-profile-empty">No pharmacy records yet.</p>
          ) : (
            <ul className="patient-profile-list">
              {pharmacyDispensations.map((d) => (
                <li key={d.id} className="patient-profile-card">
                  <div>
                    <strong>{formatDateTime(d.createdAt)}</strong>
                    <span> — {d.dispensedBy}</span>
                  </div>
                  <p className="patient-profile-muted">
                    ₹{d.totalAmount} • {d.paymentStatus}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="patient-profile-section">
          <h2>My Reports & Documents</h2>
          <div className="patient-profile-upload-row">
            <label className="patient-profile-upload-btn">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleDocumentUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              {uploading ? 'Uploading…' : '+ Add Document'}
            </label>
            <span className="patient-profile-muted">Doctor & assistant will see uploaded files</span>
          </div>
          {documents.length === 0 ? (
            <p className="patient-profile-empty">No documents uploaded yet.</p>
          ) : (
            <ul
              className={`patient-profile-list ${
                documents.length > 5 ? 'patient-profile-list-scroll' : ''
              }`}
            >
              {documents.map((d) => (
                <li key={d.id} className="patient-profile-card patient-profile-doc-row">
                  <span>{d.originalName}</span>
                  <span className="patient-profile-muted">
                    {formatDate(d.uploadedAt)}
                    {d.source === 'patient' && ' (uploaded by me)'}
                  </span>
                  <button
                    type="button"
                    className="patient-profile-link-btn"
                    onClick={() => patientPortalService.openDocument(d.id)}
                  >
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="patient-profile-footer">
        <Link to="/">Home</Link>
        <Link to="/book-appointment">Book Appointment</Link>
      </footer>

      <style>{patientProfileStyles}</style>
    </div>
  )
}

const patientProfileStyles = `
  .patient-profile {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    color: #0f172a;
  }
  .patient-profile-loading,
  .patient-profile-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px;
  }
  .patient-profile-error a {
    color: #1e40af;
  }
  .patient-profile-header {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .patient-profile-header-inner {
    max-width: 900px;
    margin: 0 auto;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  .patient-profile-logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    text-decoration: none;
  }
  .patient-profile-logo:hover {
    color: #1e40af;
  }
  .patient-profile-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .patient-profile-greeting {
    color: #475569;
    font-size: 0.95rem;
  }
  .patient-profile-nav-link {
    color: #1e40af;
    text-decoration: none;
    font-weight: 500;
  }
  .patient-profile-nav-link:hover {
    text-decoration: underline;
  }
  .patient-profile-logout {
    padding: 6px 12px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    color: #475569;
  }
  .patient-profile-logout:hover {
    background: #e2e8f0;
  }
  .patient-profile-main {
    flex: 1;
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 20px 48px;
    width: 100%;
  }
  .patient-profile-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 24px;
    color: #0f172a;
  }
  .patient-profile-section {
    margin-bottom: 32px;
  }
  .patient-profile-section h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 12px;
    color: #334155;
  }
  .patient-profile-details {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
  }
  .patient-profile-details p {
    margin: 0 0 8px;
  }
  .patient-profile-details p:last-child {
    margin-bottom: 0;
  }
  .patient-profile-empty {
    color: #64748b;
    margin: 0;
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
  }
  .patient-profile-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .patient-profile-list-scroll {
    max-height: 420px;
    overflow-y: auto;
    padding-right: 6px;
  }
  .patient-profile-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 10px;
  }
  .patient-profile-muted {
    color: #64748b;
    font-size: 0.9rem;
    margin: 4px 0 0;
  }
  .patient-profile-link-btn {
    margin-top: 8px;
    padding: 4px 0;
    background: none;
    border: none;
    color: #1e40af;
    cursor: pointer;
    font-size: 0.9rem;
    text-decoration: underline;
  }
  .patient-profile-link-btn:hover {
    color: #1e3a8a;
  }
  .patient-profile-doc-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .patient-profile-doc-row span:first-child {
    flex: 1;
    min-width: 150px;
  }
  .patient-profile-footer {
    background: #0f172a;
    color: #94a3b8;
    padding: 20px;
    display: flex;
    justify-content: center;
    gap: 24px;
  }
  .patient-profile-footer a {
    color: #cbd5e1;
    text-decoration: none;
  }
  .patient-profile-footer a:hover {
    color: #fff;
  }
  .patient-profile-add-form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    align-items: center;
  }
  .patient-profile-input {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.95rem;
    min-width: 140px;
  }
  .patient-profile-input-small {
    min-width: 100px;
  }
  .patient-profile-add-btn {
    padding: 8px 16px;
    background: #1e40af;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;
  }
  .patient-profile-add-btn:hover:not(:disabled) {
    background: #1e3a8a;
  }
  .patient-profile-add-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .patient-profile-upload-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .patient-profile-upload-btn {
    display: inline-block;
    padding: 8px 16px;
    background: #1e40af;
    color: #fff;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .patient-profile-upload-btn:hover {
    background: #1e3a8a;
  }
  .patient-profile-subsection {
    margin-top: 12px;
  }
  .patient-profile-subtitle {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 8px;
    color: #475569;
  }
  .patient-profile-request-card {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .patient-profile-badge {
    margin-left: auto;
    font-size: 0.75rem;
    background: #dbeafe;
    color: #1e40af;
    padding: 2px 8px;
    border-radius: 9999px;
    font-weight: 500;
  }
  .patient-profile-status-chip {
    font-size: 0.75rem;
    background: #ecfeff;
    color: #0f766e;
    padding: 2px 8px;
    border-radius: 9999px;
    font-weight: 600;
  }
  .patient-profile-notification-box {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 10px;
    padding: 12px 14px;
    color: #92400e;
    font-size: 0.92rem;
  }
  .patient-profile-home-strip {
    margin: 10px 0 0;
    padding: 10px 12px;
    font-size: 0.88rem;
    line-height: 1.45;
    color: #1e3a8a;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
  }
  .patient-profile-receipt-box {
    margin-top: 12px;
    padding: 12px 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.9rem;
  }
`
