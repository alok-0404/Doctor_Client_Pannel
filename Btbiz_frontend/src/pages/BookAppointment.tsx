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
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { PublicLayout } from '../components/layout/PublicLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import { TextField } from '../components/ui/TextField'

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
  const [policyConsentChecked, setPolicyConsentChecked] = useState(false)
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
  const [profileSessionReady, setProfileSessionReady] = useState<boolean>(() => !!patientStorage.getToken())
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
      patientStorage.set(result.token, result.patient.id, name || 'Patient', 'booking')
      navigate('/patient-profile')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to open full health profile. Please try again.')
    }
  }

  const syncPatientPortalSessionForMember = useCallback(
    async (memberId: string): Promise<boolean> => {
      if (!familyAccountId) return false
      try {
        const result = await publicAppointmentService.getFamilyMemberProfileToken(
          familyAccountId,
          memberId
        )
        const name = [result.patient.firstName, result.patient.lastName].filter(Boolean).join(' ')
        patientStorage.set(result.token, result.patient.id, name || 'Patient', 'booking')
        setProfileSessionReady(true)
        return true
      } catch (err) {
        console.warn('[BookAppointment] Failed to sync patient portal session after booking:', err)
        setProfileSessionReady(!!patientStorage.getToken())
        return false
      }
    },
    [familyAccountId]
  )

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
      if (selectedFamilyMemberId) {
        await syncPatientPortalSessionForMember(selectedFamilyMemberId)
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
    <Card className="book-appointment-panel book-appointment-consent-card" elevated>
      <h2 className="public-section-title book-appointment-consent-title">Privacy &amp; Terms</h2>
      <p className="public-section-text book-appointment-consent-text">
        To book an appointment, we need you to accept our Privacy Policy and Terms &amp; Conditions.
        We may use your <strong>location</strong> to (1) show you how far you are from the doctor&apos;s clinic, and (2) share your location at the time of booking with your doctor so they can see where you were when you booked.
      </p>
      <label className="book-appointment-consent-label">
        <input
          type="checkbox"
          className="book-appointment-consent-checkbox"
          checked={policyConsentChecked}
          onChange={(e) => setPolicyConsentChecked(e.target.checked)}
        />
        <span className="public-section-text book-appointment-consent-label-text">
          I accept the <strong>Privacy Policy</strong> and <strong>Terms &amp; Conditions</strong>, and I allow the use of my location to see distance from the clinic and to share my location with the doctor at booking.
        </span>
      </label>
      <Button
        disabled={!policyConsentChecked}
        onClick={() => setPolicyAccepted(true)}
      >
        Continue to book appointment
      </Button>
    </Card>
  )

  const renderDistanceBlock = () => {
    if (!selectedConsultant) return null
    if (!hasClinicLocation) {
      return (
        <p className="book-appointment-timing-msg book-appointment-distance-msg book-appointment-distance-msg--muted">
          Distance is not available for this consultant (clinic location not set).
        </p>
      )
    }
    if (locationLoading) {
      return <p className="book-appointment-timing-msg book-appointment-distance-msg book-appointment-distance-msg--loading">Getting your location…</p>
    }
    if (locationError) {
      return (
        <div className="book-appointment-distance-wrap">
          <p className="book-appointment-timing-msg book-appointment-distance-msg book-appointment-distance-msg--error">
            {locationError}
          </p>
          <Button size="sm" className="book-appointment-distance-retry" onClick={fetchUserLocation}>
            Try again
          </Button>
        </div>
      )
    }
    if (distanceKmValue != null) {
      return (
        <div className="book-appointment-timing-msg book-appointment-distance-msg">
          <div>
            You are approximately <strong>{distanceKmValue.toFixed(1)} km</strong> from <strong>{selectedConsultant.name}</strong>&apos;s clinic.
          </div>
          {locationAccuracyMeters != null && (
            <div className="book-appointment-distance-accuracy">
              Location accuracy: <strong>±{Math.round(locationAccuracyMeters)} m</strong>
              {locationFetchedAt && (
                <span> · Updated {locationFetchedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          )}
          {userLocation && (
            <div className="book-appointment-distance-actions">
              <a
                className="ui-button ui-button-secondary ui-button-sm book-appointment-map-link book-appointment-map-link--user"
                href={`https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View my location on map
              </a>
              <a
                className="ui-button ui-button-secondary ui-button-sm book-appointment-map-link book-appointment-map-link--clinic"
                href={`https://www.google.com/maps?q=${selectedConsultant.clinicLatitude},${selectedConsultant.clinicLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View clinic on map
              </a>
              <Button
                size="sm"
                variant="secondary"
                onClick={fetchUserLocation}
              >
                Refresh location
              </Button>
            </div>
          )}
          {selectedConsultant.clinicAddress && (
            <span className="book-appointment-distance-address">{selectedConsultant.clinicAddress}</span>
          )}
        </div>
      )
    }
    return (
      <div className="book-appointment-distance-wrap">
        <Button size="sm" onClick={fetchUserLocation}>
          Use my location – show distance from clinic
        </Button>
      </div>
    )
  }

  const renderModeChooser = () => (
    <Card className="book-appointment-panel book-appointment-mode-card" elevated interactive>
      <h2 className="public-section-title book-appointment-panel-title">Choose booking type</h2>
      <p className="public-section-text book-appointment-panel-lead">
        Start with a new patient profile linked to your mobile number.
      </p>
      <div className="book-appointment-mode-chooser">
        <Button onClick={selectFamily}>
          New Patient
        </Button>
      </div>
    </Card>
  )

  const renderFamilyForm = () => (
    <Card className="book-appointment-panel" elevated>
      <h2 className="public-section-title book-appointment-panel-title">New Patient</h2>
      <p className="public-section-text book-appointment-panel-lead">
        Enter your <strong>primary mobile number</strong>, then select a family member (or add a new one).
      </p>

      <div className="book-appointment-form-grid">
        <CountryCodePhoneInput
          id="family-primary-mobile"
          label="Primary Mobile No *"
          countryCode={familyCountryCode}
          onCountryCodeChange={setFamilyCountryCode}
          phoneDigits={familyMobile}
          onPhoneDigitsChange={setFamilyMobile}
        />
        <div className="book-appointment-field-action">
          <Button onClick={handleFamilyLogin}>
            Load Family
          </Button>
        </div>
      </div>

      {familyAccountId && (
        <>
          <div className="book-appointment-select-field">
            <label htmlFor="family-member-select">Select Family Member *</label>
            <select
              id="family-member-select"
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

          <div className="book-appointment-member-toolbar">
            <Button
              variant="secondary"
              className="book-appointment-member-btn book-appointment-member-btn--outline"
              onClick={() => setAddingMember((v) => !v)}
            >
              {addingMember ? 'Close Member Form' : '+ Add Family Member'}
            </Button>
            <p className="public-section-text book-appointment-member-toolbar-text">
              Members: <strong>{familyMembers.length}</strong>
            </p>
          </div>

          {familyMembers.length > 0 && (
            <div className="book-appointment-member-summary">
              <p className="public-section-text book-appointment-member-summary-lead">
                Your family members:
              </p>
              <ul
                className={
                  familyMembers.length > 5
                    ? 'book-appointment-member-list book-appointment-member-list--scroll'
                    : 'book-appointment-member-list'
                }
              >
                {familyMembers.map((m) => (
                  <li key={m.id} className="book-appointment-member-row">
                    <div className="book-appointment-member-meta">
                      <div className="book-appointment-member-name">
                        {m.fullName} <span className="book-appointment-member-relation">({m.relation})</span>
                      </div>
                      <div className="book-appointment-member-details">
                        {m.patient?.gender && <span>{m.patient.gender}</span>}
                        {m.patient?.gender && m.patient?.address && <span> · </span>}
                        {m.patient?.address && <span>{m.patient.address}</span>}
                      </div>
                    </div>
                    <div className="book-appointment-member-actions">
                      <Button
                        size="sm"
                        className="book-appointment-member-btn book-appointment-member-btn--book"
                        onClick={() => {
                          handleSelectFamilyMember(m.id, familyMembers)
                          setError(null)
                          focusFamilyBookingFields()
                        }}
                      >
                        BOOK Appointment
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="book-appointment-member-btn book-appointment-member-btn--history"
                        onClick={() => handleViewHistory(m.id)}
                      >
                        View records
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="book-appointment-member-btn book-appointment-member-btn--edit"
                        onClick={() => startEditMember(m)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        className="book-appointment-member-btn book-appointment-member-btn--delete"
                        onClick={() => openDeleteMemberModal(m)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {addingMember && (
            <Card className="book-appointment-member-form" elevated>
              <h3 className="public-section-title book-appointment-member-form-title">
                {editingMemberId ? 'Edit Family Member' : 'Add Family Member'}
              </h3>
              <TextField
                label="Full Name *"
                id="new-member-full-name"
                name="newMemberFullName"
                type="text"
                value={newMemberFullName}
                onChange={(e) => setNewMemberFullName(e.target.value)}
                placeholder="e.g. Rohan Sharma"
              />
              <div className="book-appointment-form-grid">
                <div className="book-appointment-select-field">
                  <label htmlFor="new-member-relation">Relation *</label>
                  <select
                    id="new-member-relation"
                    name="newMemberRelation"
                    value={newMemberRelation}
                    onChange={(e) => setNewMemberRelation(e.target.value as FamilyRelation)}
                  >
                    {RELATIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="book-appointment-select-field">
                  <label htmlFor="new-member-gender">Gender</label>
                  <select
                    id="new-member-gender"
                    name="newMemberGender"
                    value={newMemberGender}
                    onChange={(e) => setNewMemberGender(e.target.value as any)}
                  >
                    <option value="">Select Gender</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="book-appointment-form-grid">
                <div>
                  <TextField
                    label="Date of Birth"
                    id="new-member-dob"
                    name="newMemberDob"
                    type="date"
                    value={newMemberDob}
                    onChange={(e) => setNewMemberDob(e.target.value)}
                    hint="Self: age must be 18 years or above. For other relations, minors may be added; see disclaimer below if age is under 18."
                    error={
                      newMemberDobAge !== null && newMemberDobAge < 18 && newMemberRelation === 'SELF'
                        ? MSG_SELF_MIN_AGE
                        : undefined
                    }
                  />
                  {newMemberDobAge !== null && newMemberDobAge < 18 && newMemberRelation !== 'SELF' && (
                    <p role="note" className="book-appointment-minor-note">
                      {MSG_MINOR_FAMILY_DISCLAIMER}
                    </p>
                  )}
                </div>
                <TextField
                  label="Address"
                  id="new-member-address"
                  name="newMemberAddress"
                  type="text"
                  value={newMemberAddress}
                  onChange={(e) => setNewMemberAddress(e.target.value)}
                />
              </div>
              <div className="book-appointment-member-form-actions">
                <Button
                  onClick={handleAddFamilyMember}
                  disabled={
                    newMemberDobAge !== null &&
                    newMemberRelation === 'SELF' &&
                    newMemberDobAge < 18
                  }
                >
                  Save Member
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAddingMember(false)
                    setEditingMemberId(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          <div className="book-appointment-select-field">
            <label htmlFor="family-consultation-type">Consultation Type</label>
            <select
              id="family-consultation-type"
              name="familyConsultationType"
              value={familyConsultationType}
              onChange={(e) => setFamilyConsultationType(e.target.value)}
            >
              {CONSULTATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="book-appointment-form-grid">
            <div className="book-appointment-select-field">
              <label htmlFor="family-consultant">Name of Consultant *</label>
              <select
                id="family-consultant"
                name="familyConsultantId"
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
              {loadingConsultants && (
                <div className="book-appointment-skeleton-inline" aria-busy="true" aria-label="Loading consultants...">
                  <Skeleton lines={2} />
                </div>
              )}
            </div>
            <TextField
              label="Patient OPD No (optional)"
              id="family-opd-no"
              name="familyOpdNo"
              type="text"
              value={familyOpdNo}
              onChange={(e) => setFamilyOpdNo(e.target.value)}
            />
          </div>

          {renderDistanceBlock()}

          <div className="book-appointment-form-grid">
            <TextField
              label="Patient Name *"
              id="family-patient-name"
              name="familyPatientName"
              type="text"
              value={familyPatientName}
              onChange={(e) => setFamilyPatientName(e.target.value)}
              disabled={!selectedFamilyMemberId}
            />
            <div className="book-appointment-select-field">
              <label htmlFor="family-gender">Gender *</label>
              <select
                id="family-gender"
                name="familyGender"
                value={familyGender}
                onChange={(e) => setFamilyGender(e.target.value)}
                disabled={!selectedFamilyMemberId}
              >
                <option value="">Select Gender</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <TextField
            label="Address"
            id="family-address"
            name="familyAddress"
            type="text"
            value={familyAddress}
            onChange={(e) => setFamilyAddress(e.target.value)}
            disabled={!selectedFamilyMemberId}
          />

          <div className="book-appointment-form-grid">
            <div className="book-appointment-select-field">
              <label htmlFor="family-appointment-date">Appointment Date *</label>
              <div className="book-appointment-calendar">
                <div className="book-appointment-calendar-head">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="book-appointment-calendar-nav"
                    disabled={!canGoPrevMonth}
                    onClick={() => {
                      if (!canGoPrevMonth) return
                      setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                    }}
                  >
                    Prev
                  </Button>
                  <strong>{calendarMonthLabel}</strong>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="book-appointment-calendar-nav"
                    onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  >
                    Next
                  </Button>
                </div>
                <div className="book-appointment-calendar-weekdays">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="book-appointment-calendar-grid">
                  {calendarCells.map((cell) => {
                    if (!cell.date || !cell.dateKey) {
                      return <span key={cell.key} className="book-appointment-calendar-empty" />
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
                        className={`book-appointment-calendar-day ${isSelected ? 'selected' : ''}`}
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
                <div className="book-appointment-calendar-legend">
                  <span><i className="dot available" /> Available</span>
                  <span><i className="dot full" /> Full</span>
                  <span><i className="dot unknown" /> Checking</span>
                </div>
              </div>
              {dateAvailabilityLoading && (
                <div className="book-appointment-skeleton-inline" aria-busy="true" aria-label="Checking month availability...">
                  <Skeleton lines={2} />
                </div>
              )}
              {appointmentDate && (
                <p className="book-appointment-selected-date">
                  Selected date: <strong>{appointmentDate}</strong>
                </p>
              )}
            </div>
            <div className="book-appointment-select-field">
              <label htmlFor="family-preferred-slot">Preferred time (approx)</label>
              <select
                id="family-preferred-slot"
                name="preferredSlot"
                value={preferredSlot}
                onChange={(e) => setPreferredSlot(e.target.value)}
              >
                <option value="">Select slot</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {familyConsultantId && appointmentDate && (
            <div className="public-section-text book-appointment-quota-box">
              {appointmentQuotaLoading ? (
                <div className="book-appointment-skeleton-inline" aria-busy="true" aria-label="Checking slot availability...">
                  <Skeleton lines={3} />
                </div>
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
            <div className="book-appointment-full-day">
              <p className="book-appointment-full-day-text">
                Today booking is closed. You can choose next day appointment.
              </p>
              <Button
                variant="secondary"
                className="book-appointment-full-day-btn"
                onClick={() => void handleSuggestNextAvailableDate()}
              >
                Find next available date
              </Button>
            </div>
          )}

          {bookingDayNotice && (
            <p className="book-appointment-day-notice">
              {bookingDayNotice}
              {nextSuggestedDate ? ` (Selected: ${nextSuggestedDate})` : ''}
            </p>
          )}

          <p className="book-appointment-timing-msg">
            You may come anytime between <strong>10 AM and 3 PM</strong>.
          </p>

          <Button className="book-appointment-next-btn" onClick={goToPayment}>
            Next
          </Button>

        </>
      )}
    </Card>
  )

  const renderPayment = () => (
    <Card className="book-appointment-panel book-appointment-payment-card" elevated>
      <h2 className="public-section-title book-appointment-payment-title">Payment</h2>
      <p className="public-section-text book-appointment-payment-fee">
        Consultation fee: <strong>₹500</strong>
      </p>
      <p className="public-section-text book-appointment-payment-lead">
        Choose your payment preference. You can pay now during online booking, or pay cash at the clinic on appointment day.
      </p>
      <div className="book-appointment-payment-actions">
        <Button
          onClick={() => void handleConfirmAppointment('online_now')}
          disabled={submitting}
        >
          {submitting ? 'Processing…' : 'Pay ₹500 Online & Confirm'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void handleConfirmAppointment('cash_at_clinic')}
          disabled={submitting}
        >
          {submitting ? 'Processing…' : 'Pay cash at clinic & confirm'}
        </Button>
      </div>
    </Card>
  )

  const getConfirmName = () => familyPatientName || selectedFamilyMember?.fullName || '—'
  const getConfirmMobile = () => familyMobile || '—'
  const getConfirmEmail = () => '—'

  const renderConfirm = () => (
    <Card className="book-appointment-panel book-appointment-confirm-card" elevated>
      <h2 className="public-section-title book-appointment-confirm-title">Appointment Confirmed</h2>
      <p className="public-section-text book-appointment-confirm-lead">
        Thank you. Your appointment has been booked.
      </p>
      {appointmentId && (
        <p className="public-section-text book-appointment-confirm-id">
          Appointment ID: <strong>{appointmentId}</strong>
        </p>
      )}
      <div className="public-section-text book-appointment-confirm-summary">
        <p className="book-appointment-confirm-line"><strong>Name:</strong> {getConfirmName()}</p>
        <p className="book-appointment-confirm-line"><strong>Mobile:</strong> {getConfirmMobile()}</p>
        <p className="book-appointment-confirm-line"><strong>Email:</strong> {getConfirmEmail()}</p>
        <p className="book-appointment-confirm-line">
          <strong>Payment:</strong> {selectedPaymentMode === 'cash_at_clinic' ? 'Cash at clinic (on appointment day)' : 'Paid online during booking'}
        </p>
      </div>
      <p className="public-section-text book-appointment-confirm-footer">
        You will be contacted by the clinic if any changes are required.
      </p>

      <div className="book-appointment-confirm-actions">
        <Link to={profileSessionReady ? '/patient-profile' : '/patient-login'} className="ui-button ui-button-primary">
          {profileSessionReady ? 'View my profile' : 'Login to view profile'}
        </Link>
        <Link to="/" className="ui-button ui-button-secondary">
          Back to home
        </Link>
      </div>
    </Card>
  )

  return (
    <>
      <PublicLayout className="book-appointment-page">
        <PageHeader
          className="book-appointment-page-header"
          title="Book Appointment"
          subtitle={
            !policyAccepted
              ? 'Review privacy terms to continue with online booking.'
              : step === 'confirm'
                ? 'Your appointment is confirmed.'
                : step === 'payment'
                  ? 'Choose how you would like to pay.'
                  : 'Enter family details and pick a date for your visit.'
          }
          breadcrumb={(
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Book Appointment' },
              ]}
            />
          )}
        />
        {policyAccepted && (
          <div className="book-appointment-stats" aria-label="Booking progress">
            <StatCard
              className={step === 'details' ? 'book-appointment-stat--active' : ''}
              title="Step 1"
              value="Patient details"
              trend={{
                label:
                  step === 'details'
                    ? 'Current step'
                    : step === 'payment' || step === 'confirm'
                      ? 'Completed'
                      : 'Waiting',
                direction: step === 'payment' || step === 'confirm' ? 'up' : 'neutral',
              }}
            />
            <StatCard
              className={step === 'payment' ? 'book-appointment-stat--active' : ''}
              title="Step 2"
              value="Payment"
              trend={{
                label: step === 'payment' ? 'Current step' : step === 'confirm' ? 'Completed' : 'Waiting',
                direction: step === 'payment' ? 'neutral' : step === 'confirm' ? 'up' : 'neutral',
              }}
            />
            <StatCard
              className={step === 'confirm' ? 'book-appointment-stat--active' : ''}
              title="Step 3"
              value="Confirmed"
              trend={{
                label: step === 'confirm' ? 'Current step' : 'Waiting',
                direction: step === 'confirm' ? 'up' : 'neutral',
              }}
            />
          </div>
        )}
        {!policyAccepted && renderConsent()}
        {policyAccepted && (
          <>
            <p className="public-section-text book-appointment-intro">
              Please choose how you want to book.
            </p>
            {step === 'details' && mode === 'none' && renderModeChooser()}
          </>
        )}
        {error && (
          <p className="book-appointment-error" role="alert">
            {error}
          </p>
        )}
        {policyAccepted && step === 'details' && mode === 'family' && renderFamilyForm()}
        {policyAccepted && step === 'payment' && renderPayment()}
        {policyAccepted && step === 'confirm' && renderConfirm()}
        {step !== 'confirm' && (
          <p className="book-appointment-back-link">
            <Link to="/">Back to home</Link>
          </p>
        )}
      </PublicLayout>
      {deleteMemberTarget && (
        <div className="book-appointment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-member-title">
          <Card className="book-appointment-modal-card" elevated>
            <h3 id="delete-member-title">Delete family member?</h3>
            <p>
              Are you sure you want to delete <strong>{deleteMemberTarget.fullName}</strong> from this family list?
            </p>
            <div className="book-appointment-modal-actions">
              <Button variant="secondary" onClick={closeDeleteMemberModal}>
                Cancel
              </Button>
              <Button
                className="ui-button-danger-outline"
                onClick={() => {
                  void handleDeleteMember(deleteMemberTarget.id)
                }}
              >
                Yes, delete
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

