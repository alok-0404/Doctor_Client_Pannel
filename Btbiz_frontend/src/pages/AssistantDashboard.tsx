import { useState, useEffect } from 'react'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/TextField'
import { Button } from '../components/ui/Button'
import { authService, patientService, type PatientSummary } from '../services/api'

type Step = 'search' | 'new_patient' | 'checkin'

export const AssistantDashboard = () => {
  const name = authStorage.getName() ?? 'Assistant'

  const [step, setStep] = useState<Step>('search')
  const [mobileSearch, setMobileSearch] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [patient, setPatient] = useState<PatientSummary | null>(null)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [hasTodayVisit, setHasTodayVisit] = useState(false)

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

  // File upload for reports / prescriptions
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploadLoading, setDocUploadLoading] = useState(false)
  const [docUploadError, setDocUploadError] = useState<string | null>(null)
  const [docUploadSuccess, setDocUploadSuccess] = useState<string | null>(null)
  const [docOcrPreview, setDocOcrPreview] = useState<string | null>(null)

  const [saveLoading, setSaveLoading] = useState(false)
  const [referLoading, setReferLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const loadProfile = async () => {
    try {
      const { doctor } = await authService.getProfile()
      if (doctor.referredToDoctorName) setReferredToDoctorName(doctor.referredToDoctorName)
    } catch {
      // ignore
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError(null)
    // Reset any previous document upload messages when starting a new search
    setDocUploadError(null)
    setDocUploadSuccess(null)
    setDocFile(null)
    const digits = mobileSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setSearchError('Enter a valid 10-digit mobile number.')
      return
    }
    setSearchLoading(true)
    try {
      const found = await patientService.searchByMobile(digits)
      if (found) {
        // Load today's visit info to decide whether this is pre‑doctor (check‑in) or post‑doctor (upload only)
        try {
          const history = await patientService.getFullHistory(found.id)
          const today = new Date()
          const todayVisits = (history.visits ?? []).filter((v) => {
            const d = new Date(v.visitDate)
            return (
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate()
            )
          })
          const todayVisit = todayVisits[0]
          setHasTodayVisit(Boolean(todayVisit))

          // If there is a visit today (patient already saw the doctor),
          // pre-fill vitals and notes with the recorded values so assistant sees them.
          if (todayVisit) {
            setDiseaseReason(todayVisit.reason ?? '')
            setNotesForDoctor(todayVisit.notes ?? '')
            setBpSystolic(
              todayVisit.bloodPressureSystolic != null
                ? String(todayVisit.bloodPressureSystolic)
                : ''
            )
            setBpDiastolic(
              todayVisit.bloodPressureDiastolic != null
                ? String(todayVisit.bloodPressureDiastolic)
                : ''
            )
            setBloodSugar(
              todayVisit.bloodSugarFasting != null
                ? String(todayVisit.bloodSugarFasting)
                : ''
            )
            setWeightKg(
              todayVisit.weightKg != null
                ? String(todayVisit.weightKg)
                : ''
            )
            setTemperature(
              todayVisit.temperature != null
                ? String(todayVisit.temperature)
                : ''
            )
            setOtherVitalsNotes(todayVisit.otherVitalsNotes ?? '')
          } else {
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
          setHasTodayVisit(false)
          setDiseaseReason('')
          setNotesForDoctor('')
          setBpSystolic('')
          setBpDiastolic('')
          setBloodSugar('')
          setWeightKg('')
          setTemperature('')
          setOtherVitalsNotes('')
        }

        setPatient(found)
        setPatientId(found.id)
        setFirstName(found.firstName)
        setLastName(found.lastName ?? '')
        setMobileNumber(found.mobileNumber)
        setAddress(found.address ?? '')
        setPreviousHealthHistory(found.previousHealthHistory ?? '')
        setBloodGroup(found.bloodGroup ?? '')
        setEmergencyName(found.emergencyContactName ?? '')
        setEmergencyPhone(found.emergencyContactPhone ?? '')
        setStep('checkin')
      } else {
        setMobileNumber(digits)
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
    setFormError(null)
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
    setSaveLoading(true)
    try {
      const created = await patientService.createPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobileNumber: digits,
        address: address.trim() || undefined,
        previousHealthHistory: previousHealthHistory.trim() || undefined,
        bloodGroup: bloodGroup.trim() || undefined,
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.replace(/\D/g, '') || undefined,
      })
      setPatient(created)
      setPatientId(created.id)
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
    setFormError(null)
    setFormSuccess(null)
    setSaveLoading(true)
    try {
      const updated = await patientService.updatePatient(patientId, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobileNumber: mobileNumber.replace(/\D/g, ''),
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
    setFormError(null)
    const sys = parseInt(bpSystolic, 10)
    const dia = parseInt(bpDiastolic, 10)
    const sugar = bloodSugar.trim() ? parseInt(bloodSugar, 10) : undefined
    const weight = weightKg.trim() ? parseFloat(weightKg) : undefined
    const temp = temperature.trim() ? parseFloat(temperature) : undefined
    if (Number.isNaN(sys) || Number.isNaN(dia)) {
      setFormError('Blood pressure (systolic and diastolic) is mandatory.')
      return
    }
    setReferLoading(true)
    try {
      await patientService.createVisit(patientId, {
        reason: diseaseReason.trim() || undefined,
        notes: notesForDoctor.trim() || undefined,
        bloodPressureSystolic: sys,
        bloodPressureDiastolic: dia,
        bloodSugarFasting: sugar,
        weightKg: weight,
        temperature: temp,
        otherVitalsNotes: otherVitalsNotes.trim() || undefined,
      })
      setFormSuccess('Patient referred to doctor successfully.')
      setStep('search')
      setPatient(null)
      setPatientId(null)
      setMobileSearch('')
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Could not refer patient.')
    } finally {
      setReferLoading(false)
    }
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
      if (result.ocr && result.ocr.success && 'text' in result.ocr && result.ocr.text) {
        setDocOcrPreview(result.ocr.text)
        setDocUploadSuccess('File uploaded. Text extracted below – please review and copy as needed.')
      } else if (result.ocr && !result.ocr.success) {
        setDocUploadSuccess('File uploaded to patient record. (Text extraction failed, but document is saved.)')
      } else {
        setDocUploadSuccess('File uploaded and saved to patient record.')
      }
      setDocFile(null)
    } catch (err: any) {
      setDocUploadError(err?.response?.data?.message ?? 'Could not upload file.')
    } finally {
      setDocUploadLoading(false)
    }
  }

  const goBackToSearch = () => {
    setStep('search')
    setPatient(null)
    setPatientId(null)
    setHasTodayVisit(false)
    setMobileSearch('')
    setFormError(null)
    setFormSuccess(null)
    setDocFile(null)
    setDocUploadError(null)
    setDocUploadSuccess(null)
  }

  useEffect(() => {
    void loadProfile()
  }, [])

  // Auto-hide document upload success message after a few seconds
  useEffect(() => {
    if (!docUploadSuccess) return
    const timeout = setTimeout(() => {
      setDocUploadSuccess(null)
    }, 4000)
    return () => clearTimeout(timeout)
  }, [docUploadSuccess])

  return (
    <div className="app-shell">
      <Header clinicName="Check‑in desk" doctorName={name} />
      <main className="search-main" style={{ padding: 24, maxWidth: '100%', width: '100%' }}>
        {step === 'search' && (
          <Card className="search-card">
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
            </form>
          </Card>
        )}

        {step === 'new_patient' && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Card className="search-card">
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
                {formError && <p className="text-sm" style={{ color: '#c62828' }}>{formError}</p>}
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
          <Card className="search-card">
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
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleUpdatePatient(e)
              }}
              className="search-form"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <p className="dashboard-kicker" style={{ marginTop: 8 }}>Patient information</p>
              <TextField id="c-first-name" label="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <TextField id="c-last-name" label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <TextField id="c-mobile" type="tel" label="Mobile number *" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              <TextField id="c-address" label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
              <TextField id="c-disease" label="Disease / reason for visit" value={diseaseReason} onChange={(e) => setDiseaseReason(e.target.value)} />
              <div>
                <label className="ui-textfield-label" htmlFor="c-history">Previous health history</label>
                <textarea
                  id="c-history"
                  rows={2}
                  className="ui-textfield-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={previousHealthHistory}
                  onChange={(e) => setPreviousHealthHistory(e.target.value)}
                />
              </div>
              <TextField id="c-blood-group" label="Blood group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} />
              <TextField id="c-emergency-name" label="Emergency contact" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
              <TextField id="c-emergency-phone" type="tel" label="Emergency phone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
              <Button type="submit" disabled={saveLoading} style={{ alignSelf: 'flex-start' }}>
                {saveLoading ? 'Saving…' : 'Update patient details'}
              </Button>
            </form>

            <form onSubmit={handleReferToDoctor} className="search-form" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
              <p className="dashboard-kicker">
                {hasTodayVisit ? 'Upload documents for today\'s visit' : 'Mandatory vitals (before doctor)'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextField id="bp-sys" type="number" label="BP systolic (mmHg) *" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} placeholder="120" />
                <TextField id="bp-dia" type="number" label="BP diastolic (mmHg) *" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} placeholder="80" />
              </div>
              <TextField id="sugar" type="number" label="Blood sugar fasting (mg/dL)" value={bloodSugar} onChange={(e) => setBloodSugar(e.target.value)} placeholder="e.g. 90" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextField id="weight" type="number" label="Weight (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 70" />
                <TextField id="temp" type="number" label="Temperature (°C)" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="e.g. 37" />
              </div>
              <div>
                <label className="ui-textfield-label" htmlFor="other-vitals">Other basic tests / notes</label>
                <textarea
                  id="other-vitals"
                  rows={2}
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
                  rows={2}
                  className="ui-textfield-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={notesForDoctor}
                  onChange={(e) => setNotesForDoctor(e.target.value)}
                  placeholder="Brief note to refer patient to doctor"
                />
              </div>
              <div>
                <p className="dashboard-kicker">Upload report / document</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setDocFile(f)
                      setDocUploadError(null)
                      setDocUploadSuccess(null)
                      setDocOcrPreview(null)
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
                        maxHeight: 160,
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
              </div>
              {formError && <p className="text-sm" style={{ color: '#c62828' }}>{formError}</p>}
              {formSuccess && <p className="text-sm" style={{ color: '#2e7d32' }}>{formSuccess}</p>}
              <div className="dialog-actions" style={{ marginTop: 8 }}>
                <Button type="button" variant="secondary" onClick={goBackToSearch}>Back to search</Button>
                {!hasTodayVisit && (
                  <Button type="submit" disabled={referLoading}>
                    {referLoading ? 'Referring…' : 'Refer to doctor'}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  )
}
