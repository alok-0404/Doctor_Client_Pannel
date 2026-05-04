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

function getRequestTestNames(r: LabOrderRequest): string[] {
  const fromArray = (r.testNames ?? []).map((name) => String(name ?? '').trim()).filter(Boolean)
  if (fromArray.length > 0) return fromArray
  const fallback = String(r.testName ?? '').trim()
  return fallback ? [fallback] : []
}

/** +91… numbers must use the last 10 digits for search, not the first 10 (which included country code). */
function normalizeMobileDigitsForSearch(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length >= 10) return d.slice(-10)
  return d
}

function splitTotalInrAcrossTests(total: number, count: number): number[] {
  if (count <= 0) return []
  const paise = Math.round(total * 100)
  const base = Math.floor(paise / count)
  const rem = paise % count
  return Array.from({ length: count }, (_, i) => (base + (i < rem ? 1 : 0)) / 100)
}

function findVisitForIncomingLabRequest(
  history: FullPatientHistory | null,
  r: LabOrderRequest
): string | null {
  if (!history?.visits?.length) return null
  const requested = getRequestTestNames(r).map(normalizeLabTestName).filter(Boolean)
  if (requested.length === 0) return history.visits[0]._id

  for (const v of history.visits) {
    const norms = new Set((v.diagnosticTests ?? []).map((t) => normalizeLabTestName(t.testName)))
    if (requested.every((n) => norms.has(n))) return v._id
  }
  return history.visits[0]._id
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
  const [manualRateByTestId, setManualRateByTestId] = useState<Record<string, string>>({})
  const [savingManualRates, setSavingManualRates] = useState(false)
  const [addTestLoading, setAddTestLoading] = useState(false)
  const [addTestError, setAddTestError] = useState<string | null>(null)
  const [uploadingReportForTestId, setUploadingReportForTestId] = useState<string | null>(null)

  const [showReceipt, setShowReceipt] = useState(false)
  const [incomingTestRequests, setIncomingTestRequests] = useState<LabOrderRequest[]>([])
  const [incomingRequestBillById, setIncomingRequestBillById] = useState<Record<string, string>>({})
  const [requestsLoading, setRequestsLoading] = useState(false)
  const hiddenRequestIdsRef = useRef<Set<string>>(new Set())
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

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const t of diagnosticTests) {
      next[t._id] = t.price != null ? String(t.price) : ''
    }
    setManualRateByTestId(next)
  }, [selectedVisitId, history])

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

  const handleSaveManualRates = async () => {
    if (!patient?.id || !selectedVisitId) return
    const updates: Array<{ testName: string; price: number }> = []
    for (const t of diagnosticTests) {
      const raw = (manualRateByTestId[t._id] ?? '').trim()
      if (!raw) continue
      const parsed = parseFloat(raw)
      if (Number.isNaN(parsed) || parsed < 0) {
        alert(`Invalid rate for ${t.testName}. Please enter a valid non-negative number.`)
        return
      }
      if (t.price == null || Math.abs((t.price ?? 0) - parsed) > 0.0001) {
        updates.push({ testName: t.testName, price: parsed })
      }
    }
    if (updates.length === 0) {
      alert('No rate changes to save.')
      return
    }

    setSavingManualRates(true)
    try {
      await patientService.patchDiagnosticTestPrices(patient.id, selectedVisitId, updates)
      const h = await patientService.getFullHistory(patient.id)
      setHistory(h)
      alert('Rates saved successfully.')
    } catch {
      alert('Could not save rates. Please try again.')
    } finally {
      setSavingManualRates(false)
    }
  }

  const loadIncomingTestRequests = async (silent = false) => {
    if (!silent) setRequestsLoading(true)
    try {
      const list = await orderService.getTestRequests()
      // Keep panel clean: show only active requests.
      const seenIds = new Set<string>()
      const next = list.filter(
        (request) =>
          request.status !== 'COMPLETED' &&
          request.status !== 'CANCELLED' &&
          !seenIds.has(request.id) &&
          (seenIds.add(request.id), true) &&
          !hiddenRequestIdsRef.current.has(request.id)
      )
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
    const name = getRequestTestNames(r)[0] ?? ''
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

    const digits = normalizeMobileDigitsForSearch(r.patientMobile)
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
          return {
            patientId: summary.id,
            visitId: h.visits?.[0]?._id ?? null,
            visitTests: h.visits?.[0]?.diagnosticTests ?? [],
          }
        } catch {
          /* fall through */
        }
      }

      if (digits.length < 10) {
        setSearchError('Patient mobile is missing or invalid on this request.')
        setPatient(null)
        setHistory(null)
        return null
      }

      const options = await patientService.searchByMobileOptions(digits)
      if (options.length === 0) {
        setPatient(null)
        setHistory(null)
        setSearchError('No patient found for this mobile. Try searching manually.')
        return null
      }

      setMatchedPatients(options)
      const match =
        r.patientId ? options.find((p) => p.id === r.patientId) ?? options[0] : options[0]
      await loadPatientProfile(match)
      const refreshed = await patientService.getFullHistory(match.id)
      const visitId = refreshed.visits?.[0]?._id ?? null
      prefillAddTestFromOrderRequest(r)
      scrollLabWorkspaceIntoView()
      return {
        patientId: match.id,
        visitId,
        visitTests: refreshed.visits?.[0]?.diagnosticTests ?? [],
      }
    } catch {
      setSearchError('Could not load patient. Try Search by mobile.')
      return null
    } finally {
      setSearchLoading(false)
    }
  }

  const addRequestTestsToVisit = async (
    r: LabOrderRequest,
    patientId: string,
    visitId: string,
    currentTests: DiagnosticTestItem[]
  ): Promise<{ addedCount: number; skippedCount: number }> => {
    const requested = getRequestTestNames(r)
    if (requested.length === 0) return { addedCount: 0, skippedCount: 0 }

    const existing = new Set(currentTests.map((t) => normalizeLabTestName(t.testName)))
    const missing = requested.filter((name) => !existing.has(normalizeLabTestName(name)))

    if (missing.length === 0) {
      return { addedCount: 0, skippedCount: requested.length }
    }

    await patientService.addDiagnosticTests(
      patientId,
      visitId,
      missing.map((testName) => ({ testName }))
    )
    return { addedCount: missing.length, skippedCount: requested.length - missing.length }
  }

  const handleAcceptIncomingTestRequest = async (r: LabOrderRequest) => {
    const previousRequests = incomingTestRequests
    setIncomingTestRequests((prev) =>
      prev.map((request) => (request.id === r.id ? { ...request, status: 'ACCEPTED' } : request))
    )
    try {
      await orderService.updateTestRequest(r.id, { status: 'ACCEPTED' })
      const context = await openPatientAndPrefillFromTestRequest(r)
      if (context?.patientId && context.visitId) {
        const { addedCount, skippedCount } = await addRequestTestsToVisit(
          r,
          context.patientId,
          context.visitId,
          context.visitTests
        )
        if (addedCount > 0) {
          const refreshed = await patientService.getFullHistory(context.patientId)
          setHistory(refreshed)
        }
        if (addedCount > 0 || skippedCount > 0) {
          const parts: string[] = []
          if (addedCount > 0) parts.push(`${addedCount} test auto-added`)
          if (skippedCount > 0) parts.push(`${skippedCount} already present`)
          setAddTestError(null)
          alert(`Accepted. ${parts.join(' · ')}.`)
        }
      }
      await loadIncomingTestRequests(true)
    } catch {
      setIncomingTestRequests(previousRequests)
      alert('Could not accept request. Please try again.')
    }
  }

  const handleQuickUpdateTestRequest = async (
    r: LabOrderRequest,
    patch: Partial<{ status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'; paymentStatus: 'PENDING' | 'PAID' }>
  ) => {
    const shouldHideImmediately = patch.status === 'COMPLETED' || patch.status === 'CANCELLED'
    const previousRequests = incomingTestRequests

    if (shouldHideImmediately) {
      hiddenRequestIdsRef.current.add(r.id)
      setIncomingTestRequests((prev) => prev.filter((request) => request.id !== r.id))
    } else {
      setIncomingTestRequests((prev) =>
        prev.map((request) =>
          request.id === r.id
            ? {
                ...request,
                ...(patch.status ? { status: patch.status } : {}),
                ...(patch.paymentStatus ? { paymentStatus: patch.paymentStatus } : {}),
              }
            : request
        )
      )
    }

    try {
      await orderService.updateTestRequest(r.id, patch)
      await loadIncomingTestRequests(true)
      if (patient?.id === r.patientId) {
        try {
          const h = await patientService.getFullHistory(patient.id)
          setHistory(h)
        } catch {
          /* ignore */
        }
      }
    } catch {
      if (shouldHideImmediately) {
        hiddenRequestIdsRef.current.delete(r.id)
        setIncomingTestRequests(previousRequests)
      }
      alert('Could not update request. Please try again.')
    }
  }

  const handleMarkPaidIncomingRequest = async (r: LabOrderRequest) => {
    if (r.paymentStatus === 'PAID') return
    const raw = incomingRequestBillById[r.id]?.trim() ?? ''
    const total = parseFloat(raw)
    if (!raw || Number.isNaN(total) || total <= 0) {
      alert('Enter a valid total bill amount (₹) before marking paid. Amounts are split evenly across tests on the visit.')
      return
    }
    if (!r.patientId) {
      alert('Patient is missing on this request.')
      return
    }
    const requestedNames = getRequestTestNames(r)
    if (requestedNames.length === 0) {
      alert('This request has no tests listed.')
      return
    }
    try {
      const h = await patientService.getFullHistory(r.patientId)
      const visitId = findVisitForIncomingLabRequest(h, r)
      if (!visitId) {
        alert('No visit found for this patient. Accept the request first so tests are added to a visit.')
        return
      }
      const visit = h.visits?.find((v) => v._id === visitId)
      const splits = splitTotalInrAcrossTests(total, requestedNames.length)
      const items: { testName: string; price: number }[] = []
      for (let i = 0; i < requestedNames.length; i++) {
        const reqN = normalizeLabTestName(requestedNames[i])
        const dt = visit?.diagnosticTests?.find((t) => normalizeLabTestName(t.testName) === reqN)
        if (dt) items.push({ testName: dt.testName, price: splits[i] })
      }
      if (items.length < requestedNames.length) {
        alert(
          'Some tests from this request are not on the visit yet. Accept the request first, then enter the bill amount.'
        )
        return
      }
      await patientService.patchDiagnosticTestPrices(r.patientId, visitId, items)
      await handleQuickUpdateTestRequest(r, { paymentStatus: 'PAID' })
      if (patient?.id === r.patientId) {
        const refreshed = await patientService.getFullHistory(r.patientId)
        setHistory(refreshed)
      }
    } catch {
      alert('Could not save prices or mark paid. Please try again.')
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

  const getDateBucket = (isoDate: string): 'today' | 'yesterday' | 'older' => {
    const requestDate = new Date(isoDate)
    if (Number.isNaN(requestDate.getTime())) return 'older'

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)

    if (requestDate >= startOfToday) return 'today'
    if (requestDate >= startOfYesterday) return 'yesterday'
    return 'older'
  }

  const todayRequests = incomingTestRequests.filter((request) => getDateBucket(request.createdAt) === 'today')
  const yesterdayRequests = incomingTestRequests.filter((request) => getDateBucket(request.createdAt) === 'yesterday')
  const olderRequests = incomingTestRequests.filter((request) => getDateBucket(request.createdAt) === 'older')

  const renderRequestCard = (r: LabOrderRequest) => (
    <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{r.patientName} ({r.patientMobile})</p>
      <p style={{ margin: '4px 0', fontSize: 13 }}>{r.testName}{r.notes ? ` · ${r.notes}` : ''}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
        {r.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'} · {r.paymentMode} · {r.paymentStatus} · {r.status}
        {r.preferredDateTime ? ` · Preferred ${new Date(r.preferredDateTime).toLocaleString('en-IN')}` : ''}
        {r.expectedFulfillmentMinutes ? ` · Need in ${r.expectedFulfillmentMinutes} min` : ''}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
        Request time: {new Date(r.createdAt).toLocaleString('en-IN')}
      </p>
      <div style={{ marginTop: 10, maxWidth: 280 }}>
        <TextField
          id={`lab-incoming-bill-${r.id}`}
          label="Total bill (₹)"
          value={incomingRequestBillById[r.id] ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, '')
            setIncomingRequestBillById((prev) => ({ ...prev, [r.id]: v }))
          }}
          disabled={r.paymentStatus === 'PAID'}
        />
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
          Required before Mark paid. Total is split evenly across tests for receipts.
        </p>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" onClick={() => void handleAcceptIncomingTestRequest(r)}>
          Accept
        </Button>
        <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateTestRequest(r, { status: 'CANCELLED' })}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateTestRequest(r, { status: 'COMPLETED' })}>
          Ready
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={r.paymentStatus === 'PAID'}
          onClick={() => void handleMarkPaidIncomingRequest(r)}
        >
          Mark paid
        </Button>
      </div>
    </div>
  )

  const renderRequestSection = (
    title: string,
    requests: LabOrderRequest[],
    emptyLabel: string
  ) => (
    <div>
      <p style={{ margin: '6px 0 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: '#475569' }}>
        {title}
      </p>
      {requests.length === 0 ? (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#94a3b8' }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((request) => renderRequestCard(request))}
        </div>
      )}
    </div>
  )

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
                No patient test requests found right now.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  maxHeight: incomingTestRequests.length > 5 ? 420 : undefined,
                  overflowY: incomingTestRequests.length > 5 ? 'auto' : undefined,
                  paddingRight: incomingTestRequests.length > 5 ? 6 : undefined,
                }}
              >
                {renderRequestSection('TODAY', todayRequests, 'No requests today.')}
                {renderRequestSection('YESTERDAY', yesterdayRequests, 'No requests yesterday.')}
                {renderRequestSection('OLDER', olderRequests, 'No older requests.')}
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
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, minWidth: 140 }}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="Enter rate"
                                      value={manualRateByTestId[t._id] ?? ''}
                                      onChange={(e) => {
                                        const cleaned = e.target.value.replace(/[^\d.]/g, '')
                                        setManualRateByTestId((prev) => ({ ...prev, [t._id]: cleaned }))
                                      }}
                                      style={{
                                        width: 110,
                                        padding: '6px 8px',
                                        fontSize: 13,
                                        textAlign: 'right',
                                        borderRadius: 6,
                                        border: '1px solid #d9e2ec',
                                      }}
                                    />
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
                        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={savingManualRates}
                            onClick={() => void handleSaveManualRates()}
                          >
                            {savingManualRates ? 'Saving rates…' : 'Save rates'}
                          </Button>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            Accept ke baad blank rates yahin manually fill karke save karein.
                          </span>
                        </div>
                      )}
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
