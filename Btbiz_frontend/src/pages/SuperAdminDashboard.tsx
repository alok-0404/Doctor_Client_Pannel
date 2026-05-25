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

type EditTarget =
  | { kind: 'tenant'; tenant: SuperAdminTenant }
  | { kind: 'legacy'; item: SuperAdminListItem }
  | null

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
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [form, setForm] = useState(emptyPartnerForm)
  const [saving, setSaving] = useState(false)

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
    setEditTarget({ kind: 'tenant', tenant })
    setForm({
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.ownerEmail ?? '',
      password: '',
      phone: tenant.phone ?? '',
      statusActive: tenant.status === 'ACTIVE',
    })
    setShowForm(true)
  }

  const openEditLegacy = (item: SuperAdminListItem) => {
    setEditTarget({ kind: 'legacy', item })
    setForm({
      name: item.name,
      slug: '',
      email: item.email,
      password: '',
      phone: item.phone,
      statusActive: item.status,
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
        if (editTarget?.kind === 'tenant' && editTarget.tenant.id === tenant.id) {
          resetFormState()
        }
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to delete tenant.')
      }
    })
  }

  const handleDeleteLegacy = (item: SuperAdminListItem) => {
    confirmCenterToast('Are you sure you want to delete this registration?', async () => {
      try {
        await authService.deleteSuperAdminLegacyPartner(item.id)
        toast.success(`${item.name} deleted successfully.`)
        if (editTarget?.kind === 'legacy' && editTarget.item.id === item.id) {
          resetFormState()
        }
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to delete registration.')
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

      if (editTarget?.kind === 'tenant') {
        await authService.updateSuperAdminTenant(editTarget.tenant.id, {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password.trim() || undefined,
          status: form.statusActive ? 'ACTIVE' : 'SUSPENDED',
        })
        toast.success('Tenant updated successfully.')
      } else if (editTarget?.kind === 'legacy') {
        await authService.updateSuperAdminLegacyPartner(editTarget.item.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password.trim() || undefined,
          status: form.statusActive,
        })
        toast.success('Registration updated successfully.')
      } else {
        await authService.createSuperAdminTenant({
          tenantType,
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
        })
        toast.success(`${tenantType === 'PHARMACY' ? 'Pharmacy' : 'Lab'} created successfully. Owner can login now.`)
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
    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
      <button
        type="button"
        className="ui-button ui-button-edit ui-button-sm"
        style={{ marginRight: 6 }}
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

  const renderLegacyPartnerList = (items: SuperAdminListItem[]) => {
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
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Action</th>
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
                {renderActions(
                  () => openEditLegacy(i),
                  () => handleDeleteLegacy(i)
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
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Action</th>
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
    const showSlug = !editTarget || editTarget.kind === 'tenant'

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
        {showSlug && (
          <input
            placeholder="URL slug (optional, e.g. medplus)"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
          />
        )}
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
    if (openCard === 'pharmacies') {
      const legacy = overview.lists.pharmacies.filter(
        (p) => !pharmacyTenants.some((t) => t.ownerEmail === p.email)
      )
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          {renderTenantList(pharmacyTenants)}
          {legacy.length > 0 && (
            <div>
              <p className="dashboard-body" style={{ marginBottom: 8 }}>
                <strong>Older registrations</strong> (no tenant record yet — self-signup):
              </p>
              {renderLegacyPartnerList(legacy)}
            </div>
          )}
        </div>
      )
    }
    if (openCard === 'labs') {
      const legacy = overview.lists.labs.filter(
        (l) => !labTenants.some((t) => t.ownerEmail === l.email)
      )
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          {renderTenantList(labTenants)}
          {legacy.length > 0 && (
            <div>
              <p className="dashboard-body" style={{ marginBottom: 8 }}>
                <strong>Older registrations</strong> (no tenant record yet — self-signup):
              </p>
              {renderLegacyPartnerList(legacy)}
            </div>
          )}
        </div>
      )
    }
    return (
      <p className="dashboard-body">
        Total diagnostics records in system: <strong>{overview.summary.diagnostics}</strong>
      </p>
    )
  }

  const canAddPartner = openCard === 'pharmacies' || openCard === 'labs'

  return (
    <div className="app-shell">
      <Header clinicName="Super Admin Dashboard" doctorName={name} />
      <main className="dashboard-main">
        <section className="dashboard-left" style={{ width: '100%' }}>
          <Card className="dashboard-overview-card">
            <p className="dashboard-kicker">Overview</p>
            <h2 className="dashboard-heading">Tenant management</h2>
            <p className="dashboard-body">
              Add pharmacy / lab tenants here. Edit or delete from the Action column. Confirmations appear as center toasts.
            </p>
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
                      <button
                        type="button"
                        className="public-cta"
                        style={{ padding: '8px 14px' }}
                        onClick={openCreateForm}
                      >
                        {openCard === 'pharmacies' ? 'Add Pharmacy' : 'Add Lab'}
                      </button>
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
