import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { Header } from '../components/Header'
import { ClinicLocationSetup } from '../components/ClinicLocationSetup'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { Button } from '../components/ui/Button'
import { DnaLoader } from '../components/ui/DnaLoader'
import {
  patientService,
  pharmacyService,
  orderService,
  type PatientSummary,
  type FullPatientHistory,
  type PharmacyReceipt,
  type PharmacyOrderRequest,
} from '../services/api'

interface MedicineRow {
  id: string
  medicineName: string
  mrp: string
  discount: string
  quantity: string
}

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

function patientIdsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return String(a).trim() === String(b).trim()
}

/** +91… numbers must use the last 10 digits for search, not the first 10 (which included country code). */
function normalizeMobileDigitsForSearch(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length >= 10) return d.slice(-10)
  return d
}

export const MedicineDashboard = () => {
  const name = authStorage.getName() ?? 'Medicine'

  const [mobileSearch, setMobileSearch] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const [history, setHistory] = useState<FullPatientHistory | null>(null)
  const [matchedPatients, setMatchedPatients] = useState<PatientSummary[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')

  const [rows, setRows] = useState<MedicineRow[]>([
    { id: '1', medicineName: '', mrp: '', discount: '0', quantity: '1' },
  ])
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [currentDispensationId, setCurrentDispensationId] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [receiptData, setReceiptData] = useState<PharmacyReceipt | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [incomingRequests, setIncomingRequests] = useState<PharmacyOrderRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [substituteDraftByRequest, setSubstituteDraftByRequest] = useState<Record<string, { name: string; notes: string }>>({})
  const hiddenRequestIdsRef = useRef<Set<string>>(new Set())
  const authWarningShownRef = useRef(false)
  const pharmacyWorkspaceRef = useRef<HTMLDivElement>(null)

  const loadPatientProfile = async (p: PatientSummary) => {
    setPatient(p)
    setSelectedPatientId(p.id)
    const h = await patientService.getFullHistory(p.id)
    setHistory(h)
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError(null)
    setHistory(null)
    setPatient(null)
    setMatchedPatients([])
    setSelectedPatientId('')
    setCurrentDispensationId(null)
    setActiveRequestId(null)
    const digits = normalizeMobileDigitsForSearch(mobileSearch)
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
        setSearchError('No patient found with this mobile number.')
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now()), medicineName: '', mrp: '', discount: '0', quantity: '1' },
    ])
  }

  const updateRow = (id: string, field: keyof MedicineRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const removeRow = (id: string) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const getItems = () => {
    return rows
      .map((r) => {
        const mrp = parseFloat(r.mrp)
        const discount = parseFloat(r.discount) || 0
        const quantity = parseInt(r.quantity, 10) || 1
        if (!r.medicineName.trim() || Number.isNaN(mrp) || mrp <= 0) return null
        return {
          medicineName: r.medicineName.trim(),
          mrp,
          discount: discount >= 0 ? discount : 0,
          quantity: quantity >= 1 ? quantity : 1,
        }
      })
      .filter(Boolean) as Array<{ medicineName: string; mrp: number; discount?: number; quantity?: number }>
  }

  /** Rows with a medicine name must have MRP > 0 before save bill or mark paid. */
  const getMedicinePriceValidationMessage = (): string | null => {
    for (const r of rows) {
      const name = r.medicineName.trim()
      if (!name) continue
      const mrp = parseFloat(r.mrp)
      if (Number.isNaN(mrp) || mrp <= 0) {
        return 'Please insert rate / price (MRP) for each medicine — blank or ₹0 is not allowed.'
      }
    }
    return null
  }

  const items = getItems()
  const subtotal = items.reduce((s, it) => s + it.mrp * (it.quantity ?? 1), 0)
  const totalDiscount = items.reduce((s, it) => s + (it.discount ?? 0), 0)
  const totalAmount = Math.max(0, subtotal - totalDiscount)

  const currentBillFromHistory = history?.pharmacyDispensations?.find((d) => d.id === currentDispensationId)
  const isCurrentBillPaid = currentBillFromHistory?.paymentStatus === 'PAID'

  const handleCreateDispensation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient?.id) return
    const priceMsg = getMedicinePriceValidationMessage()
    if (priceMsg) {
      setCreateError(priceMsg)
      toast.error(priceMsg)
      return
    }
    if (items.length === 0) {
      const msg = 'Add at least one medicine with name and MRP (₹) greater than 0.'
      setCreateError(msg)
      toast.error(msg)
      return
    }
    setCreateError(null)
    setCreateLoading(true)
    try {
      const res = await pharmacyService.createDispensation(patient.id, items)
      setCurrentDispensationId(res.id)
      setPaymentAmount(String(res.totalAmount))
      setReceiptData(null)
      setShowReceipt(false)
      setRows([{ id: String(Date.now()), medicineName: '', mrp: '', discount: '0', quantity: '1' }])
      const h = await patientService.getFullHistory(patient.id)
      setHistory(h)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setCreateError(ax?.response?.data?.message ?? 'Failed to save. Please try again.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleMarkPayment = async () => {
    if (!currentDispensationId) return
    if (isCurrentBillPaid) {
      toast.info('Payment already recorded for this bill.')
      return
    }
    const bill = currentBillFromHistory
    if (bill?.items?.length) {
      const bad = bill.items.find(
        (it) => typeof it.mrp !== 'number' || !Number.isFinite(it.mrp) || it.mrp <= 0
      )
      if (bad) {
        const msg =
          'Please insert rate / price (MRP) for every medicine on this bill before marking paid — blank or ₹0 is not allowed.'
        toast.error(msg)
        return
      }
    }
    let amount = paymentAmount.trim() ? parseFloat(paymentAmount) : NaN
    if (Number.isNaN(amount) || amount <= 0) {
      amount = totalAmount
    }
    if (Number.isNaN(amount) || amount < 0) return
    setPaymentLoading(true)
    try {
      await pharmacyService.recordPayment(currentDispensationId, amount)
      setPaymentAmount('')
      setReceiptData(null)
      const receipt = await pharmacyService.getReceipt(currentDispensationId)
      setReceiptData(receipt)
      setShowReceipt(true)
      if (activeRequestId) {
        await orderService.updateMedicineRequest(activeRequestId, {
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          receiptNumber: receipt.receiptNumber,
          paidAt: receipt.paidAt,
          subtotal: receipt.subtotal,
          totalDiscount: receipt.totalDiscount,
          totalAmount: receipt.totalAmount,
          paidAmount: receipt.paidAmount,
        })
        await loadIncomingRequests(true)
      }
      if (patient?.id) {
        const h = await patientService.getFullHistory(patient.id)
        setHistory(h)
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      toast.error(ax?.response?.data?.message ?? 'Failed to record payment.')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleShowReceipt = async () => {
    if (!currentDispensationId) return
    try {
      const receipt = await pharmacyService.getReceipt(currentDispensationId)
      setReceiptData(receipt)
      setShowReceipt(true)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      toast.error(ax?.response?.data?.message ?? 'Failed to load receipt.')
    }
  }

  const startNewBill = () => {
    setCurrentDispensationId(null)
    setPaymentAmount('')
    setReceiptData(null)
    setShowReceipt(false)
    setActiveRequestId(null)
  }

  const loadIncomingRequests = async (silent = false) => {
    if (authStorage.getRole() !== 'PHARMACY' || !authStorage.getToken()) {
      setIncomingRequests([])
      if (!silent) setRequestsLoading(false)
      return
    }
    if (!silent) setRequestsLoading(true)
    try {
      const list = await orderService.getMedicineRequests()
      const seenIds = new Set<string>()
      const next = list.filter(
        (request) =>
          request.status !== 'COMPLETED' &&
          request.status !== 'CANCELLED' &&
          request.paymentStatus !== 'PAID' &&
          !seenIds.has(request.id) &&
          (seenIds.add(request.id), true) &&
          !hiddenRequestIdsRef.current.has(request.id)
      )
      setIncomingRequests((prev) => {
        const prevKey = JSON.stringify(prev)
        const nextKey = JSON.stringify(next)
        return prevKey === nextKey ? prev : next
      })
      authWarningShownRef.current = false
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e?.response?.status === 401) {
        setIncomingRequests([])
        if (!authWarningShownRef.current) {
          toast.error('Pharmacy session expired or unauthorized. Please login again as Pharmacy.')
          authWarningShownRef.current = true
        }
        return
      }
      if (!silent) {
        toast.error('Could not load medicine requests. Please try again.')
      }
    } finally {
      if (!silent) setRequestsLoading(false)
    }
  }

  useEffect(() => {
    void loadIncomingRequests()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadIncomingRequests(true)
    }, 10000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (patient?.id) void loadIncomingRequests()
  }, [patient?.id])

  const prefillRowsFromOrderRequest = (r: PharmacyOrderRequest) => {
    const sourceItems =
      Array.isArray(r.medicines) && r.medicines.length > 0
        ? r.medicines
        : [{ medicineName: r.medicineName, dosage: r.dosage, quantity: r.quantity }]
    const mappedRows = sourceItems
      .filter((it) => String(it.medicineName ?? '').trim().length > 0)
      .map((it, idx) => {
        const baseName = String(it.medicineName ?? '').trim()
        const withDosage = it.dosage?.trim() ? `${baseName} (${it.dosage.trim()})` : baseName
        const qty = it.quantity != null && it.quantity > 0 ? String(Math.floor(it.quantity)) : '1'
        return {
          id: String(Date.now() + idx),
          medicineName: withDosage,
          mrp: '',
          discount: '0',
          quantity: qty,
        }
      })
    setRows(mappedRows.length > 0 ? mappedRows : [{ id: String(Date.now()), medicineName: '', mrp: '', discount: '0', quantity: '1' }])
    setCreateError(null)
  }

  const scrollPharmacyWorkspaceIntoView = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        pharmacyWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    })
  }

  /** After Accept: same as manual search + autofill requested medicine in the bill table. */
  const openPatientAndPrefillFromRequest = async (r: PharmacyOrderRequest) => {
    setSearchError(null)
    setCurrentDispensationId(null)
    setActiveRequestId(r.id)
    setPaymentAmount('')
    setReceiptData(null)
    setShowReceipt(false)

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
          prefillRowsFromOrderRequest(r)
          scrollPharmacyWorkspaceIntoView()
          return
        } catch {
          /* fall through to mobile search */
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
      prefillRowsFromOrderRequest(r)
      scrollPharmacyWorkspaceIntoView()
    } catch {
      setSearchError('Could not load patient. Try Search by mobile.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleAcceptIncomingRequest = async (r: PharmacyOrderRequest) => {
    const previousRequests = incomingRequests
    setIncomingRequests((prev) =>
      prev.map((request) => (request.id === r.id ? { ...request, status: 'ACCEPTED' } : request))
    )
    try {
      await orderService.updateMedicineRequest(r.id, { status: 'ACCEPTED' })
      await openPatientAndPrefillFromRequest(r)
      await loadIncomingRequests(true)
      toast.success('Accepted. Medicine lines prefilled — enter MRP/discount and save bill.', { autoClose: 2800 })
    } catch {
      setIncomingRequests(previousRequests)
      toast.error('Could not accept request. Please try again.')
    }
  }

  const handleQuickUpdateRequest = async (
    r: PharmacyOrderRequest,
    patch: Partial<{ status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'; paymentStatus: 'PENDING' | 'PAID' }>
  ) => {
    const shouldHideImmediately = patch.status === 'COMPLETED' || patch.status === 'CANCELLED'
    const previousRequests = incomingRequests

    if (shouldHideImmediately) {
      hiddenRequestIdsRef.current.add(r.id)
      setIncomingRequests((prev) => prev.filter((request) => request.id !== r.id))
    } else {
      setIncomingRequests((prev) =>
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
      await orderService.updateMedicineRequest(r.id, patch)
      if (r.patientId) {
        try {
          const h = await patientService.getFullHistory(r.patientId)
          if (patient && patientIdsMatch(patient.id, r.patientId)) {
            setHistory(h)
          }
        } catch {
          /* ignore */
        }
      }
      if (patch.paymentStatus === 'PAID') {
        hiddenRequestIdsRef.current.add(r.id)
        setIncomingRequests((prev) => prev.filter((request) => request.id !== r.id))
      }
      await loadIncomingRequests(true)
      if (patch.status === 'CANCELLED') {
        hiddenRequestIdsRef.current.delete(r.id)
        toast.success('Request cancelled.', { autoClose: 2500 })
      }
    } catch (err: unknown) {
      if (shouldHideImmediately) {
        hiddenRequestIdsRef.current.delete(r.id)
      }
      setIncomingRequests(previousRequests)
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e?.response?.data?.message?.trim()
      toast.error(msg || 'Could not update request. Please try again.')
    }
  }

  const handleMarkPaidIncomingRequest = async (r: PharmacyOrderRequest) => {
    if (r.paymentStatus === 'PAID') return
    setConfirmState({
      message:
        'Mark this medicine order as paid on the request record? Use “Mark as paid” under Payment after saving a bill if you need a receipt.',
      onConfirm: () => void handleQuickUpdateRequest(r, { paymentStatus: 'PAID' }),
    })
  }

  const handleMarkSubstitute = async (r: PharmacyOrderRequest) => {
    const draft = substituteDraftByRequest[r.id]
    const substituteName = (draft?.name ?? '').trim()
    if (!substituteName) {
      toast.error('Enter substitute medicine name first.')
      return
    }
    try {
      await orderService.updateMedicineRequest(r.id, {
        isSubstitute: true,
        substituteMedicineName: substituteName,
        substituteNotes: (draft?.notes ?? '').trim() || undefined,
      })
      toast.success('Substitute medicine marked successfully.')
      await loadIncomingRequests(true)
      if (patient && patientIdsMatch(patient.id, r.patientId)) {
        const h = await patientService.getFullHistory(r.patientId)
        setHistory(h)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Could not save substitute medicine.')
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

  const todayRequests = incomingRequests.filter((request) => getDateBucket(request.createdAt) === 'today')
  const yesterdayRequests = incomingRequests.filter((request) => getDateBucket(request.createdAt) === 'yesterday')
  const olderRequests = incomingRequests.filter((request) => getDateBucket(request.createdAt) === 'older')

  const renderPharmacyRequestCard = (r: PharmacyOrderRequest) => (
    <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{r.patientName} ({r.patientMobile})</p>
      <div style={{ margin: '4px 0', fontSize: 13 }}>
        {(r.medicines && r.medicines.length > 0
          ? r.medicines
          : [{ medicineName: r.medicineName, dosage: r.dosage, quantity: r.quantity }]
        ).map((m, idx) => (
          <p key={`${r.id}-${idx}`} style={{ margin: idx === 0 ? '0 0 2px' : '0 0 2px' }}>
            {m.medicineName}
            {m.dosage ? ` · ${m.dosage}` : ''}
            {m.quantity ? ` · Qty ${m.quantity}` : ''}
          </p>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
        {r.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup'} · {r.paymentMode} · {r.paymentStatus} · {r.status}
        {r.expectedFulfillmentMinutes ? ` · Need in ${r.expectedFulfillmentMinutes} min` : ''}
      </p>
      {r.isSubstitute && r.substituteMedicineName && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          Substitute: {r.substituteMedicineName}
          {r.substituteNotes ? ` · ${r.substituteNotes}` : ''}
        </p>
      )}
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
        Request time: {new Date(r.createdAt).toLocaleString('en-IN')}
      </p>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        <input
          type="text"
          value={substituteDraftByRequest[r.id]?.name ?? ''}
          onChange={(e) =>
            setSubstituteDraftByRequest((prev) => ({
              ...prev,
              [r.id]: { name: e.target.value, notes: prev[r.id]?.notes ?? '' },
            }))
          }
          placeholder="Substitute medicine name (if original unavailable)"
          style={{
            width: '100%',
            padding: '7px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <input
          type="text"
          value={substituteDraftByRequest[r.id]?.notes ?? ''}
          onChange={(e) =>
            setSubstituteDraftByRequest((prev) => ({
              ...prev,
              [r.id]: { name: prev[r.id]?.name ?? '', notes: e.target.value },
            }))
          }
          placeholder="Substitute note (e.g. same composition, different brand)"
          style={{
            width: '100%',
            padding: '7px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" onClick={() => void handleAcceptIncomingRequest(r)}>
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setConfirmState({
              message: 'Cancel this request? It will be removed from the list.',
              onConfirm: () => void handleQuickUpdateRequest(r, { status: 'CANCELLED' }),
            })
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setConfirmState({
              message: 'Mark this order as ready (completed)? It will be removed from the incoming list.',
              onConfirm: () => void handleQuickUpdateRequest(r, { status: 'COMPLETED' }),
            })
          }}
        >
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleMarkSubstitute(r)}
        >
          Mark substitute
        </Button>
      </div>
    </div>
  )

  const renderPharmacyRequestSection = (
    title: string,
    requests: PharmacyOrderRequest[],
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
          {requests.map((request) => renderPharmacyRequestCard(request))}
        </div>
      )}
    </div>
  )

  return (
    <div className="app-shell">
      <Header doctorName={name} />
      <div style={{ maxWidth: 1280, margin: '12px auto 0', padding: '0 16px' }}>
        <ClinicLocationSetup />
      </div>
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
            <p className="dashboard-kicker">Patient medicine orders</p>
            <h2 className="dashboard-heading">Incoming requests</h2>
            <p className="dashboard-body" style={{ marginBottom: 12 }}>
              Patient requests from their profile are shown here with name, mobile, payment and delivery preference.
            </p>
            {requestsLoading ? (
              <DnaLoader label="Loading requests..." />
            ) : incomingRequests.length === 0 ? (
              <p className="dashboard-body">No medicine requests yet.</p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  maxHeight: incomingRequests.length > 5 ? 420 : undefined,
                  overflowY: incomingRequests.length > 5 ? 'auto' : undefined,
                  paddingRight: incomingRequests.length > 5 ? 6 : undefined,
                }}
              >
                {renderPharmacyRequestSection('TODAY', todayRequests, 'No requests today.')}
                {renderPharmacyRequestSection('YESTERDAY', yesterdayRequests, 'No requests yesterday.')}
                {renderPharmacyRequestSection('OLDER', olderRequests, 'No older requests.')}
              </div>
            )}
              </Card>
            </div>

            <div>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Medicine</p>
            <h2 className="dashboard-heading">Search patient by mobile</h2>
            <p className="dashboard-body" style={{ marginBottom: 16 }}>
              Enter the patient&apos;s 10-digit mobile number to view details and create a medicine bill (MRP, discount, payment, receipt).
            </p>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TextField
                id="med-mobile-search"
                label="Mobile number"
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="10-digit number"
                type="tel"
                maxLength={15}
              />
              <div style={{ alignSelf: 'flex-end' }}>
                <Button type="submit" disabled={searchLoading}>
                  {searchLoading ? 'Searching…' : 'Search'}
                </Button>
              </div>
            </form>
            {searchError && (
              <p style={{ color: 'var(--color-error)', marginTop: 8, fontSize: 14 }}>{searchError}</p>
            )}
            {searchLoading && <DnaLoader label="Searching patient..." size={42} />}
          </Card>

          {patient && history && (
            <div ref={pharmacyWorkspaceRef}>
              {matchedPatients.length > 1 && (
                <div style={{ marginTop: 16 }}>
                  <Card className="dashboard-overview-card">
                    <p className="dashboard-kicker">Family profiles</p>
                    <p className="dashboard-body" style={{ marginBottom: 8 }}>
                      This mobile is linked to multiple family members. Select the correct patient.
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
                        onClick={() =>
                          void patientService.openDocument(patient.id, history.documents[0].id, {
                            assistantVerified: Boolean(history.documents[0].verifiedAt),
                          })
                        }
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
                  <p className="dashboard-kicker">Add medicines</p>
                  <p className="dashboard-body" style={{ marginBottom: 12 }}>
                    Enter medicine name, <strong>MRP (₹) required</strong> (must be greater than 0), discount (₹) and quantity.
                    Amount = (MRP × Qty) − Discount per row. You cannot save the bill or mark paid without a valid price per line.
                  </p>
                  <div
                    style={{
                      overflowX: 'auto',
                      overflowY: rows.length > 5 ? 'auto' : undefined,
                      maxHeight: rows.length > 5 ? 320 : undefined,
                      marginBottom: 12,
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: '#f0f4f8', borderBottom: '2px solid #d9e2ec' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Medicine name</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>MRP (₹)</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Discount (₹)</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Qty</th>
                          <th style={{ padding: '8px', width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                value={r.medicineName}
                                onChange={(e) => updateRow(r.id, 'medicineName', e.target.value)}
                                placeholder="Name"
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={r.mrp}
                                onChange={(e) => updateRow(r.id, 'mrp', e.target.value)}
                                placeholder="0"
                                style={{
                                  width: 80,
                                  padding: '6px 8px',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  textAlign: 'right',
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={r.discount}
                                onChange={(e) => updateRow(r.id, 'discount', e.target.value)}
                                placeholder="0"
                                style={{
                                  width: 70,
                                  padding: '6px 8px',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  textAlign: 'right',
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                min={1}
                                value={r.quantity}
                                onChange={(e) => updateRow(r.id, 'quantity', e.target.value)}
                                style={{
                                  width: 56,
                                  padding: '6px 8px',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  textAlign: 'right',
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <button
                                type="button"
                                onClick={() => removeRow(r.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  fontSize: 18,
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                                title="Remove row"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={addRow}
                    style={{
                      fontSize: 13,
                      color: '#0d47a1',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 0',
                      marginBottom: 12,
                    }}
                  >
                    + Add another medicine
                  </button>
                  <p style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Subtotal: ₹{subtotal.toFixed(2)} · Discount: ₹{totalDiscount.toFixed(2)} · Total: ₹{totalAmount.toFixed(2)}
                  </p>
                  <Button
                    type="button"
                    onClick={handleCreateDispensation}
                    disabled={createLoading || items.length === 0}
                  >
                    {createLoading ? 'Saving…' : 'Save bill'}
                  </Button>
                  {createError && (
                    <p style={{ color: 'var(--color-error)', marginTop: 8, fontSize: 14 }}>{createError}</p>
                  )}
                </Card>
              </div>

              {currentDispensationId && (
                <div style={{ marginTop: 16 }}>
                  <Card className="dashboard-overview-card" style={{ padding: 20, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <p className="dashboard-kicker">Payment & receipt</p>
                    {currentDispensationId && (
                      <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>
                        Status:{' '}
                        <span
                          style={{
                            color:
                              currentBillFromHistory?.paymentStatus === 'PAID'
                                ? '#047857'
                                : currentBillFromHistory?.paymentStatus === 'PARTIAL'
                                  ? '#b45309'
                                  : '#64748b',
                          }}
                        >
                          {currentBillFromHistory?.paymentStatus ?? '—'}
                        </span>
                        {currentBillFromHistory != null && (
                          <span style={{ fontWeight: 400, color: '#475569' }}>
                            {' '}
                            · Total ₹{Number(currentBillFromHistory.totalAmount ?? 0).toFixed(2)}
                            {currentBillFromHistory.receiptNumber
                              ? ` · ${currentBillFromHistory.receiptNumber}`
                              : ''}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="dashboard-body" style={{ marginBottom: 12 }}>
                      Record payment and generate receipt for the last saved bill.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                      <TextField
                        id="med-payment-amount"
                        label="Amount received (₹)"
                        type="number"
                        min={0}
                        step={0.01}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0"
                        disabled={isCurrentBillPaid || paymentLoading}
                      />
                      <Button type="button" onClick={handleMarkPayment} disabled={paymentLoading || isCurrentBillPaid}>
                        {paymentLoading ? 'Saving…' : isCurrentBillPaid ? 'Paid' : 'Mark as paid'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={handleShowReceipt}>
                        View / Download receipt
                      </Button>
                      <Button type="button" variant="secondary" onClick={startNewBill}>
                        New bill
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
            </div>
          </div>
        </section>
      </main>

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
            id="pharmacy-receipt"
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 440,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Medicine receipt</h2>
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
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>Receipt # {receiptData.receiptNumber}</p>
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>Patient: <strong>{receiptData.patient.name}</strong></p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>Mobile: {receiptData.patient.mobile}</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#94a3b8' }}>Dispensed by: {receiptData.dispensedBy}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, marginBottom: 12, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0' }}>Medicine</th>
                  <th style={{ textAlign: 'right', padding: '8px 0' }}>MRP</th>
                  <th style={{ textAlign: 'right', padding: '8px 0' }}>Disc</th>
                  <th style={{ textAlign: 'right', padding: '8px 0' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {receiptData.items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0' }}>{it.medicineName}</td>
                    <td style={{ textAlign: 'right', padding: '6px 0' }}>₹{it.mrp}</td>
                    <td style={{ textAlign: 'right', padding: '6px 0' }}>₹{it.discount}</td>
                    <td style={{ textAlign: 'right', padding: '6px 0' }}>{it.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '6px 0' }}>₹{it.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '8px 0 4px', fontSize: 13 }}>Subtotal: ₹{receiptData.subtotal} · Discount: ₹{receiptData.totalDiscount}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Total: ₹{receiptData.totalAmount}</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Paid: ₹{receiptData.paidAmount} · Status: {receiptData.paymentStatus}</p>
            {receiptData.paidAt && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Paid on: {new Date(receiptData.paidAt).toLocaleString('en-IN')}
              </p>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <Button type="button" onClick={() => window.print()}>Print / Save as PDF</Button>
              <Button type="button" variant="secondary" onClick={() => setShowReceipt(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
          }}
          onClick={() => setConfirmState(null)}
        >
          <div
            style={{
              width: 'min(480px, 100%)',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #dbeafe',
              boxShadow: '0 22px 45px rgba(15, 23, 42, 0.25)',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="dashboard-kicker" style={{ marginBottom: 8 }}>Please confirm</p>
            <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>{confirmState.message}</p>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="secondary" onClick={() => setConfirmState(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const action = confirmState.onConfirm
                  setConfirmState(null)
                  action()
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
