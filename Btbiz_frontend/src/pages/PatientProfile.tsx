import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  patientPortalService,
  type FullPatientHistory,
  type PharmacyDispensationSummary,
  type DiagnosticTestItem,
  type ServiceProviderOption,
} from '../services/api'
import { patientStorage } from '../utils/patientStorage'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DnaLoader } from '../components/ui/DnaLoader'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'

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

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function providerDistanceKm(
  p: ServiceProviderOption,
  patientLat?: number,
  patientLng?: number
): number | undefined {
  if (typeof p.distanceKm === 'number') return p.distanceKm
  if (
    typeof patientLat === 'number' &&
    typeof patientLng === 'number' &&
    typeof p.clinicLatitude === 'number' &&
    typeof p.clinicLongitude === 'number'
  ) {
    return distanceKm(patientLat, patientLng, p.clinicLatitude, p.clinicLongitude)
  }
  return undefined
}

/** Label for provider dropdown: always show km when we can compute it. */
function formatProviderOptionLabel(
  p: ServiceProviderOption,
  geo: 'loading' | 'ok' | 'none',
  patientLat?: number,
  patientLng?: number
): string {
  const km = providerDistanceKm(p, patientLat, patientLng)
  if (typeof km === 'number') {
    return `${p.name} · ${km.toFixed(1)} km`
  }
  if (geo === 'loading') {
    return `${p.name} · …`
  }
  if (geo === 'ok') {
    return `${p.name} · — km (shop location not set yet)`
  }
  return `${p.name} · — (allow location for km)`
}

function PatientProfileAccordionSection({
  title,
  defaultOpen = false,
  loading = false,
  loadingVariant = 'details',
  children,
}: {
  title: string
  defaultOpen?: boolean
  loading?: boolean
  /** Skeleton layout when `loading` is true. */
  loadingVariant?: 'details' | 'appointments'
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  const renderLoading = () => {
    if (loadingVariant === 'appointments') {
      return (
        <div className="patient-profile-accordion-loading" aria-busy="true" aria-label="Loading appointments">
          <div className="patient-profile-accordion-skeleton-list">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="patient-profile-appointment-card patient-profile-appointment-card--skeleton" elevated>
                <Skeleton lines={2} />
              </Card>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="patient-profile-accordion-loading" aria-busy="true" aria-label="Loading profile details">
        <DnaLoader label="Loading details…" size={28} />
        <Card className="patient-profile-details-card" elevated>
          <Skeleton lines={5} />
        </Card>
      </div>
    )
  }

  return (
    <Card className="patient-profile-accordion-section" elevated>
      <button
        type="button"
        className="patient-profile-accordion-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="patient-profile-accordion-title">{title}</span>
        <span
          className={`patient-profile-accordion-chevron${open ? ' patient-profile-accordion-chevron--open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="patient-profile-accordion-panel">
          {loading ? renderLoading() : children}
        </div>
      ) : null}
    </Card>
  )
}

type HealthTrendTooltipProps = {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { fullDate?: string } }>
  label?: string
}

function HealthTrendTooltip({ active, payload, label }: HealthTrendTooltipProps) {
  if (!active || !payload?.length) return null
  const title = payload[0]?.payload?.fullDate ?? label ?? ''

  const formatValue = (name: string | undefined, value: number | undefined) => {
    if (value == null) return '—'
    if (name === 'Temperature') return `${value} °F`
    if (name === 'Weight') return `${value} kg`
    if (name === 'Sugar (Fasting)') return `${value} mg/dL`
    return `${value} mmHg`
  }

  return (
    <div className="patient-profile-chart-tooltip">
      <p className="patient-profile-chart-tooltip-title">{title}</p>
      <ul className="patient-profile-chart-tooltip-list">
        {payload.map((entry) => (
          <li key={String(entry.name)}>
            <span className="patient-profile-chart-tooltip-dot" style={{ background: entry.color }} />
            <span>{entry.name}</span>
            <strong>{formatValue(entry.name, entry.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProviderDistanceActions({
  loading,
  onRefresh,
  onUseLocation,
}: {
  loading: boolean
  onRefresh: () => void
  onUseLocation: () => void
}) {
  return (
    <div className="patient-profile-distance-actions">
      <button
        type="button"
        className="patient-profile-link-btn"
        disabled={loading}
        onClick={onUseLocation}
      >
        {loading ? 'Loading…' : 'Use my location'}
      </button>
      <button
        type="button"
        className="patient-profile-link-btn"
        disabled={loading}
        onClick={onRefresh}
      >
        Refresh distances
      </button>
    </div>
  )
}

function ProviderDistanceHint({
  geo,
  providers,
  patientLat,
  patientLng,
  loading,
}: {
  geo: 'loading' | 'ok' | 'none'
  providers: ServiceProviderOption[]
  patientLat?: number
  patientLng?: number
  loading?: boolean
}) {
  if (loading || geo === 'loading') {
    return <p className="patient-profile-distance-hint">Getting distances… (first time may take up to a minute)</p>
  }
  if (providers.length === 0) {
    return null
  }
  const withKm = providers.filter(
    (p) => typeof providerDistanceKm(p, patientLat, patientLng) === 'number',
  )
  if (geo === 'none') {
    return (
      <p className="patient-profile-distance-hint">
        Allow location in the browser (padlock icon → Location → Allow), or tap “Use my location” above. We also use your profile address when GPS is off.
      </p>
    )
  }
  if (withKm.length === 0) {
    return (
      <p className="patient-profile-distance-hint">
        Pharmacies/labs have no map pin yet. Ask Super Admin to run “Fix km distance”, or each shop to tap “Save shop location” in their dashboard.
      </p>
    )
  }
  return (
    <p className="patient-profile-distance-hint">
      Straight-line km from your home / location — nearest pharmacy or lab is listed first so you can pick the closest one.
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
  const [providersLoading, setProvidersLoading] = useState(false)
  const [patientCoords, setPatientCoords] = useState<{ lat: number; lng: number } | null>(null)
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
        if (e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '')) {
          setError('Request timed out. Check your connection and try again.')
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

  const loadProviderLists = useCallback(
    async (opts?: { lat?: number; lng?: number; forceGps?: boolean }) => {
      const patientAddress = data?.patient?.address?.trim()
      if (!patientAddress && opts?.lat == null && !opts?.forceGps) {
        setProviderGeoStatus('none')
        return
      }

      setProvidersLoading(true)
      setProviderGeoStatus('loading')

      const applyLists = (labs: ServiceProviderOption[], pharmacies: ServiceProviderOption[]) => {
        setLabProviders(labs)
        setPharmacyProviders(pharmacies)
        const hasKm = [...labs, ...pharmacies].some((p) => typeof p.distanceKm === 'number')
        setProviderGeoStatus(hasKm ? 'ok' : 'none')
      }

      const fetchLists = async (lat?: number, lng?: number) => {
        const [labs, pharmacies] = await Promise.all([
          patientPortalService.getServiceProviders('lab', lat, lng, patientAddress),
          patientPortalService.getServiceProviders('pharmacy', lat, lng, patientAddress),
        ])
        applyLists(labs, pharmacies)
        if (typeof lat === 'number' && typeof lng === 'number') {
          setPatientCoords({ lat, lng })
        }
      }

      try {
        if (opts?.forceGps && navigator.geolocation) {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                void fetchLists(pos.coords.latitude, pos.coords.longitude).then(resolve).catch(reject)
              },
              () => reject(new Error('denied')),
              { timeout: 15000, maximumAge: 0, enableHighAccuracy: true },
            )
          })
          return
        }

        if (opts?.lat != null && opts?.lng != null) {
          await fetchLists(opts.lat, opts.lng)
          return
        }

        // 1) Home / profile address first (works even when browser blocks GPS)
        if (patientAddress) {
          await fetchLists()
        }

        // 2) Refine with live GPS when allowed (more accurate if patient is not at home)
        if (navigator.geolocation) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                void fetchLists(pos.coords.latitude, pos.coords.longitude).then(resolve)
              },
              () => resolve(),
              { timeout: 8000, maximumAge: 300000, enableHighAccuracy: false },
            )
          })
        } else if (!patientAddress) {
          await fetchLists()
        }
      } catch {
        setLabProviders([])
        setPharmacyProviders([])
        setProviderGeoStatus('none')
      } finally {
        setProvidersLoading(false)
      }
    },
    [data?.patient?.address],
  )

  /** Wait for profile, then load distances (GPS or profile address). */
  useEffect(() => {
    if (!data?.patient) return
    void loadProviderLists()
  }, [data?.patient, loadProviderLists])

  const selectedLabProvider = useMemo(
    () => labProviders.find((p) => p.id === selectedLabProviderId),
    [labProviders, selectedLabProviderId]
  )
  const selectedPharmacyProvider = useMemo(
    () => pharmacyProviders.find((p) => p.id === selectedPharmacyProviderId),
    [pharmacyProviders, selectedPharmacyProviderId]
  )

  const healthTrendData = useMemo(() => {
    const visits = data?.visits ?? []
    return visits
      .slice()
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())
      .map((v) => ({
        dateKey: formatDate(v.visitDate),
        fullDate: formatDateTime(v.visitDate),
        sugar: typeof v.bloodSugarFasting === 'number' ? v.bloodSugarFasting : undefined,
        systolic: typeof v.bloodPressureSystolic === 'number' ? v.bloodPressureSystolic : undefined,
        diastolic: typeof v.bloodPressureDiastolic === 'number' ? v.bloodPressureDiastolic : undefined,
        weight: typeof v.weightKg === 'number' ? v.weightKg : undefined,
        temperature: typeof v.temperature === 'number' ? v.temperature : undefined,
      }))
      .filter(
        (p) =>
          p.sugar != null ||
          p.systolic != null ||
          p.diastolic != null ||
          p.weight != null ||
          p.temperature != null
      )
  }, [data?.visits])

  const handleLogout = () => {
    patientStorage.clear()
    window.location.href = '/'
  }

  const patientName = patientStorage.getPatientName() ?? data?.patient?.firstName ?? 'Patient'

  const profilePageHeader = (
    <PageHeader
      className="patient-profile-page-header"
      title="My Health Profile"
      subtitle={`Hello, ${patientName}`}
      breadcrumb={(
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'My Profile' },
          ]}
        />
      )}
      actions={(
        <>
          <Link to="/book-appointment" className="ui-button ui-button-secondary">
            Book appointment
          </Link>
          <Button variant="secondary" onClick={handleLogout}>
            Logout
          </Button>
        </>
      )}
    />
  )

  if (loading) {
    return (
      <PublicLayout className="patient-profile-page">
        {profilePageHeader}
        <div className="patient-profile-main">
          <PatientProfileAccordionSection title="My Details" defaultOpen loading loadingVariant="details" />
          <PatientProfileAccordionSection title="Appointments" loading loadingVariant="appointments" />
        </div>
      </PublicLayout>
    )
  }

  if (error || !data) {
    return (
      <PublicLayout className="patient-profile-page">
        {profilePageHeader}
        <div className="patient-profile-error">
          <p>{error ?? 'Profile not found.'}</p>
          <div className="patient-profile-error-actions">
            <Link to="/patient-login">Sign in again</Link>
            <Link to="/">Back to home</Link>
          </div>
        </div>
      </PublicLayout>
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
    if (!addMedicineName.trim()) {
      toast.error('Please enter a medicine name.')
      return
    }
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
    if (!addTestName.trim()) {
      toast.error('Please enter a test name.')
      return
    }
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
              Print / save as PDF
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
              Print / save as PDF
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
              Print / save as PDF
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
    <PublicLayout className="patient-profile-page">
      {profilePageHeader}

      <div className="patient-profile-main">
        <PatientProfileAccordionSection title="My Details" defaultOpen>
          <Card className="patient-profile-details-card" elevated>
            <div className="patient-profile-details">
              <p className="public-section-text patient-profile-detail-line"><strong>Name:</strong> {[patient.firstName, patient.lastName].filter(Boolean).join(' ')}</p>
              <p className="public-section-text patient-profile-detail-line"><strong>Mobile:</strong> {patient.mobileNumber}</p>
              {patient.gender && <p className="public-section-text patient-profile-detail-line"><strong>Gender:</strong> {patient.gender}</p>}
              {patient.dateOfBirth && <p className="public-section-text patient-profile-detail-line"><strong>Date of birth:</strong> {formatDate(patient.dateOfBirth)}</p>}
              {patient.bloodGroup && <p className="public-section-text patient-profile-detail-line"><strong>Blood group:</strong> {patient.bloodGroup}</p>}
              {patient.address && <p className="public-section-text patient-profile-detail-line"><strong>Address:</strong> {patient.address}</p>}
            </div>
          </Card>
        </PatientProfileAccordionSection>

        <PatientProfileAccordionSection title="Appointments">
          {visits.length === 0 ? (
            <p className="public-section-text patient-profile-empty">No appointments yet.</p>
          ) : (
            <ul className="patient-profile-appointment-list">
              {visits.map((v) => (
                <li key={v._id}>
                  <Card className="patient-profile-appointment-card" elevated interactive>
                    <div className="patient-profile-appointment-head">
                      <strong>{formatDate(v.visitDate)}</strong>
                      {v.doctor?.name && <span> — Dr. {v.doctor.name}</span>}
                    </div>
                    {v.reason && <p className="public-section-text patient-profile-muted">{v.reason}</p>}
                    {v.notes && <p className="public-section-text patient-profile-muted">{v.notes}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </PatientProfileAccordionSection>

        <section className="patient-profile-section patient-profile-health-trend-section">
          <h2 className="patient-profile-section-title">Health Trend Graph</h2>
          {healthTrendData.length < 2 ? (
            <p className="public-section-text patient-profile-empty patient-profile-health-trend-empty">
              At least 2 visit readings are needed to show trend graph.
            </p>
          ) : (
            <Card className="patient-profile-health-trend-card" elevated>
              <div className="patient-profile-chart-wrap">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={healthTrendData} margin={{ top: 16, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.35)" vertical={false} />
                    <XAxis
                      dataKey="dateKey"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      yAxisId="vitals"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <YAxis
                      yAxisId="body"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip content={<HealthTrendTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Legend
                      verticalAlign="bottom"
                      height={40}
                      iconType="circle"
                      wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
                    />
                    <Line
                      yAxisId="vitals"
                      type="monotone"
                      dataKey="sugar"
                      name="Sugar (Fasting)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                      connectNulls
                    />
                    <Line
                      yAxisId="vitals"
                      type="monotone"
                      dataKey="systolic"
                      name="BP Systolic"
                      stroke="#dc2626"
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                      connectNulls
                    />
                    <Line
                      yAxisId="vitals"
                      type="monotone"
                      dataKey="diastolic"
                      name="BP Diastolic"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                      connectNulls
                    />
                    <Line
                      yAxisId="body"
                      type="monotone"
                      dataKey="weight"
                      name="Weight"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                      connectNulls
                    />
                    <Line
                      yAxisId="body"
                      type="monotone"
                      dataKey="temperature"
                      name="Temperature"
                      stroke="#7c3aed"
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="public-section-text patient-profile-health-trend-caption">
                Graph shows date-wise trend from your visit vitals and basic tests. Left axis: BP &amp; sugar · Right axis: weight &amp; temperature.
              </p>
            </Card>
          )}
        </section>

        <section className="patient-profile-section patient-profile-lab-section">
          <h2 className="patient-profile-section-title">Lab Tests</h2>

          <Card className="patient-profile-lab-toolbar-card" elevated>
            <div className="patient-profile-lab-toolbar">
              <div className="patient-profile-lab-select-field">
                <label htmlFor="lab-provider-select">Choose lab</label>
                <select
                  id="lab-provider-select"
                  value={selectedLabProviderId}
                  onChange={(e) => setSelectedLabProviderId(e.target.value)}
                  className="patient-profile-provider-select"
                  aria-label="Choose lab"
                >
                  <option value="">Choose lab (auto-assign if not selected)</option>
                  {labProviders.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {formatProviderOptionLabel(
                        lab,
                        providerGeoStatus,
                        patientCoords?.lat,
                        patientCoords?.lng,
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <ProviderDistanceActions
                loading={providersLoading}
                onRefresh={() => void loadProviderLists()}
                onUseLocation={() => void loadProviderLists({ forceGps: true })}
              />
              <ProviderDistanceHint
                geo={providerGeoStatus}
                providers={labProviders}
                patientLat={patientCoords?.lat}
                patientLng={patientCoords?.lng}
                loading={providersLoading}
              />
              {selectedLabProvider && (
                <p className="patient-profile-distance-selected public-section-text">
                  {(() => {
                    const km = providerDistanceKm(
                      selectedLabProvider,
                      patientCoords?.lat,
                      patientCoords?.lng,
                    )
                    if (typeof km === 'number') {
                      return (
                        <>
                          Selected: <strong>{selectedLabProvider.name}</strong> — {km.toFixed(1)} km from
                          you
                        </>
                      )
                    }
                    return (
                      <>
                        Selected: <strong>{selectedLabProvider.name}</strong>
                        {providerGeoStatus === 'ok' ? ' — distance not available (shop location not set)' : ''}
                      </>
                    )
                  })()}
                </p>
              )}
            </div>
          </Card>

          <Card className="patient-profile-lab-form-card" elevated>
            <h3 className="patient-profile-subtitle">Request a test</h3>
            <form onSubmit={handleAddTest} className="patient-profile-lab-form">
              <TextField
                id="lab-test-name"
                name="addTestName"
                label="Test name"
                type="text"
                placeholder="Add test request (e.g. CBC, Sugar)"
                value={addTestName}
                onChange={(e) => setAddTestName(e.target.value)}
              />
              <TextField
                id="lab-test-notes"
                name="addTestNotes"
                label="Notes (optional)"
                type="text"
                placeholder="Notes (optional)"
                value={addTestNotes}
                onChange={(e) => setAddTestNotes(e.target.value)}
              />
              <div className="patient-profile-lab-form-grid">
                <div className="patient-profile-lab-select-field">
                  <label htmlFor="lab-test-service-type">Service type</label>
                  <select
                    id="lab-test-service-type"
                    name="addTestServiceType"
                    value={addTestServiceType}
                    onChange={(e) => setAddTestServiceType(e.target.value as 'LAB_VISIT' | 'HOME_SERVICE')}
                  >
                    <option value="LAB_VISIT">Lab visit</option>
                    <option value="HOME_SERVICE">Home service</option>
                  </select>
                </div>
                {addTestServiceType === 'HOME_SERVICE' ? (
                  <div className="patient-profile-lab-select-field">
                    <label htmlFor="lab-test-payment-mode">Payment</label>
                    <select
                      id="lab-test-payment-mode"
                      name="addTestPaymentMode"
                      value={addTestPaymentMode}
                      onChange={(e) => setAddTestPaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                    >
                      <option value="ONLINE">Pay online</option>
                      <option value="OFFLINE">Cash on service</option>
                    </select>
                  </div>
                ) : (
                  <div className="patient-profile-lab-select-field">
                    <label htmlFor="lab-test-payment-mode">Payment</label>
                    <select
                      id="lab-test-payment-mode"
                      name="addTestPaymentMode"
                      value={addTestPaymentMode}
                      onChange={(e) => setAddTestPaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                    >
                      <option value="OFFLINE">Pay at lab (offline)</option>
                      <option value="ONLINE">Pay online</option>
                    </select>
                  </div>
                )}
                <TextField
                  id="lab-test-preferred-datetime"
                  name="addTestPreferredDateTime"
                  label="Preferred date & time (optional)"
                  type="datetime-local"
                  value={addTestPreferredDateTime}
                  onChange={(e) => setAddTestPreferredDateTime(e.target.value)}
                />
                <TextField
                  id="lab-test-eta-minutes"
                  name="addTestEtaMinutes"
                  label="Need in minutes (optional)"
                  type="number"
                  min={15}
                  step={5}
                  placeholder="Need in minutes (optional)"
                  value={addTestEtaMinutes}
                  onChange={(e) => setAddTestEtaMinutes(e.target.value)}
                />
              </div>
              <div className="patient-profile-lab-form-actions">
                <Button type="submit" disabled={addingTest}>
                  {addingTest ? 'Adding…' : 'Add test'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="patient-profile-lab-list-card" elevated>
            <h3 className="patient-profile-subtitle">My test requests</h3>
            <p className="public-section-text patient-profile-lab-list-lead">
              Orders you send from this app. Tap a row to expand details — chevron on the right.
            </p>
            {testRequests.length === 0 ? (
              <p className="public-section-text patient-profile-empty patient-profile-lab-empty">
                No test requests yet. Use the form above to add one.
              </p>
            ) : (
              <ul className="patient-profile-lab-request-list">
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
                  <li key={t.id}>
                    <Card className="patient-profile-collapsible-card patient-profile-lab-request-card" elevated>
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
                        <span
                          className={`patient-profile-accordion-chevron${expanded ? ' patient-profile-accordion-chevron--open' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                      {expanded ? (
                        <div className="patient-profile-card-expand">
                          {t.notes ? <p className="public-section-text patient-profile-muted">{t.notes}</p> : null}
                          <span className="public-section-text patient-profile-muted patient-profile-lab-request-meta">
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
                                <p className="patient-profile-receipt-line">
                                  No. <strong>{t.receiptNumber}</strong>
                                  {t.paidAt && <span className="patient-profile-muted"> · {formatDateTime(t.paidAt)}</span>}
                                </p>
                              )}
                              <div className="patient-profile-lab-request-actions">
                                <Button
                                  size="sm"
                                  variant="secondary"
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
                                </Button>
                                {linkedDiagnostic?.test?.hasReport && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      patientPortalService.openDiagnosticReport(linkedDiagnostic.visitId, linkedDiagnostic.test._id)
                                    }
                                  >
                                    View report
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </Card>
                  </li>
                  )
                })}
              </ul>
            )}
          </Card>
          {visibleDiagnosticTests.length > 0 ? (
            <Card className="patient-profile-lab-list-card" elevated>
              <h3 className="patient-profile-subtitle">Tests added directly by clinic</h3>
              <p className="public-section-text patient-profile-lab-list-lead">
                Only tests that were not requested from this app are shown here.
              </p>
              <ul className="patient-profile-lab-request-list">
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
                <li key={test._id}>
                  <Card className="patient-profile-collapsible-card patient-profile-lab-request-card" elevated>
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
                        <span className="patient-profile-muted patient-profile-card-subline patient-profile-lab-clinic-hint">
                          {headerHint}
                        </span>
                      </div>
                      <span
                        className={`patient-profile-accordion-chevron${visitExpanded ? ' patient-profile-accordion-chevron--open' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    {visitExpanded ? (
                      <div className="patient-profile-card-expand">
                        {(() => {
                          const buttons: React.ReactNode[] = []
                          if (canSeeReport) {
                            buttons.push(
                              <Button
                                key="report"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  patientPortalService.openDiagnosticReport(visitId, test._id)
                                }
                              >
                                View Report
                              </Button>
                            )
                          }
                          if (hasPaid) {
                            buttons.push(
                              <Button
                                key="receipt"
                                size="sm"
                                variant="secondary"
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
                              </Button>
                            )
                          }
                          if (buttons.length === 0) {
                            return (
                              <p className="public-section-text patient-profile-muted patient-profile-lab-no-links">
                                No report or receipt yet. After the lab marks payment as paid, links will appear here.
                              </p>
                            )
                          }
                          return (
                            <div className="patient-profile-lab-request-actions">
                              {buttons}
                            </div>
                          )
                        })()}
                      </div>
                    ) : null}
                  </Card>
                </li>
                )
              })}
            </ul>
            </Card>
          ) : null}
        </section>

        <section className="patient-profile-section patient-profile-medicine-section">
          <h2 className="patient-profile-section-title">Medicine Requests</h2>

          <Card className="patient-profile-medicine-toolbar-card" elevated>
            <div className="patient-profile-medicine-toolbar">
              <div className="patient-profile-medicine-select-field">
                <label htmlFor="pharmacy-provider-select">Choose pharmacy</label>
                <select
                  id="pharmacy-provider-select"
                  value={selectedPharmacyProviderId}
                  onChange={(e) => setSelectedPharmacyProviderId(e.target.value)}
                  className="patient-profile-provider-select"
                  aria-label="Choose pharmacy"
                >
                  <option value="">Choose pharmacy (auto-assign if not selected)</option>
                  {pharmacyProviders.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {formatProviderOptionLabel(
                        ph,
                        providerGeoStatus,
                        patientCoords?.lat,
                        patientCoords?.lng,
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <ProviderDistanceActions
                loading={providersLoading}
                onRefresh={() => void loadProviderLists()}
                onUseLocation={() => void loadProviderLists({ forceGps: true })}
              />
              <ProviderDistanceHint
                geo={providerGeoStatus}
                providers={pharmacyProviders}
                patientLat={patientCoords?.lat}
                patientLng={patientCoords?.lng}
                loading={providersLoading}
              />
              {selectedPharmacyProvider && (
                <p className="patient-profile-distance-selected public-section-text">
                  {(() => {
                    const km = providerDistanceKm(
                      selectedPharmacyProvider,
                      patientCoords?.lat,
                      patientCoords?.lng,
                    )
                    if (typeof km === 'number') {
                      return (
                        <>
                          Selected: <strong>{selectedPharmacyProvider.name}</strong> — {km.toFixed(1)} km from
                          you
                        </>
                      )
                    }
                    return (
                      <>
                        Selected: <strong>{selectedPharmacyProvider.name}</strong>
                        {providerGeoStatus === 'ok'
                          ? ' — distance not available (shop location not set)'
                          : ''}
                      </>
                    )
                  })()}
                </p>
              )}
            </div>
          </Card>

          <Card className="patient-profile-medicine-form-card" elevated>
            <h3 className="patient-profile-subtitle">Request medicine</h3>
            <form onSubmit={handleAddMedicine} className="patient-profile-medicine-form">
              <TextField
                id="medicine-request-name"
                name="addMedicineName"
                label="Medicine name"
                type="text"
                placeholder="Medicine name"
                value={addMedicineName}
                onChange={(e) => setAddMedicineName(e.target.value)}
              />
              <div className="patient-profile-medicine-form-grid">
                <TextField
                  id="medicine-request-dosage"
                  name="addMedicineDosage"
                  label="Dosage (optional)"
                  type="text"
                  placeholder="Dosage (optional)"
                  value={addMedicineDosage}
                  onChange={(e) => setAddMedicineDosage(e.target.value)}
                />
                <TextField
                  id="medicine-request-notes"
                  name="addMedicineNotes"
                  label="Notes (optional)"
                  type="text"
                  placeholder="Notes (optional)"
                  value={addMedicineNotes}
                  onChange={(e) => setAddMedicineNotes(e.target.value)}
                />
                <div className="patient-profile-medicine-select-field">
                  <label htmlFor="medicine-service-type">Service type</label>
                  <select
                    id="medicine-service-type"
                    name="addMedicineServiceType"
                    value={addMedicineServiceType}
                    onChange={(e) => {
                      const next = e.target.value as 'PICKUP' | 'HOME_DELIVERY'
                      setAddMedicineServiceType(next)
                      // Rule: Home delivery always uses ONLINE payment in UI.
                      if (next === 'HOME_DELIVERY') setAddMedicinePaymentMode('ONLINE')
                    }}
                  >
                    <option value="PICKUP">Pickup from medical</option>
                    <option value="HOME_DELIVERY">Home delivery</option>
                  </select>
                </div>
                {addMedicineServiceType === 'HOME_DELIVERY' ? (
                  <div className="patient-profile-medicine-select-field">
                    <label htmlFor="medicine-payment-mode">Payment</label>
                    <select
                      id="medicine-payment-mode"
                      name="addMedicinePaymentMode"
                      value="ONLINE"
                      onChange={() => setAddMedicinePaymentMode('ONLINE')}
                      disabled
                    >
                      <option value="ONLINE">Pay online</option>
                    </select>
                  </div>
                ) : (
                  <div className="patient-profile-medicine-select-field">
                    <label htmlFor="medicine-payment-mode">Payment</label>
                    <select
                      id="medicine-payment-mode"
                      name="addMedicinePaymentMode"
                      value={addMedicinePaymentMode}
                      onChange={(e) => setAddMedicinePaymentMode(e.target.value as 'ONLINE' | 'OFFLINE')}
                    >
                      <option value="OFFLINE">Pay at medical (offline)</option>
                      <option value="ONLINE">Pay online</option>
                    </select>
                  </div>
                )}
                <TextField
                  id="medicine-request-eta"
                  name="addMedicineEtaMinutes"
                  label="Need in minutes (optional)"
                  type="number"
                  min={15}
                  step={5}
                  placeholder="Need in minutes (optional)"
                  value={addMedicineEtaMinutes}
                  onChange={(e) => setAddMedicineEtaMinutes(e.target.value)}
                />
              </div>
              <div className="patient-profile-medicine-form-actions">
                <Button type="submit" disabled={addingMedicine}>
                  {addingMedicine ? 'Adding…' : 'Add medicine'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="patient-profile-medicine-list-card" elevated>
            <h3 className="patient-profile-subtitle">My medicine requests</h3>
            <p className="public-section-text patient-profile-medicine-list-lead">
              Orders you send from this app. Tap a row to expand — chevron on the right.
            </p>
            {medicineRequests.length === 0 ? (
              <p className="public-section-text patient-profile-empty patient-profile-medicine-empty">
                No medicine requests yet. Use the form above to add one.
              </p>
            ) : (
              <ul className="patient-profile-medicine-request-list">
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
                  <li key={m.id}>
                    <Card className="patient-profile-collapsible-card patient-profile-medicine-request-card" elevated>
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
                        <span
                          className={`patient-profile-accordion-chevron${medExp ? ' patient-profile-accordion-chevron--open' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                      {medExp ? (
                        <div className="patient-profile-card-expand">
                          {(m.dosage || m.notes) && (
                            <p className="public-section-text patient-profile-muted">
                              {m.dosage && <span>Dosage: {m.dosage}</span>}
                              {m.dosage && m.notes ? ' · ' : ''}
                              {m.notes && <span>{m.notes}</span>}
                            </p>
                          )}
                          <span className="public-section-text patient-profile-muted patient-profile-medicine-request-meta">
                            {m.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup'} ·{' '}
                            {formatMedicinePaymentLabel(m.paymentMode, m.serviceType)}
                            {m.preferredProviderName ? ` · Pharmacy: ${m.preferredProviderName}` : ''}
                            {m.expectedFulfillmentMinutes ? ` · Need in ${m.expectedFulfillmentMinutes} min` : ''}
                            {typeof m.totalAmount === 'number' ? ` · Amount ₹${m.totalAmount.toFixed(2)}` : ''}
                          </span>
                          {m.isSubstitute && m.substituteMedicineName && (
                            <p className="patient-profile-substitute-note">
                              This tablet is substitute: {m.substituteMedicineName}
                              {m.substituteNotes ? ` (${m.substituteNotes})` : ''}
                            </p>
                          )}
                          {m.paymentStatus === 'PAID' && (
                            <div className="patient-profile-receipt-box">
                              <strong>Receipt</strong>
                              {(m.receiptNumber || m.paidAt) && (
                                <p className="patient-profile-receipt-line">
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
                              <div className="patient-profile-medicine-request-actions">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleViewMedicineOrderReceipt(m)}
                                >
                                  View bill / receipt
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </Card>
                  </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>

        <section className="patient-profile-section patient-profile-pharmacy-section">
          <h2 className="patient-profile-section-title">Pharmacy (Dispensed)</h2>
          {!pharmacyDispensations?.length ? (
            <p className="public-section-text patient-profile-empty patient-profile-pharmacy-empty">
              No pharmacy records yet.
            </p>
          ) : (
            <Card className="patient-profile-pharmacy-list-card" elevated>
              <h3 className="patient-profile-subtitle">Dispensed medicines</h3>
              <p className="public-section-text patient-profile-pharmacy-list-lead">
                Bills from your clinic pharmacy. Tap a record to see items and open receipt.
              </p>
              <ul className="patient-profile-pharmacy-disp-list">
                {pharmacyDispensations.map((d) => {
                const phKey = `pharm-disp-${d.id}`
                const phExp = !!expandedCards[phKey]
                const itemCount = d.items?.length ?? 0
                return (
                <li key={d.id}>
                  <Card className="patient-profile-collapsible-card patient-profile-pharmacy-disp-card" elevated>
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
                          <span className="patient-profile-muted patient-profile-card-subline patient-profile-pharmacy-receipt-ref">
                            Receipt {d.receiptNumber}
                          </span>
                        )}
                      </div>
                      <span
                        className={`patient-profile-accordion-chevron${phExp ? ' patient-profile-accordion-chevron--open' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    {phExp ? (
                      <div className="patient-profile-card-expand">
                        {!!d.items?.length && (
                          <div className="patient-profile-pharmacy-items">
                            <p className="patient-profile-pharmacy-items-title">Medicines</p>
                            <ul className="patient-profile-pharmacy-item-list">
                              {d.items.map((it, i) => (
                                <li key={`${d.id}-item-${i}`} className="patient-profile-pharmacy-item-row">
                                  <span className="patient-profile-pharmacy-item-name">
                                    {it.medicineName}
                                    {it.quantity ? ` x ${it.quantity}` : ''}
                                  </span>
                                  <span className="patient-profile-pharmacy-item-amount">₹{it.amount}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="patient-profile-pharmacy-disp-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleViewPharmacyReceipt(d)}
                          >
                            View bill / receipt
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                </li>
                )
              })}
              </ul>
            </Card>
          )}
        </section>

        <section className="patient-profile-section patient-profile-documents-section">
          <h2 className="patient-profile-section-title">My Reports & Documents</h2>
          <Card className="patient-profile-doc-toolbar-card" elevated>
            <div className="patient-profile-doc-upload-row">
              <label className={`patient-profile-doc-upload-label${uploading ? ' patient-profile-doc-upload-label--disabled' : ''}`}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleDocumentUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                <span className="ui-button ui-button-primary ui-button-sm">
                  {uploading ? 'Uploading…' : '+ Add Document'}
                </span>
              </label>
              <p className="public-section-text patient-profile-doc-upload-hint">
                Doctor & assistant will see uploaded files
              </p>
            </div>
          </Card>
          {documents.length === 0 ? (
            <p className="public-section-text patient-profile-empty patient-profile-doc-empty">
              No documents uploaded yet.
            </p>
          ) : (
            <Card className="patient-profile-doc-list-card" elevated>
              <h3 className="patient-profile-subtitle">Your files</h3>
              <p className="public-section-text patient-profile-doc-list-lead">
                Open reports and uploads shared with your care team.
              </p>
              <ul className="patient-profile-doc-list">
                {documents.map((d) => {
                const pendingVerify = d.patientPublishStatus === 'PENDING_ASSISTANT'
                return (
                <li key={d.id}>
                  <Card className="patient-profile-doc-card" elevated>
                    <div className="patient-profile-doc-card-body">
                      <div className="patient-profile-doc-card-info">
                        <strong className="patient-profile-doc-name">{d.originalName}</strong>
                        <span className="public-section-text patient-profile-muted patient-profile-doc-meta">
                          {formatDate(d.uploadedAt)}
                          {d.source === 'patient' && ' (uploaded by me)'}
                          {d.isFileAvailable === false && ' (file unavailable on this server)'}
                        </span>
                      </div>
                      {pendingVerify ? (
                        <span className="patient-profile-doc-pending">
                          Assistant verification in progress — you can open this after your clinic releases it.
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={d.isFileAvailable === false}
                          onClick={() =>
                            patientPortalService.openDocument(d.id, patient.id, {
                              assistantVerified: Boolean(d.verifiedAt),
                            })
                          }
                        >
                          {d.isFileAvailable === false ? 'Unavailable' : 'View'}
                        </Button>
                      )}
                    </div>
                  </Card>
                </li>
                )
              })}
              </ul>
            </Card>
          )}
        </section>
      </div>

    </PublicLayout>
  )
}
