import { useState, type FC, type ReactNode } from 'react'
import { patientService } from '../services/api'

interface TagProps {
  variant?: 'worked' | 'notWorked'
  children: ReactNode
}

const PillTag: FC<TagProps> = ({ variant = 'worked', children }) => {
  const variantClass = variant === 'worked' ? 'pill-tag pill-tag-worked' : 'pill-tag pill-tag-not-worked'

  return (
    <span className={variantClass}>
      {children}
    </span>
  )
}

interface DocumentViewButtonProps {
  patientId: string
  documentId: string
  label: string
  /** Optional fallback text (e.g. OCR) to show if file cannot be opened */
  fallbackText?: string
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const DocumentViewButton: FC<DocumentViewButtonProps> = ({ patientId, documentId, label, fallbackText }) => {
  const [loading, setLoading] = useState(false)
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      await patientService.openDocument(patientId, documentId)
    } catch {
      if (fallbackText) {
        const html = `
          <html>
            <head>
              <title>Prescription text</title>
              <meta charset="utf-8" />
            </head>
            <body style="margin:0; padding:16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8fafc; color:#0f172a;">
              <h1 style="font-size:16px; margin:0 0 12px;">Prescription text</h1>
              <pre style="white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:13px; line-height:1.5; padding:12px; border-radius:8px; background:#ffffff; border:1px solid #e2e8f0; max-width:960px; overflow:auto;">
${escapeHtml(fallbackText)}
              </pre>
            </body>
          </html>
        `
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const opened = window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        if (!opened) {
          // eslint-disable-next-line no-alert
          alert('Unable to open prescription text in a new tab.')
        }
      } else {
        // eslint-disable-next-line no-alert
        alert('Failed to open document.')
      }
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="ui-button ui-button-primary"
      style={{ fontSize: 12, padding: '4px 10px' }}
    >
      {loading ? 'Opening…' : label}
    </button>
  )
}

export interface MedicineItem {
  name: string
  dosage?: string
  worked?: boolean
}

export interface VisitItem {
  date: string
  reason: string
  notes?: string
  /** Patient's location at time of booking (so doctor can see) */
  patientLatitude?: number
  patientLongitude?: number
}

export interface PrescriptionItem {
  date: string
  summary: string
}

export interface DiagnosticTestItem {
  name: string
  status: string
  hasReport?: boolean
  testId?: string
  visitId?: string
}

export interface DocumentItem {
  id: string
  originalName: string
  uploadedAt: string
  ocrText?: string
  /** Optional source of document, e.g. 'WHATSAPP' when uploaded via bot */
  source?: string
}

export interface PharmacyDispensationItem {
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
}

export interface MedicineRequestItem {
  id: string
  medicineName: string
  dosage?: string
  quantity?: number
  notes?: string
  source?: string
  createdAt: string
}

export interface TestRequestItem {
  id: string
  testName: string
  notes?: string
  source?: string
  createdAt: string
}

export interface PatientDetailsData {
  id: string
  name: string
  age?: number
  gender: string
  mobile: string
  lastVisit?: string
  address?: string
  basicInfo?: string
  heightCm?: number
  weightKg?: number
  bloodGroup?: string
  primaryDisease?: string
  lifestyle?: string
  exerciseRoutine?: string
  dietType?: string
  geneticConditions?: string
  emergencyContact?: {
    name: string
    relation?: string
    phone: string
  }
  visits: VisitItem[]
  prescriptions: PrescriptionItem[]
  medicines: MedicineItem[]
  medicineRequests?: MedicineRequestItem[]
  pharmacyDispensations?: PharmacyDispensationItem[]
  tests: DiagnosticTestItem[]
  testRequests?: TestRequestItem[]
  documents?: DocumentItem[]
}

interface PatientCardProps {
  data: PatientDetailsData
  patientId: string
}

type SectionKey = 'patient' | 'visitHistory' | 'prescriptions' | 'medicines' | 'pharmacyDispensations' | 'tests'

export const PatientCard: FC<PatientCardProps> = ({ data, patientId }) => {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    patient: true,
    visitHistory: true,
    prescriptions: false,
    medicines: false,
    pharmacyDispensations: false,
    tests: false,
  })

  const toggleSection = (key: SectionKey) => (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const openPatient = openSections.patient
  const openVisitHistory = openSections.visitHistory
  const openPrescriptions = openSections.prescriptions
  const openMedicines = openSections.medicines
  const openPharmacyDispensations = openSections.pharmacyDispensations
  const openTests = openSections.tests

  return (
    <div className="patient-layout">
      {/* Left column – patient summary */}
      <section
        className={`patient-summary-card patient-collapsible ${openPatient ? 'patient-collapsible-open' : ''}`}
        onClick={toggleSection('patient')}
        onKeyDown={(e) => e.key === 'Enter' && toggleSection('patient')(e)}
        role="button"
        tabIndex={0}
      >
        <h2 className="dashboard-kicker">
          Patient
        </h2>
        {openPatient && (
          <>
            <p className="patient-name">
              {data.name}
            </p>
            <p className="patient-meta">
              {typeof data.age === 'number' && data.age > 0 ? `${data.age} yrs` : 'Age N/A'} • {data.gender}
            </p>
            <dl className="patient-summary-list">
              <div className="patient-summary-row">
                <dt>Mobile</dt>
                <dd>{data.mobile}</dd>
              </div>
              {data.emergencyContact && (
                <div className="patient-summary-row">
                  <dt>Emergency</dt>
                  <dd>
                    {data.emergencyContact.name}
                    {` • ${data.emergencyContact.phone}`}
                  </dd>
                </div>
              )}
              {data.address && (
                <div className="patient-summary-row">
                  <dt>Address</dt>
                  <dd>{data.address}</dd>
                </div>
              )}
              {data.heightCm && data.weightKg && (
                <div className="patient-summary-row">
                  <dt>Height / Weight</dt>
                  <dd>
                    {data.heightCm} cm • {data.weightKg} kg
                  </dd>
                </div>
              )}
              {data.bloodGroup && (
                <div className="patient-summary-row">
                  <dt>Blood group</dt>
                  <dd>{data.bloodGroup}</dd>
                </div>
              )}
              {data.primaryDisease && (
                <div className="patient-summary-row">
                  <dt>Main condition</dt>
                  <dd>{data.primaryDisease}</dd>
                </div>
              )}
              {data.lastVisit && (
                <div className="patient-summary-row">
                  <dt>Last visit</dt>
                  <dd>{data.lastVisit}</dd>
                </div>
              )}
            </dl>
            {(data.basicInfo ||
              data.lifestyle ||
              data.exerciseRoutine ||
              data.dietType ||
              data.geneticConditions ||
              data.emergencyContact) && (
              <div className="patient-note">
                {data.basicInfo && (
                  <p style={{ margin: 0 }}>
                    {data.basicInfo}
                  </p>
                )}
                {data.lifestyle && (
                  <p style={{ margin: '6px 0 0' }}>
                    <strong>Lifestyle:</strong> {data.lifestyle}
                  </p>
                )}
                {data.exerciseRoutine && (
                  <p style={{ margin: '4px 0 0' }}>
                    <strong>Routine exercise:</strong> {data.exerciseRoutine}
                  </p>
                )}
                {data.dietType && (
                  <p style={{ margin: '4px 0 0' }}>
                    <strong>Eating habits:</strong> {data.dietType}
                  </p>
                )}
                {data.geneticConditions && (
                  <p style={{ margin: '4px 0 0' }}>
                    <strong>Genetic disease:</strong> {data.geneticConditions}
                  </p>
                )}
                {data.emergencyContact && (
                  <p style={{ margin: '6px 0 0' }}>
                    <strong>Emergency contact:</strong>{' '}
                    {data.emergencyContact.name}
                    {data.emergencyContact.relation
                      ? ` (${data.emergencyContact.relation})`
                      : ''}
                    {` • ${data.emergencyContact.phone}`}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Right column – history, prescriptions, etc. */}
      <section className="patient-right">
        <div className="patient-grid">
          <div
            className={`patient-section-card patient-collapsible ${openVisitHistory ? 'patient-collapsible-open' : ''}`}
            onClick={toggleSection('visitHistory')}
            onKeyDown={(e) => e.key === 'Enter' && toggleSection('visitHistory')(e)}
            role="button"
            tabIndex={0}
          >
            <h3 className="patient-section-title">
              Visit History
            </h3>
            {openVisitHistory && (
              <ul className="patient-list">
                {data.visits.map((visit) => (
                  <li
                    key={`${visit.date}-${visit.reason}`}
                    className="patient-list-item"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div className="patient-list-copy">
                        <p className="patient-list-primary">
                          {visit.reason}
                        </p>
                        {visit.notes && (
                          <p className="patient-list-secondary">
                            {visit.notes}
                          </p>
                        )}
                      </div>
                      <span className="patient-list-meta">
                        {visit.date}
                      </span>
                    </div>
                    {visit.patientLatitude != null && visit.patientLongitude != null && (
                      <p className="patient-list-secondary" style={{ margin: 0, fontSize: 12 }}>
                        Patient location at booking:{' '}
                        <a
                          href={`https://www.google.com/maps?q=${visit.patientLatitude},${visit.patientLongitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1e40af', fontWeight: 500 }}
                        >
                          Open in Google Maps
                        </a>
                        {' '}({visit.patientLatitude.toFixed(4)}, {visit.patientLongitude.toFixed(4)})
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className={`patient-section-card patient-collapsible ${openPrescriptions ? 'patient-collapsible-open' : ''}`}
            onClick={toggleSection('prescriptions')}
            onKeyDown={(e) => e.key === 'Enter' && toggleSection('prescriptions')(e)}
            role="button"
            tabIndex={0}
          >
            <h3 className="patient-section-title">
              Prescriptions
            </h3>
            {openPrescriptions && (
              <>
                {(data.prescriptions?.length > 0 || (data.documents?.length ?? 0) > 0) ? (
                  <ul className="patient-list">
                    {data.prescriptions?.map((p) => (
                      <li
                        key={`${p.date}-${p.summary}`}
                        className="patient-list-item">
                        <p className="patient-list-meta">
                          {p.date}
                        </p>
                        <p className="patient-list-primary">
                          {p.summary}
                        </p>
                      </li>
                    ))}
                    {data.documents?.map((doc) => (
                      <li
                        key={doc.id}
                        className="patient-list-item"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                      >
                        <div>
                          <p className="patient-list-primary">
                            {doc.originalName}
                          </p>
                          <span className="patient-list-meta">
                            {new Date(doc.uploadedAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {' · Uploaded prescription'}
                            {doc.source === 'patient' && ' · Uploaded by patient'}
                            {doc.source === 'WHATSAPP' && ' · WhatsApp'}
                          </span>
                          {doc.ocrText && (
                            <p className="patient-list-secondary" style={{ marginTop: 4, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {doc.ocrText}
                            </p>
                          )}
                        </div>
                        <DocumentViewButton
                          patientId={patientId}
                          documentId={doc.id}
                          label="View"
                          fallbackText={doc.ocrText}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="patient-list-secondary" style={{ margin: 0 }}>
                    No prescriptions recorded yet.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="patient-grid">
          <div
            className={`patient-section-card patient-collapsible ${openMedicines ? 'patient-collapsible-open' : ''}`}
            onClick={toggleSection('medicines')}
            onKeyDown={(e) => e.key === 'Enter' && toggleSection('medicines')(e)}
            role="button"
            tabIndex={0}
          >
            <h3 className="patient-section-title">
              Medicines
            </h3>
            {openMedicines && (
              (data.medicines.length > 0 || (data.medicineRequests?.length ?? 0) > 0) ? (
                <ul className="patient-list">
                  {(data.medicineRequests ?? []).map((m) => (
                    <li key={m.id} className="patient-list-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div className="patient-list-copy">
                        <p className="patient-list-primary">{m.medicineName}</p>
                        {(m.dosage || m.notes) && (
                          <p className="patient-list-secondary">
                            {[m.dosage, m.notes].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                        Patient request
                      </span>
                    </li>
                  ))}
                  {data.medicines.map((m) => (
                    <li key={`${m.name}-${m.dosage}`} className="patient-list-item">
                      <div className="patient-list-copy">
                        <p className="patient-list-primary">{m.name}</p>
                        {m.dosage && <p className="patient-list-secondary">{m.dosage}</p>}
                      </div>
                      <PillTag variant={m.worked ? 'worked' : 'notWorked'}>
                        {m.worked ? 'Worked' : 'Not worked'}
                      </PillTag>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="patient-list-secondary" style={{ margin: 0 }}>No medicines recorded.</p>
              )
            )}
          </div>

          <div
            className={`patient-section-card patient-collapsible ${openPharmacyDispensations ? 'patient-collapsible-open' : ''}`}
            onClick={toggleSection('pharmacyDispensations')}
            onKeyDown={(e) => e.key === 'Enter' && toggleSection('pharmacyDispensations')(e)}
            role="button"
            tabIndex={0}
          >
            <h3 className="patient-section-title">
              Pharmacy (Medicine dispensed)
            </h3>
            {openPharmacyDispensations && (
              <>
                {(!data.pharmacyDispensations || data.pharmacyDispensations.length === 0) ? (
                  <p className="patient-list-secondary" style={{ margin: 0 }}>
                    No medicine dispensation recorded yet.
                  </p>
                ) : (
                  <ul className="patient-list">
                    {data.pharmacyDispensations.map((d) => (
                      <li key={d.id} className="patient-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          <span className="patient-list-primary">
                            {new Date(d.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {d.receiptNumber && ` · ${d.receiptNumber}`}
                          </span>
                          <span className="patient-list-meta">
                            {d.paymentStatus} · ₹{d.paidAmount} / ₹{d.totalAmount}
                          </span>
                        </div>
                        <p className="patient-list-secondary" style={{ margin: 0, fontSize: 12 }}>
                          By {d.dispensedBy}. Items: {d.items.map((i) => i.medicineName).join(', ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div
            className={`patient-section-card patient-collapsible ${openTests ? 'patient-collapsible-open' : ''}`}
            onClick={toggleSection('tests')}
            onKeyDown={(e) => e.key === 'Enter' && toggleSection('tests')(e)}
            role="button"
            tabIndex={0}
          >
            <h3 className="patient-section-title">
              Diagnostic Tests
            </h3>
            {openTests && (
              (data.tests.length > 0 || (data.testRequests?.length ?? 0) > 0) ? (
                <ul className="patient-list">
                  {(data.testRequests ?? []).map((tr) => (
                    <li key={tr.id} className="patient-list-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <p className="patient-list-primary">{tr.testName}</p>
                        {tr.notes && <span className="patient-list-meta">{tr.notes}</span>}
                      </div>
                      <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                        Patient request
                      </span>
                    </li>
                  ))}
                  {data.tests.map((t, idx) => (
                    <li
                      key={`test-${idx}-${t.name}`}
                      className="patient-list-item"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                    >
                      <div style={{ flex: 1 }}>
                        <p className="patient-list-primary">{t.name}</p>
                        <span className="patient-list-meta">{t.status}</span>
                      </div>
                      {t.hasReport && t.testId && t.visitId ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              await patientService.openDiagnosticTestReport(patientId, t.visitId!, t.testId!)
                            } catch {
                              alert('Failed to open report')
                            }
                          }}
                          className="ui-button ui-button-primary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                        >
                          View
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#627d98', fontStyle: 'italic' }}>Waiting</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="patient-list-secondary" style={{ margin: 0 }}>No tests recorded.</p>
              )
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

