import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  patientPortalService,
  type FullPatientHistory,
  type PharmacyDispensationSummary,
  type DiagnosticTestItem,
  type ServiceProviderOption,
} from '../services/api'
import { patientStorage } from '../utils/patientStorage'
import { DnaLoader } from '../components/ui/DnaLoader'

const PATIENT_PROFILE_CACHE_KEY = 'patient_profile_cache_v1'

function readCachedPatientProfile(): FullPatientHistory | null {
  try {
    const raw = window.sessionStorage.getItem(PATIENT_PROFILE_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FullPatientHistory
  } catch {
    return null
  }
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  const msg = e?.response?.data?.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  if (typeof e?.message === 'string' && e.message.trim()) return e.message.trim()
  return fallback
}

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

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/** `window.open('', …, 'noopener')` returns null but can still open a blank tab — `document.write` never runs. Blob URL avoids that. */
function openHtmlInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    URL.revokeObjectURL(url)
    toast.error('Popup blocked. Allow popups for this site to view the receipt.')
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function dateOnly(input: string | Date | undefined): string | null {
  if (!input) return null
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function normalizeLabName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '') // remove spaces and punctuation
}

/** Patient request "CBC" vs visit row "Complete Blood Count (CBC)" after normalizeLabName */
function labNormalizedNamesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.includes(b) || b.includes(a)
}

/** Label for provider dropdown: always show km when we can compute it. */
function formatProviderOptionLabel(
  p: ServiceProviderOption,
  geo: 'loading' | 'ok' | 'none'
): string {
  if (typeof p.distanceKm === 'number') {
    return `${p.name} · ${p.distanceKm.toFixed(1)} km`
  }
  if (geo === 'loading') {
    return `${p.name} · …`
  }
  if (geo === 'ok') {
    return `${p.name} · — km (no map location on file)`
  }
  return `${p.name} · — (allow location for km)`
}

function PatientProfileAccordionSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="patient-profile-section patient-profile-accordion-section">
      <button
        type="button"
        className="patient-profile-accordion-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="patient-profile-accordion-title">{title}</span>
        <span className="patient-profile-accordion-icon" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open ? <div className="patient-profile-accordion-panel">{children}</div> : null}
    </section>
  )
}

function ProviderDistanceHint({
  geo,
  providers,
}: {
  geo: 'loading' | 'ok' | 'none'
  providers: ServiceProviderOption[]
}) {
  if (geo === 'loading') {
    return <p className="patient-profile-distance-hint">Getting distances…</p>
  }
  if (providers.length === 0) {
    return null
  }
  const withKm = providers.filter((p) => typeof p.distanceKm === 'number')
  if (geo === 'none') {
    return (
      <p className="patient-profile-distance-hint">
        Turn on / allow location for this site to see straight-line distance (km) from you for each tie-up.
      </p>
    )
  }
  if (withKm.length === 0) {
    return (
      <p className="patient-profile-distance-hint">
        Tie-ups have no map coordinates yet — distance (km) will show after clinic location is saved.
      </p>
    )
  }
  return (
    <p className="patient-profile-distance-hint">
      Distance is approximate straight-line km from your location; list is sorted nearest first.
    </p>
  )
}

export const PatientProfile = () => {
  const [data, setData] = useState<FullPatientHistory | null>(() => readCachedPatientProfile())
  const [loading, setLoading] = useState(() => readCachedPatientProfile() === null)
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
  const [pharmacyProviders, setPharmacyProviders] = useState<ServiceProviderOption[]>([])
  const [selectedPharmacyProviderId, setSelectedPharmacyProviderId] = useState('')
  const [addTestName, setAddTestName] = useState('')
  const [addTestNotes, setAddTestNotes] = useState('')
  const [addTestServiceType, setAddTestServiceType] = useState<'LAB_VISIT' | 'HOME_SERVICE'>('LAB_VISIT')
  const [addTestPaymentMode, setAddTestPaymentMode] = useState<'ONLINE' | 'OFFLINE'>('OFFLINE')
  const [addTestPreferredDateTime, setAddTestPreferredDateTime] = useState('')
  const [addTestEtaMinutes, setAddTestEtaMinutes] = useState('')
  const [labProviders, setLabProviders] = useState<ServiceProviderOption[]>([])
  const [selectedLabProviderId, setSelectedLabProviderId] = useState('')
  const [providerGeoStatus, setProviderGeoStatus] = useState<'loading' | 'ok' | 'none'>('loading')
  const lastVisibilityRefreshRef = useRef(0)
  const paymentToastShownRef = useRef<Set<string>>(new Set())
  const dataRef = useRef<FullPatientHistory | null>(data)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const paidLabToastSignature = useMemo(() => {
    const list = data?.testRequests ?? []
    return list
      .filter((t) => t.paymentStatus === 'PAID')
      .map((t) => t.id)
      .sort()
      .join(',')
  }, [data?.testRequests])

  const readyMedicineToastSignature = useMemo(() => {
    const list = data?.medicineRequests ?? []
    return list
      .filter((m) => m.status === 'COMPLETED' && m.paymentStatus === 'PAID')
      .map((m) => m.id)
      .sort()
      .join(',')
  }, [data?.medicineRequests])

  useEffect(() => {
    if (loading || !data) return
    for (const t of data.testRequests ?? []) {
      if (t.paymentStatus !== 'PAID') continue
      const k = `toast-lab-paid-${t.id}`
      if (paymentToastShownRef.current.has(k)) continue
      paymentToastShownRef.current.add(k)
      let msg = `Payment received for ${t.testName}`
      if (t.receiptNumber) msg += ` — receipt no. ${t.receiptNumber}`
      msg += '. Follow lab instructions for sample collection or visit.'
      toast.success(msg, { toastId: k, autoClose: 3000 })
    }
    for (const m of data.medicineRequests ?? []) {
      if (m.status !== 'COMPLETED' || m.paymentStatus !== 'PAID') continue
      const k = `toast-med-ready-${m.id}`
      if (paymentToastShownRef.current.has(k)) continue
      paymentToastShownRef.current.add(k)
      toast.success(`Your medicine order "${m.medicineName}" is ready. Please collect now.`, {
        toastId: k,
        autoClose: 3000,
      })
    }
  }, [loading, data, paidLabToastSignature, readyMedicineToastSignature])

  const loadProfile = useCallback(() => {
    const shouldShowBlockingLoader = !dataRef.current
    setError(null)
    if (shouldShowBlockingLoader) setLoading(true)
    patientPortalService
      .getProfile()
      .then((profile) => {
        setData(profile)
        try {
          window.sessionStorage.setItem(PATIENT_PROFILE_CACHE_KEY, JSON.stringify(profile))
        } catch {
          // ignore cache write errors
        }
      })
      .catch((err: unknown) => {
        const e = err as {
          response?: { status?: number; data?: { message?: string } }
          code?: string
          message?: string
        }
        if (e?.response?.status === 401) {
          try {
            window.sessionStorage.removeItem(PATIENT_PROFILE_CACHE_KEY)
          } catch {
            // ignore cache cleanup errors
          }
          patientStorage.clear()
          window.location.replace('/patient-login')
          return
        }
        if (!e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error')) {
          setError(
            'Server not reachable. Open a terminal in Btbiz_backend and run: npm run start (port 4000), then refresh this page.'
          )
          return
        }
        const msg = e?.response?.data?.message
        if (typeof msg === 'string' && msg.trim()) {
          setError(msg.trim())
          return
        }
        setError('Unable to load profile.')
      })
      .finally(() => {
        if (shouldShowBlockingLoader) setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  /** When patient returns to this tab (e.g. after pharmacy marks paid), refresh so PAID + receipt show without manual reload. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastVisibilityRefreshRef.current < 4000) return
      lastVisibilityRefreshRef.current = now
      loadProfile()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loadProfile])

  useEffect(() => {
    let cancelled = false

    const loadProviders = async (lat?: number, lng?: number) => {
      try {
        const [labs, pharmacies] = await Promise.all([
          patientPortalService.getServiceProviders('lab', lat, lng),
          patientPortalService.getServiceProviders('pharmacy', lat, lng),
        ])
        if (!cancelled) {
          setLabProviders(labs)
          setPharmacyProviders(pharmacies)
        }
      } catch {
        if (!cancelled) {
          setLabProviders([])
          setPharmacyProviders([])
        }
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) setProviderGeoStatus('ok')
          loadProviders(pos.coords.latitude, pos.coords.longitude)
        },
        () => {
          if (!cancelled) setProviderGeoStatus('none')
          loadProviders()
        },
        { timeout: 12000, maximumAge: 300000, enableHighAccuracy: false }
      )
    } else {
      setProviderGeoStatus('none')
      loadProviders()
    }

    return () => {
      cancelled = true
    }
  }, [])

  const selectedLabProvider = useMemo(
    () => labProviders.find((p) => p.id === selectedLabProviderId),
    [labProviders, selectedLabProviderId]
  )
  const selectedPharmacyProvider = useMemo(
    () => pharmacyProviders.find((p) => p.id === selectedPharmacyProviderId),
    [pharmacyProviders, selectedPharmacyProviderId]
  )

  const handleLogout = () => {
    patientStorage.clear()
    window.location.href = '/'
  }

  const patientName = patientStorage.getPatientName() ?? data?.patient?.firstName ?? 'Patient'

  if (loading) {
    return (
      <div className="patient-profile">
        <div className="patient-profile-loading">
          <DnaLoader label="Loading your profile..." size={56} />
        </div>
        <style>{patientProfileStyles}</style>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="patient-profile">
        <div className="patient-profile-error">
          <p>{error ?? 'Profile not found.'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, justifyContent: 'center' }}>
            <Link to="/patient-login">Sign in again</Link>
            <Link to="/">Back to Home</Link>
          </div>
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

  const labPaidRequests = testRequests.filter((t) => t.paymentStatus === 'PAID')

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
      toast.error('Failed to upload document.')
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
        preferredProviderId: selectedPharmacyProviderId || undefined,
      })
      setAddMedicineName('')
      setAddMedicineDosage('')
      setAddMedicineNotes('')
      setAddMedicineEtaMinutes('')
      setSelectedPharmacyProviderId('')
      loadProfile()
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      toast.error(apiErrorMessage(err, 'Failed to add medicine.'))
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
        preferredProviderId: selectedLabProviderId || undefined,
      })
      setAddTestName('')
      setAddTestNotes('')
      setAddTestPreferredDateTime('')
      setAddTestEtaMinutes('')
      setSelectedLabProviderId('')
      loadProfile()
    } catch (err: unknown) {
      // eslint-disable-next-line no-alert
      toast.error(apiErrorMessage(err, 'Failed to add test.'))
    } finally {
      setAddingTest(false)
    }
  }

  const handleViewPharmacyReceipt = (d: PharmacyDispensationSummary) => {
    try {
      const safeReceiptNumber = escapeHtml(d.receiptNumber ?? '—')
      const safePaidAt = escapeHtml(d.paidAt ? formatDateTime(d.paidAt) : '—')
      const safeCreatedAt = escapeHtml(formatDateTime(d.createdAt))
      const safeMobile = escapeHtml(patient?.mobileNumber ?? '')
      const safeDispensedBy = escapeHtml(d.dispensedBy)

      const itemsHtml =
        d.items?.length
          ? d.items
              .map((it) => {
                const qty = Number(it.quantity ?? 0)
                const mrp = Number(it.mrp ?? 0)
                const discount = Number(it.discount ?? 0)
                const amount = Number(it.amount ?? 0)
                return `<tr>
                  <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb; text-align:left;">
                    ${escapeHtml(it.medicineName)}
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb; text-align:right;">${qty}</td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb; text-align:right;">₹${mrp}</td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb; text-align:right;">₹${discount}</td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb; text-align:right;">₹${amount}</td>
                </tr>`
              })
              .join('')
          : `<tr><td colspan="5" style="padding:10px 6px;color:#64748b;">No items</td></tr>`

      const body = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Pharmacy receipt</title>
          <style>
            @media print {
              body, body * { visibility: visible !important; }
            }
          </style>
        </head>
        <body style="font-family:system-ui;padding:24px;">
          <h2 style="margin:0 0 12px;">Pharmacy bill — Receipt</h2>
          <div style="color:#334155;font-size:13px;line-height:1.5;">
            <p style="margin:0 0 6px;"><strong>Receipt no.:</strong> ${safeReceiptNumber}</p>
            <p style="margin:0 0 6px;"><strong>Dispensed by:</strong> ${safeDispensedBy}</p>
            <p style="margin:0 0 6px;"><strong>Dispensed on:</strong> ${safeCreatedAt}</p>
            <p style="margin:0 0 6px;"><strong>Patient mobile:</strong> ${safeMobile}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px 6px;border-bottom:2px solid #e2e8f0;">Medicine</th>
                <th style="text-align:right;padding:10px 6px;border-bottom:2px solid #e2e8f0;">Qty</th>
                <th style="text-align:right;padding:10px 6px;border-bottom:2px solid #e2e8f0;">MRP</th>
                <th style="text-align:right;padding:10px 6px;border-bottom:2px solid #e2e8f0;">Discount</th>
                <th style="text-align:right;padding:10px 6px;border-bottom:2px solid #e2e8f0;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-top:14px;font-size:13px;color:#0f172a;">
            <p style="margin:6px 0;"><strong>Subtotal:</strong> ₹${d.subtotal ?? 0}</p>
            <p style="margin:6px 0;"><strong>Total discount:</strong> ₹${d.totalDiscount ?? 0}</p>
            <p style="margin:6px 0;"><strong>Total:</strong> ₹${d.totalAmount ?? 0}</p>
            <p style="margin:6px 0;"><strong>Paid:</strong> ₹${d.paidAmount ?? 0} · ${escapeHtml(d.paymentStatus)}</p>
            <p style="margin:6px 0;color:#64748b;"><strong>Paid at:</strong> ${safePaidAt}</p>
          </div>

          <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" onclick="window.print()" style="padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;cursor:pointer;">
              Print / Save as PDF
            </button>
          </div>
        </body>
      </html>`

      openHtmlInNewTab(body)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to open pharmacy receipt:', e)
      toast.error('Failed to open receipt. Please try again.')
    }
  }

  const findReceiptForDiagnosticTest = (
    testName: string,
    visitDate: string,
    diagnosticCreatedAt?: string
  ) => {
    const rawName = String(testName ?? '').trim()
    const name = normalizeLabName(rawName)
    if (!name) return null

    // Prefer exact same-day matches (if dates exist), but fall back to name-only.
    const visitDay = dateOnly(visitDate)
    const createdDay = dateOnly(diagnosticCreatedAt)

    const matchesByDay = labPaidRequests.filter((r) => {
      const rName = normalizeLabName(String(r.testName ?? '').trim())
      if (!rName || !labNormalizedNamesMatch(rName, name)) return false

      const paidDay = dateOnly(r.paidAt)
      const createdReqDay = dateOnly(r.createdAt)

      if (visitDay) {
        return (paidDay && paidDay === visitDay) || (createdReqDay && createdReqDay === visitDay)
      }

      if (createdDay) {
        return (paidDay && paidDay === createdDay) || (createdReqDay && createdReqDay === createdDay)
      }

      return false
    })

    if (matchesByDay.length > 0) return matchesByDay[0]

    // Name-only fallback (most reliable across mismatched timestamps).
    return (
      labPaidRequests.find((r) =>
        labNormalizedNamesMatch(
          normalizeLabName(String(r.testName ?? '').trim()),
          name
        )
      ) ?? null
    )
  }

  const findPaidForDiagnosticTest = (
    testName: string,
    visitDate: string,
    diagnosticCreatedAt?: string
  ) => {
    const rawName = String(testName ?? '').trim()
    const name = normalizeLabName(rawName)
    if (!name) return null

    const visitDay = dateOnly(visitDate)
    const createdDay = dateOnly(diagnosticCreatedAt)

    const matches = labPaidRequests.filter((r) => {
      const rName = normalizeLabName(String(r.testName ?? '').trim())
      if (!rName || !labNormalizedNamesMatch(rName, name)) return false

      const paidDay = dateOnly(r.paidAt)
      const createdReqDay = dateOnly(r.createdAt)

      if (visitDay) {
        return (paidDay && paidDay === visitDay) || (createdReqDay && createdReqDay === visitDay)
      }
      if (createdDay) {
        return (paidDay && paidDay === createdDay) || (createdReqDay && createdReqDay === createdDay)
      }
      return false
    })

    if (matches.length > 0) return matches[0]

    // Fallback: production data can have date drift between request and visit.
    // If names match, still treat as paid so report/receipt does not get stuck at "pending".
    const byName = labPaidRequests.filter((r) =>
      labNormalizedNamesMatch(
        normalizeLabName(String(r.testName ?? '').trim()),
        name
      )
    )
    if (byName.length === 0) return null
    if (byName.length === 1) return byName[0]
    return byName
      .slice()
      .sort((a, b) => {
        const at = new Date(a.paidAt ?? a.createdAt ?? 0).getTime()
        const bt = new Date(b.paidAt ?? b.createdAt ?? 0).getTime()
        return bt - at
      })[0]
  }

  const handleViewLabReceipt = (payload: {
    testName: string
    receiptNumber?: string
    paidAt?: string
    price?: number
    serviceType?: 'LAB_VISIT' | 'HOME_SERVICE'
  }) => {
    const safeReceiptNumber = escapeHtml(payload.receiptNumber ?? '—')
    const safePaidAt = escapeHtml(payload.paidAt ? formatDateTime(payload.paidAt) : '—')
    const safeTestName = escapeHtml(payload.testName)
    const safeServiceType =
      payload.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'
    const safePrice = Number(payload.price ?? 0)

    const body = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Lab receipt</title>
          <style>
            @media print {
              body, body * { visibility: visible !important; }
            }
          </style>
        </head>
        <body style="font-family:system-ui;padding:24px;">
          <h2 style="margin:0 0 12px;">Lab test — Payment Receipt</h2>
          <div style="font-size:13px;color:#334155;line-height:1.6;">
            <p style="margin:0 0 6px;"><strong>Test:</strong> ${safeTestName}</p>
            <p style="margin:0 0 6px;"><strong>Receipt no.:</strong> ${safeReceiptNumber}</p>
            <p style="margin:0 0 6px;"><strong>Paid at:</strong> ${safePaidAt}</p>
            <p style="margin:0 0 6px;"><strong>Service:</strong> ${safeServiceType}</p>
            <p style="margin:0 0 6px;"><strong>Rate:</strong> ₹${safePrice}</p>
          </div>
          <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" onclick="window.print()" style="padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;cursor:pointer;">
              Print / Save as PDF
            </button>
          </div>
        </body>
      </html>`

    openHtmlInNewTab(body)
  }

  const handleViewMedicineOrderReceipt = (m: {
    medicineName: string
    dosage?: string
    quantity?: number
    notes?: string
    receiptNumber?: string
    paidAt?: string
    serviceType?: 'PICKUP' | 'HOME_DELIVERY'
    paymentMode?: 'ONLINE' | 'OFFLINE'
    preferredProviderName?: string
    subtotal?: number
    totalDiscount?: number
    totalAmount?: number
    paidAmount?: number
  }) => {
    const safeReceipt = escapeHtml(m.receiptNumber ?? '—')
    const safePaidAt = escapeHtml(m.paidAt ? formatDateTime(m.paidAt) : '—')
    const safeName = escapeHtml(m.medicineName)
    const safeDosage = escapeHtml(m.dosage ?? '')
    const safeNotes = escapeHtml(m.notes ?? '')
    const safePatient = escapeHtml(
      [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Patient'
    )
    const safeMobile = escapeHtml(patient.mobileNumber ?? '')
    const safePharmacy = escapeHtml(m.preferredProviderName ?? 'Pharmacy')
    const serviceLabel =
      m.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup from medical'
    const payLabel = formatMedicinePaymentLabel(m.paymentMode, m.serviceType)
    const subtotal = Number(m.subtotal ?? 0)
    const totalDiscount = Number(m.totalDiscount ?? 0)
    const totalAmount = Number(m.totalAmount ?? 0)
    const paidAmount = Number(m.paidAmount ?? totalAmount)

    const body = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Medicine order receipt</title>
          <style>@media print { body, body * { visibility: visible !important; } }</style>
        </head>
        <body style="font-family:system-ui;padding:24px;max-width:560px;">
          <h2 style="margin:0 0 12px;">Medicine order — Receipt</h2>
          <div style="font-size:13px;color:#334155;line-height:1.65;">
            <p style="margin:0 0 6px;"><strong>Receipt no.:</strong> ${safeReceipt}</p>
            <p style="margin:0 0 6px;"><strong>Paid at:</strong> ${safePaidAt}</p>
            <p style="margin:0 0 6px;"><strong>Patient:</strong> ${safePatient}</p>
            <p style="margin:0 0 6px;"><strong>Mobile:</strong> ${safeMobile}</p>
            <p style="margin:0 0 6px;"><strong>Pharmacy:</strong> ${safePharmacy}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;" />
            <p style="margin:0 0 6px;"><strong>Medicine:</strong> ${safeName}</p>
            ${m.dosage ? `<p style="margin:0 0 6px;"><strong>Dosage:</strong> ${safeDosage}</p>` : ''}
            ${m.quantity != null ? `<p style="margin:0 0 6px;"><strong>Qty:</strong> ${Number(m.quantity)}</p>` : ''}
            ${m.notes ? `<p style="margin:0 0 6px;"><strong>Notes:</strong> ${safeNotes}</p>` : ''}
            <p style="margin:8px 0 0;"><strong>Service:</strong> ${escapeHtml(serviceLabel)} · <strong>Payment:</strong> ${escapeHtml(payLabel)}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;" />
            <p style="margin:0 0 6px;"><strong>Subtotal:</strong> ₹${subtotal.toFixed(2)}</p>
            <p style="margin:0 0 6px;"><strong>Total discount:</strong> ₹${totalDiscount.toFixed(2)}</p>
            <p style="margin:0 0 6px;"><strong>Total bill:</strong> ₹${totalAmount.toFixed(2)}</p>
            <p style="margin:0;"><strong>Paid amount:</strong> ₹${paidAmount.toFixed(2)}</p>
          </div>
          <div style="margin-top:18px;">
            <button type="button" onclick="window.print()" style="padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;cursor:pointer;">
              Print / Save as PDF
            </button>
          </div>
        </body>
      </html>`

    openHtmlInNewTab(body)
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

  const findLinkedDiagnosticForRequest = (request: (typeof testRequests)[number]): {
    visitId: string
    test: DiagnosticTestItem
  } | null => {
    const requestName = normalizeLabName(String(request.testName ?? '').trim())
    if (!requestName) return null
    const requestDay = dateOnly(request.createdAt) ?? dateOnly(request.paidAt)

    const sameDay = allDiagnosticTests.find(({ visitId, visitDate, test }) => {
      const testName = normalizeLabName(String(test.testName ?? '').trim())
      if (!labNormalizedNamesMatch(testName, requestName)) return false
      const visitDay = dateOnly(visitDate)
      const testDay = dateOnly(test.createdAt)
      const matchedDay =
        !!requestDay && ((visitDay && visitDay === requestDay) || (testDay && testDay === requestDay))
      return matchedDay && !!visitId
    })
    if (sameDay) return { visitId: sameDay.visitId, test: sameDay.test }

    const byName = allDiagnosticTests
      .filter(({ test }) => {
        const testName = normalizeLabName(String(test.testName ?? '').trim())
        return labNormalizedNamesMatch(testName, requestName)
      })
      .sort((a, b) => {
        const at = new Date(a.test.createdAt ?? a.visitDate ?? 0).getTime()
        const bt = new Date(b.test.createdAt ?? b.visitDate ?? 0).getTime()
        return bt - at
      })[0]

    return byName ? { visitId: byName.visitId, test: byName.test } : null
  }

  const isDiagnosticLinkedToAnyRequest = (
    diagnostic: { visitId: string; visitDate: string; doctorName?: string; test: DiagnosticTestItem }
  ): boolean => {
    const testName = normalizeLabName(String(diagnostic.test.testName ?? '').trim())
    if (!testName) return false
    const visitDay = dateOnly(diagnostic.visitDate) ?? dateOnly(diagnostic.test.createdAt)

    return testRequests.some((request) => {
      const requestName = normalizeLabName(String(request.testName ?? '').trim())
      if (!requestName || !labNormalizedNamesMatch(requestName, testName)) return false
      const requestDay = dateOnly(request.createdAt) ?? dateOnly(request.paidAt)
      if (!visitDay || !requestDay) return true
      return visitDay === requestDay
    })
  }

  const visibleDiagnosticTests = allDiagnosticTests.filter((entry) => !isDiagnosticLinkedToAnyRequest(entry))

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

        <PatientProfileAccordionSection title="My Details" defaultOpen>
          <div className="patient-profile-details">
            <p><strong>Name:</strong> {[patient.firstName, patient.lastName].filter(Boolean).join(' ')}</p>
            <p><strong>Mobile:</strong> {patient.mobileNumber}</p>
            {patient.gender && <p><strong>Gender:</strong> {patient.gender}</p>}
            {patient.dateOfBirth && <p><strong>Date of birth:</strong> {formatDate(patient.dateOfBirth)}</p>}
            {patient.bloodGroup && <p><strong>Blood group:</strong> {patient.bloodGroup}</p>}
            {patient.address && <p><strong>Address:</strong> {patient.address}</p>}
          </div>
        </PatientProfileAccordionSection>

        <PatientProfileAccordionSection title="Appointments">
          {visits.length === 0 ? (
            <p className="patient-profile-empty">No appointments yet.</p>
          ) : (
            <ul className="patient-profile-list patient-profile-list-accordion">
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
        </PatientProfileAccordionSection>

        <section className="patient-profile-section">
          <div className="patient-profile-heading-with-hint">
            <div className="patient-profile-section-heading-row">
              <h2>Lab Tests</h2>
              <select
                value={selectedLabProviderId}
                onChange={(e) => setSelectedLabProviderId(e.target.value)}
                className="patient-profile-input patient-profile-input-small patient-profile-heading-select"
                aria-label="Choose lab"
              >
                <option value="">Choose lab (auto-assign if not selected)</option>
                {labProviders.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {formatProviderOptionLabel(lab, providerGeoStatus)}
                  </option>
                ))}
              </select>
            </div>
            <ProviderDistanceHint geo={providerGeoStatus} providers={labProviders} />
            {selectedLabProvider && (
              <p className="patient-profile-distance-selected">
                {typeof selectedLabProvider.distanceKm === 'number' ? (
                  <>
                    Selected: <strong>{selectedLabProvider.name}</strong> — {selectedLabProvider.distanceKm.toFixed(1)}{' '}
                    km from you
                  </>
                ) : (
                  <>
                    Selected: <strong>{selectedLabProvider.name}</strong>
                    {providerGeoStatus === 'ok' ? ' — distance not available (no map pin)' : ''}
                  </>
                )}
              </p>
            )}
          </div>
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
              <p className="patient-profile-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                Orders you send from this app. Once lab processes a request, report/receipt appears in the same card.
              </p>
              <ul className="patient-profile-list patient-profile-list-accordion">
                {testRequests.map((t) => {
                  const paymentLabel = formatTestPaymentLabel(t.paymentMode, t.serviceType)
                  const linkedDiagnostic = findLinkedDiagnosticForRequest(t)
                  const showHomeAcceptMsg =
                    t.serviceType === 'HOME_SERVICE' &&
                    (t.status === 'ACCEPTED' || t.status === 'COMPLETED') &&
                    t.paymentStatus === 'PENDING'
                  const cardKey = `test-req-${t.id}`
                  const expanded = !!expandedCards[cardKey]
                  const orderShort =
                    (
                      {
                        PENDING: 'Waiting for lab',
                        ACCEPTED: 'Accepted by lab',
                        COMPLETED: 'Ready',
                        CANCELLED: 'Cancelled',
                      } as Record<string, string>
                    )[t.status ?? ''] ?? ''
                  return (
                  <li key={t.id} className="patient-profile-card patient-profile-collapsible-card">
                    <button
                      type="button"
                      className="patient-profile-card-header-btn"
                      onClick={() => toggleCard(cardKey)}
                      aria-expanded={expanded}
                    >
                      <div className="patient-profile-card-header-text">
                        <div className="patient-profile-card-header-row">
                          <strong>{t.testName}</strong>
                          <span className="patient-profile-badge">Requested by me</span>
                        </div>
                        <div className="patient-profile-card-header-chips">
                          <span className="patient-profile-status-chip">Order: {orderShort}</span>
                          <span
                            className="patient-profile-status-chip"
                            style={{ background: '#f1f5f9', color: '#334155' }}
                          >
                            Payment: {t.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <span className="patient-profile-accordion-icon" aria-hidden>
                        {expanded ? '▼' : '▶'}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="patient-profile-card-expand">
                        {t.notes ? <p className="patient-profile-muted" style={{ margin: '0 0 8px' }}>{t.notes}</p> : null}
                        <span className="patient-profile-muted" style={{ display: 'block', marginBottom: 8 }}>
                          {t.serviceType === 'HOME_SERVICE' ? 'Home service' : 'Lab visit'}
                          {' · '}
                          {paymentLabel}
                          {t.preferredProviderName ? ` · Lab: ${t.preferredProviderName}` : ''}
                          {t.preferredDateTime && ` · Preferred ${formatDateTime(t.preferredDateTime)}`}
                          {t.expectedFulfillmentMinutes ? ` · Need in ${t.expectedFulfillmentMinutes} min` : ''}
                        </span>
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
                              onClick={() =>
                                handleViewLabReceipt({
                                  testName: t.testName,
                                  receiptNumber: t.receiptNumber,
                                  paidAt: t.paidAt,
                                  serviceType: t.serviceType,
                                  price: linkedDiagnostic?.test?.price,
                                })
                              }
                            >
                              View / print receipt
                            </button>
                            {linkedDiagnostic?.test?.hasReport && (
                              <button
                                type="button"
                                className="patient-profile-link-btn"
                                style={{ marginTop: 8, marginLeft: 8 }}
                                onClick={() =>
                                  patientPortalService.openDiagnosticReport(linkedDiagnostic.visitId, linkedDiagnostic.test._id)
                                }
                              >
                                View report
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                  )
                })}
              </ul>
            </div>
          )}
          {visibleDiagnosticTests.length === 0 && testRequests.length === 0 ? (
            <p className="patient-profile-empty">No lab tests yet.</p>
          ) : visibleDiagnosticTests.length > 0 ? (
            <>
              <h3 className="patient-profile-subtitle" style={{ marginTop: testRequests.length > 0 ? 20 : 0 }}>
                Tests added directly by clinic
              </h3>
              <p className="patient-profile-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                Only tests that were not requested from this app are shown here.
              </p>
              <ul className="patient-profile-list patient-profile-list-accordion">
              {visibleDiagnosticTests.map(({ visitId, visitDate, doctorName, test }) => {
                const visitCardKey = `visit-test-${test._id}`
                const visitExpanded = !!expandedCards[visitCardKey]
                const receiptMatch = findReceiptForDiagnosticTest(
                  test.testName,
                  visitDate,
                  test.createdAt
                )
                const paidMatch = findPaidForDiagnosticTest(
                  test.testName,
                  visitDate,
                  test.createdAt
                )
                const hasPaid = !!paidMatch
                const canSeeReport = test.hasReport && hasPaid
                const headerHint =
                  canSeeReport || hasPaid ? 'Tap to view report or receipt' : 'Payment pending for report access'

                return (
                <li key={test._id} className="patient-profile-card patient-profile-collapsible-card">
                  <button
                    type="button"
                    className="patient-profile-card-header-btn"
                    onClick={() => toggleCard(visitCardKey)}
                    aria-expanded={visitExpanded}
                  >
                    <div className="patient-profile-card-header-text">
                      <div className="patient-profile-card-header-row">
                        <strong>{test.testName}</strong>
                      </div>
                      <span className="patient-profile-muted patient-profile-card-subline">
                        {formatDate(visitDate)}
                        {doctorName ? ` · Dr. ${doctorName}` : ''}
                      </span>
                      <span className="patient-profile-muted patient-profile-card-subline" style={{ fontSize: 12 }}>
                        {headerHint}
                      </span>
                    </div>
                    <span className="patient-profile-accordion-icon" aria-hidden>
                      {visitExpanded ? '▼' : '▶'}
                    </span>
                  </button>
                  {visitExpanded ? (
                    <div className="patient-profile-card-expand">
                      {(() => {
                        const buttons: React.ReactNode[] = []
                        if (canSeeReport) {
                          buttons.push(
                            <button
                              key="report"
                              type="button"
                              className="patient-profile-link-btn"
                              onClick={() =>
                                patientPortalService.openDiagnosticReport(visitId, test._id)
                              }
                            >
                              View Report
                            </button>
                          )
                        }
                        if (hasPaid) {
                          buttons.push(
                            <button
                              key="receipt"
                              type="button"
                              className="patient-profile-link-btn"
                              onClick={() =>
                                handleViewLabReceipt({
                                  testName: test.testName,
                                  receiptNumber: receiptMatch?.receiptNumber,
                                  paidAt: paidMatch?.paidAt,
                                  serviceType: (receiptMatch?.serviceType ?? paidMatch?.serviceType) as
                                    | 'LAB_VISIT'
                                    | 'HOME_SERVICE'
                                    | undefined,
                                  price: test.price,
                                })
                              }
                            >
                              View / print receipt
                            </button>
                          )
                        }
                        if (buttons.length === 0) {
                          return (
                            <p className="patient-profile-muted" style={{ margin: 0 }}>
                              No report or receipt yet. After the lab marks payment as paid, links will appear here.
                            </p>
                          )
                        }
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                            {buttons}
                          </div>
                        )
                      })()}
                    </div>
                  ) : null}
                </li>
                )
              })}
            </ul>
            </>
          ) : null}
        </section>

        <section className="patient-profile-section">
          <div className="patient-profile-heading-with-hint">
            <div className="patient-profile-section-heading-row">
              <h2>Medicine Requests</h2>
              <select
                value={selectedPharmacyProviderId}
                onChange={(e) => setSelectedPharmacyProviderId(e.target.value)}
                className="patient-profile-input patient-profile-input-small patient-profile-heading-select"
                aria-label="Choose pharmacy"
              >
                <option value="">Choose pharmacy (auto-assign if not selected)</option>
                {pharmacyProviders.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {formatProviderOptionLabel(ph, providerGeoStatus)}
                  </option>
                ))}
              </select>
            </div>
            <ProviderDistanceHint geo={providerGeoStatus} providers={pharmacyProviders} />
            {selectedPharmacyProvider && (
              <p className="patient-profile-distance-selected">
                {typeof selectedPharmacyProvider.distanceKm === 'number' ? (
                  <>
                    Selected: <strong>{selectedPharmacyProvider.name}</strong> —{' '}
                    {selectedPharmacyProvider.distanceKm.toFixed(1)} km from you
                  </>
                ) : (
                  <>
                    Selected: <strong>{selectedPharmacyProvider.name}</strong>
                    {providerGeoStatus === 'ok' ? ' — distance not available (no map pin)' : ''}
                  </>
                )}
              </p>
            )}
          </div>
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
            <ul className="patient-profile-list patient-profile-list-accordion">
              {medicineRequests.map((m) => {
                const medKey = `med-req-${m.id}`
                const medExp = !!expandedCards[medKey]
                const orderMed =
                  (
                    {
                      PENDING: 'Waiting for pharmacy',
                      ACCEPTED: 'Accepted by chemist',
                      COMPLETED: 'Ready',
                      CANCELLED: 'Cancelled',
                    } as Record<string, string>
                  )[m.status ?? ''] ?? ''
                return (
                <li key={m.id} className="patient-profile-card patient-profile-collapsible-card">
                  <button
                    type="button"
                    className="patient-profile-card-header-btn"
                    onClick={() => toggleCard(medKey)}
                    aria-expanded={medExp}
                  >
                    <div className="patient-profile-card-header-text">
                      <div className="patient-profile-card-header-row">
                        <strong>{m.medicineName}</strong>
                        <span className="patient-profile-badge">Requested by me</span>
                      </div>
                      <div className="patient-profile-card-header-chips">
                        <span className="patient-profile-status-chip">Order: {orderMed}</span>
                        <span
                          className="patient-profile-status-chip"
                          style={{ background: '#f1f5f9', color: '#334155' }}
                        >
                          Payment: {m.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <span className="patient-profile-accordion-icon" aria-hidden>
                      {medExp ? '▼' : '▶'}
                    </span>
                  </button>
                  {medExp ? (
                    <div className="patient-profile-card-expand">
                      {(m.dosage || m.notes) && (
                        <p className="patient-profile-muted" style={{ margin: '0 0 8px' }}>
                          {m.dosage && <span>Dosage: {m.dosage}</span>}
                          {m.dosage && m.notes ? ' · ' : ''}
                          {m.notes && <span>{m.notes}</span>}
                        </p>
                      )}
                      <span className="patient-profile-muted" style={{ display: 'block', marginBottom: 8 }}>
                        {m.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup'} ·{' '}
                        {formatMedicinePaymentLabel(m.paymentMode, m.serviceType)}
                        {m.preferredProviderName ? ` · Pharmacy: ${m.preferredProviderName}` : ''}
                        {m.expectedFulfillmentMinutes ? ` · Need in ${m.expectedFulfillmentMinutes} min` : ''}
                        {typeof m.totalAmount === 'number' ? ` · Amount ₹${m.totalAmount.toFixed(2)}` : ''}
                      </span>
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
                          <button
                            type="button"
                            className="patient-profile-link-btn"
                            style={{ marginTop: 10, display: 'inline-block' }}
                            onClick={() => handleViewMedicineOrderReceipt(m)}
                          >
                            View bill / Receipt
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
                )
              })}
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
            <ul className="patient-profile-list patient-profile-list-accordion">
              {pharmacyDispensations.map((d) => {
                const phKey = `pharm-disp-${d.id}`
                const phExp = !!expandedCards[phKey]
                const itemCount = d.items?.length ?? 0
                return (
                <li key={d.id} className="patient-profile-card patient-profile-collapsible-card">
                  <button
                    type="button"
                    className="patient-profile-card-header-btn"
                    onClick={() => toggleCard(phKey)}
                    aria-expanded={phExp}
                  >
                    <div className="patient-profile-card-header-text">
                      <div className="patient-profile-card-header-row">
                        <strong>{formatDateTime(d.createdAt)}</strong>
                      </div>
                      <span className="patient-profile-muted patient-profile-card-subline">
                        {d.dispensedBy} · ₹{d.totalAmount} · {d.paymentStatus}
                        {itemCount ? ` · ${itemCount} line${itemCount === 1 ? '' : 's'}` : ''}
                      </span>
                      {d.receiptNumber && (
                        <span className="patient-profile-muted patient-profile-card-subline" style={{ fontSize: 12 }}>
                          Receipt {d.receiptNumber}
                        </span>
                      )}
                    </div>
                    <span className="patient-profile-accordion-icon" aria-hidden>
                      {phExp ? '▼' : '▶'}
                    </span>
                  </button>
                  {phExp ? (
                    <div className="patient-profile-card-expand">
                      {!!d.items?.length && (
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                            Medicines
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {d.items.map((it, i) => (
                              <div
                                key={`${d.id}-item-${i}`}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  fontSize: 13,
                                  color: '#0f172a',
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>
                                  {it.medicineName}
                                  {it.quantity ? ` x ${it.quantity}` : ''}
                                </span>
                                <span style={{ color: '#475569' }}>₹{it.amount}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="patient-profile-link-btn"
                        style={{ marginTop: 4 }}
                        onClick={() => handleViewPharmacyReceipt(d)}
                      >
                        View bill / Receipt
                      </button>
                    </div>
                  ) : null}
                </li>
                )
              })}
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
                documents.length > 3 ? 'patient-profile-doc-list-scroll' : ''
              }`}
            >
              {documents.map((d) => (
                <li key={d.id} className="patient-profile-card patient-profile-doc-row">
                  <span>{d.originalName}</span>
                  <span className="patient-profile-muted">
                    {formatDate(d.uploadedAt)}
                    {d.source === 'patient' && ' (uploaded by me)'}
                    {d.isFileAvailable === false && ' (file unavailable on this server)'}
                  </span>
                  <button
                    type="button"
                    className="patient-profile-link-btn"
                    disabled={d.isFileAvailable === false}
                    onClick={() => patientPortalService.openDocument(d.id, patient.id)}
                  >
                    {d.isFileAvailable === false ? 'Unavailable' : 'View'}
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
  .patient-profile-accordion-section {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 0;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .patient-profile-accordion-section .patient-profile-section {
    margin-bottom: 0;
  }
  .patient-profile-accordion-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: #fff;
    border: none;
    cursor: pointer;
    text-align: left;
  }
  .patient-profile-accordion-trigger:hover {
    background: #f8fafc;
  }
  .patient-profile-accordion-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: #334155;
  }
  .patient-profile-accordion-icon {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: #64748b;
    width: 1.25rem;
    text-align: center;
  }
  .patient-profile-accordion-panel {
    padding: 0 16px 16px;
    border-top: 1px solid #f1f5f9;
  }
  .patient-profile-accordion-panel .patient-profile-details {
    border-radius: 10px;
  }
  .patient-profile-accordion-panel .patient-profile-empty {
    border-radius: 10px;
  }
  .patient-profile-list-accordion {
    max-height: none;
  }
  .patient-profile-collapsible-card {
    padding: 0;
    overflow: hidden;
  }
  .patient-profile-card-header-btn {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px;
    background: #fff;
    border: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }
  .patient-profile-card-header-btn:hover {
    background: #f8fafc;
  }
  .patient-profile-card-header-text {
    flex: 1;
    min-width: 0;
  }
  .patient-profile-card-header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .patient-profile-card-header-row .patient-profile-badge {
    margin-left: 0;
  }
  .patient-profile-card-header-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .patient-profile-card-subline {
    display: block;
    margin-top: 4px;
  }
  .patient-profile-card-expand {
    padding: 0 16px 14px;
    border-top: 1px solid #f1f5f9;
    background: #fafbfc;
  }
  .patient-profile-section-heading-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    margin-bottom: 10px;
    width: 100%;
  }
  .patient-profile-section-heading-row h2 {
    margin: 0;
    flex: 0 1 auto;
  }
  .patient-profile-heading-with-hint {
    width: 100%;
    margin-bottom: 10px;
  }
  .patient-profile-distance-hint {
    margin: 0 0 6px;
    font-size: 0.78rem;
    line-height: 1.35;
    color: #64748b;
    max-width: 42rem;
  }
  .patient-profile-distance-selected {
    margin: 0 0 8px;
    font-size: 0.82rem;
    color: #334155;
    max-width: 42rem;
  }
  .patient-profile-heading-select {
    flex: 0 1 auto;
    width: auto;
    min-width: 0;
    max-width: 200px;
    margin-left: auto;
    font-size: 0.875rem;
    padding: 6px 10px;
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
    max-height: 420px;
    overflow-y: auto;
    padding-right: 6px;
  }
  .patient-profile-doc-list-scroll {
    max-height: 280px;
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
    max-width: 560px;
  }
  .patient-profile-input {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.95rem;
    min-width: 110px;
    max-width: 100%;
  }
  .patient-profile-add-form .patient-profile-input {
    flex: 1 1 auto;
    max-width: 260px;
  }
  .patient-profile-add-form .patient-profile-input-small {
    max-width: 180px;
  }
  .patient-profile-input-small {
    min-width: 88px;
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
