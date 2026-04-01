import { useEffect, useState } from 'react'
import { Header } from '../components/Header'
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
    const digits = mobileSearch.replace(/\D/g, '')
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
        if (!r.medicineName.trim() || Number.isNaN(mrp) || mrp < 0) return null
        return {
          medicineName: r.medicineName.trim(),
          mrp,
          discount: discount >= 0 ? discount : 0,
          quantity: quantity >= 1 ? quantity : 1,
        }
      })
      .filter(Boolean) as Array<{ medicineName: string; mrp: number; discount?: number; quantity?: number }>
  }

  const items = getItems()
  const subtotal = items.reduce((s, it) => s + it.mrp * (it.quantity ?? 1), 0)
  const totalDiscount = items.reduce((s, it) => s + (it.discount ?? 0), 0)
  const totalAmount = Math.max(0, subtotal - totalDiscount)

  const handleCreateDispensation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient?.id || items.length === 0) return
    setCreateError(null)
    setCreateLoading(true)
    try {
      const res = await pharmacyService.createDispensation(patient.id, items)
      setCurrentDispensationId(res.id)
      setPaymentAmount(String(res.totalAmount))
      setRows([{ id: String(Date.now()), medicineName: '', mrp: '', discount: '0', quantity: '1' }])
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setCreateError(ax?.response?.data?.message ?? 'Failed to save. Please try again.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleMarkPayment = async () => {
    if (!currentDispensationId) return
    const amount = paymentAmount.trim() ? parseFloat(paymentAmount) : 0
    if (Number.isNaN(amount) || amount < 0) return
    setPaymentLoading(true)
    try {
      await pharmacyService.recordPayment(currentDispensationId, amount)
      setPaymentAmount('')
      setReceiptData(null)
      const receipt = await pharmacyService.getReceipt(currentDispensationId)
      setReceiptData(receipt)
      setShowReceipt(true)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      alert(ax?.response?.data?.message ?? 'Failed to record payment.')
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
      alert(ax?.response?.data?.message ?? 'Failed to load receipt.')
    }
  }

  const startNewBill = () => {
    setCurrentDispensationId(null)
    setPaymentAmount('')
    setReceiptData(null)
    setShowReceipt(false)
  }

  const loadIncomingRequests = async () => {
    setRequestsLoading(true)
    try {
      const list = await orderService.getMedicineRequests()
      setIncomingRequests(list.filter((r) => r.paymentStatus !== 'PAID'))
    } finally {
      setRequestsLoading(false)
    }
  }

  useEffect(() => {
    void loadIncomingRequests()
  }, [])

  const handleQuickUpdateRequest = async (
    requestId: string,
    patch: Partial<{ status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'; paymentStatus: 'PENDING' | 'PAID' }>
  ) => {
    await orderService.updateMedicineRequest(requestId, patch)
    await loadIncomingRequests()
  }

  return (
    <div className="app-shell">
      <Header doctorName={name} />
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
                  gap: 10,
                  maxHeight: incomingRequests.length > 5 ? 420 : undefined,
                  overflowY: incomingRequests.length > 5 ? 'auto' : undefined,
                  paddingRight: incomingRequests.length > 5 ? 6 : undefined,
                }}
              >
                {incomingRequests.map((r) => (
                  <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{r.patientName} ({r.patientMobile})</p>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>
                      {r.medicineName}
                      {r.dosage ? ` · ${r.dosage}` : ''}
                      {r.quantity ? ` · Qty ${r.quantity}` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                      {r.serviceType === 'HOME_DELIVERY' ? 'Home delivery' : 'Pickup'} · {r.paymentMode} · {r.paymentStatus} · {r.status}
                      {r.expectedFulfillmentMinutes ? ` · Need in ${r.expectedFulfillmentMinutes} min` : ''}
                    </p>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateRequest(r.id, { status: 'ACCEPTED' })}>
                        Accept
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateRequest(r.id, { status: 'COMPLETED' })}>
                        Ready
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleQuickUpdateRequest(r.id, { paymentStatus: 'PAID' })}>
                        Mark paid
                      </Button>
                    </div>
                  </div>
                ))}
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
                onChange={(e) => setMobileSearch(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                type="tel"
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
            <>
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
                        onClick={() => void patientService.openDocument(patient.id, history.documents[0].id)}
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
                    Enter medicine name, MRP, discount (₹) and quantity. Amount = (MRP × Qty) − Discount per row.
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
                      />
                      <Button type="button" onClick={handleMarkPayment} disabled={paymentLoading}>
                        {paymentLoading ? 'Saving…' : 'Mark as paid'}
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
            </>
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
    </div>
  )
}
