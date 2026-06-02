import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'

import { Header } from '../components/Header'
import { Card } from '../components/ui/Card'
import { DnaLoader } from '../components/ui/DnaLoader'
import { authStorage } from '../utils/authStorage'
import {
  authService,
  type SuperAdminListItem,
  type SuperAdminOverview,
  type SuperAdminTenant,
} from '../services/api'

type CardKey = 'doctors' | 'assistants' | 'labAssistants' | 'pharmacies' | 'labs' | 'diagnostics'

const cardTitleMap: Record<CardKey, string> = {
  doctors: 'Doctors',
  assistants: 'Assistants',
  labAssistants: 'Lab Assistants',
  pharmacies: 'Pharmacies (Tenants)',
  labs: 'Labs (Tenants)',
  diagnostics: 'Diagnostics',
}

const emptyPartnerForm = () => ({
  name: '',
  slug: '',
  email: '',
  password: '',
  phone: '',
  addressLine1: '',
  addressCity: '',
  addressPincode: '',
  statusActive: true,
})

const confirmCenterToast = (
  message: string,
  onConfirm: () => void | Promise<void>
) => {
  toast(
    ({ closeToast }) => (
      <div style={{ textAlign: 'center', minWidth: 220 }}>
        <p className="medigraph-toast-confirm-message">{message}</p>
        <div className="medigraph-toast-confirm-actions">
          <button
            type="button"
            className="public-cta"
            onClick={() => {
              void (async () => {
                closeToast?.()
                await onConfirm()
              })()
            }}
          >
            Yes, confirm
          </button>
          <button type="button" className="public-cta-secondary" onClick={() => closeToast?.()}>
            Cancel
          </button>
        </div>
      </div>
    ),
    {
      position: 'top-center',
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      closeButton: false,
      className: 'medigraph-toastify-toast medigraph-toastify-confirm',
    }
  )
}

export const SuperAdminDashboard = () => {
  const name = authStorage.getName() ?? 'Super Admin'
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null)
  const [pharmacyTenants, setPharmacyTenants] = useState<SuperAdminTenant[]>([])
  const [labTenants, setLabTenants] = useState<SuperAdminTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openCard, setOpenCard] = useState<CardKey | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<SuperAdminTenant | null>(null)
  const [form, setForm] = useState(emptyPartnerForm)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [data, pharmacies, labs] = await Promise.all([
        authService.getSuperAdminOverview(),
        authService.getSuperAdminTenants('PHARMACY'),
        authService.getSuperAdminTenants('LAB'),
      ])
      setOverview(data)
      setPharmacyTenants(pharmacies)
      setLabTenants(labs)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to load super admin dashboard data.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!overview) return
    const pendingCount = overview.summary.pendingDoctorApprovals ?? 0
    if (pendingCount > 0) {
      toast.info(
        `${pendingCount} doctor approval request${pendingCount > 1 ? 's' : ''} pending.`,
        { autoClose: 6000 }
      )
    }
  }, [overview])

  const resetFormState = () => {
    setShowForm(false)
    setEditTarget(null)
    setForm(emptyPartnerForm())
  }

  const openCreateForm = () => {
    setEditTarget(null)
    setForm(emptyPartnerForm())
    setShowForm(true)
  }

  const openEditTenant = (tenant: SuperAdminTenant) => {
    setEditTarget(tenant)
    setForm({
      ...emptyPartnerForm(),
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.ownerEmail ?? '',
      phone: tenant.phone ?? '',
      statusActive: tenant.status === 'ACTIVE',
    })
    setShowForm(true)
  }

  const summaryCards = useMemo(() => {
    if (!overview) return []
    return [
      { key: 'doctors' as const, count: overview.summary.doctors },
      { key: 'assistants' as const, count: overview.summary.assistants },
      { key: 'labAssistants' as const, count: overview.summary.labAssistants },
      { key: 'pharmacies' as const, count: pharmacyTenants.length || overview.summary.pharmacies },
      { key: 'labs' as const, count: labTenants.length || overview.summary.labs },
      { key: 'diagnostics' as const, count: overview.summary.diagnostics },
    ]
  }, [overview, pharmacyTenants.length, labTenants.length])

  const handleDeleteTenant = (tenant: SuperAdminTenant) => {
    confirmCenterToast('Are you sure you want to delete this tenant?', async () => {
      try {
        await authService.deleteSuperAdminTenant(tenant.id)
        toast.success(`${tenant.name} deleted successfully.`)
        if (editTarget?.id === tenant.id) {
          resetFormState()
        }
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to delete tenant.')
      }
    })
  }

  const handleDoctorApproval = (
    doctor: SuperAdminListItem,
    approvalStatus: 'APPROVED' | 'REJECTED'
  ) => {
    const actionText = approvalStatus === 'APPROVED' ? 'approve' : 'reject'
    confirmCenterToast(`Are you sure you want to ${actionText} ${doctor.name}?`, async () => {
      try {
        await authService.updateDoctorApproval(doctor.id, approvalStatus)
        toast.success(
          approvalStatus === 'APPROVED'
            ? `${doctor.name} approved successfully.`
            : `${doctor.name} rejected successfully.`
        )
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to update doctor approval.')
      }
    })
  }

  const handleSaveForm = async () => {
    if (openCard !== 'pharmacies' && openCard !== 'labs') return

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.warning('Name, email, and phone are required.')
      return
    }

    const isCreate = !editTarget
    if (isCreate && !form.password) {
      toast.warning('Password is required for new tenants.')
      return
    }

    const tenantType = openCard === 'pharmacies' ? 'PHARMACY' : 'LAB'

    try {
      setSaving(true)

      if (editTarget) {
        const address =
          form.addressLine1.trim() || form.addressCity.trim() || form.addressPincode.trim()
            ? {
                line1: form.addressLine1.trim() || undefined,
                city: form.addressCity.trim() || undefined,
                pincode: form.addressPincode.trim() || undefined,
                state: 'Haryana',
              }
            : undefined
        await authService.updateSuperAdminTenant(editTarget.id, {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password.trim() || undefined,
          status: form.statusActive ? 'ACTIVE' : 'SUSPENDED',
          address,
        })
        toast.success('Tenant updated successfully.')
      } else {
        const address =
          form.addressLine1.trim() || form.addressCity.trim() || form.addressPincode.trim()
            ? {
                line1: form.addressLine1.trim() || undefined,
                city: form.addressCity.trim() || undefined,
                pincode: form.addressPincode.trim() || undefined,
                state: 'Haryana',
              }
            : undefined
        const ownerEmail = form.email.trim().toLowerCase()
        const ownerPassword = form.password.trim()
        await authService.createSuperAdminTenant({
          tenantType,
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: ownerEmail,
          password: ownerPassword,
          phone: form.phone.trim(),
          address,
        })
        toast.success(
          `${tenantType === 'PHARMACY' ? 'Pharmacy' : 'Lab'} created. Owner logs in via "Login as ${
            tenantType === 'PHARMACY' ? 'Medicine' : 'Lab Manager'
          }" with email: ${ownerEmail}`,
          { autoClose: 12000 }
        )
      }

      resetFormState()
      await loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const renderActions = (
    onEdit: () => void,
    onDelete: () => void
  ) => (
    <td
      style={{
        padding: '10px 8px',
        borderBottom: '1px solid #f1f5f9',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        width: '1%',
      }}
    >
      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
        <button
          type="button"
          className="ui-button ui-button-edit ui-button-sm"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="ui-button ui-button-danger-outline ui-button-sm"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </td>
  )

  const renderSimpleList = (items: SuperAdminListItem[]) => {
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
              {openCard === 'doctors' && (
                <>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Approval</th>
                  <th
                    style={{
                      padding: '10px 8px',
                      borderBottom: '1px solid #e2e8f0',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      width: '1%',
                    }}
                  >
                    Action
                  </th>
                </>
              )}
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
                {openCard === 'doctors' && (
                  <>
                    <td
                      style={{
                        padding: '10px 8px',
                        borderBottom: '1px solid #f1f5f9',
                        color:
                          i.approvalStatus === 'APPROVED'
                            ? '#2e7d32'
                            : i.approvalStatus === 'REJECTED'
                              ? '#b91c1c'
                              : '#b45309',
                      }}
                    >
                      {i.approvalStatus ?? 'APPROVED'}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        borderBottom: '1px solid #f1f5f9',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                        width: '1%',
                      }}
                    >
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="ui-button ui-button-sm"
                          disabled={i.approvalStatus === 'APPROVED'}
                          onClick={() => handleDoctorApproval(i, 'APPROVED')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ui-button ui-button-danger-outline ui-button-sm"
                          disabled={i.approvalStatus === 'REJECTED'}
                          onClick={() => handleDoctorApproval(i, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderTenantList = (tenants: SuperAdminTenant[]) => {
    if (tenants.length === 0) {
      return (
        <p className="dashboard-body">
          No tenants yet. Use <strong>Add {openCard === 'pharmacies' ? 'Pharmacy' : 'Lab'}</strong> above.
        </p>
      )
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Business</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Slug</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Owner login</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Phone</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
              <th
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid #e2e8f0',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  width: '1%',
                }}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{t.name}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{t.slug}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>
                  {t.ownerEmail ?? '—'}
                  {t.ownerName ? ` (${t.ownerName})` : ''}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{t.phone ?? '—'}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', color: t.status === 'ACTIVE' ? '#2e7d32' : '#b91c1c' }}>
                  {t.status}
                </td>
                {renderActions(
                  () => openEditTenant(t),
                  () => handleDeleteTenant(t)
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderPartnerForm = () => {
    const isEdit = !!editTarget
    return (
      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          display: 'grid',
          gap: 10,
          maxWidth: 480,
        }}
      >
        <p className="dashboard-body" style={{ margin: 0, fontWeight: 600 }}>
          {isEdit ? 'Edit details' : 'Add new tenant'}
        </p>
        <input
          placeholder="Business name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="URL slug (optional, e.g. medplus)"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="Owner email *"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder={isEdit ? 'New password (leave blank to keep)' : 'Owner password *'}
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="Phone *"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="Shop address line (for patient km distance)"
          value={form.addressLine1}
          onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="City (e.g. Gurgaon, Faridabad)"
          value={form.addressCity}
          onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <input
          placeholder="Pincode"
          value={form.addressPincode}
          onChange={(e) => setForm((f) => ({ ...f, addressPincode: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.statusActive}
            onChange={(e) => setForm((f) => ({ ...f, statusActive: e.target.checked }))}
          />
          Active account
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="public-cta"
            disabled={saving}
            onClick={() => void handleSaveForm()}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create tenant'}
          </button>
          <button type="button" className="public-cta-secondary" onClick={resetFormState}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const renderCardContent = () => {
    if (!overview || !openCard) return null
    if (openCard === 'doctors') return renderSimpleList(overview.lists.doctors)
    if (openCard === 'assistants') return renderSimpleList(overview.lists.assistants)
    if (openCard === 'labAssistants') return renderSimpleList(overview.lists.labAssistants)
    if (openCard === 'pharmacies') return renderTenantList(pharmacyTenants)
    if (openCard === 'labs') return renderTenantList(labTenants)
    return (
      <p className="dashboard-body">
        Total diagnostics records in system: <strong>{overview.summary.diagnostics}</strong>
      </p>
    )
  }

  const canAddPartner = openCard === 'pharmacies' || openCard === 'labs'

  const handleGeocodePartners = async () => {
    const kind = openCard === 'pharmacies' ? 'pharmacy' : 'lab'
    try {
      setGeocoding(true)
      const { results } = await authService.geocodeSuperAdminPartners(kind)
      const lines = results.map((r) => `${r.kind}: ${r.updated} updated, ${r.failed} still without map`)
      toast.success(`Map locations saved. ${lines.join('; ')}`)
      await loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update map locations.')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="app-shell">
      <Header clinicName="Super Admin Dashboard" doctorName={name} />
      <main className="dashboard-main">
        <section className="dashboard-left" style={{ width: '100%' }}>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Overview</p>
            <h2 className="dashboard-heading">Tenant management</h2>
            <p className="dashboard-body">
              Add pharmacy / lab tenants here. Fill shop address (city + pincode) so patients see km distance and can choose the nearest one.
              Use “Fix km distance” after adding shops.
            </p>
            {!!overview && overview.summary.pendingDoctorApprovals > 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#9a3412',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Notification: {overview.summary.pendingDoctorApprovals} doctor approval request
                {overview.summary.pendingDoctorApprovals > 1 ? 's are' : ' is'} pending.
                Open <strong>Doctors</strong> card to approve/reject.
              </div>
            )}
          </Card>

          {loading && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <DnaLoader label="Loading data…" />
            </div>
          )}
          {error && <p className="dashboard-body" style={{ marginTop: 12, color: '#b91c1c' }}>{error}</p>}

          {!loading && !error && (
            <>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
                {summaryCards.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setOpenCard(c.key)
                      resetFormState()
                    }}
                    style={{
                      textAlign: 'left',
                      border: openCard === c.key ? '2px solid #1e40af' : '1px solid #dbeafe',
                      borderRadius: 12,
                      background: '#fff',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      minWidth: 170,
                      flex: '0 0 auto',
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
                    {canAddPartner && !showForm && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="public-cta"
                          style={{ padding: '8px 14px' }}
                          onClick={openCreateForm}
                        >
                          {openCard === 'pharmacies' ? 'Add Pharmacy' : 'Add Lab'}
                        </button>
                        <button
                          type="button"
                          className="public-cta-secondary"
                          style={{ padding: '8px 14px' }}
                          disabled={geocoding}
                          onClick={() => void handleGeocodePartners()}
                        >
                          {geocoding ? 'Updating map…' : 'Fix km distance (save map pins)'}
                        </button>
                      </div>
                    )}
                  </div>

                  {showForm && canAddPartner && renderPartnerForm()}

                  <div style={{ marginTop: 12 }}>{renderCardContent()}</div>
                </Card>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
