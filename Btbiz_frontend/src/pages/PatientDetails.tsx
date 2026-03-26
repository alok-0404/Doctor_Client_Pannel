import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { authStorage } from '../utils/authStorage'
import { PatientCard, type PatientDetailsData } from '../components/PatientCard'
import { Card } from '../components/ui/Card'
import { patientService } from '../services/api'

function formatVisitDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ageFromDob(dob: string | Date | undefined): number | undefined {
  if (!dob) return undefined
  const d = typeof dob === 'string' ? new Date(dob) : dob
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return age
}

export const PatientDetails = () => {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PatientDetailsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const doctorName = authStorage.getName() ?? 'Doctor'

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Invalid patient')
      return
    }
    let cancelled = false
    patientService
      .getFullHistory(id)
      .then((res) => {
        if (cancelled) return
        const p = res.patient as any
        const documents = (res.documents || []) as Array<{ id: string; originalName: string; uploadedAt: string; ocrText?: string; source?: string }>
        const medicineRequests = (res.medicineRequests || []) as Array<{ id: string; medicineName: string; dosage?: string; notes?: string; source?: string; createdAt: string }>
        const testRequests = (res.testRequests || []) as Array<{ id: string; testName: string; notes?: string; source?: string; createdAt: string }>
        const pharmacyDispensations = (res.pharmacyDispensations || []) as Array<{
          id: string
          dispensedBy: string
          items: Array<{ medicineName: string; mrp: number; discount: number; quantity: number; amount: number }>
          subtotal: number
          totalDiscount: number
          totalAmount: number
          paidAmount: number
          paymentStatus: string
          paidAt?: string
          receiptNumber?: string
          createdAt: string
        }>
        const visits = (res.visits || []) as Array<{
          _id: string
          visitDate: string
          reason?: string
          notes?: string
          bloodPressureSystolic?: number
          bloodPressureDiastolic?: number
          bloodSugarFasting?: number
          weightKg?: number
          temperature?: number
          otherVitalsNotes?: string
          patientLatitude?: number
          patientLongitude?: number
          doctor?: { name: string }
          diagnosticTests?: Array<{ _id: string; testName: string; result?: string; notes?: string }>
        }>
        const age = ageFromDob(p.dateOfBirth)
        const lastVisit = visits.length > 0 ? formatVisitDate(visits[0].visitDate) : undefined
        const allTests = visits.flatMap((v) =>
          (v.diagnosticTests || []).map((t: any) => ({
            name: t.testName,
            status: t.result || 'Added',
            hasReport: t.hasReport || false,
            testId: t._id,
            visitId: v._id
          }))
        )

        const visitItems = visits.map((v) => {
          const vitals: string[] = []
          if (v.bloodPressureSystolic != null && v.bloodPressureDiastolic != null) {
            vitals.push(`BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg`)
          }
          if (v.bloodSugarFasting != null) vitals.push(`Sugar ${v.bloodSugarFasting} mg/dL`)
          if (v.weightKg != null) vitals.push(`Weight ${v.weightKg} kg`)
          if (v.temperature != null) vitals.push(`Temp ${v.temperature}°C`)
          if (v.otherVitalsNotes) vitals.push(v.otherVitalsNotes)
          const vitalsStr = vitals.length ? ` [Vitals: ${vitals.join(', ')}]` : ''
          return {
            date: formatVisitDate(v.visitDate),
            reason: v.reason || '—',
            notes: `${v.notes || ''}${vitalsStr}`.trim() || undefined,
            patientLatitude: v.patientLatitude,
            patientLongitude: v.patientLongitude
          }
        })
        setData({
          id: p._id ?? id,
          name: [p.firstName, p.lastName].filter(Boolean).join(' ') || '—',
          age: age ?? 0,
          gender: p.gender === 'MALE' ? 'Male' : p.gender === 'FEMALE' ? 'Female' : p.gender ?? '—',
          mobile: p.mobileNumber ?? '',
          lastVisit,
          address: p.address ?? undefined,
          basicInfo: p.previousHealthHistory ?? undefined,
          bloodGroup: p.bloodGroup ?? undefined,
          emergencyContact:
            p.emergencyContactName || p.emergencyContactPhone
              ? {
                  name: p.emergencyContactName || '—',
                  phone: p.emergencyContactPhone || '—'
                }
              : undefined,
          visits: visitItems,
          prescriptions: [],
          medicines: [],
          pharmacyDispensations,
          tests: allTests,
          medicineRequests,
          testRequests,
          documents: documents.map((d) => ({
            id: d.id,
            originalName: d.originalName,
            uploadedAt: d.uploadedAt,
            ocrText: d.ocrText,
            source: d.source,
          }))
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.status === 404 ? 'Patient not found' : 'Failed to load patient')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="app-shell">
        <Header doctorName={doctorName} />
        <main className="details-main" style={{ padding: 24 }}>
          <p className="dashboard-body">Loading patient…</p>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app-shell">
        <Header doctorName={doctorName} />
        <main className="details-main" style={{ padding: 24 }}>
          <p className="dashboard-body" style={{ color: '#c62828' }}>{error ?? 'Patient not found'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header doctorName={doctorName} />
      <main className="details-main">
        <div className="details-header-row">
          <Card className="details-header-card">
            <div className="details-header-copy">
              <p className="dashboard-kicker">Patient record</p>
              <h2 className="details-title">Patient details</h2>
              <p className="details-subtitle">
                Demographics, visit history with vitals (recorded by assistant), and notes.
              </p>
            </div>
            <p className="details-header-meta">Mobile: {data.mobile}</p>
          </Card>
        </div>
        <PatientCard data={data} patientId={id!} />
      </main>
    </div>
  )
}
