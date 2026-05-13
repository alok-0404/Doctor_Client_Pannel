import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { io } from 'socket.io-client'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { Button } from '../components/ui/Button'
import { DnaLoader } from '../components/ui/DnaLoader'
import {
  API_BASE_URL,
  getApiOriginForSockets,
  api,
  authService,
  patientService,
  appointmentService,
  type PatientSummary,
  type DoctorAppointmentItem,
  type AssistantCheckedInItem,
  type AssistantFamilyOption,
  type AssistantPatientPrefill,
  type AssistantPendingDocumentItem,
} from '../services/api'
import { toast } from 'react-toastify'
import { parseAssistantReferralError } from '../utils/assistantErrors'

const newVerifyRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

type VerifyMedicineRow = {
  id: string
  medicineName: string
  dosage: string
  quantity: string
  notes: string
}

type VerifyTestRow = { id: string; testName: string; notes: string }

type Step = 'search' | 'new_patient' | 'checkin'
type AvailabilityStatus = 'available' | 'unavailable' | 'busy'

const normalizeMobileForBackend = (raw: string): string => {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const last10 = digits.slice(-10)
  return `+91${last10}`
}

/** Dev: same tab uses Vite proxy for `/public/*`; absolute backend URLs can break binary blob XHR. */
function previewPublicFileUrlForInlineDisplay(rawUrl: string): string {
  if (!import.meta.env.DEV || API_BASE_URL) return rawUrl
  try {
    const u = new URL(rawUrl)
    if (u.pathname.startsWith('/public/')) {
      return `${window.location.origin}${u.pathname}${u.search}${u.hash}`
    }
  } catch {
    /* ignore */
  }
  return rawUrl
}

function isLikelyImageMime(mime: string | null | undefined, fileName?: string | null): boolean {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(String(fileName || ''))
}

function isLikelyPdfMime(mime: string | null | undefined, fileName?: string | null): boolean {
  const m = (mime || '').toLowerCase()
  if (m.includes('pdf')) return true
  return String(fileName || '').toLowerCase().endsWith('.pdf')
}

export const AssistantDashboard = () => {
  const name = authStorage.getName() ?? 'Assistant'

  const [step, setStep] = useState<Step>('search')
  const [mobileSearch, setMobileSearch] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [hasTodayVisit, setHasTodayVisit] = useState(false)
  const [todayVisitId, setTodayVisitId] = useState<string | null>(null)
  const [prefilledFromVisitAt, setPrefilledFromVisitAt] = useState<string | null>(null)
  /** When assistant check-in was recorded on the visit (wall clock), if any. */
  const [prefilledAssistantCheckInAt, setPrefilledAssistantCheckInAt] = useState<string | null>(null)

  // Form state for new patient / edit
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [address, setAddress] = useState('')
  const [diseaseReason, setDiseaseReason] = useState('')
  const [previousHealthHistory, setPreviousHealthHistory] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')

  // Vitals (mandatory before refer)
  const [bpSystolic, setBpSystolic] = useState('')
  const [bpDiastolic, setBpDiastolic] = useState('')
  const [bloodSugar, setBloodSugar] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [temperature, setTemperature] = useState('')
  const [otherVitalsNotes, setOtherVitalsNotes] = useState('')

  const [notesForDoctor, setNotesForDoctor] = useState('')
  const [referredToDoctorName, setReferredToDoctorName] = useState<string | null>(null)

  // Doctor availability (real-time for assistant) – assistant can also update on doctor's behalf
  const [doctorAvailabilityStatus, setDoctorAvailabilityStatus] = useState<AvailabilityStatus>('available')
  const [doctorUnavailableReason, setDoctorUnavailableReason] = useState<string | null>(null)
  const [doctorUnavailableUntil, setDoctorUnavailableUntil] = useState<string | null>(null)
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false)
  const [availabilityUpdateSuccess, setAvailabilityUpdateSuccess] = useState<string | null>(null)
  const [availabilityUpdateError, setAvailabilityUpdateError] = useState<string | null>(null)
  const [unavailableReason, setUnavailableReason] = useState('')
  const [unavailableDuration, setUnavailableDuration] = useState<string>('')
  const [unavailableUntilCustom, setUnavailableUntilCustom] = useState('')
  const [todayAppointments, setTodayAppointments] = useState<DoctorAppointmentItem[]>([])
  const [upcomingAppointments, setUpcomingAppointments] = useState<DoctorAppointmentItem[]>([])
  const [checkedInToday, setCheckedInToday] = useState<AssistantCheckedInItem[]>([])
  const [todayPatientsToContact, setTodayPatientsToContact] = useState<DoctorAppointmentItem[]>([])
  const [todayPatientsLoading, setTodayPatientsLoading] = useState(false)
  const [upcomingPatientsLoading, setUpcomingPatientsLoading] = useState(false)
  const [checkedInLoading, setCheckedInLoading] = useState(false)
  const checkedInPatientIdsRef = useRef<Set<string>>(new Set())

  // File upload for reports / prescriptions
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploadLoading, setDocUploadLoading] = useState(false)
  const [docUploadError, setDocUploadError] = useState<string | null>(null)
  const [docUploadSuccess, setDocUploadSuccess] = useState<string | null>(null)
  /** Staff upload id waiting for “release to patient profile” after verification */
  const [docPendingReleaseId, setDocPendingReleaseId] = useState<string | null>(null)
  const [docVerifyLoading, setDocVerifyLoading] = useState(false)
  const [docOcrPreview, setDocOcrPreview] = useState<string | null>(null)

  const [verifyModalOpen, setVerifyModalOpen] = useState(false)
  const [verifyMedicines, setVerifyMedicines] = useState<VerifyMedicineRow[]>([
    { id: newVerifyRowId(), medicineName: '', dosage: '', quantity: '', notes: '' },
  ])
  const [verifyTests, setVerifyTests] = useState<VerifyTestRow[]>([
    { id: newVerifyRowId(), testName: '', notes: '' },
  ])
  const [verifyClinicalNotes, setVerifyClinicalNotes] = useState('')
  const [verifyImportantNotes, setVerifyImportantNotes] = useState('')

  const [pendingDocs, setPendingDocs] = useState<AssistantPendingDocumentItem[]>([])
  const [pendingDocsLoading, setPendingDocsLoading] = useState(false)
  const [pendingDocsError, setPendingDocsError] = useState<string | null>(null)
  const [pendingDocsSort, setPendingDocsSort] = useState<'asc' | 'desc'>('asc')

  /** Mime + name for the document open in the verify modal (queue row or fresh upload). */
  const [verifyDocMeta, setVerifyDocMeta] = useState<{ mimeType: string; originalName: string } | null>(null)
  /** Signed `/public/.../file` URL for inline preview (same bytes as “View (new tab)”). */
  const [verifyPreviewPublicUrl, setVerifyPreviewPublicUrl] = useState<string | null>(null)
  /** Fallback: blob from authenticated `/patients/.../file` when public link is unavailable. */
  const [verifyPreviewUrl, setVerifyPreviewUrl] = useState<string | null>(null)
  const [verifyPreviewMime, setVerifyPreviewMime] = useState<string | null>(null)
  const [verifyPreviewLoading, setVerifyPreviewLoading] = useState(false)
  const [verifyPreviewError, setVerifyPreviewError] = useState<string | null>(null)
  const verifyPreviewUrlRef = useRef<string | null>(null)

  const [saveLoading, setSaveLoading] = useState(false)
  const [referLoading, setReferLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /** Walk-in daily quota (409) uses a calmer “capacity” alert instead of red error text. */
  const [formErrorVariant, setFormErrorVariant] = useState<'quota' | 'standard'>('standard')
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const clearFormError = () => {
    setFormError(null)
    setFormErrorVariant('standard')
  }

  const renderFormError = () => {
    if (!formError) return null
    if (formErrorVariant === 'quota') {
      return (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #fcd34d',
            background: '#fffbeb',
            color: '#78350f',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', color: '#92400e' }}>
            Walk-in limit reached for today
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{formError}</p>
          <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45, color: '#a16207' }}>
            Ask the doctor to adjust <strong>Daily caps</strong> on their dashboard if more walk-ins are needed today.
          </p>
        </div>
      )
    }
    return <p className="text-sm" style={{ color: '#c62828' }}>{formError}</p>
  }

  const [familyOptions, setFamilyOptions] = useState<AssistantFamilyOption[] | null>(null)
  const [familyPickMobile, setFamilyPickMobile] = useState<string | null>(null)

  const loadProfile = async () => {
    try {
      const { doctor } = await authService.getProfile()
      if (doctor.referredToDoctorName) setReferredToDoctorName(doctor.referredToDoctorName)
      if (doctor.availabilityStatus) setDoctorAvailabilityStatus(doctor.availabilityStatus as AvailabilityStatus)
      if (doctor.unavailableReason) {
        setDoctorUnavailableReason(doctor.unavailableReason)
        setUnavailableReason(doctor.unavailableReason)
      } else {
        setDoctorUnavailableReason(null)
        setUnavailableReason('')
      }
      if (doctor.unavailableUntil) setDoctorUnavailableUntil(doctor.unavailableUntil)
      else setDoctorUnavailableUntil(null)
    } catch {
      // ignore
    }
  }

  const getUnavailableUntilISO = (): string | undefined => {
    if (doctorAvailabilityStatus === 'available') return undefined
    if (unavailableDuration === 'custom' && unavailableUntilCustom) {
      const d = new Date(unavailableUntilCustom)
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
    }
    const hours = parseFloat(unavailableDuration)
    if (Number.isNaN(hours) || hours <= 0) return undefined
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  }

  const handleSetAvailability = async (status: AvailabilityStatus) => {
    setAvailabilityUpdateSuccess(null)
    setAvailabilityUpdateError(null)
    setAvailabilityUpdating(true)
    try {
      // Only "unavailable" requires a reason and time period. "busy" is simple.
      const until = status === 'unavailable' ? getUnavailableUntilISO() : undefined
      const res = await authService.updateDoctorAvailability({
        availabilityStatus: status,
        unavailableReason: status === 'unavailable' ? unavailableReason : undefined,
        unavailableUntil: until
      })
      setDoctorAvailabilityStatus(status)
      if (status === 'available') {
        setDoctorUnavailableUntil(null)
      } else if (res.unavailableUntil) {
        setDoctorUnavailableUntil(res.unavailableUntil)
      } else {
        setDoctorUnavailableUntil(null)
      }
      setDoctorUnavailableReason(status === 'unavailable' ? unavailableReason || null : null)
      setAvailabilityUpdateSuccess(
        status === 'available' ? 'Doctor is now available.' : status === 'unavailable' ? 'Reason and time period saved.' : 'Doctor marked as busy.'
      )
      setTimeout(() => setAvailabilityUpdateSuccess(null), 4000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save. Please try again.'
      setAvailabilityUpdateError(msg)
    } finally {
      setAvailabilityUpdating(false)
    }
  }

  const loadTodayPatientsForDoctor = async () => {
    setTodayPatientsLoading(true)
    try {
      const { appointments } = await appointmentService.getAssistantDoctorTodayAppointments()
      const filtered = (appointments ?? []).filter((a) => !checkedInPatientIdsRef.current.has(a.patientId))
      setTodayAppointments(filtered)
      setTodayPatientsToContact(filtered.filter((a) => typeof a.distanceKm === 'number' && a.distanceKm <= 0.5))
    } catch {
      setTodayPatientsToContact([])
      setTodayAppointments([])
    } finally {
      setTodayPatientsLoading(false)
    }
  }

  const loadUpcomingPatientsForDoctor = async () => {
    setUpcomingPatientsLoading(true)
    try {
      const { appointments } = await appointmentService.getAssistantDoctorUpcomingAppointments()
      setUpcomingAppointments((appointments ?? []).filter((a) => !checkedInPatientIdsRef.current.has(a.patientId)))
    } catch {
      setUpcomingAppointments([])
    } finally {
      setUpcomingPatientsLoading(false)
    }
  }

  const loadCheckedInAudit = async () => {
    setCheckedInLoading(true)
    try {
      const { checkedIn } = await appointmentService.getAssistantCheckedInToday()
      setCheckedInToday(checkedIn ?? [])
      for (const item of checkedIn ?? []) {
        if (item.patientId) checkedInPatientIdsRef.current.add(item.patientId)
      }
    } catch {
      setCheckedInToday([])
    } finally {
      setCheckedInLoading(false)
    }
  }

  const hideCheckedInPatientFromLists = (id?: string | null) => {
    const patientIdToHide = id?.trim()
    if (!patientIdToHide) return
    checkedInPatientIdsRef.current.add(patientIdToHide)
    setTodayAppointments((prev) => prev.filter((a) => a.patientId !== patientIdToHide))
    setTodayPatientsToContact((prev) => prev.filter((a) => a.patientId !== patientIdToHide))
    setUpcomingAppointments((prev) => prev.filter((a) => a.patientId !== patientIdToHide))
  }

  const loadCheckinFromPrefill = async (prefill: AssistantPatientPrefill, backendMobile: string) => {
    const found = prefill.patient
    if (!found) return

    setFamilyOptions(null)
    setFamilyPickMobile(null)

    setPatient(found)
    setPatientId(found.id)
    setFirstName(found.firstName)
    setLastName(found.lastName ?? '')
    setMobileNumber(found.mobileNumber || backendMobile)
    setAddress(found.address ?? '')
    setPreviousHealthHistory(found.previousHealthHistory ?? '')
    setBloodGroup(found.bloodGroup ?? '')
    setEmergencyName(found.emergencyContactName ?? '')
    setEmergencyPhone(found.emergencyContactPhone ?? '')
    setStep('checkin')
    hideCheckedInPatientFromLists(found.id)

    const latestVisit = prefill.latestVisit ?? null
    if (latestVisit) {
      const today = new Date()
      const d = new Date(latestVisit.visitDate)
      const isToday =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()

      setHasTodayVisit(isToday)
      setTodayVisitId(isToday ? latestVisit.id : null)

      // Always prefill from latest known visit values (even if not today's visit).
      try {
        const history = await patientService.getFullHistory(found.id)
        const visitIdStr = String(latestVisit.id)
        const latestKnownVisit =
          (history.visits as any[] | undefined)?.find((v) => String(v._id) === visitIdStr) ??
          (history.visits as any[] | undefined)?.[0]
        if (latestKnownVisit) {
          setPrefilledFromVisitAt(
            latestKnownVisit.visitDate ? new Date(latestKnownVisit.visitDate).toISOString() : null
          )
          const checkedInRaw = (latestKnownVisit as { assistantCheckedInAt?: string | Date }).assistantCheckedInAt
          setPrefilledAssistantCheckInAt(
            checkedInRaw ? new Date(checkedInRaw).toISOString() : null
          )
          setDiseaseReason(latestKnownVisit.reason ?? '')
          setNotesForDoctor(latestKnownVisit.notes ?? '')
          setBpSystolic(
            typeof latestKnownVisit.bloodPressureSystolic === 'number' ? String(latestKnownVisit.bloodPressureSystolic) : ''
          )
          setBpDiastolic(
            typeof latestKnownVisit.bloodPressureDiastolic === 'number' ? String(latestKnownVisit.bloodPressureDiastolic) : ''
          )
          setBloodSugar(
            typeof latestKnownVisit.bloodSugarFasting === 'number' ? String(latestKnownVisit.bloodSugarFasting) : ''
          )
          setWeightKg(typeof latestKnownVisit.weightKg === 'number' ? String(latestKnownVisit.weightKg) : '')
          setTemperature(typeof latestKnownVisit.temperature === 'number' ? String(latestKnownVisit.temperature) : '')
          setOtherVitalsNotes(latestKnownVisit.otherVitalsNotes ?? '')
        } else {
          setPrefilledFromVisitAt(null)
          setPrefilledAssistantCheckInAt(null)
          setDiseaseReason('')
          setNotesForDoctor('')
          setBpSystolic('')
          setBpDiastolic('')
          setBloodSugar('')
          setWeightKg('')
          setTemperature('')
          setOtherVitalsNotes('')
        }
      } catch {
        setPrefilledFromVisitAt(null)
        setPrefilledAssistantCheckInAt(null)
        setDiseaseReason('')
        setNotesForDoctor('')
        setBpSystolic('')
        setBpDiastolic('')
        setBloodSugar('')
        setWeightKg('')
        setTemperature('')
        setOtherVitalsNotes('')
      }
    } else {
      setHasTodayVisit(false)
      setTodayVisitId(null)
      setPrefilledFromVisitAt(null)
      setPrefilledAssistantCheckInAt(null)
      setDiseaseReason('')
      setNotesForDoctor('')
      setBpSystolic('')
      setBpDiastolic('')
      setBloodSugar('')
      setWeightKg('')
      setTemperature('')
      setOtherVitalsNotes('')
    }
  }

  const handleFamilyMemberSelect = async (memberId: string) => {
    if (!familyPickMobile) return
    setSearchError(null)
    setSearchLoading(true)
    try {
      const prefill = await appointmentService.getAssistantPatientPrefill(familyPickMobile, memberId)
      if (!prefill.patient) {
        setSearchError('Could not load this patient.')
        return
      }
      await loadCheckinFromPrefill(prefill, familyPickMobile)
    } catch {
      setSearchError('Could not load this patient.')
    } finally {
      setSearchLoading(false)
    }
  }

  const startCheckInFromAppointment = async (a: DoctorAppointmentItem) => {
    if (!a.patientMobile) {
      setSearchError('This appointment has no mobile on file — use mobile search.')
      return
    }
    setSearchError(null)
    setSearchLoading(true)
    hideCheckedInPatientFromLists(a.patientId)
    const digits = String(a.patientMobile).replace(/\D/g, '')
    const backendMobile = normalizeMobileForBackend(digits.slice(-10))
    try {
      const prefill = await appointmentService.getAssistantPatientPrefill(backendMobile, a.patientId, a.id)
      if (!prefill.patient) {
        setSearchError('Could not load this patient.')
        return
      }
      await loadCheckinFromPrefill(prefill, backendMobile)
      setMobileSearch(digits.slice(-10))
      void loadCheckedInAudit()
    } catch {
      setSearchError('Could not open check-in for this appointment.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError(null)
    setFamilyOptions(null)
    setFamilyPickMobile(null)
    // Reset any previous document upload messages when starting a new search
    setDocUploadError(null)
    setDocUploadSuccess(null)
    setDocFile(null)
    const digits = mobileSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setSearchError('Enter a valid 10-digit mobile number.')
      return
    }
    const backendMobile = normalizeMobileForBackend(digits)
    setSearchLoading(true)
    try {
      let prefill: AssistantPatientPrefill | null = null
      try {
        prefill = await appointmentService.getAssistantPatientPrefill(backendMobile)
      } catch (err: any) {
        if (err?.response?.status === 404) {
          prefill = null
        } else {
          throw err
        }
      }

      if (prefill?.familyOptions?.length && !prefill.patient) {
        setFamilyOptions(prefill.familyOptions)
        setFamilyPickMobile(backendMobile)
        setSearchError(null)
        setSearchLoading(false)
        return
      }

      if (prefill?.patient) {
        await loadCheckinFromPrefill(prefill, backendMobile)
        void loadCheckedInAudit()
      } else {
        setMobileNumber(backendMobile)
        setFirstName('')
        setLastName('')
        setAddress('')
        setDiseaseReason('')
        setPreviousHealthHistory('')
        setBloodGroup('')
        setEmergencyName('')
        setEmergencyPhone('')
        setBpSystolic('')
        setBpDiastolic('')
        setBloodSugar('')
        setWeightKg('')
        setTemperature('')
        setOtherVitalsNotes('')
        setNotesForDoctor('')
        setPatient(null)
        setPatientId(null)
        setPrefilledFromVisitAt(null)
        setPrefilledAssistantCheckInAt(null)
        setStep('new_patient')
      }
    } catch {
      setSearchError('Could not search. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFormError()
    setFormSuccess(null)
    if (!firstName.trim()) {
      setFormError('First name is required.')
      return
    }
    const digits = mobileNumber.replace(/\D/g, '')
    if (digits.length < 10) {
      setFormError('Valid 10-digit mobile number is required.')
      return
    }
    const backendMobile = normalizeMobileForBackend(digits)
    setSaveLoading(true)
    try {
      const created = await patientService.createPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobileNumber: backendMobile,
        address: address.trim() || undefined,
        previousHealthHistory: previousHealthHistory.trim() || undefined,
        bloodGroup: bloodGroup.trim() || undefined,
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.replace(/\D/g, '') || undefined,
      })
      setPatient(created)
      setPatientId(created.id)
      setPrefilledFromVisitAt(null)
      setPrefilledAssistantCheckInAt(null)
      setFormSuccess('Patient registered. Now fill mandatory vitals and refer to doctor.')
      setStep('checkin')
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not create patient. Mobile may already be registered.'
      setFormError(msg)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) return
    clearFormError()
    setFormSuccess(null)
    setSaveLoading(true)
    try {
      const updated = await patientService.updatePatient(patientId, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobileNumber: normalizeMobileForBackend(mobileNumber),
        address: address.trim() || undefined,
        previousHealthHistory: previousHealthHistory.trim() || undefined,
        bloodGroup: bloodGroup.trim() || undefined,
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.replace(/\D/g, '') || undefined,
      })
      setPatient(updated)
      setFormSuccess('Patient details updated.')
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Could not update patient.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleReferToDoctor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) return
    clearFormError()
    const sys = parseInt(bpSystolic, 10)
    const dia = parseInt(bpDiastolic, 10)
    const sugar = bloodSugar.trim() ? parseInt(bloodSugar, 10) : undefined
    const weight = weightKg.trim() ? parseFloat(weightKg) : undefined
    const temp = temperature.trim() ? parseFloat(temperature) : undefined
    if (Number.isNaN(sys) || Number.isNaN(dia)) {
      setFormError('Blood pressure (systolic and diastolic) is mandatory.')
      return
    }
    const payload = {
      reason: diseaseReason.trim() || undefined,
      notes: notesForDoctor.trim() || undefined,
      bloodPressureSystolic: sys,
      bloodPressureDiastolic: dia,
      bloodSugarFasting: sugar,
      weightKg: weight,
      temperature: temp,
      otherVitalsNotes: otherVitalsNotes.trim() || undefined,
    }
    setReferLoading(true)
    try {
      if (hasTodayVisit && todayVisitId) {
        await patientService.referExistingVisit(patientId, todayVisitId, payload)
      } else {
        await patientService.createVisit(patientId, payload)
      }
      setFormSuccess('Patient referred to doctor successfully.')
      setStep('search')
      setPatient(null)
      setPatientId(null)
      setTodayVisitId(null)
      setPrefilledFromVisitAt(null)
      setPrefilledAssistantCheckInAt(null)
      setMobileSearch('')
      setDocPendingReleaseId(null)
    } catch (err: unknown) {
      const parsed = parseAssistantReferralError(err)
      setFormError(parsed.message)
      setFormErrorVariant(parsed.variant)
    } finally {
      setReferLoading(false)
    }
  }

  const seedVerifyFormFromSuggestedParse = (parse?: {
    medicines?: Array<{ text: string }>
    tests?: Array<{ text: string }>
  }) => {
    const meds = (parse?.medicines ?? []).map((m) => ({
      id: newVerifyRowId(),
      medicineName: m.text,
      dosage: '',
      quantity: '',
      notes: '',
    }))
    setVerifyMedicines(
      meds.length > 0
        ? meds
        : [{ id: newVerifyRowId(), medicineName: '', dosage: '', quantity: '', notes: '' }]
    )
    const t = (parse?.tests ?? []).map((x) => ({
      id: newVerifyRowId(),
      testName: x.text,
      notes: '',
    }))
    setVerifyTests(t.length > 0 ? t : [{ id: newVerifyRowId(), testName: '', notes: '' }])
    setVerifyClinicalNotes('')
    setVerifyImportantNotes('')
  }

  const verifyPreviewFileNameHint = useMemo(() => {
    if (!docPendingReleaseId || !patientId) return verifyDocMeta?.originalName ?? null
    return (
      verifyDocMeta?.originalName ??
      pendingDocs.find((d) => d.documentId === docPendingReleaseId && d.patientId === patientId)?.originalName ??
      null
    )
  }, [verifyDocMeta, pendingDocs, docPendingReleaseId, patientId])

  const loadPendingAssistantDocuments = useCallback(async () => {
    setPendingDocsLoading(true)
    setPendingDocsError(null)
    try {
      const items = await patientService.listAssistantPendingDocuments(pendingDocsSort)
      setPendingDocs(items)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setPendingDocsError(ax?.response?.data?.message ?? 'Could not load pending prescriptions.')
      setPendingDocs([])
    } finally {
      setPendingDocsLoading(false)
    }
  }, [pendingDocsSort])

  const openVerifyFromPendingQueue = (row: AssistantPendingDocumentItem) => {
    setStep('checkin')
    setPatient({
      id: row.patientId,
      firstName: row.patientFirstName,
      lastName: row.patientLastName,
      mobileNumber: row.mobileNumber,
    })
    setPatientId(row.patientId)
    setVerifyDocMeta({ mimeType: row.mimeType, originalName: row.originalName })
    setDocPendingReleaseId(row.documentId)
    setDocOcrPreview(row.ocrText ?? null)
    seedVerifyFormFromSuggestedParse(row.suggestedParse)
    setVerifyModalOpen(true)
  }

  const handleUploadDocument = async () => {
    if (!patientId) return
    setDocUploadError(null)
    setDocUploadSuccess(null)
    setDocOcrPreview(null)
    if (!docFile) {
      setDocUploadError('Please choose a file to upload.')
      return
    }
    setDocUploadLoading(true)
    try {
      const result = await patientService.uploadDocument(patientId, docFile)
      const pub = result.document?.patientPublishStatus
      if (pub === 'PENDING_ASSISTANT' && result.document?.id) {
        setVerifyDocMeta({
          mimeType: result.document.mimeType || docFile.type || 'application/octet-stream',
          originalName: result.document.originalName || docFile.name,
        })
        setDocPendingReleaseId(result.document.id)
        seedVerifyFormFromSuggestedParse(result.suggestedParse)
        setVerifyModalOpen(true)
      } else {
        setVerifyDocMeta(null)
        setDocPendingReleaseId(null)
        setVerifyModalOpen(false)
      }
      if (result.ocr && result.ocr.success && 'text' in result.ocr && result.ocr.text) {
        setDocOcrPreview(result.ocr.text)
        setDocUploadSuccess(
          pub === 'PENDING_ASSISTANT'
            ? 'File saved. The verification window is open — edit medicines / tests / notes, then save to release.'
            : 'File uploaded. Text extracted below – please review and copy as needed.'
        )
      } else if (result.ocr && !result.ocr.success) {
        setDocUploadSuccess(
          pub === 'PENDING_ASSISTANT'
            ? 'File saved (OCR failed). Use the verification window to enter medicines and tests manually, then save.'
            : 'File uploaded to patient record. (Text extraction failed, but document is saved.)'
        )
      } else {
        setDocUploadSuccess(
          pub === 'PENDING_ASSISTANT'
            ? 'File saved. Complete the verification window to release to the patient profile.'
            : 'File uploaded and saved to patient record.'
        )
      }
      setDocFile(null)
      void loadPendingAssistantDocuments()
    } catch (err: any) {
      setDocUploadError(err?.response?.data?.message ?? 'Could not upload file.')
    } finally {
      setDocUploadLoading(false)
    }
  }

  const handleVerifyModalSave = async () => {
    if (!patientId || !docPendingReleaseId) return
    const medicinesPayload = verifyMedicines
      .map((r) => ({
        medicineName: r.medicineName.trim(),
        dosage: r.dosage.trim() || undefined,
        quantity: r.quantity.trim() || undefined,
        notes: r.notes.trim() || undefined,
      }))
      .filter((r) => r.medicineName.length > 0)
    const testsPayload = verifyTests
      .map((r) => ({
        testName: r.testName.trim(),
        notes: r.notes.trim() || undefined,
      }))
      .filter((r) => r.testName.length > 0)
    const clinical = verifyClinicalNotes.trim()
    const important = verifyImportantNotes.trim()
    const hasAny =
      medicinesPayload.length > 0 ||
      testsPayload.length > 0 ||
      clinical.length > 0 ||
      important.length > 0
    if (!hasAny) {
      toast.error('Add at least one medicine, lab test, or clinical / important notes before saving.')
      return
    }
    setDocVerifyLoading(true)
    try {
      await patientService.verifyDocumentForPatientProfile(patientId, docPendingReleaseId, {
        medicines: medicinesPayload,
        tests: testsPayload,
        clinicalNotes: clinical || undefined,
        importantNotes: important || undefined,
      })
      setDocPendingReleaseId(null)
      setVerifyDocMeta(null)
      setVerifyModalOpen(false)
      setDocOcrPreview(null)
      toast.success(
        'Verified and released — patient can view this document; lab/pharmacy preview uses your structured data.'
      )
      void loadPendingAssistantDocuments()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      toast.error(ax?.response?.data?.message ?? 'Could not verify document.')
    } finally {
      setDocVerifyLoading(false)
    }
  }

  const addVerifyMedicineRow = () => {
    setVerifyMedicines((rows) => [
      ...rows,
      { id: newVerifyRowId(), medicineName: '', dosage: '', quantity: '', notes: '' },
    ])
  }

  const removeVerifyMedicineRow = (id: string) => {
    setVerifyMedicines((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
  }

  const addVerifyTestRow = () => {
    setVerifyTests((rows) => [...rows, { id: newVerifyRowId(), testName: '', notes: '' }])
  }

  const removeVerifyTestRow = (id: string) => {
    setVerifyTests((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
  }

  const handleViewOriginalPrescriptionInNewTab = () => {
    if (!patientId || !docPendingReleaseId) return
    void patientService.openDocument(patientId, docPendingReleaseId, { assistantVerified: false })
  }

  useEffect(() => {
    if (!verifyModalOpen || !patientId || !docPendingReleaseId) {
      return
    }
    let cancelled = false
    if (verifyPreviewUrlRef.current) {
      URL.revokeObjectURL(verifyPreviewUrlRef.current)
      verifyPreviewUrlRef.current = null
    }
    setVerifyPreviewUrl(null)
    setVerifyPreviewPublicUrl(null)
    setVerifyPreviewMime(null)
    setVerifyPreviewError(null)
    setVerifyPreviewLoading(true)

    const rowMeta =
      verifyDocMeta ??
      pendingDocs.find((d) => d.documentId === docPendingReleaseId && d.patientId === patientId) ??
      null
    const hintName = rowMeta?.originalName
    const hintMime = rowMeta?.mimeType?.toLowerCase().trim()

    void (async () => {
      try {
        try {
          const linkRes = await api.get('/public/patient/documents/link', {
            params: { patientId, documentId: docPendingReleaseId },
          })
          const rawUrl = (linkRes.data as { url?: string })?.url
          if (typeof rawUrl === 'string' && rawUrl.length > 0) {
            const displayUrl = previewPublicFileUrlForInlineDisplay(rawUrl)
            const mimeGuess =
              (hintMime && hintMime.length > 0 ? hintMime : null) ||
              (isLikelyPdfMime(undefined, hintName) ? 'application/pdf' : null) ||
              (isLikelyImageMime(undefined, hintName) ? 'image/jpeg' : null)
            if (!cancelled) {
              setVerifyPreviewPublicUrl(displayUrl)
              setVerifyPreviewMime(mimeGuess)
            }
            if (!cancelled) setVerifyPreviewLoading(false)
            return
          }
        } catch {
          /* fall through to authenticated blob fetch */
        }

        const res = await api.get(`/patients/${patientId}/documents/${docPendingReleaseId}/file`, {
          responseType: 'blob',
          params: { _ts: Date.now() },
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        })
        const blob = res.data as Blob
        const headerRaw = String(res.headers['content-type'] ?? (res.headers as { 'Content-Type'?: string })['Content-Type'] ?? '')
        const headerCt = headerRaw.split(';')[0].trim().toLowerCase()
        const mimeRaw = (blob.type || '').toLowerCase()
        const mime =
          mimeRaw && mimeRaw !== 'application/octet-stream'
            ? mimeRaw
            : (headerCt && headerCt !== 'application/octet-stream' ? headerCt : null) ||
                hintMime ||
                (isLikelyPdfMime(undefined, hintName) ? 'application/pdf' : null) ||
                (isLikelyImageMime(undefined, hintName) ? 'image/jpeg' : null) ||
                'application/octet-stream'

        if (mimeRaw.includes('json') || headerRaw.toLowerCase().includes('application/json')) {
          const text = await blob.text()
          try {
            const j = JSON.parse(text) as { message?: string }
            if (!cancelled) setVerifyPreviewError(j.message ?? 'Could not load preview.')
          } catch {
            if (!cancelled) setVerifyPreviewError('Could not load preview.')
          }
          return
        }

        const objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        verifyPreviewUrlRef.current = objectUrl
        setVerifyPreviewMime(mime)
        setVerifyPreviewUrl(objectUrl)
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { message?: string } } }
        if (!cancelled) {
          setVerifyPreviewError(ax?.response?.data?.message ?? 'Could not load document preview.')
        }
      } finally {
        if (!cancelled) setVerifyPreviewLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (verifyPreviewUrlRef.current) {
        URL.revokeObjectURL(verifyPreviewUrlRef.current)
        verifyPreviewUrlRef.current = null
      }
      setVerifyPreviewUrl(null)
      setVerifyPreviewPublicUrl(null)
      setVerifyPreviewMime(null)
      setVerifyPreviewError(null)
      setVerifyPreviewLoading(false)
    }
  }, [verifyModalOpen, patientId, docPendingReleaseId, pendingDocs, verifyDocMeta])

  const goBackToSearch = () => {
    setStep('search')
    setPatient(null)
    setPatientId(null)
    setHasTodayVisit(false)
    setTodayVisitId(null)
    setPrefilledFromVisitAt(null)
    setPrefilledAssistantCheckInAt(null)
    setMobileSearch('')
    setFamilyOptions(null)
    setFamilyPickMobile(null)
    clearFormError()
    setFormSuccess(null)
    setDocFile(null)
    setDocUploadError(null)
    setDocUploadSuccess(null)
    setDocPendingReleaseId(null)
    setVerifyDocMeta(null)
    setVerifyModalOpen(false)
    seedVerifyFormFromSuggestedParse(undefined)
  }

  useEffect(() => {
    void loadProfile()
  }, [])

  useEffect(() => {
    void loadPendingAssistantDocuments()
  }, [loadPendingAssistantDocuments])

  // Load today's + upcoming appointments for assistant view.
  useEffect(() => {
    void loadCheckedInAudit()
    void loadTodayPatientsForDoctor()
    void loadUpcomingPatientsForDoctor()
    const timer = window.setInterval(() => {
      void loadCheckedInAudit()
      void loadTodayPatientsForDoctor()
      void loadUpcomingPatientsForDoctor()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // If doctor is available, hide the "to contact" list.
  useEffect(() => {
    if (doctorAvailabilityStatus === 'available') {
      setTodayPatientsToContact([])
    }
  }, [doctorAvailabilityStatus])

  // Socket: real-time doctor availability updates for assistant
  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null
    let mounted = true
    const connect = async () => {
      try {
        const { doctor } = await authService.getProfile()
        const userId = doctor?.id
        if (!userId || !mounted) return
        const socketUrl = getApiOriginForSockets()
        socket = io(socketUrl, {
          query: { doctorId: userId },
          transports: ['websocket', 'polling']
        })
        socket.on('doctorAvailabilityChanged', (data: { availabilityStatus: AvailabilityStatus; unavailableReason?: string; unavailableUntil?: string }) => {
          if (!mounted) return
          if (data.availabilityStatus) setDoctorAvailabilityStatus(data.availabilityStatus)
          setDoctorUnavailableReason(data.unavailableReason ?? null)
          setUnavailableReason(data.unavailableReason ?? '')
          setDoctorUnavailableUntil(data.unavailableUntil ?? null)
        })
      } catch {
        // ignore
      }
    }
    void connect()
    return () => {
      mounted = false
      if (socket) socket.disconnect()
    }
  }, [])

  // Auto-hide document upload success message after a few seconds
  useEffect(() => {
    if (!docUploadSuccess || docPendingReleaseId) return
    const timeout = setTimeout(() => {
      setDocUploadSuccess(null)
    }, 4000)
    return () => clearTimeout(timeout)
  }, [docUploadSuccess, docPendingReleaseId])

  const isBotBookedAppointment = (a: DoctorAppointmentItem): boolean => {
    const source = String(a.source ?? '').toUpperCase()
    const reason = String(a.reason ?? '').toUpperCase()
    if (source.includes('WHATSAPP') || source.includes('BOT')) return true
    // Bot and public booking payloads commonly store consultation type as reason.
    return reason === 'NEW_CONSULTATION' || reason === 'REVIEW_APPOINTMENT'
  }

  const getAssistantAppointmentSubtitle = (a: DoctorAppointmentItem): string | null => {
    if (isBotBookedAppointment(a)) return 'Booked by BOT'
    const reason = a.reason?.trim()
    return reason && reason.length > 0 ? reason : null
  }

  return (
    <div className="app-shell">
      <Header clinicName="Check‑in desk" doctorName={name} />
      <main className="search-main" style={{ padding: 24, maxWidth: '100%', width: '100%' }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card className="dashboard-overview-card">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: pendingDocsLoading || pendingDocs.length > 0 || pendingDocsError ? 14 : 0,
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <p className="dashboard-kicker">
                Prescriptions waiting for release
                {pendingDocs.length > 0 ? ` (${pendingDocs.length})` : ''}
              </p>
              <p className="dashboard-body" style={{ marginTop: 4, fontSize: 13, color: '#627d98', lineHeight: 1.45 }}>
                Staff uploads stay hidden from the patient until you verify structured medicines / tests and release.
                Open any row to continue — oldest uploads are listed first by default.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <label htmlFor="pending-docs-sort" className="text-sm" style={{ color: '#475569' }}>
                Sort by upload
              </label>
              <select
                id="pending-docs-sort"
                value={pendingDocsSort}
                onChange={(e) => setPendingDocsSort(e.target.value as 'asc' | 'desc')}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  background: '#fff',
                }}
              >
                <option value="asc">Oldest first</option>
                <option value="desc">Newest first</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                disabled={pendingDocsLoading}
                onClick={() => void loadPendingAssistantDocuments()}
              >
                {pendingDocsLoading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
          </div>
          {pendingDocsError && (
            <p className="text-sm" style={{ color: '#b91c1c', margin: '0 0 10px' }}>
              {pendingDocsError}
            </p>
          )}
          {pendingDocsLoading && pendingDocs.length === 0 && !pendingDocsError && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <DnaLoader />
            </div>
          )}
          {!pendingDocsLoading && pendingDocs.length === 0 && !pendingDocsError && (
            <p className="text-sm" style={{ margin: 0, color: '#64748b' }}>
              No prescriptions waiting for release right now.
            </p>
          )}
          {pendingDocs.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: 'left', background: '#f8fafc', color: '#64748b' }}>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Patient</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Mobile</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>File</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Uploaded</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', width: 140 }} />
                  </tr>
                </thead>
                <tbody>
                  {pendingDocs.map((row) => (
                    <tr key={row.documentId}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        {row.patientName}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        {row.mobileNumber}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        {row.originalName}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {new Date(row.uploadedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        <span style={{ color: '#92400e', fontWeight: 600 }}>Pending assistant</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        <Button type="button" variant="secondary" onClick={() => openVerifyFromPendingQueue(row)}>
                          Open verify
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {referredToDoctorName && (
          <div style={{ marginBottom: 0 }}>
          <Card className="dashboard-overview-card assistant-availability-card">
            <p className="dashboard-kicker">Your doctor&apos;s availability</p>
            <p className="dashboard-body" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#627d98' }}>
              Mark doctor unavailable or busy so patients can be informed in real time. You can update this on behalf of the doctor.
            </p>
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
                    border: doctorAvailabilityStatus === status ? '2px solid #0d47a1' : '1px solid #e2e8f0',
                    background: doctorAvailabilityStatus === status
                      ? (status === 'unavailable' ? '#fff3e0' : status === 'busy' ? '#fce4ec' : '#e3f2fd')
                      : '#fff',
                    color: doctorAvailabilityStatus === status ? '#0d47a1' : '#334155',
                    fontWeight: doctorAvailabilityStatus === status ? 600 : 400,
                    cursor: availabilityUpdating ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    textTransform: 'capitalize'
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
            {doctorAvailabilityStatus === 'unavailable' && (
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
                    marginBottom: 10
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
                    marginBottom: 8
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
                        fontSize: 13
                      }}
                    />
                  </div>
                )}
                {doctorUnavailableUntil && (
                  <p style={{ fontSize: 12, color: '#2e7d32', marginTop: 4, marginBottom: 8 }}>
                    Unavailable until: {new Date(doctorUnavailableUntil).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
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
                  onClick={() => handleSetAvailability(doctorAvailabilityStatus)}
                  style={{
                    marginTop: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #0d47a1',
                    background: '#0d47a1',
                    color: '#fff',
                    cursor: availabilityUpdating ? 'not-allowed' : 'pointer',
                    fontSize: 12
                  }}
                >
                  Save reason &amp; duration
                </button>
              </div>
            )}
            <p className="dashboard-body" style={{ marginTop: 10, marginBottom: 8 }}>
              {referredToDoctorName} is currently{' '}
              <strong
                style={{
                  color:
                    doctorAvailabilityStatus === 'available'
                      ? '#2e7d32'
                      : doctorAvailabilityStatus === 'busy'
                        ? '#ed6c02'
                        : '#c62828'
                }}
              >
                {doctorAvailabilityStatus}
              </strong>
              {doctorUnavailableReason && (
                <span style={{ display: 'block', marginTop: 4, fontWeight: 400, color: '#334155' }}>
                  Reason: {doctorUnavailableReason}
                </span>
              )}
            </p>
            {(doctorAvailabilityStatus === 'unavailable' || doctorAvailabilityStatus === 'busy') && (
              <div style={{ marginTop: 12 }}>
                <p className="dashboard-body" style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
                  Call or message only patients who are within <strong>500 meters</strong> of the clinic to inform that the doctor is not available.
                </p>
                {todayPatientsLoading ? (
                  <DnaLoader label="Loading today's appointments..." />
                ) : todayPatientsToContact.length === 0 ? (
                  <p className="dashboard-body" style={{ fontSize: 13, color: '#627d98' }}>
                    No patients are within <strong>500 meters</strong> of the clinic right now.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      maxHeight: todayPatientsToContact.length > 5 ? 320 : undefined,
                      overflowY: todayPatientsToContact.length > 5 ? 'auto' : undefined,
                    }}
                  >
                    {todayPatientsToContact.map((a) => (
                      <li
                        key={a.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          backgroundColor: '#f5f9fc',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          fontSize: 13
                        }}
                      >
                        <div>
                          <strong>{a.patientName}</strong>
                          {a.reason && <div style={{ color: '#607d8b', fontSize: 12 }}>{a.reason}</div>}
                          {a.distanceKm != null && (
                            <div style={{ marginTop: 4, fontSize: 12, color: '#0d47a1' }}>
                              {a.distanceKm < 1 ? `${Math.round(a.distanceKm * 1000)} m` : `~${a.distanceKm.toFixed(1)} km`} from clinic
                              {a.patientLatitude != null && a.patientLongitude != null && (
                                <>
                                  {' · '}
                                  <a
                                    href={`https://www.google.com/maps?q=${a.patientLatitude},${a.patientLongitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#1565c0', textDecoration: 'underline' }}
                                  >
                                    View on map
                                  </a>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {a.patientMobile && (
                            <a href={`tel:${a.patientMobile}`} style={{ color: '#0d47a1', fontWeight: 500, textDecoration: 'none' }}>
                              {a.patientMobile}
                            </a>
                          )}
                          <Button type="button" variant="secondary" onClick={() => void startCheckInFromAppointment(a)} style={{ fontSize: 12, padding: '4px 10px' }}>
                            Check-in this patient
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
          </div>
        )}

        <div style={{ marginBottom: 0 }}>
          <Card className="dashboard-overview-card assistant-availability-card">
            <p className="dashboard-kicker">Today&apos;s appointments (assistant view)</p>
            {todayPatientsLoading ? (
              <DnaLoader label="Loading appointments..." />
            ) : todayAppointments.length === 0 ? (
              <p className="dashboard-body" style={{ fontSize: 13, color: '#627d98' }}>No appointments scheduled for today.</p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: todayAppointments.length > 5 ? 320 : undefined,
                  overflowY: todayAppointments.length > 5 ? 'auto' : undefined,
                }}
              >
                {todayAppointments.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      backgroundColor: '#f5f9fc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 13
                    }}
                  >
                    <div>
                      <strong>{a.patientName}</strong>
                      {getAssistantAppointmentSubtitle(a) && (
                        <div style={{ color: '#607d8b', fontSize: 12 }}>{getAssistantAppointmentSubtitle(a)}</div>
                      )}
                      {a.distanceKm != null ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: a.distanceKm <= 0.5 ? '#2e7d32' : '#0d47a1' }}>
                          {a.distanceKm <= 0.5
                            ? `Within 500m (arrived) · ${Math.round(a.distanceKm * 1000)} m`
                            : `${a.distanceKm < 1 ? `${Math.round(a.distanceKm * 1000)} m` : `~${a.distanceKm.toFixed(1)} km`} from clinic`}
                        </div>
                      ) : a.patientLatitude != null && a.patientLongitude != null ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9aa5b1' }}>
                          Clinic location not set
                        </div>
                      ) : !isBotBookedAppointment(a) ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9aa5b1' }}>
                          Location not shared yet
                        </div>
                      ) : a.patientAddress?.trim() ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                          {a.patientAddress.trim()}
                        </div>
                      ) : (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9aa5b1' }}>
                          Location not provided in bot booking
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {a.patientMobile && (
                        <a href={`tel:${a.patientMobile}`} style={{ color: '#0d47a1', fontWeight: 500, textDecoration: 'none' }}>
                          {a.patientMobile}
                        </a>
                      )}
                      <Button type="button" variant="secondary" onClick={() => void startCheckInFromAppointment(a)} style={{ fontSize: 12, padding: '4px 10px' }}>
                        Check-in this patient
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div style={{ marginBottom: 0 }}>
          <Card className="dashboard-overview-card assistant-availability-card">
            <p className="dashboard-kicker">Today checked-in patients (audit)</p>
            {checkedInLoading ? (
              <DnaLoader label="Loading checked-in list..." />
            ) : checkedInToday.length === 0 ? (
              <p className="dashboard-body" style={{ fontSize: 13, color: '#627d98' }}>No checked-in patients yet today.</p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: checkedInToday.length > 5 ? 320 : undefined,
                  overflowY: checkedInToday.length > 5 ? 'auto' : undefined,
                }}
              >
                {checkedInToday.map((a) => (
                  <li
                    key={`checked-${a.id}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      backgroundColor: '#f5f9fc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 13
                    }}
                  >
                    <div>
                      <strong>{a.patientName}</strong>
                      <div style={{ color: '#607d8b', fontSize: 12 }}>
                        Checked-in at {new Date(a.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {a.reason && <div style={{ color: '#607d8b', fontSize: 12 }}>{a.reason}</div>}
                    </div>
                    {a.patientMobile && (
                      <a href={`tel:${a.patientMobile}`} style={{ color: '#0d47a1', fontWeight: 500, textDecoration: 'none' }}>
                        {a.patientMobile}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div style={{ marginBottom: 0 }}>
          <Card className="dashboard-overview-card assistant-availability-card">
            <p className="dashboard-kicker">Upcoming appointments (assistant view)</p>
            {upcomingPatientsLoading ? (
              <DnaLoader label="Loading upcoming appointments..." />
            ) : upcomingAppointments.length === 0 ? (
              <p className="dashboard-body" style={{ fontSize: 13, color: '#627d98' }}>No upcoming appointments.</p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: upcomingAppointments.length > 5 ? 320 : undefined,
                  overflowY: upcomingAppointments.length > 5 ? 'auto' : undefined,
                }}
              >
                {upcomingAppointments.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      backgroundColor: '#f5f9fc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 13
                    }}
                  >
                    <div>
                      <strong>{a.patientName}</strong>
                      <div style={{ color: '#607d8b', fontSize: 12 }}>
                        {new Date(a.visitDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {a.patientMobile && (
                        <a href={`tel:${a.patientMobile}`} style={{ color: '#0d47a1', fontWeight: 500, textDecoration: 'none' }}>
                          {a.patientMobile}
                        </a>
                      )}
                      <Button type="button" variant="secondary" onClick={() => void startCheckInFromAppointment(a)} style={{ fontSize: 12, padding: '4px 10px' }}>
                        Check-in this patient
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Existing assistant workspace below */}

        {step === 'search' && (
          <Card className="search-card assistant-workspace-card">
            <header className="search-header">
              <p className="dashboard-kicker">Assistant workspace</p>
              <h2 className="search-title">Find or register patient</h2>
              <p className="search-subtitle">
                Enter patient mobile number. If found, you can update details, record vitals and refer to doctor. If not found, register as new patient.
              </p>
            </header>
            <form onSubmit={handleSearch} className="search-form">
              <TextField
                id="mobile-search"
                type="tel"
                inputMode="numeric"
                label="Mobile number"
                placeholder="e.g. 9876543210"
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              {searchError && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>{searchError}</p>
              )}
              <div className="search-footer">
                <Button type="submit" disabled={searchLoading}>
                  {searchLoading ? 'Searching…' : 'Search'}
                </Button>
              </div>
              {familyOptions && familyOptions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p className="dashboard-body" style={{ fontSize: 13, marginBottom: 8, color: '#0d47a1', fontWeight: 600 }}>
                    Several family members use this number — choose who is visiting:
                  </p>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      maxHeight: familyOptions.length > 5 ? 260 : undefined,
                      overflowY: familyOptions.length > 5 ? 'auto' : undefined,
                    }}
                  >
                    {familyOptions.map((m) => (
                      <li key={m.id}>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={searchLoading}
                          onClick={() => void handleFamilyMemberSelect(m.id)}
                          style={{ width: '100%', justifyContent: 'flex-start' }}
                        >
                          {[m.firstName, m.lastName].filter(Boolean).join(' ') || 'Patient'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          </Card>
        )}

        {step === 'new_patient' && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Card className="search-card assistant-workspace-card">
              <header className="search-header">
                <p className="dashboard-kicker">New patient</p>
                <h2 className="search-title">Register patient</h2>
                <p className="search-subtitle">
                  Collect name, address, contact, and health history. Then you will fill mandatory vitals and refer to doctor.
                </p>
              </header>
              <form
                onSubmit={handleCreatePatient}
                className="search-form"
                style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  <TextField id="first-name" label="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <TextField id="last-name" label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  <TextField id="mobile" type="tel" label="Mobile number *" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <TextField id="address" label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  <TextField id="disease" label="Disease / reason for visit" value={diseaseReason} onChange={(e) => setDiseaseReason(e.target.value)} />
                </div>
                <div>
                  <label className="ui-textfield-label" htmlFor="history">Previous health history</label>
                  <textarea
                    id="history"
                    rows={3}
                    className="ui-textfield-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={previousHealthHistory}
                    onChange={(e) => setPreviousHealthHistory(e.target.value)}
                    placeholder="Past conditions, surgeries, allergies, current medicines…"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  <TextField id="blood-group" label="Blood group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="e.g. B+" />
                  <TextField id="emergency-name" label="Emergency contact name" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
                  <TextField id="emergency-phone" type="tel" label="Emergency contact phone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                </div>
                {renderFormError()}
                {formSuccess && <p className="text-sm" style={{ color: '#2e7d32' }}>{formSuccess}</p>}
                <div className="dialog-actions" style={{ marginTop: 8 }}>
                  <Button type="button" variant="secondary" onClick={goBackToSearch}>Back</Button>
                  <Button type="submit" disabled={saveLoading}>{saveLoading ? 'Saving…' : 'Register & continue to vitals'}</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {step === 'checkin' && patientId && (
          <Card className="search-card assistant-workspace-card assistant-checkin-card">
            <header className="search-header">
              <p className="dashboard-kicker">Check-in & refer to doctor</p>
              <h2 className="search-title">
                {patient ? 'Update details, record vitals, refer' : 'Record vitals and refer'}
              </h2>
              {referredToDoctorName && (
                <p className="search-subtitle">
                  Patient will be referred to <strong>{referredToDoctorName}</strong>.
                </p>
              )}
              {prefilledFromVisitAt && (
                <p
                  className="search-subtitle"
                  style={{ marginTop: 6, color: '#0d47a1', fontSize: 12, lineHeight: 1.45 }}
                >
                  Vitals prefilled from the latest visit.{' '}
                  <strong>Scheduled appointment</strong> (from booking / preferred slot — not “saved just now”):{' '}
                  <strong>
                    {new Date(prefilledFromVisitAt).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </strong>
                  {prefilledAssistantCheckInAt ? (
                    <>
                      {' '}
                      · Assistant check-in:{' '}
                      <strong>
                        {new Date(prefilledAssistantCheckInAt).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </strong>
                    </>
                  ) : null}
                </p>
              )}
            </header>

            <div className="assistant-checkin-grid">
              <div className="assistant-checkin-col">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleUpdatePatient(e)
                  }}
                  className="search-form"
                  style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                  <p className="dashboard-kicker" style={{ marginTop: 0 }}>Patient information</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <TextField id="c-first-name" label="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    <TextField id="c-last-name" label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    <TextField id="c-mobile" type="tel" label="Mobile number *" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <TextField id="c-address" label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
                    <TextField id="c-disease" label="Disease / reason for visit" value={diseaseReason} onChange={(e) => setDiseaseReason(e.target.value)} />
                  </div>
                  <div>
                    <label className="ui-textfield-label" htmlFor="c-history">Previous health history</label>
                    <textarea
                      id="c-history"
                      rows={3}
                      className="ui-textfield-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={previousHealthHistory}
                      onChange={(e) => setPreviousHealthHistory(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <TextField id="c-blood-group" label="Blood group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} />
                    <TextField id="c-emergency-name" label="Emergency contact name" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
                    <TextField id="c-emergency-phone" type="tel" label="Emergency contact phone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={saveLoading} style={{ alignSelf: 'flex-start' }}>
                    {saveLoading ? 'Saving…' : 'Update patient details'}
                  </Button>
                </form>
              </div>

              <div className="assistant-checkin-col">
                <form onSubmit={handleReferToDoctor} className="search-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p className="dashboard-kicker" style={{ marginTop: 0 }}>
                    {hasTodayVisit ? 'Upload documents for today\'s visit' : 'Mandatory vitals (before doctor)'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <TextField id="bp-sys" type="number" label="BP systolic (mmHg) *" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} placeholder="120" />
                    <TextField id="bp-dia" type="number" label="BP diastolic (mmHg) *" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} placeholder="80" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <TextField id="sugar" type="number" label="Blood sugar fasting (mg/dL)" value={bloodSugar} onChange={(e) => setBloodSugar(e.target.value)} placeholder="e.g. 90" />
                    <TextField id="weight" type="number" label="Weight (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 70" />
                    <TextField id="temp" type="number" label="Temperature (°C)" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="e.g. 37" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
                    <div>
                      <label className="ui-textfield-label" htmlFor="other-vitals">Other basic tests / notes</label>
                      <textarea
                        id="other-vitals"
                        rows={3}
                        className="ui-textfield-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        value={otherVitalsNotes}
                        onChange={(e) => setOtherVitalsNotes(e.target.value)}
                        placeholder="e.g. Pulse, SpO2, any other readings"
                      />
                    </div>
                    <div>
                      <label className="ui-textfield-label" htmlFor="notes-doctor">Notes for doctor</label>
                      <textarea
                        id="notes-doctor"
                        rows={3}
                        className="ui-textfield-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        value={notesForDoctor}
                        onChange={(e) => setNotesForDoctor(e.target.value)}
                        placeholder="Brief note to refer patient to doctor"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="dashboard-kicker">Upload report / document</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          setDocFile(f)
                          setDocUploadError(null)
                          setDocUploadSuccess(null)
                          setDocOcrPreview(null)
                          setDocPendingReleaseId(null)
                          setVerifyDocMeta(null)
                        }}
                      />
                      {docFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setDocFile(null)
                            setDocUploadError(null)
                            setDocUploadSuccess(null)
                            setDocOcrPreview(null)
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#c62828',
                            fontSize: 18,
                            cursor: 'pointer',
                            lineHeight: 1,
                          }}
                          aria-label="Clear selected file"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {docUploadError && (
                      <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                        {docUploadError}
                      </p>
                    )}
                    {docUploadSuccess && (
                      <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                        {docUploadSuccess}
                      </p>
                    )}
                    {docOcrPreview && (
                      <div style={{ marginTop: 8 }}>
                        <p className="dashboard-kicker">Extracted text (OCR)</p>
                        <div
                          style={{
                            border: '1px solid #ddd',
                            borderRadius: 4,
                            padding: 8,
                            maxHeight: 140,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: 12,
                            backgroundColor: '#fafafa',
                          }}
                        >
                          {docOcrPreview}
                        </div>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!docFile || docUploadLoading}
                      onClick={handleUploadDocument}
                      style={{ marginTop: 8 }}
                    >
                      {docUploadLoading ? 'Uploading…' : 'Upload to patient record'}
                    </Button>
                    {docPendingReleaseId && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 8,
                          background: '#fffbeb',
                          border: '1px solid #fcd34d',
                        }}
                      >
                        <p className="text-sm" style={{ margin: '0 0 8px', color: '#92400e', fontWeight: 600 }}>
                          Patient profile: verification in progress
                        </p>
                        <p className="text-sm" style={{ margin: '0 0 10px', color: '#78350f', lineHeight: 1.45 }}>
                          This file stays hidden from the patient until you review medicines, lab tests, and notes in
                          the verification window, then save structured data and release.
                        </p>
                        {!verifyModalOpen && (
                          <Button type="button" onClick={() => setVerifyModalOpen(true)}>
                            Open verification
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {renderFormError()}
                  {formSuccess && <p className="text-sm" style={{ color: '#2e7d32' }}>{formSuccess}</p>}
                  <div className="dialog-actions" style={{ marginTop: 8 }}>
                    <Button type="button" variant="secondary" onClick={goBackToSearch}>Back to search</Button>
                    <Button type="submit" disabled={referLoading}>
                      {referLoading ? 'Referring…' : 'Refer to doctor'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </Card>
        )}
        </div>
      </main>

      {verifyModalOpen && docPendingReleaseId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-prescription-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(1180px, 98vw)',
              maxHeight: 'min(92vh, 900px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <h2 id="verify-prescription-title" className="text-lg" style={{ margin: 0, fontWeight: 700 }}>
                Verify prescription & release to patient
              </h2>
              <Button
                type="button"
                variant="secondary"
                disabled={docVerifyLoading}
                onClick={() => {
                  setVerifyDocMeta(null)
                  setVerifyModalOpen(false)
                }}
              >
                Close
              </Button>
            </div>
            <div style={{ overflow: 'auto', padding: 20, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                <aside style={{ flex: '1 1 300px', maxWidth: '100%', alignSelf: 'flex-start' }}>
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 12,
                      background: '#f8fafc',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <p className="text-sm" style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                        Original prescription
                      </p>
                      <Button type="button" variant="secondary" onClick={handleViewOriginalPrescriptionInNewTab}>
                        View (new tab)
                      </Button>
                    </div>
                    {verifyPreviewLoading && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 8px' }}>
                        <DnaLoader />
                      </div>
                    )}
                    {verifyPreviewError && (
                      <p className="text-sm" style={{ color: '#b91c1c', margin: '0 0 8px', lineHeight: 1.45 }}>
                        {verifyPreviewError}
                      </p>
                    )}
                    {verifyPreviewPublicUrl && isLikelyImageMime(verifyPreviewMime, verifyPreviewFileNameHint) && (
                      <img
                        src={verifyPreviewPublicUrl}
                        alt="Uploaded prescription"
                        style={{
                          width: '100%',
                          maxHeight: 'min(60vh, 520px)',
                          objectFit: 'contain',
                          borderRadius: 6,
                          background: '#fff',
                          display: 'block',
                        }}
                      />
                    )}
                    {!verifyPreviewPublicUrl && verifyPreviewUrl && verifyPreviewMime?.startsWith('image/') && (
                      <img
                        src={verifyPreviewUrl}
                        alt="Uploaded prescription"
                        style={{
                          width: '100%',
                          maxHeight: 'min(60vh, 520px)',
                          objectFit: 'contain',
                          borderRadius: 6,
                          background: '#fff',
                          display: 'block',
                        }}
                      />
                    )}
                    {verifyPreviewPublicUrl && isLikelyPdfMime(verifyPreviewMime, verifyPreviewFileNameHint) && (
                      <embed
                        src={verifyPreviewPublicUrl}
                        type="application/pdf"
                        title="Uploaded prescription"
                        style={{
                          width: '100%',
                          height: 'min(60vh, 520px)',
                          borderRadius: 6,
                          background: '#fff',
                          display: 'block',
                        }}
                      />
                    )}
                    {!verifyPreviewPublicUrl && verifyPreviewUrl && verifyPreviewMime?.includes('pdf') && (
                      <embed
                        src={verifyPreviewUrl}
                        type="application/pdf"
                        title="Uploaded prescription"
                        style={{
                          width: '100%',
                          height: 'min(60vh, 520px)',
                          borderRadius: 6,
                          background: '#fff',
                          display: 'block',
                        }}
                      />
                    )}
                    {!verifyPreviewLoading &&
                      !verifyPreviewError &&
                      (verifyPreviewPublicUrl || verifyPreviewUrl) &&
                      !isLikelyImageMime(verifyPreviewMime, verifyPreviewFileNameHint) &&
                      !isLikelyPdfMime(verifyPreviewMime, verifyPreviewFileNameHint) && (
                        <p className="text-sm" style={{ color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                          Inline preview is not available for this file type. Use &quot;View (new tab)&quot; to open the
                          file.
                        </p>
                      )}
                  </div>
                </aside>
                <div style={{ flex: '2 1 380px', minWidth: 0 }}>
              <p className="text-sm" style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.5 }}>
                OCR suggested rows below — edit each line, add or remove rows, then save. Lab and pharmacy secure
                preview will use this structured data.
              </p>

              {docOcrPreview && (
                <details style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  <summary className="text-sm" style={{ cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                    Raw OCR text (reference)
                  </summary>
                  <pre
                    className="text-xs"
                    style={{
                      margin: '12px 0 0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 180,
                      overflow: 'auto',
                      color: '#64748b',
                    }}
                  >
                    {docOcrPreview}
                  </pre>
                </details>
              )}

              <section style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 className="text-sm" style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                    Medicines
                  </h3>
                  <Button type="button" variant="secondary" onClick={addVerifyMedicineRow}>
                    + Add row
                  </Button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>Tablet / medicine</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 120 }}>Dosage</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 90 }}>Qty</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>Notes</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 72 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {verifyMedicines.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-med-name-${row.id}`}
                              label=" "
                              value={row.medicineName}
                              onChange={(e) =>
                                setVerifyMedicines((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id ? { ...r, medicineName: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="e.g. Paracetamol 500mg"
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-med-dose-${row.id}`}
                              label=" "
                              value={row.dosage}
                              onChange={(e) =>
                                setVerifyMedicines((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, dosage: e.target.value } : r))
                                )
                              }
                              placeholder="1-0-1"
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-med-qty-${row.id}`}
                              label=" "
                              value={row.quantity}
                              onChange={(e) =>
                                setVerifyMedicines((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r))
                                )
                              }
                              placeholder="10"
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-med-notes-${row.id}`}
                              label=" "
                              value={row.notes}
                              onChange={(e) =>
                                setVerifyMedicines((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, notes: e.target.value } : r))
                                )
                              }
                              placeholder="After food"
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <Button type="button" variant="secondary" onClick={() => removeVerifyMedicineRow(row.id)}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 className="text-sm" style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                    Lab tests
                  </h3>
                  <Button type="button" variant="secondary" onClick={addVerifyTestRow}>
                    + Add row
                  </Button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>Test name</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>Notes</th>
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 72 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {verifyTests.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-test-name-${row.id}`}
                              label=" "
                              value={row.testName}
                              onChange={(e) =>
                                setVerifyTests((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, testName: e.target.value } : r))
                                )
                              }
                              placeholder="e.g. CBC, LFT"
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <TextField
                              id={`verify-test-notes-${row.id}`}
                              label=" "
                              value={row.notes}
                              onChange={(e) =>
                                setVerifyTests((rows) =>
                                  rows.map((r) => (r.id === row.id ? { ...r, notes: e.target.value } : r))
                                )
                              }
                              placeholder="Fasting, etc."
                            />
                          </td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <Button type="button" variant="secondary" onClick={() => removeVerifyTestRow(row.id)}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={{ marginBottom: 8 }}>
                <h3 className="text-sm" style={{ margin: '0 0 10px', fontWeight: 700, color: '#0f172a' }}>
                  Extra notes
                </h3>
                <label htmlFor="verify-clinical-notes" className="text-sm" style={{ display: 'block', marginBottom: 6, color: '#475569' }}>
                  Clinical notes
                </label>
                <textarea
                  id="verify-clinical-notes"
                  value={verifyClinicalNotes}
                  onChange={(e) => setVerifyClinicalNotes(e.target.value)}
                  placeholder="Diagnosis context, follow-up, etc."
                  rows={4}
                  className="text-sm"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: 88,
                  }}
                />
                <label
                  htmlFor="verify-important-notes"
                  className="text-sm"
                  style={{ display: 'block', margin: '14px 0 6px', color: '#475569' }}
                >
                  Important / allergy / cautions
                </label>
                <textarea
                  id="verify-important-notes"
                  value={verifyImportantNotes}
                  onChange={(e) => setVerifyImportantNotes(e.target.value)}
                  placeholder="Allergies, contraindications…"
                  rows={3}
                  className="text-sm"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: 72,
                  }}
                />
              </section>
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                flexShrink: 0,
                background: '#f8fafc',
              }}
            >
              <Button
                type="button"
                variant="secondary"
                disabled={docVerifyLoading}
                onClick={() => {
                  setVerifyDocMeta(null)
                  setVerifyModalOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button type="button" disabled={docVerifyLoading} onClick={() => void handleVerifyModalSave()}>
                {docVerifyLoading ? 'Saving…' : 'Save structured data & release'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
