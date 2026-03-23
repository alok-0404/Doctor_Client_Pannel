import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { publicAppointmentService, type PatientSummary, type ConsultantOption, type FamilyMemberSummary, type FamilyRelation } from '../services/api'

type Mode = 'none' | 'family' | 'old' | 'new'
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

export const BookAppointment = () => {
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
  const [viewingHistoryForId, setViewingHistoryForId] = useState<string | null>(null)
  const [memberHistory, setMemberHistory] = useState<Awaited<ReturnType<typeof publicAppointmentService.getFamilyMemberHistory>> | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Old patient state
  const [oldMobile, setOldMobile] = useState('')
  const [oldPatient, setOldPatient] = useState<PatientSummary | null>(null)
  const [oldConsultationType, setOldConsultationType] = useState(CONSULTATION_TYPES[0])
  const [oldConsultantId, setOldConsultantId] = useState('')
  const [oldOpdNo, setOldOpdNo] = useState('')
  const [oldName, setOldName] = useState('')
  const [oldEmail, setOldEmail] = useState('')
  const [oldGender, setOldGender] = useState<string>('')
  const [oldAddress, setOldAddress] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [preferredSlot, setPreferredSlot] = useState('')

  // New patient state
  const [newConsultantId, setNewConsultantId] = useState('')
  const [newName, setNewName] = useState('')
  const [newAge, setNewAge] = useState('')
  const [newGender, setNewGender] = useState<string>('')
  const [newMobile, setNewMobile] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newAddress, setNewAddress] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | null>(null)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode | null>(null)
  const liveShareWatchIdRef = useRef<number | null>(null)
  const lastSentMsRef = useRef<number>(0)

  useEffect(() => {
    setLoadingConsultants(true)
    void publicAppointmentService
      .listConsultants()
      .then((list) => {
        setConsultants(list)
        if (list.length > 0) {
          setOldConsultantId((prev) => prev || list[0].id)
          setNewConsultantId((prev) => prev || list[0].id)
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

  const selectedConsultantId =
    mode === 'old' ? oldConsultantId
      : mode === 'new' ? newConsultantId
        : mode === 'family' ? familyConsultantId
          : ''
  const selectedConsultant = consultants.find((c) => c.id === selectedConsultantId)
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

  const selectOld = () => {
    setMode('old')
    resetState()
  }

  const selectNew = () => {
    setMode('new')
    resetState()
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

  const handleFamilyLogin = async () => {
    setError(null)
    setFamilyAccountId(null)
    setFamilyMembers([])
    setSelectedFamilyMemberId('')

    const mobile = familyMobile.trim()
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
        setSelectedFamilyMemberId(list.members[0].id)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to load family members. Please try again.')
    }
  }

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
        if (last?.id) setSelectedFamilyMemberId(last.id)
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
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to delete family member. Please try again.')
    }
  }

  const handleViewHistory = async (memberId: string) => {
    setViewingHistoryForId(memberId)
    setMemberHistory(null)
    setLoadingHistory(true)
    setError(null)
    try {
      const hist = await publicAppointmentService.getFamilyMemberHistory(memberId)
      setMemberHistory(hist)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to load health records. Please try again.')
    } finally {
      setLoadingHistory(false)
    }
  }

  // When member is selected, prefill editable patient details for appointment.
  useEffect(() => {
    if (mode !== 'family') return
    if (!selectedFamilyMember) return
    const p = selectedFamilyMember.patient
    setFamilyPatientName(
      (p ? `${p.firstName} ${p.lastName ?? ''}`.trim() : selectedFamilyMember.fullName) || ''
    )
    setFamilyGender(p?.gender ?? selectedFamilyMember.gender ?? '')
    setFamilyAddress(p?.address ?? '')
  }, [mode, selectedFamilyMember])

  const handleFetchOldPatient = async () => {
    setError(null)
    setOldPatient(null)
    if (!oldMobile || oldMobile.trim().length < 8) {
      return
    }
    try {
      const p = await publicAppointmentService.findPatientByMobile(oldMobile.trim())
      if (!p) {
        setError('No patient found with this mobile number.')
        return
      }
      setOldPatient(p)
      setOldName(`${p.firstName} ${p.lastName ?? ''}`.trim())
      setOldGender(p.gender ?? '')
      setOldAddress(p.address ?? '')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(typeof msg === 'string' ? msg : 'Failed to fetch patient details. Please try again.')
    }
  }

  const goToPayment = () => {
    setError(null)
    if (!appointmentDate) {
      setError('Please select appointment date.')
      return
    }
    if (mode === 'family') {
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
    } else if (mode === 'old') {
      if (!oldMobile || !oldConsultationType || !oldConsultantId || !oldOpdNo) {
        setError('Please fill all mandatory fields.')
        return
      }
    } else if (mode === 'new') {
      if (!newConsultantId || !newName || !newGender || !newMobile) {
        setError('Please fill all mandatory fields.')
        return
      }
      const ageNum = newAge ? Number(newAge) : NaN
      if (!newAge || isNaN(ageNum) || ageNum < 18) {
        setError('Age must be 18 or above.')
        return
      }
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
      } else if (mode === 'old') {
        res = await publicAppointmentService.bookOldPatientAppointment({
          mobileNumber: oldMobile.trim(),
          consultationType: oldConsultationType,
          consultantId: oldConsultantId,
          opdNumber: oldOpdNo,
          appointmentDate,
          preferredSlot: preferredSlot || undefined,
          patientName: oldName || undefined,
          gender: oldGender || undefined,
          address: oldAddress || undefined,
          ...(userLocation && { patientLatitude: userLocation.lat, patientLongitude: userLocation.lng }),
        })
      } else {
        res = await publicAppointmentService.bookNewPatientAppointment({
          consultantId: newConsultantId,
          patientName: newName,
          age: newAge ? Number(newAge) : undefined,
          gender: newGender,
          mobileNumber: newMobile.trim(),
          city: newCity || undefined,
          address: newAddress || undefined,
          appointmentDate,
          preferredSlot: preferredSlot || undefined,
          ...(userLocation && { patientLatitude: userLocation.lat, patientLongitude: userLocation.lng }),
        })
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
        Family Booking
      </button>
      <button type="button" className="public-cta" onClick={selectOld}>
        Old Patient
      </button>
      <button type="button" className="public-cta" onClick={selectNew}>
        New Patient
      </button>
    </div>
  )

  const renderFamilyForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 6 }}>Family Booking</h2>
      <p className="public-section-text" style={{ marginBottom: 16 }}>
        Enter your <strong>primary mobile number</strong>, then select a family member (or add a new one).
      </p>

      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Primary Mobile No *</label>
          <input
            type="tel"
            value={familyMobile}
            onChange={(e) => setFamilyMobile(e.target.value)}
            placeholder="Enter mobile number"
          />
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
              onChange={(e) => setSelectedFamilyMemberId(e.target.value)}
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
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                        onClick={() => setSelectedFamilyMemberId(m.id)}
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
                        onClick={() => handleDeleteMember(m.id)}
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
                </div>
                <div className="appt-field">
                  <label>Address</label>
                  <input type="text" value={newMemberAddress} onChange={(e) => setNewMemberAddress(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" className="public-cta" onClick={handleAddFamilyMember}>
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
                value={familyConsultantId}
                onChange={(e) => setFamilyConsultantId(e.target.value)}
                disabled={loadingConsultants}
              >
                {consultants.length === 0 && <option value="">Loading…</option>}
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
              <input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
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

          <p className="appt-timing-msg">
            You may come anytime between <strong>10 AM and 3 PM</strong>.
          </p>

          <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
            Next
          </button>

          {viewingHistoryForId && (
            <div className="appt-card" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <h3 className="public-section-title" style={{ marginBottom: 0, fontSize: '1.05rem' }}>Health Records</h3>
                <button
                  type="button"
                  className="public-cta"
                  style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#334155' }}
                  onClick={() => {
                    setViewingHistoryForId(null)
                    setMemberHistory(null)
                  }}
                >
                  Close
                </button>
              </div>
              {loadingHistory && (
                <p className="public-section-text">Loading health records…</p>
              )}
              {!loadingHistory && memberHistory && (
                <>
                  <p className="public-section-text" style={{ marginBottom: 10 }}>
                    <strong>{memberHistory.member.fullName}</strong> ({memberHistory.member.relation}) – {memberHistory.member.patient.mobileNumber}
                  </p>
                  {memberHistory.visits.length === 0 && (
                    <p className="public-section-text">No visits found for this member yet.</p>
                  )}
                  {memberHistory.visits.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                      {memberHistory.visits.map((v) => (
                        <li key={v.id} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>
                          <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            <strong>{new Date(v.visitDate).toLocaleDateString()}</strong>
                            {v.doctorName && <span style={{ color: '#64748b' }}> · {v.doctorName}</span>}
                          </div>
                          {v.reason && (
                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                              Reason: {v.reason}
                            </div>
                          )}
                          {v.notes && (
                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                              Notes: {v.notes}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderOldForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>Old Patient Appointment</h2>
      <div className="appt-field">
        <label>Mobile No *</label>
        <input
          type="tel"
          value={oldMobile}
          onChange={(e) => setOldMobile(e.target.value)}
          onBlur={handleFetchOldPatient}
          placeholder="Enter registered mobile number"
        />
      </div>
      {oldPatient && (
        <div className="appt-summary">
          <div className="appt-field">
            <label>Patient Name</label>
            <div className="appt-readonly-value">
              {oldName || '—'}
            </div>
          </div>
          <div className="appt-two-cols">
            <div className="appt-field">
              <label>Gender</label>
              <div className="appt-readonly-value">
                {oldGender || '—'}
              </div>
            </div>
            <div className="appt-field">
              <label>Address</label>
              <div className="appt-readonly-value">
                {oldAddress || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="appt-field">
        <label>Email (optional)</label>
        <input
          type="email"
          value={oldEmail}
          onChange={(e) => setOldEmail(e.target.value)}
          placeholder="your@email.com"
        />
      </div>
      <div className="appt-field">
        <label>Consultation Type *</label>
        <select value={oldConsultationType} onChange={(e) => setOldConsultationType(e.target.value)}>
          {CONSULTATION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Name of Consultant *</label>
          <select
            value={oldConsultantId}
            onChange={(e) => setOldConsultantId(e.target.value)}
            disabled={loadingConsultants}
          >
            {consultants.length === 0 && <option value="">Loading…</option>}
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="appt-field">
          <label>Patient OPD No *</label>
          <input
            type="text"
            value={oldOpdNo}
            onChange={(e) => setOldOpdNo(e.target.value)}
          />
        </div>
      </div>
      {renderDistanceBlock()}
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Appointment Date *</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
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
      <p className="appt-timing-msg">
        You may come anytime between <strong>10 AM and 3 PM</strong>.
      </p>
      <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
        Next
      </button>
    </div>
  )

  const renderNewForm = () => (
    <div className="appt-card">
      <h2 className="public-section-title" style={{ marginBottom: 16 }}>New Patient Appointment</h2>
      <div className="appt-field">
        <label>Name of Consultant for Appointment *</label>
        <select
          value={newConsultantId}
          onChange={(e) => setNewConsultantId(e.target.value)}
          disabled={loadingConsultants}
        >
          {consultants.length === 0 && <option value="">Loading…</option>}
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {renderDistanceBlock()}
      <div className="appt-field">
        <label>Name of the Patient *</label>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Age *</label>
          <input
            type="number"
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
            min={18}
            placeholder="18 or above"
            style={{
              borderColor: newAge && (isNaN(Number(newAge)) || Number(newAge) < 18) ? '#dc2626' : undefined,
              boxShadow: newAge && (isNaN(Number(newAge)) || Number(newAge) < 18) ? '0 0 0 2px rgba(220, 38, 38, 0.2)' : undefined,
            }}
          />
          {newAge && (isNaN(Number(newAge)) || Number(newAge) < 18) && (
            <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4 }}>Age must be 18 or above</p>
          )}
        </div>
        <div className="appt-field">
          <label>Gender *</label>
          <select value={newGender} onChange={(e) => setNewGender(e.target.value)}>
            <option value="">Select Gender</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="appt-field">
        <label>Mobile No *</label>
        <input
          type="tel"
          value={newMobile}
          onChange={(e) => setNewMobile(e.target.value)}
        />
      </div>
      <div className="appt-field">
        <label>Email (optional)</label>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="your@email.com"
        />
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>City Name</label>
          <input
            type="text"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
          />
        </div>
        <div className="appt-field">
          <label>Address</label>
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
        </div>
      </div>
      <div className="appt-two-cols">
        <div className="appt-field">
          <label>Appointment Date *</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
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
      <p className="appt-timing-msg">
        You may come anytime between <strong>10 AM and 3 PM</strong>.
      </p>
      <button type="button" className="public-cta" style={{ marginTop: 16 }} onClick={goToPayment}>
        Next
      </button>
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

  const getConfirmName = () => {
    if (mode === 'family') return familyPatientName || selectedFamilyMember?.fullName || '—'
    if (mode === 'old') return (oldPatient ? `${oldPatient.firstName} ${oldPatient.lastName ?? ''}`.trim() : oldName) || '—'
    return newName || '—'
  }
  const getConfirmMobile = () => {
    if (mode === 'family') return familyMobile || '—'
    return (mode === 'old' ? oldMobile : newMobile) || '—'
  }
  const getConfirmEmail = () => {
    if (mode === 'family') return '—'
    return (mode === 'old' ? oldEmail : newEmail).trim() || '—'
  }

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
        {policyAccepted && step === 'details' && mode === 'old' && renderOldForm()}
        {policyAccepted && step === 'details' && mode === 'new' && renderNewForm()}
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
        .appt-two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 640px) { .appt-two-cols { grid-template-columns: 1fr; } }
        .appt-readonly-value { padding: 8px 10px; border-radius: 8px; background: #f1f5f9; font-size: 0.95rem; color: #111827; }
        .appt-timing-msg { font-size: 0.9rem; color: #475569; margin: 12px 0 0; padding: 10px 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
        .public-footer { margin-top: auto; background: #0f172a; color: #94a3b8; padding: 28px 20px; }
        .public-footer-inner { max-width: 1100px; margin: 0 auto; text-align: center; }
        .public-footer-copy { font-size: 0.875rem; margin: 0; color: #64748b; }
      `}</style>
    </div>
  )
}

