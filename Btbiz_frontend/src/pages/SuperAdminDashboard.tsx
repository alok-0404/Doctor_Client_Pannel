import { useMemo, useState, useEffect } from 'react'

import { Header } from '../components/Header'
import { Card } from '../components/ui/Card'
import { authStorage } from '../utils/authStorage'
import { authService, type SuperAdminListItem, type SuperAdminOverview } from '../services/api'

type CardKey = 'doctors' | 'assistants' | 'labAssistants' | 'pharmacies' | 'labs' | 'diagnostics' | 'catalog'

const cardTitleMap: Record<CardKey, string> = {
  doctors: 'Doctors',
  assistants: 'Assistants',
  labAssistants: 'Lab Assistants',
  pharmacies: 'Pharmacies',
  labs: 'Labs',
  diagnostics: 'Diagnostics',
  catalog: 'Quick Add (frontend only)'
}

export const SuperAdminDashboard = () => {
  const name = authStorage.getName() ?? 'Super Admin'
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openCard, setOpenCard] = useState<CardKey | null>(null)

  // Frontend-only quick-add catalog (static, no backend save).
  const [newLab, setNewLab] = useState('')
  const [newDiagnosis, setNewDiagnosis] = useState('')
  const [newMedical, setNewMedical] = useState('')
  const [labsCatalog, setLabsCatalog] = useState<string[]>([])
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<string[]>([])
  const [medicalCatalog, setMedicalCatalog] = useState<string[]>([])

  const addCatalogItem = (type: 'lab' | 'diagnosis' | 'medical') => {
    if (type === 'lab') {
      const v = newLab.trim()
      if (!v) return
      setLabsCatalog((prev) => [v, ...prev])
      setNewLab('')
      return
    }
    if (type === 'diagnosis') {
      const v = newDiagnosis.trim()
      if (!v) return
      setDiagnosisCatalog((prev) => [v, ...prev])
      setNewDiagnosis('')
      return
    }
    const v = newMedical.trim()
    if (!v) return
    setMedicalCatalog((prev) => [v, ...prev])
    setNewMedical('')
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await authService.getSuperAdminOverview()
        setOverview(data)
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? 'Unable to load super admin dashboard data.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const summaryCards = useMemo(() => {
    if (!overview) return []
    return [
      { key: 'doctors' as const, count: overview.summary.doctors },
      { key: 'assistants' as const, count: overview.summary.assistants },
      { key: 'labAssistants' as const, count: overview.summary.labAssistants },
      { key: 'pharmacies' as const, count: overview.summary.pharmacies },
      { key: 'labs' as const, count: overview.summary.labs },
      { key: 'diagnostics' as const, count: overview.summary.diagnostics },
      { key: 'catalog' as const, count: labsCatalog.length + diagnosisCatalog.length + medicalCatalog.length }
    ]
  }, [overview, labsCatalog.length, diagnosisCatalog.length, medicalCatalog.length])

  const renderList = (items: SuperAdminListItem[]) => {
    if (items.length === 0) {
      return <p className="dashboard-body">No records found.</p>
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Name</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Email</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Phone</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{i.name}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{i.email}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{i.phone}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', color: i.status ? '#2e7d32' : '#b91c1c' }}>
                  {i.status ? 'Active' : 'Inactive'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderCardContent = () => {
    if (!overview || !openCard) return null
    if (openCard === 'doctors') return renderList(overview.lists.doctors)
    if (openCard === 'assistants') return renderList(overview.lists.assistants)
    if (openCard === 'labAssistants') return renderList(overview.lists.labAssistants)
    if (openCard === 'pharmacies') return renderList(overview.lists.pharmacies)
    if (openCard === 'labs') return renderList(overview.lists.labs)
    if (openCard === 'diagnostics') {
      return <p className="dashboard-body">Total diagnostics records in system: <strong>{overview.summary.diagnostics}</strong></p>
    }
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <p className="dashboard-body"><strong>Labs:</strong> {labsCatalog.join(', ') || '—'}</p>
          <p className="dashboard-body"><strong>Diagnosis:</strong> {diagnosisCatalog.join(', ') || '—'}</p>
          <p className="dashboard-body"><strong>Medical:</strong> {medicalCatalog.join(', ') || '—'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header clinicName="Super Admin Dashboard" doctorName={name} />
      <main className="dashboard-main">
        <section className="dashboard-left" style={{ width: '100%' }}>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Overview</p>
            <h2 className="dashboard-heading">Simple card-based control panel</h2>
            <p className="dashboard-body">Click any card to open details. Interface intentionally minimal to avoid confusion.</p>
          </Card>

          {loading && <p className="dashboard-body" style={{ marginTop: 12 }}>Loading data…</p>}
          {error && <p className="dashboard-body" style={{ marginTop: 12, color: '#b91c1c' }}>{error}</p>}

          {!loading && !error && (
            <>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
                {summaryCards.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setOpenCard(c.key)}
                    style={{
                      textAlign: 'left',
                      border: openCard === c.key ? '2px solid #1e40af' : '1px solid #dbeafe',
                      borderRadius: 12,
                      background: '#fff',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      minWidth: 170,
                      flex: '0 0 auto'
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{cardTitleMap[c.key]}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{c.count}</div>
                  </button>
                ))}
              </div>
              {openCard && (
                <Card className="dashboard-overview-card" style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <p className="dashboard-kicker" style={{ marginBottom: 0 }}>{cardTitleMap[openCard]}</p>
                    {openCard === 'catalog' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={newLab}
                            onChange={(e) => setNewLab(e.target.value)}
                            placeholder="Add lab"
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 150 }}
                          />
                          <button type="button" className="public-cta" style={{ padding: '8px 12px' }} onClick={() => addCatalogItem('lab')}>Add</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={newDiagnosis}
                            onChange={(e) => setNewDiagnosis(e.target.value)}
                            placeholder="Add diagnosis"
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 150 }}
                          />
                          <button type="button" className="public-cta" style={{ padding: '8px 12px' }} onClick={() => addCatalogItem('diagnosis')}>Add</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={newMedical}
                            onChange={(e) => setNewMedical(e.target.value)}
                            placeholder="Add medical"
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 150 }}
                          />
                          <button type="button" className="public-cta" style={{ padding: '8px 12px' }} onClick={() => addCatalogItem('medical')}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 12 }}>
                  {renderCardContent()}
                  </div>
                </Card>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

