import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  publicAppointmentService,
  type ConsultantOption,
  type DoctorAppointmentQuotaSnapshot,
  type FamilyMemberSummary,
  type FamilyRelation,
} from '../services/api'
import { patientStorage } from '../utils/patientStorage'
import { completedAgeYears } from '../utils/age'
import { DnaLoader } from '../components/ui/DnaLoader'

type Mode = 'none' | 'family'
type Step = 'details' | 'payment' | 'confirm'
type PaymentMode = 'online_now' | 'cash_at_clinic'

const CONSULTATION_TYPES = ['New Consultation', 'Review Appointment']
const GENDERS = ['MALE', 'FEMALE', 'OTHER']
const RELATIONS: Array<{ value: FamilyRelation; label: string }> = [
  { value: 'SELF', label: 'Self' },
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'SON', label: 'Son' },
  { value: 'DAUGHTER', label: 'Daughter' },
  { value: 'FATHER', label: 'Father' },
  { value: 'MOTHER', label: 'Mother' },
  { value: 'BROTHER', label: 'Brother' },
  { value: 'SISTER', label: 'Sister' },
  { value: 'OTHER', label: 'Other' },
]
const TIME_SLOTS = [
  '10:00 - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 - 1:00 PM',
  '1:00 - 2:00 PM',
  '2:00 - 3:00 PM',
]

const MSG_SELF_MIN_AGE =
  'For Self, age must be 18 years or above. Please enter a valid date of birth.'
const MSG_MINOR_FAMILY_DISCLAIMER =
  'Disclaimer: The date of birth shows age below 18 years. Online booking on this portal is for patients aged 18 years or above. For minors, a parent or guardian should manage this profile.'

/** Check if coordinates are likely invalid (e.g. DevTools override 0,0) */
function isInvalidCoords(lat: number, lng: number): boolean {
  return (lat === 0 && lng === 0) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
}

/** Distance in km between two lat/lng points (Haversine) */
function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function isOnlineFull(snap: DoctorAppointmentQuotaSnapshot | null): boolean {
  if (!snap) return false
  if (snap.online.limit == null) return false
  return snap.online.remaining === 0
}

export const BookAppointment = () => {
  const navigate = useNavigate()
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [mode, setMode] = useState<Mode>('none')
  const [step, setStep] = useState<Step>('details')

  const [consultants, setConsultants] = useState<ConsultantOption[]>([])
  const [loadingConsultants, setLoadingConsultants] = useState(false)

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null)
  const [locationFetchedAt, setLocationFetchedAt] = useState<Date | null>(null)

  // Family booking state (recommended flow)
  const [familyCountryCode, setFamilyCountryCode] = useState('+91')
  const [familyMobile, setFamilyMobile] = useState('')
  const [familyAccountId, setFamilyAccountId] = useState<string | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberSummary[]>([])
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string>('')

  const [familyConsultantId, setFamilyConsultantId] = useState('')
  const [familyConsultationType, setFamilyConsultationType] = useState(CONSULTATION_TYPES[0])
  const [familyOpdNo, setFamilyOpdNo] = useState('')
  const [familyPatientName, setFamilyPatientName] = useState('')
  const [familyGender, setFamilyGender] = useState<string>('')
  const [familyAddress, setFamilyAddress] = useState('')

  const [addingMember, setAddingMember] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [newMemberFullName, setNewMemberFullName] = useState('')
  const [newMemberRelation, setNewMemberRelation] = useState<FamilyRelation>('SELF')
  const [newMemberGender, setNewMemberGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('')
  const [newMemberDob, setNewMemberDob] = useState('')
  const [newMemberAddress, setNewMemberAddress] = useState('')

  const [appointmentDate, setAppointmentDate] = useState('')
  const [preferredSlot, setPreferredSlot] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | null>(null)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode | null>(null)
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<FamilyMemberSummary | null>(null)
  const [appointmentQuota, setAppointmentQuota] = useState<DoctorAppointmentQuotaSnapshot | null>(null)
  const [appointmentQuotaLoading, setAppointmentQuotaLoading] = useState(false)
  const [dateAvailabilityMap, setDateAvailabilityMap] = useState<Record<string, 'available' | 'full' | 'unknown'>>({})
  const [dateAvailabilityLoading, setDateAvailabilityLoading] = useState(false)
  const [bookingDayNotice, setBookingDayNotice] = useState<string | null>(null)
  const [nextSuggestedDate, setNextSuggestedDate] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const liveShareWatchIdRef = useRef<number | null>(null)
  const lastSentMsRef = useRef<number>(0)
  const familyConsultantRef = useRef<HTMLSelectElement | null>(null)
  const focusFamilyBookingFields = useCallback(() => {
    setTimeout(() => {
      familyConsultantRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      familyConsultantRef.current?.focus()
    }, 80)
  }, [])


  useEffect(() => {
    setLoadingConsultants(true)
    void publicAppointmentService
      .listConsultants()
      .then((list) => {
        setConsultants(list)
        if (list.length > 0) {
          setFamilyConsultantId((prev) => prev || list[0].id)
        }
      })
      .catch(() => {
        setError('Unable to load consultants. Please try again later.')
      })
      .finally(() => {
        setLoadingConsultants(false)
      })
  }, [])

  const fetchUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Location is not supported by your browser.')
      return
    }
    setLocationLoading(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        if (isInvalidCoords(lat, lng)) {
          setLocationError('Location (0,0) is invalid. If Chrome DevTools is open, go to Sensors → Location → select "No override", then click Refresh location.')
          setUserLocation(null)
          setLocationLoading(false)
          return
        }
        setUserLocation({ lat, lng })
        setLocationAccuracyMeters(typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null)
        setLocationFetchedAt(new Date())
        setLocationLoading(false)
      },
      (err) => {
        setLocationError(err.message === 'User denied Geolocation' ? 'Location access denied. Distance will not be shown.' : 'Could not get your location.')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  // Auto-fetch location after user accepts policy, so distance is ready.
  useEffect(() => {
    if (!policyAccepted) return
    if (userLocation) return
    if (locationLoading) return
    if (locationError) return
    fetchUserLocation()
  }, [policyAccepted, userLocation, locationLoading, locationError, fetchUserLocation])

  // Live location sharing for appointment: send updates to backend every ~10 seconds.
  useEffect(() => {
    if (!appointmentId) return
    if (!policyAccepted) return

    if (!navigator.geolocation) {
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        if (isInvalidCoords(lat, lng)) return // skip invalid coords (e.g. DevTools 0,0)
        const nowMs = Date.now()
        // Throttle network calls: at most once per 10s.
        if (nowMs - lastSentMsRef.current < 10_000) return
        lastSentMsRef.current = nowMs

        setUserLocation({ lat, lng })
        setLocationAccuracyMeters(typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null)
        setLocationFetchedAt(new Date())

        try {
          await publicAppointmentService.updateAppointmentLiveLocation({
            appointmentId,
            patientLatitude: lat,
            patientLongitude: lng,
            accuracyMeters: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
          })
        } catch {
          // silent failure
        } finally {
          // no-op
        }
      },
      () => {
        // ignore location errors silently (permission denied / unavailable)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )

    liveShareWatchIdRef.current = watchId
    return () => {
      if (liveShareWatchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(liveShareWatchIdRef.current)
      }
      liveShareWatchIdRef.current = null
    }
  }, [appointmentId, policyAccepted])

  const selectedConsultantId = mode === 'family' ? familyConsultantId : ''
  const selectedConsultant = consultants.find((c) => c.id === selectedConsultantId)
  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const canGoPrevMonth =
    calendarMonth.getFullYear() > todayStart.getFullYear() ||
    (calendarMonth.getFullYear() === todayStart.getFullYear() && calendarMonth.getMonth() > todayStart.getMonth())
  const calendarMonthLabel = calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const firstWeekday = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ key: string; date: Date | null; dateKey: string | null }> = []
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ key: `empty-${i}`, date: null, dateKey: null })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(year, month, day)
      const dateKey = formatDateKey(d)
      cells.push({ key: dateKey, date: d, dateKey })
    }
    return cells
  }, [calendarMonth])
  const hasClinicLocation = selectedConsultant && selectedConsultant.clinicLatitude != null && selectedConsultant.clinicLongitude != null
  const distanceKmValue = userLocation && hasClinicLocation && selectedConsultant
    ? distanceKm(userLocation.lat, userLocation.lng, selectedConsultant.clinicLatitude!, selectedConsultant.clinicLongitude!)
    : null

  const resetState = () => {
    setStep('details')
    setError(null)
    setAppointmentId(null)
    setSelectedPaymentMode(null)
  }

  const selectFamily = () => {
    setMode('family')
    resetState()
  }

  const selectedFamilyMember = useMemo(
    () => familyMembers.find((m) => m.id === selectedFamilyMemberId) ?? null,
    [familyMembers, selectedFamilyMemberId]
  )

  const selectedFamilyPatientId = selectedFamilyMember?.patientId ?? selectedFamilyMember?.patient?.id ?? null

  const applyFamilyMemberToBooking = useCallback((member: FamilyMemberSummary | null) => {
    if (!member) {
      setFamilyPatientName('')
      setFamilyGender('')
      setFamilyAddress('')
      return
    }
    const p = member.patient
    setFamilyPatientName(
      (p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : member.fullName) || ''
    )
    setFamilyGender(p?.gender ?? member.gender ?? '')
    setFamilyAddress(p?.address ?? '')
  }, [])

  const handleSelectFamilyMember = useCallback((memberId: string, sourceMembers?: FamilyMemberSummary[]) => {
    setSelectedFamilyMemberId(memberId)
    const members = sourceMembers ?? familyMembers
    const member = members.find((m) => m.id === memberId) ?? null
    applyFamilyMemberToBooking(member)
  }, [familyMembers, applyFamilyMemberToBooking])

  const handleFamilyLogin = async () => {
    setError(null)
    setFamilyAccountId(null)
    setFamilyMembers([])
    setSelectedFamilyMemberId('')

    const mobile = `${familyCountryCode}${familyMobile.replace(/\D/g, '').trim()}`
    if (mobile.length < 8) {
      setError('Please enter a valid mobile number.')
      return
    }
    try {
      const account = await publicAppointmentService.familyLoginOrCreate(mobile)
      setFamilyAccountId(account.id)
      const list = await publicAppointmentService.listFamilyMembers({ accountId: account.id })
      setFamilyMembers(list.members ?? [])
      if ((list.members ?? []).length === 1) {
        handleSelectFamilyMember(list.members[0].id, list.members ?? [])
        focusFamilyBookingFields()
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to load family members. Please try again.')
    }
  }

  const newMemberDobAge = useMemo(() => {
    if (!newMemberDob) return null
    const d = new Date(newMemberDob)
    if (Number.isNaN(d.getTime())) return null
    return completedAgeYears(d)
  }, [newMemberDob])

  const handleAddFamilyMember = async () => {
    setError(null)
    if (!familyAccountId) {
      setError('Please login with your mobile number first.')
      return
    }
    if (!newMemberFullName.trim()) {
      setError('Please enter member full name.')
      return
    }
    if (newMemberDobAge !== null && newMemberRelation === 'SELF' && newMemberDobAge < 18) {
      setError(MSG_SELF_MIN_AGE)
      return
    }
    try {
      if (editingMemberId) {
        await publicAppointmentService.updateFamilyMember(editingMemberId, {
          fullName: newMemberFullName.trim(),
          relation: newMemberRelation,
          gender: newMemberGender || undefined,
          dateOfBirth: newMemberDob || undefined,
          address: newMemberAddress || undefined,
        })
      } else {
        await publicAppointmentService.addFamilyMember({
          accountId: familyAccountId,
          fullName: newMemberFullName.trim(),
          relation: newMemberRelation,
          gender: newMemberGender || undefined,
          dateOfBirth: newMemberDob || undefined,
          address: newMemberAddress || undefined,
        })
      }
      const list = await publicAppointmentService.listFamilyMembers({ accountId: familyAccountId })
      setFamilyMembers(list.members ?? [])
      if (!editingMemberId) {
        const last = (list.members ?? [])[list.members.length - 1]
        if (last?.id) {
          handleSelectFamilyMember(last.id, list.members ?? [])
          focusFamilyBookingFields()
        }
      }
      setAddingMember(false)
      setEditingMemberId(null)
      setNewMemberFullName('')
      setNewMemberRelation('SELF')
      setNewMemberGender('')
      setNewMemberDob('')
      setNewMemberAddress('')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to add family member. Please try again.')
    }
  }

  const startEditMember = (member: FamilyMemberSummary) => {
    setAddingMember(true)
    setEditingMemberId(member.id)
    setNewMemberFullName(member.fullName)
    setNewMemberRelation(member.relation)
    setNewMemberGender((member.gender as any) || '')
    setNewMemberDob(member.dateOfBirth ?? '')
    setNewMemberAddress(member.patient?.address ?? '')
  }

  const handleDeleteMember = async (memberId: string) => {
    if (!familyAccountId) return
    try {
      await publicAppointmentService.deleteFamilyMember(memberId)
      const list = await publicAppointmentService.listFamilyMembers({ accountId: familyAccountId })
      setFamilyMembers(list.members ?? [])
      if (selectedFamilyMemberId === memberId) {
        setSelectedFamilyMemberId('')
      }
      setDeleteMemberTarget(null)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to delete family member. Please try again.')
    }
  }

  const openDeleteMemberModal = (member: FamilyMemberSummary) => {
    setDeleteMemberTarget(member)
  }

  const closeDeleteMemberModal = () => {
    setDeleteMemberTarget(null)
  }

  const handleViewHistory = async (memberId: string) => {
    setError(null)
    if (!familyAccountId) {
      setError('Please load family first.')
      return
    }
    try {
      const result = await publicAppointmentService.getFamilyMemberProfileToken(
        familyAccountId,
        memberId
      )
      const name = [result.patient.firstName, result.patient.lastName].filter(Boolean).join(' ')
      patientStorage.set(result.token, result.patient.id, name || 'Patient')
      navigate('/patient-profile')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to open full health profile. Please try again.')
    }
  }

  // When member is selected, prefill editable patient details for appointment.
  useEffect(() => {
    if (mode !== 'family') return
    if (!selectedFamilyMember) return
    applyFamilyMemberToBooking(selectedFamilyMember)
  }, [mode, selectedFamilyMember, applyFamilyMemberToBooking])

  useEffect(() => {
    if (mode !== 'family' || !familyConsultantId || !appointmentDate) {
      setAppointmentQuota(null)
      return
    }
    let cancelled = false
    setAppointmentQuotaLoading(true)
    void publicAppointmentService
      .getAppointmentQuota(familyConsultantId, appointmentDate)
      .then((snap) => {
        if (!cancelled) setAppointmentQuota(snap)
      })
      .catch(() => {
        if (!cancelled) setAppointmentQuota(null)
      })
      .finally(() => {
        if (!cancelled) setAppointmentQuotaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, familyConsultantId, appointmentDate])

  useEffect(() => {
    if (mode !== 'family' || !familyConsultantId) {
      setDateAvailabilityMap({})
      setDateAvailabilityLoading(false)
      setBookingDayNotice(null)
      setNextSuggestedDate(null)
      return
    }
    let cancelled = false
    const load = async () => {
      setDateAvailabilityLoading(true)
      const year = calendarMonth.getFullYear()
      const month = calendarMonth.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const entries = await Promise.all(
        Array.from({ length: daysInMonth }).map(async (_, i) => {
          const d = new Date(year, month, i + 1)
          const key = formatDateKey(d)
          if (startOfDay(d) < todayStart) {
            return [key, 'full'] as const
          }
          try {
            const snap = await publicAppointmentService.getAppointmentQuota(familyConsultantId, key)
            return [key, isOnlineFull(snap) ? 'full' : 'available'] as const
          } catch {
            return [key, 'unknown'] as const
          }
        })
      )
      if (!cancelled) {
        setDateAvailabilityMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
        setDateAvailabilityLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [mode, familyConsultantId, calendarMonth, todayStart])

  const handleSuggestNextAvailableDate = async () => {
    if (!familyConsultantId) return
    const startFrom = appointmentDate ? new Date(appointmentDate) : new Date()
    for (let i = 0; i < 45; i += 1) {
      const date = addDays(startFrom, i + 1)
      const key = formatDateKey(date)
      try {
        const snap = await publicAppointmentService.getAppointmentQuota(familyConsultantId, key)
        if (!isOnlineFull(snap)) {
          setAppointmentDate(key)
          setAppointmentQuota(snap)
          setNextSuggestedDate(key)
          setBookingDayNotice(`Today is fully booked. Next available date selected: ${key}.`)
          return
        }
      } catch {
        // ignore and continue
      }
    }
    setBookingDayNotice('Booking is currently full for upcoming days. Please try again later or contact clinic.')
  }

  const goToPayment = () => {
    setError(null)
    if (!appointmentDate) {
      setError('Please select appointment date.')
      return
    }
    if (mode !== 'family') {
      setError('Please select New Patient.')
      return
    }
    if (!familyAccountId) {
      setError('Please login with your mobile number first.')
      return
    }
    if (!selectedFamilyMemberId || !selectedFamilyPatientId) {
      setError('Please select a family member.')
      return
    }
    if (!familyConsultantId) {
      setError('Please select a consultant.')
      return
    }
    if (!familyPatientName || !familyGender) {
      setError('Please fill patient name and gender.')
      return
    }
    if (
      appointmentQuota &&
      appointmentQuota.online.limit != null &&
      appointmentQuota.online.remaining === 0
    ) {
      setBookingDayNotice('Today booking is closed. Choose next available date.')
      return
    }
    setStep('payment')
  }

  const handleConfirmAppointment = async (paymentMode: PaymentMode) => {
    setSubmitting(true)
    setError(null)
    try {
      let res: { appointmentId: string; patientId: string }
      if (mode === 'family') {
        res = await publicAppointmentService.bookFamilyAppointment({
          patientId: selectedFamilyPatientId!,
          consultantId: familyConsultantId,
          appointmentDate,
          preferredSlot: preferredSlot || undefined,
          consultationType: familyConsultationType || undefined,
          opdNumber: familyOpdNo || undefined,
          patientName: familyPatientName || undefined,
          gender: familyGender || undefined,
          address: familyAddress || undefined,
          ...(userLocation && { patientLatitude: userLocation.lat, patientLongitude: userLocation.lng }),
        })
      } else {
        setError('Please select New Patient.')
        return
      }
      setAppointmentId(res.appointmentId)
      setSelectedPaymentMode(paymentMode)
      setStep('confirm')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to confirm appointment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const renderConsent = () => (
    <div className="appt-card" style={{ maxWidth: 520 }}>
      <h2 className="public-section-title" style={{ marginBottom: 12 }}>Privacy &amp; Terms</h2>
      <p className="public-section-text" style={{ marginBottom: 16 }}>
        To book an appointment, we need you to accept our Privacy Policy and Terms &amp; Conditions.
        We may use your <strong>location</strong> to (1) show you how far you are from the doctor&apos;s clinic, and (2) share your location at the time of booking with your doctor so they can see where you were when you booked.
      </p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
        <input
          type="checkbox"
          checked={policyAccepted}
          onChange={(e) => setPolicyAccepted(e.target.checked)}
          style={{ marginTop: 4 }}
        />
        <span className="public-section-text" style={{ margin: 0 }}>
          I accept the <strong>Privacy Policy</strong> and <strong>Terms &amp; Conditions</strong>, and I allow the use of my location to see distance from the clinic and to share my location with the doctor at booking.
        </span>
      </label>
      <button
        type="button"
        className="public-cta"
        disabled={!policyAccepted}
        onClick={() => setPolicyAccepted(true)}
      >
        Continue to Book Appointment
      </button>
    </div>
  )

  const renderDistanceBlock = () => {
    if (!selectedConsultant) return null
    if (!hasClinicLocation) {
      return (
        <p className="appt-timing-msg" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
          Distance is not available for this consultant (clinic location not set).
        </p>
      )
    }
    if (locationLoading) {
      return <p className="appt-timing-msg" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>Getting your location…</p>
    }
    if (locationError) {
      return (
        <div style={{ marginTop: 8 }}>
          <p className="appt-timing-msg" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
            {locationError}
          </p>
          <button type="button" className="public-cta" style={{ marginTop: 8, padding: '6px 14px', fontSize: '0.9rem' }} onClick={fetchUserLocation}>
            Try again
          </button>
        </div>
      )
    }
    if (distanceKmValue != null) {
      return (
        <div className="appt-timing-msg" style={{ marginTop: 12 }}>
          <div>
            You are approximately <strong>{distanceKmValue.toFixed(1)} km</strong> from <strong>{selectedConsultant.name}</strong>&apos;s clinic.
          </div>
          {locationAccuracyMeters != null && (
            <div style={{ marginTop: 6, fontSize: '0.9rem', color: '#475569' }}>
              Location accuracy: <strong>±{Math.round(locationAccuracyMeters)} m</strong>
              {locationFetchedAt && (
                <span> · Updated {locationFetchedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          )}
          {userLocation && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a
                className="public-cta"
                style={{ padding: '6px 14px', fontSize: '0.9rem', background: '#0369a1' }}
                href={`https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View my location on map
              </a>
              <a
                className="public-cta"
                style={{ padding: '6px 14px', fontSize: '0.9rem', background: '#1e40af' }}
                href={`https://www.google.com/maps?q=${selectedConsultant.clinicLatitude},${selectedConsultant.clinicLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View clinic on map
              </a>
              <button
                type="button"
                className="public-cta"
                style={{ padding: '6px 14px', fontSize: '0.9rem', background: '#334155' }}
                onClick={fetchUserLocation}
              >
                Refresh location
              </button>
            </div>
          )}
          {selectedConsultant.clinicAddress && (
            <span style={{ display: 'block', marginTop: 10, fontSize: '0.9rem' }}>{selectedConsultant.clinicAddress}</span>
          )}
        </div>
      )
    }
    return (
      <div style={{ marginTop: 8 }}>
        <button type="button" className="public-cta" style={{ padding: '6px 14px', fontSize: '0.9rem' }} onClick={fetchUserLocation}>
          Use my location – show distance from clinic
        </button>
      </div>
    )
  }

  const renderModeChooser = () => (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
      <button type="button" className="public-cta" onClick={selectFamily}>
        New Patient
      </button>
    </div>
  )

  const renderFamilyForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 6 }}>New Patient</h2>
      <p className="public-section-text" style={{ marginBottom: 16 }}>
        Enter your <strong>primary mobile number</strong>, then select a family member (or add a new one).
      </p>

      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Primary Mobile No *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '125px 1fr', gap: 8 }}>
            <select value={familyCountryCode} onChange={(e) => setFamilyCountryCode(e.target.value)}>
              <option value="+91">IN (+91)</option>
              <option value="+1">US/CA (+1)</option>
              <option value="+44">UK (+44)</option>
              <option value="+61">AU (+61)</option>
              <option value="+971">UAE (+971)</option>
            </select>
            <input
              type="tel"
              value={familyMobile}
              onChange={(e) => setFamilyMobile(e.target.value.replace(/\D/g, '').slice(0, 14))}
              placeholder="Enter mobile number"
            />
          </div>
        </div>
        <div className="appt-field" style={{ justifyContent: 'flex-end' }}>
          <label>&nbsp;</label>
          <button type="button" className="public-cta" onClick={handleFamilyLogin}>
            Load Family
          </button>
        </div>
      </div>

      {familyAccountId && (
        <>
          <div className="appt-field">
            <label>Select Family Member *</label>
            <select
              value={selectedFamilyMemberId}
              onChange={(e) => handleSelectFamilyMember(e.target.value)}
            >
              <option value="">Select member</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.relation})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="public-cta" style={{ padding: '8px 16px', fontSize: '0.95rem' }} onClick={() => setAddingMember((v) => !v)}>
              {addingMember ? 'Close Member Form' : '+ Add Family Member'}
            </button>
            <p className="public-section-text" style={{ margin: 0, alignSelf: 'center' }}>
              Members: <strong>{familyMembers.length}</strong>
            </p>
          </div>

          {familyMembers.length > 0 && (
            <div className="appt-summary" style={{ marginBottom: 16 }}>
              <p className="public-section-text" style={{ margin: '0 0 8px' }}>
                Your family members:
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: familyMembers.length > 5 ? 320 : undefined,
                  overflowY: familyMembers.length > 5 ? 'auto' : undefined,
                  paddingRight: familyMembers.length > 5 ? 4 : undefined,
                }}
              >
                {familyMembers.map((m) => (
                  <li key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                        {m.fullName} <span style={{ fontWeight: 400, color: '#64748b' }}>({m.relation})</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {m.patient?.gender && <span>{m.patient.gender}</span>}
                        {m.patient?.gender && m.patient?.address && <span> · </span>}
                        {m.patient?.address && <span>{m.patient.address}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="public-cta"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => {
                          handleSelectFamilyMember(m.id, familyMembers)
                          setError(null)
                          focusFamilyBookingFields()
                        }}
                      >
                        Use for booking
                      </button>
                      <button
                        type="button"
                        className="public-cta"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#0369a1' }}
                        onClick={() => handleViewHistory(m.id)}
                      >
                        View records
                      </button>
                      <button
                        type="button"
                        className="public-cta"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#4b5563' }}
                        onClick={() => startEditMember(m)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="public-cta"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#b91c1c' }}
                        onClick={() => openDeleteMemberModal(m)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {addingMember && (
            <div className="appt-card" style={{ background: '#f8fafc', borderColor: '#e2e8f0', boxShadow: 'none' }}>
              <h3 className="public-section-title" style={{ marginBottom: 12, fontSize: '1.1rem' }}>
                {editingMemberId ? 'Edit Family Member' : 'Add Family Member'}
              </h3>
              <div className="appt-field">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={newMemberFullName}
                  onChange={(e) => setNewMemberFullName(e.target.value)}
                  placeholder="e.g. Rohan Sharma"
                />
              </div>
              <div className="appt-two-cols">
                <div className="appt-field">
                  <label>Relation *</label>
                  <select value={newMemberRelation} onChange={(e) => setNewMemberRelation(e.target.value as FamilyRelation)}>
                    {RELATIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="appt-field">
                  <label>Gender</label>
                  <select value={newMemberGender} onChange={(e) => setNewMemberGender(e.target.value as any)}>
                    <option value="">Select Gender</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="appt-two-cols">
                <div className="appt-field">
                  <label>Date of Birth</label>
                  <input type="date" value={newMemberDob} onChange={(e) => setNewMemberDob(e.target.value)} />
                  <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                    Self: age must be <strong>18 years or above</strong>. For other relations, minors may be added; see disclaimer below if age is under 18.
                  </p>
                  {newMemberDobAge !== null && newMemberDobAge < 18 && newMemberRelation !== 'SELF' && (
                    <p
                      role="note"
                      style={{
                        margin: '10px 0 0',
                        padding: '10px 12px',
                        fontSize: '0.82rem',
                        lineHeight: 1.45,
                        color: '#92400e',
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: 8,
                      }}
                    >
                      {MSG_MINOR_FAMILY_DISCLAIMER}
                    </p>
                  )}
                  {newMemberDobAge !== null && newMemberDobAge < 18 && newMemberRelation === 'SELF' && (
                    <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#b91c1c', lineHeight: 1.45 }}>
                      {MSG_SELF_MIN_AGE}
                    </p>
                  )}
                </div>
                <div className="appt-field">
                  <label>Address</label>
                  <input type="text" value={newMemberAddress} onChange={(e) => setNewMemberAddress(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  className="public-cta"
                  onClick={handleAddFamilyMember}
                  disabled={
                    newMemberDobAge !== null &&
                    newMemberRelation === 'SELF' &&
                    newMemberDobAge < 18
                  }
                >
                  Save Member
                </button>
                <button
                  type="button"
                  className="public-cta"
                  style={{ background: '#334155' }}
                  onClick={() => {
                    setAddingMember(false)
                    setEditingMemberId(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="appt-field">
            <label>Consultation Type</label>
            <select value={familyConsultationType} onChange={(e) => setFamilyConsultationType(e.target.value)}>
              {CONSULTATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="appt-two-cols">
            <div className="appt-field">
              <label>Name of Consultant *</label>
              <select
                ref={familyConsultantRef}
                value={familyConsultantId}
                onChange={(e) => setFamilyConsultantId(e.target.value)}
                disabled={loadingConsultants}
              >
                {consultants.length === 0 && <option value="">Loading…</option>}
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {loadingConsultants && <DnaLoader label="Loading consultants..." size={38} />}
            </div>
            <div className="appt-field">
              <label>Patient OPD No (optional)</label>
              <input
                type="text"
                value={familyOpdNo}
                onChange={(e) => setFamilyOpdNo(e.target.value)}
              />
            </div>
          </div>

          {renderDistanceBlock()}

          <div className="appt-two-cols">
            <div className="appt-field">
              <label>Patient Name *</label>
              <input
                type="text"
                value={familyPatientName}
                onChange={(e) => setFamilyPatientName(e.target.value)}
                disabled={!selectedFamilyMemberId}
              />
            </div>
            <div className="appt-field">
              <label>Gender *</label>
              <select value={familyGender} onChange={(e) => setFamilyGender(e.target.value)} disabled={!selectedFamilyMemberId}>
                <option value="">Select Gender</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="appt-field">
            <label>Address</label>
            <input
              type="text"
              value={familyAddress}
              onChange={(e) => setFamilyAddress(e.target.value)}
              disabled={!selectedFamilyMemberId}
            />
          </div>

          <div className="appt-two-cols">
            <div className="appt-field">
              <label>Appointment Date *</label>
              <div className="appt-calendar">
                <div className="appt-calendar-head">
                  <button
                    type="button"
                    className="appt-calendar-nav"
                    disabled={!canGoPrevMonth}
                    onClick={() => {
                      if (!canGoPrevMonth) return
                      setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                    }}
                  >
                    Prev
                  </button>
                  <strong>{calendarMonthLabel}</strong>
                  <button
                    type="button"
                    className="appt-calendar-nav"
                    onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  >
                    Next
                  </button>
                </div>
                <div className="appt-calendar-weekdays">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="appt-calendar-grid">
                  {calendarCells.map((cell) => {
                    if (!cell.date || !cell.dateKey) {
                      return <span key={cell.key} className="appt-calendar-empty" />
                    }
                    const dayStart = startOfDay(cell.date)
                    const isPast = dayStart < todayStart
                    const status = dateAvailabilityMap[cell.dateKey] ?? 'unknown'
                    const isSelected = appointmentDate === cell.dateKey
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        disabled={isPast}
                        className={`appt-calendar-day ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setAppointmentDate(cell.dateKey!)
                          if (status === 'full') {
                            setBookingDayNotice('Selected day is full. Please choose another date.')
                          } else {
                            setBookingDayNotice(null)
                          }
                        }}
                      >
                        <span>{cell.date.getDate()}</span>
                        <i className={`dot ${status}`} />
                      </button>
                    )
                  })}
                </div>
                <div className="appt-calendar-legend">
                  <span><i className="dot available" /> Available</span>
                  <span><i className="dot full" /> Full</span>
                  <span><i className="dot unknown" /> Checking</span>
                </div>
              </div>
              {dateAvailabilityLoading && (
                <DnaLoader label="Checking month availability..." size={38} />
              )}
              {appointmentDate && (
                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#334155' }}>
                  Selected date: <strong>{appointmentDate}</strong>
                </p>
              )}
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

          {familyConsultantId && appointmentDate && (
            <div
              className="public-section-text"
              style={{
                margin: '12px 0 0',
                fontSize: '0.88rem',
                lineHeight: 1.45,
                color: '#334155',
                padding: '10px 12px',
                background: '#f1f5f9',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              {appointmentQuotaLoading ? (
                <DnaLoader label="Checking slot availability..." size={38} />
              ) : appointmentQuota ? (
                <>
                  <strong>Slots (IST, this date)</strong>
                  <br />
                  Online / portal:{' '}
                  {appointmentQuota.online.limit == null ? (
                    `${appointmentQuota.online.booked} booked (no limit set)`
                  ) : (
                    <>
                      {appointmentQuota.online.remaining} left of {appointmentQuota.online.limit}{' '}
                      ({appointmentQuota.online.booked} booked)
                    </>
                  )}
                  <br />
                  Walk-in (clinic):{' '}
                  {appointmentQuota.walkIn.limit == null ? (
                    `${appointmentQuota.walkIn.booked} registered (no limit set)`
                  ) : (
                    <>
                      {appointmentQuota.walkIn.remaining} left of {appointmentQuota.walkIn.limit}{' '}
                      ({appointmentQuota.walkIn.booked} used)
                    </>
                  )}
                </>
              ) : (
                <>Could not load slot counts. You can still try to continue.</>
              )}
            </div>
          )}

          {appointmentQuota && isOnlineFull(appointmentQuota) && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e' }}>
                Today booking is closed. You can choose next day appointment.
              </p>
              <button
                type="button"
                className="public-cta"
                style={{ marginTop: 8, padding: '7px 12px', fontSize: '0.82rem', background: '#0369a1' }}
                onClick={() => void handleSuggestNextAvailableDate()}
              >
                Find next available date
              </button>
            </div>
          )}

          {bookingDayNotice && (
            <p style={{ margin: '10px 0 0', fontSize: '0.84rem', color: '#0f766e' }}>
              {bookingDayNotice}
              {nextSuggestedDate ? ` (Selected: ${nextSuggestedDate})` : ''}
            </p>
          )}

          <p className="appt-timing-msg">
            You may come anytime between <strong>10 AM and 3 PM</strong>.
          </p>

          <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
            Next
          </button>

        </>
      )}
    </div>
  )

  const renderPayment = () => (
    <div className="appt-card" style={{ textAlign: 'center' }}>
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>Payment</h2>
      <p className="public-section-text" style={{ marginBottom: 16 }}>
        Consultation fee: <strong>₹500</strong>
      </p>
      <p className="public-section-text" style={{ marginBottom: 24 }}>
        Choose your payment preference. You can pay now during online booking, or pay cash at the clinic on appointment day.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="public-cta"
          onClick={() => void handleConfirmAppointment('online_now')}
          disabled={submitting}
        >
          {submitting ? 'Processing…' : 'Pay ₹500 Online & Confirm'}
        </button>
        <button
          type="button"
          className="public-cta"
          onClick={() => void handleConfirmAppointment('cash_at_clinic')}
          disabled={submitting}
          style={{ background: '#334155' }}
        >
          {submitting ? 'Processing…' : 'Pay Cash at Clinic & Confirm'}
        </button>
      </div>
    </div>
  )

  const getConfirmName = () => familyPatientName || selectedFamilyMember?.fullName || '—'
  const getConfirmMobile = () => familyMobile || '—'
  const getConfirmEmail = () => '—'

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
      <div className="public-section-text" style={{ marginBottom: 16, textAlign: 'left', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
        <p style={{ margin: '0 0 6px', fontSize: '0.95rem', color: '#475569' }}><strong>Name:</strong> {getConfirmName()}</p>
        <p style={{ margin: '0 0 6px', fontSize: '0.95rem', color: '#475569' }}><strong>Mobile:</strong> {getConfirmMobile()}</p>
        <p style={{ margin: '0 0 6px', fontSize: '0.95rem', color: '#475569' }}><strong>Email:</strong> {getConfirmEmail()}</p>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569' }}>
          <strong>Payment:</strong> {selectedPaymentMode === 'cash_at_clinic' ? 'Cash at clinic (on appointment day)' : 'Paid online during booking'}
        </p>
      </div>
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
        {!policyAccepted && renderConsent()}
        {policyAccepted && (
          <>
            <p className="public-section-text" style={{ marginBottom: 20 }}>
              Please choose how you want to book.
            </p>
            {step === 'details' && mode === 'none' && renderModeChooser()}
          </>
        )}
        {error && (
          <p style={{ color: '#b91c1c', marginBottom: 16, fontSize: '0.9rem' }}>
            {error}
          </p>
        )}
        {policyAccepted && step === 'details' && mode === 'family' && renderFamilyForm()}
        {policyAccepted && step === 'payment' && renderPayment()}
        {policyAccepted && step === 'confirm' && renderConfirm()}
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
      {deleteMemberTarget && (
        <div className="appt-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-member-title">
          <div className="appt-modal-card">
            <h3 id="delete-member-title">Delete family member?</h3>
            <p>
              Are you sure you want to delete <strong>{deleteMemberTarget.fullName}</strong> from this family list?
            </p>
            <div className="appt-modal-actions">
              <button type="button" className="appt-modal-btn cancel" onClick={closeDeleteMemberModal}>
                Cancel
              </button>
              <button
                type="button"
                className="appt-modal-btn delete"
                onClick={() => {
                  void handleDeleteMember(deleteMemberTarget.id)
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
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
        .appt-calendar { border: 1px solid #dbeafe; border-radius: 12px; padding: 10px; background: #f8fbff; }
        .appt-calendar-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .appt-calendar-nav { border: 1px solid #bfdbfe; background: #ffffff; color: #1d4ed8; border-radius: 8px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer; }
        .appt-calendar-nav:disabled { opacity: 0.45; cursor: not-allowed; }
        .appt-calendar-weekdays, .appt-calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
        .appt-calendar-weekdays span { text-align: center; font-size: 0.72rem; color: #64748b; }
        .appt-calendar-empty { min-height: 34px; }
        .appt-calendar-day { min-height: 34px; border: 1px solid #dbeafe; background: #ffffff; border-radius: 8px; cursor: pointer; color: #0f172a; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .appt-calendar-day:hover { border-color: #60a5fa; }
        .appt-calendar-day.selected { border-color: #1d4ed8; background: #eff6ff; font-weight: 700; }
        .appt-calendar-day:disabled { background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0; cursor: not-allowed; }
        .appt-calendar-legend { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.74rem; color: #475569; }
        .dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; vertical-align: middle; }
        .dot.available { background: #16a34a; }
        .dot.full { background: #dc2626; }
        .dot.unknown { background: #94a3b8; }
        .appt-two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 640px) { .appt-two-cols { grid-template-columns: 1fr; } }
        .appt-readonly-value { padding: 8px 10px; border-radius: 8px; background: #f1f5f9; font-size: 0.95rem; color: #111827; }
        .appt-timing-msg { font-size: 0.9rem; color: #475569; margin: 12px 0 0; padding: 10px 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
        .appt-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.52); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px; }
        .appt-modal-card { width: min(460px, 100%); background: #fff; border-radius: 16px; border: 1px solid #dbeafe; box-shadow: 0 22px 45px rgba(15, 23, 42, 0.25); padding: 18px; }
        .appt-modal-card h3 { margin: 0 0 8px; font-size: 1.1rem; color: #0f172a; }
        .appt-modal-card p { margin: 0; color: #475569; line-height: 1.5; font-size: 0.95rem; }
        .appt-modal-actions { margin-top: 16px; display: flex; justify-content: flex-end; gap: 10px; }
        .appt-modal-btn { border: none; border-radius: 10px; padding: 9px 14px; font-weight: 600; cursor: pointer; }
        .appt-modal-btn.cancel { background: #e2e8f0; color: #0f172a; }
        .appt-modal-btn.cancel:hover { background: #cbd5e1; }
        .appt-modal-btn.delete { background: #b91c1c; color: #fff; }
        .appt-modal-btn.delete:hover { background: #991b1b; }
        .public-footer { margin-top: auto; background: #0f172a; color: #94a3b8; padding: 28px 20px; }
        .public-footer-inner { max-width: 1100px; margin: 0 auto; text-align: center; }
        .public-footer-copy { font-size: 0.875rem; margin: 0; color: #64748b; }
      `}</style>
    </div>
  )
}

