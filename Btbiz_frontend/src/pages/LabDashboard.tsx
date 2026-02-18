import { useState } from 'react'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { Button } from '../components/ui/Button'
import {
  patientService,
  type PatientSummary,
  type FullPatientHistory,
  type DiagnosticTestItem,
} from '../services/api'
// import { Button } from '../components/ui/Button'

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
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)

  const [addTestSelect, setAddTestSelect] = useState('')
  const [addTestCustom, setAddTestCustom] = useState('')
  const [addTestLoading, setAddTestLoading] = useState(false)
  const [addTestError, setAddTestError] = useState<string | null>(null)
  const [uploadingReportForTestId, setUploadingReportForTestId] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError(null)
    setHistory(null)
    setSelectedVisitId(null)
    setAddTestError(null)
    const digits = mobileSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setSearchError('Enter a valid 10-digit mobile number.')
      return
    }
    setSearchLoading(true)
    try {
      const found = await patientService.searchByMobile(digits)
      if (found) {
        setPatient(found)
        const h = await patientService.getFullHistory(found.id)
        setHistory(h)
        if (h.visits?.length) {
          setSelectedVisitId(h.visits[0]._id)
        } else {
          setSelectedVisitId(null)
        }
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
    setAddTestError(null)
    setAddTestLoading(true)
    try {
      await patientService.addDiagnosticTests(patient.id, selectedVisitId, [testName])
      setAddTestSelect('')
      setAddTestCustom('')
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
        <section style={{ maxWidth: 900, margin: '0 auto' }}>
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
                onChange={(e) => setMobileSearch(e.target.value)}
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
          </Card>

          {patient && history && (
            <>
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
                      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
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
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>Report</th>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#102a43' }}>Added on</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnosticTests.length === 0 ? (
                              <tr>
                                <td colSpan={4} style={{ padding: '16px 12px', color: '#627d98', textAlign: 'center' }}>
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
            </>
          )}
        </section>
      </main>
    </div>
  )
}
