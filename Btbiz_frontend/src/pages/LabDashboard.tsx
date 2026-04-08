import { useEffect, useRef, useState } from 'react'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { Button } from '../components/ui/Button'
import { DnaLoader } from '../components/ui/DnaLoader'
import {
  patientService,
  orderService,
  type PatientSummary,
  type FullPatientHistory,
  type DiagnosticTestItem,
  type LabOrderRequest,
} from '../services/api'

function patientSummaryFromHistory(p: FullPatientHistory['patient']): PatientSummary {
  const raw = p as PatientSummary & { _id?: string }
  return {
    id: raw.id ?? raw._id?.toString() ?? '',
    firstName: raw.firstName,
    lastName: raw.lastName,
    mobileNumber: raw.mobileNumber,
    gender: raw.gender,
    dateOfBirth: raw.dateOfBirth,
    address: raw.address,
    bloodGroup: raw.bloodGroup,
    previousHealthHistory: raw.previousHealthHistory,
    emergencyContactName: raw.emergencyContactName,
    emergencyContactPhone: raw.emergencyContactPhone,
  }
}
// import { Button } from '../components/ui/Button'

function normalizeLabTestName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

const COMMON_LAB_TESTS = [
  'CBC',
  'HbA1c',
  'Lipid Profile',
  'Thyroid (TSH)',
  'LFT',
  'KFT',
  'Blood Sugar Fasting',
  'Urine Routine',
  'X-Ray',
  'ECG',
  'Ultrasound',
  'Other',
]

export const LabDashboard = () => {
  const name = authStorage.getName() ?? 'Lab Assistant'

  const [mobileSearch, setMobileSearch] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const [history, setHistory] = useState<FullPatientHistory | null>(null)
  const [matchedPatients, setMatchedPatients] = useState<PatientSummary[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)

  const [addTestSelect, setAddTestSelect] = useState('')
  const [addTestCustom, setAddTestCustom] = useState('')
  const [addTestPrice, setAddTestPrice] = useState('')
  const [addTestLoading, setAddTestLoading] = useState(false)
  const [addTestError, setAddTestError] = useState<string | null>(null)
  const [uploadingReportForTestId, setUploadingReportForTestId] = useState<string | null>(null)

  const [showReceipt, setShowReceipt] = useState(false)
  const [incomingTestRequests, setIncomingTestRequests] = useState<LabOrderRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const labWorkspaceRef = useRef<HTMLDivElement>(null)
  const [receiptData, setReceiptData] = useState<{
    patient: { name: string; mobile: string }
    visit: { visitDate: string; reason?: string }
    tests: Array<{ testName: string; price: number }>
    total: number
    paidAmount: number
    paymentStatus: string
    paidAt?: string
  } | null>(null)

  const loadPatientProfile = async (p: PatientSummary) => {
    setPatient(p)
    setSelectedPatientId(p.id)
    const h = await patientService.getFullHistory(p.id)
    setHistory(h)
    if (h.visits?.length) {
      setSelectedVisitId(h.visits[0]._id)
    } else {
      setSelectedVisitId(null)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError(null)
    setPatient(null)
    setHistory(null)
    setMatchedPatients([])
    setSelectedPatientId('')
    setSelectedVisitId(null)
    setAddTestError(null)
    setShowReceipt(false)
    setReceiptData(null)
    const digits = mobileSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setSearchError('Enter a valid 10-digit mobile number.')
      return
    }
    setSearchLoading(true)
    try {
      const options = await patientService.searchByMobileOptions(digits)
      if (options.length > 0) {
        setMatchedPatients(options)
        await loadPatientProfile(options[0])
      } else {
        setPatient(null)
        setHistory(null)
        setSelectedVisitId(null)
        setSearchError('No patient found with this mobile number.')
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const selectedVisit = history?.visits?.find((v) => v._id === selectedVisitId)
  const diagnosticTests: DiagnosticTestItem[] = selectedVisit?.diagnosticTests ?? []

  const getTestNameToAdd = (): string | null => {
    if (addTestSelect === 'Other') {
      const t = addTestCustom.trim()
      return t.length > 0 ? t : null
    }
    return addTestSelect && addTestSelect !== 'Other' ? addTestSelect : null
  }

  const handleAddTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient?.id || !selectedVisitId) return
    const testName = getTestNameToAdd()
    if (!testName) {
      setAddTestError('Select a test or enter custom test name.')
      return
    }
    const price = addTestPrice.trim() ? parseFloat(addTestPrice) : undefined
    if (price !== undefined && (Number.isNaN(price) || price < 0)) {
      setAddTestError('Enter a valid rate (₹).')
      return
    }
    const n = normalizeLabTestName(testName)
    if (diagnosticTests.some((t) => normalizeLabTestName(t.testName) === n)) {
      setAddTestError('This test is already added for this visit.')
      return
    }
    setAddTestError(null)
    setAddTestLoading(true)
    try {
      await patientService.addDiagnosticTests(patient.id, selectedVisitId, [{ testName, price }])
      setAddTestSelect('')
      setAddTestCustom('')
      setAddTestPrice('')
      const h = await patientService.getFullHistory(patient.id)
      setHistory(h)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? 'Failed to add test. Please try again.'
      setAddTestError(msg)
    } finally {
      setAddTestLoading(false)
    }
  }

  const openLabReceipt = () => {
    if (!patient || !selectedVisit) return
    const tests = diagnosticTests.map((t) => ({
      testName: t.testName,
      price: t.price ?? 0,
    }))
    const total = tests.reduce((sum, t) => sum + t.price, 0)
    setReceiptData({
      patient: {
        name: `${patient.firstName} ${patient.lastName ?? ''}`.trim() || 'Patient',
        mobile: patient.mobileNumber ?? '',
      },
      visit: {
        visitDate: selectedVisit.visitDate,
        reason: selectedVisit.reason,
      },
      tests,
      total,
      paidAmount: 0,
      paymentStatus: 'Unpaid',
    })
    setShowReceipt(true)
  }

  const formatVisitDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return d
    }
  }

  const handleReportUpload = async (testId: string, file: File) => {
    if (!patient?.id || !selectedVisitId) return
    setUploadingReportForTestId(testId)
    try {
      await patientService.uploadDiagnosticTestReport(patient.id, selectedVisitId, testId, file)
      const h = await patientService.getFullHistory(patient.id)
      setHistory(h)
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to upload report')
    } finally {
      setUploadingReportForTestId(null)
    }
  }

  const loadIncomingTestRequests = async (silent = false) => {
    if (!silent) setRequestsLoading(true)
    try {
      const list = await orderService.getTestRequests()
      const next = list.filter((r) => r.paymentStatus !== 'PAID')
      setIncomingTestRequests((prev) => {
        const prevKey = JSON.stringify(prev)
        const nextKey = JSON.stringify(next)
        return prevKey === nextKey ? prev : next
      })
    } finally {
      if (!silent) setRequestsLoading(false)
    }
  }

  useEffect(() => {
    void loadIncomingTestRequests()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadIncomingTestRequests(true)
    }, 10000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (patient?.id) void loadIncomingTestRequests()
  }, [patient?.id])

  const prefillAddTestFromOrderRequest = (r: LabOrderRequest) => {
    const name = (r.testNames?.[0] || r.testName || '').trim()
    if (!name) return
    const exact = COMMON_LAB_TESTS.find((t) => t.toLowerCase() === name.toLowerCase())
    if (exact) {
      setAddTestSelect(exact)
      setAddTestCustom('')
    } else {
      setAddTestSelect('Other')
      setAddTestCustom(name)
    }
    setAddTestPrice('')
    setAddTestError(null)
  }

  const scrollLabWorkspaceIntoView = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        labWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    })
  }

  /** After Accept: load patient + visit + prefill “Add test” from request (like pharmacy). */
  const openPatientAndPrefillFromTestRequest = async (r: LabOrderRequest) => {
    setSearchError(null)
    setShowReceipt(false)
    setReceiptData(null)

    const digits = r.patientMobile.replace(/\D/g, '').slice(0, 10)
    setMobileSearch(digits)
    setSearchLoading(true)

    try {
      if (r.patientId) {
        try {
          const h = await patientService.getFullHistory(r.patientId)
          const summary = patientSummaryFromHistory(h.patient)
          setPatient(summary)
          setSelectedPatientId(summary.id)
          setHistory(h)
          setMatchedPatients([summary])
          if (h.visits?.length) {
            setSelectedVisitId(h.visits[0]._id)
          } else {
            setSelectedVisitId(null)
          }
          prefillAddTestFromOrderRequest(r)
          scrollLabWorkspaceIntoView()
          return
        } catch {
          /* fall through */
        }
      }

      if (digits.length < 10) {
        setSearchError('Patient mobile is missing or invalid on this request.')
        setPatient(null)
        setHistory(null)
        return
      }

      const options = await patientService.searchByMobileOptions(digits)
      if (options.length === 0) {
        setPatient(null)
        setHistory(null)
        setSearchError('No patient found for this mobile. Try searching manually.')
        return
      }

      setMatchedPatients(options)
      const match =
        r.patientId ? options.find((p) => p.id === r.patientId) ?? options[0] : options[0]
      await loadPatientProfile(match)
      prefillAddTestFromOrderRequest(r)
      scrollLabWorkspaceIntoView()
    } catch {
      setSearchError('Could not load patient. Try Search by mobile.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleAcceptIncomingTestRequest = async (r: LabOrderRequest) => {
    try {
      await orderService.updateTestRequest(r.id, { status: 'ACCEPTED' })
      await openPatientAndPrefillFromTestRequest(r)
      await loadIncomingTestRequests()
    } catch {
      alert('Could not accept request. Please try again.')
    }
  }

  const handleQuickUpdateTestRequest = async (
    r: LabOrderRequest,
    patch: Partial<{ status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'; paymentStatus: 'PENDING' | 'PAID' }>
  ) => {
    await orderService.updateTestRequest(r.id, patch)
    await loadIncomingTestRequests()
    if (patient?.id === r.patientId) {
      try {
        const h = await patientService.getFullHistory(patient.id)
        setHistory(h)
      } catch {
        /* ignore */
      }
    }
  }

  const handleViewReport = async (testId: string) => {
    if (!patient?.id || !selectedVisitId) return
    try {
      await patientService.openDiagnosticTestReport(patient.id, selectedVisitId, testId)
    } catch {
      alert('Failed to open report')
    }
  }

  return (
    <div className="app-shell">
      <Header doctorName={name} />
      <main className="dashboard-main" style={{ maxWidth: '100%' }}>
        <section style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(340px, 400px) minmax(0, 1fr)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div>
              <Card className="dashboard-overview-card" style={{ marginBottom: 0, position: 'sticky', top: 88 }}>
            <p className="dashboard-kicker">Patient test orders</p>
            <h2 className="dashboard-heading">Incoming test requests</h2>
            <p className="dashboard-body" style={{ marginBottom: 12 }}>
              Requests created by patients are shown here with home service and payment preference.
            </p>
            {requestsLoading ? (
              <DnaLoader label="Loading requests..." />
            ) : incomingTestRequests.length === 0 ? (
              <p className="dashboard-body" style={{ marginBottom: 0 }}>
                No pending patient test requests (or all are already paid).
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  maxHeight: incomingTestRequests.length > 5 ? 420 : undefined,
                  overflowY: incomingTestRequests.length > 5 ? 'auto' : undefined,
                  paddingRight: incomingTestRequests.length > 5 ? 6 : undefined,
                }}
              >
                {incomingTestRequests.map((r) => (
                  <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{r.patientName} ({r.patientMobile})</p>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>{r.testName}{r.notes ? ` · ${r.notes}` : ''}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                      {r.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'} · {r.paymentMode} · {r.paymentStatus} · {r.status}
                      {r.preferredDateTime ? ` · Preferred ${new Date(r.preferredDateTime).toLocaleString('en-IN')}` : ''}
                      {r.expectedFulfillmentMinutes ? ` · Need in ${r.expectedFulfillmentMinutes} min` : ''}
                    </p>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => void handleAcceptIncomingTestRequest(r)}>
                        Accept
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateTestRequest(r, { status: 'COMPLETED' })}>
                        Ready
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateTestRequest(r, { paymentStatus: 'PAID' })}>
                        Mark paid
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </Card>
            </div>

            <div>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Diagnostic panel</p>
            <h2 className="dashboard-heading">Search patient by mobile</h2>
            <p className="dashboard-body" style={{ marginBottom: 16 }}>
              Enter the patient&apos;s 10-digit mobile number to view details and
              add lab tests for a visit.
            </p>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TextField
                id="lab-mobile-search"
                label="Mobile number"
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                type="tel"
                maxLength={10}
              />
              <div style={{ alignSelf: 'flex-end' }}>
                <Button type="submit" disabled={searchLoading}>
                  {searchLoading ? 'Searching…' : 'Search'}
                </Button>
              </div>
            </form>
            {searchError && (
              <p style={{ color: 'var(--color-error)', marginTop: 8, fontSize: 14 }}>
                {searchError}
              </p>
            )}
            {searchLoading && <DnaLoader label="Searching patient..." size={42} />}
          </Card>

          {patient && history && (
            <div ref={labWorkspaceRef}>
              {matchedPatients.length > 1 && (
                <div style={{ marginTop: 16 }}>
                  <Card className="dashboard-overview-card">
                    <p className="dashboard-kicker">Family profiles</p>
                    <p className="dashboard-body" style={{ marginBottom: 8 }}>
                      This mobile has multiple family members. Select the profile to continue.
                    </p>
                    <select
                      value={selectedPatientId}
                      onChange={(e) => {
                        const next = matchedPatients.find((p) => p.id === e.target.value)
                        if (next) void loadPatientProfile(next)
                      }}
                      style={{
                        width: '100%',
                        maxWidth: 460,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        fontSize: 14,
                      }}
                    >
                      {matchedPatients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {[p.firstName, p.lastName].filter(Boolean).join(' ') || 'Patient'} ({p.mobileNumber})
                        </option>
                      ))}
                    </select>
                  </Card>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <Card className="dashboard-overview-card">
                  <p className="dashboard-kicker">Patient details</p>
                  <h2 className="dashboard-heading">
                    {patient.firstName} {patient.lastName ?? ''}
                  </h2>
                  <p className="dashboard-body">
                    Mobile: {patient.mobileNumber}
                    {patient.bloodGroup && ` · Blood group: ${patient.bloodGroup}`}
                    {patient.address && ` · ${patient.address}`}
                  </p>
                  {history.documents?.length ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void patientService.openDocument(patient.id, history.documents[0].id)}
                      >
                        View prescription (secure)
                      </Button>
                      <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
                        Latest uploaded prescription
                      </span>
                    </div>
                  ) : (
                    <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                      No prescription uploaded for this patient yet.
                    </p>
                  )}
                </Card>
              </div>

              <div style={{ marginTop: 16 }}>
                <Card className="dashboard-overview-card">
                  <p className="dashboard-kicker">Lab tests</p>
                  <h2 className="dashboard-heading">Select visit</h2>
                  {!history.visits?.length ? (
                    <p className="dashboard-body">
                      No visits found for this patient. Tests are added per visit.
                    </p>
                  ) : (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <label
                          htmlFor="lab-visit-select"
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: 'var(--color-text-secondary)',
                            marginBottom: 4,
                          }}
                        >
                          Visit
                        </label>
                        <select
                          id="lab-visit-select"
                          value={selectedVisitId ?? ''}
                          onChange={(e) => {
                            setSelectedVisitId(e.target.value || null)
                            setAddTestError(null)
                          }}
                          style={{
                            width: '100%',
                            maxWidth: 400,
                            padding: '8px 12px',
                            fontSize: 14,
                            borderRadius: 8,
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          {history.visits.map((v) => (
                            <option key={v._id} value={v._id}>
                              {formatVisitDate(v.visitDate)}
                              {v.reason ? ` – ${v.reason}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="dashboard-body" style={{ marginBottom: 12 }}>
                        Tests added for this visit:
                      </p>
                      <div
                        style={{
                          overflowX: 'auto',
                          overflowY: diagnosticTests.length > 5 ? 'auto' : undefined,
                          maxHeight: diagnosticTests.length > 5 ? 320 : undefined,
                          marginBottom: 16,
                        }}
                      >
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 14,
                            background: '#fff',
                            borderRadius: 8,
                            overflow: 'hidden',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          }}
                        >
                          <thead>
                            <tr style={{ background: '#f0f4f8', borderBottom: '2px solid #d9e2ec' }}>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>#</th>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>Test name</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#102a43' }}>Rate (₹)</th>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>Report</th>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>Added on</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnosticTests.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ padding: '16px 12px', color: '#627d98', textAlign: 'center' }}>
                                  No tests added yet. Add a test below.
                                </td>
                              </tr>
                            ) : (
                              diagnosticTests.map((t, idx) => (
                                <tr
                                  key={t._id}
                                  style={{
                                    borderBottom: '1px solid #e2e8f0',
                                  }}
                                >
                                  <td style={{ padding: '10px 12px', color: '#627d98' }}>{idx + 1}</td>
                                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.testName}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>
                                    {t.price != null ? `₹${t.price}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#486581' }}>
                                    {t.hasReport ? (
                                      <button
                                        type="button"
                                        onClick={() => handleViewReport(t._id)}
                                        style={{
                                          padding: '4px 12px',
                                          fontSize: 12,
                                          background: '#0d47a1',
                                          color: '#fff',
                                          border: 'none',
                                          borderRadius: 6,
                                          cursor: 'pointer',
                                          fontWeight: 500,
                                        }}
                                      >
                                        View
                                      </button>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png"
                                          style={{ fontSize: 11, width: 120 }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) handleReportUpload(t._id, file)
                                          }}
                                        />
                                        {uploadingReportForTestId === t._id && (
                                          <span style={{ fontSize: 11, color: '#627d98' }}>Uploading...</span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#627d98', fontSize: 13 }}>
                                    {t.createdAt
                                      ? new Date(t.createdAt).toLocaleString('en-IN', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {diagnosticTests.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <Button type="button" onClick={openLabReceipt}>
                            View bill / Receipt
                          </Button>
                        </div>
                      )}

                      <h3 style={{ fontSize: 16, marginBottom: 8 }}>Add test</h3>
                      <form
                        onSubmit={handleAddTest}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          alignItems: 'flex-end',
                        }}
                      >
                        <div>
                          <label
                            htmlFor="lab-test-select"
                            style={{
                              display: 'block',
                              fontSize: 12,
                              color: 'var(--color-text-secondary)',
                              marginBottom: 4,
                            }}
                          >
                            Test name
                          </label>
                          <select
                            id="lab-test-select"
                            value={addTestSelect}
                            onChange={(e) => {
                              setAddTestSelect(e.target.value)
                              setAddTestError(null)
                            }}
                            style={{
                              padding: '8px 12px',
                              fontSize: 14,
                              borderRadius: 8,
                              border: '1px solid var(--color-border)',
                              minWidth: 180,
                            }}
                          >
                            <option value="">Select…</option>
                            {COMMON_LAB_TESTS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        {addTestSelect === 'Other' && (
                          <TextField
                            id="lab-custom-test"
                            label="Custom test name"
                            value={addTestCustom}
                            onChange={(e) => setAddTestCustom(e.target.value)}
                            placeholder="Enter test name"
                          />
                        )}
                        <TextField
                          id="lab-test-rate"
                          label="Rate (₹)"
                          type="number"
                          min={0}
                          value={addTestPrice}
                          onChange={(e) => setAddTestPrice(e.target.value)}
                          placeholder="e.g. 200"
                        />
                        <div style={{ alignSelf: 'flex-end' }}>
                          <Button
                            type="submit"
                            disabled={addTestLoading || !getTestNameToAdd()}
                          >
                            {addTestLoading ? 'Adding…' : 'Add test'}
                          </Button>
                        </div>
                      </form>
                      {addTestError && (
                        <p
                          style={{
                            color: 'var(--color-error)',
                            marginTop: 8,
                            fontSize: 14,
                          }}
                        >
                          {addTestError}
                        </p>
                      )}
                    </>
                  )}
                </Card>
              </div>
            </div>
          )}
            </div>
          </div>
        </section>
      </main>

      {/* Receipt modal - print-friendly */}
      {showReceipt && receiptData && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 24,
          }}
          onClick={() => setShowReceipt(false)}
        >
          <div
            id="lab-receipt"
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 420,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Lab Receipt</h2>
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>Patient: <strong>{receiptData.patient.name}</strong></p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>Mobile: {receiptData.patient.mobile}</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#94a3b8' }}>
              Visit: {new Date(receiptData.visit.visitDate).toLocaleDateString('en-IN')}
              {receiptData.visit.reason ? ` – ${receiptData.visit.reason}` : ''}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, marginBottom: 12, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0' }}>Test</th>
                  <th style={{ textAlign: 'right', padding: '8px 0' }}>Price (₹)</th>
                </tr>
              </thead>
              <tbody>
                {receiptData.tests.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0' }}>{t.testName}</td>
                    <td style={{ textAlign: 'right', padding: '6px 0' }}>₹{t.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '8px 0 4px', fontSize: 14, fontWeight: 600 }}>Total: ₹{receiptData.total}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Paid: ₹{receiptData.paidAmount} · Status: {receiptData.paymentStatus}</p>
            {receiptData.paidAt && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Paid on: {new Date(receiptData.paidAt).toLocaleString('en-IN')}
              </p>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <Button
                type="button"
                onClick={() => window.print()}
              >
                Print / Save as PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowReceipt(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
