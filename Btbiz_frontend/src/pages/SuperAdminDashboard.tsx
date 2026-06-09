import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'

import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { StatCard } from '../components/ui/StatCard'
import { LabIcon, PharmacyIcon, UserIcon } from '../components/ui/icons'
import { authStorage } from '../utils/authStorage'
import {
  authService,
  type SuperAdminListItem,
  type SuperAdminOverview,
  type SuperAdminTenant,
} from '../services/api'

type CardKey = 'doctors' | 'assistants' | 'labAssistants' | 'pharmacies' | 'labs' | 'diagnostics'

const CARD_KEYS: CardKey[] = [
  'doctors',
  'assistants',
  'labAssistants',
  'pharmacies',
  'labs',
  'diagnostics',
]
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
    <td className="super-admin-td-actions">
      <div className="super-admin-row-actions">
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
      return (
        <EmptyState
          className="super-admin-empty-state"
          icon={<UserIcon size={22} />}
          title="No records yet"
          message="New staff accounts will appear in this list."
        />
      )
    }

    const columns =
      openCard === 'doctors'
        ? [
            { label: 'Name' },
            { label: 'Email' },
            { label: 'Phone' },
            { label: 'Status' },
            { label: 'Approval' },
            { label: 'Action', align: 'center' as const },
          ]
        : [
            { label: 'Name' },
            { label: 'Email' },
            { label: 'Phone' },
            { label: 'Status' },
          ]

    return (
      <DataTable
        className="super-admin-data-table"
        columns={columns}
        stickyHeader={items.length > 5}
      >
        {items.map((i) => (
          <tr key={i.id}>
            <td>{i.name}</td>
            <td>{i.email}</td>
            <td>{i.phone}</td>
            <td className={i.status ? 'super-admin-td-status super-admin-td-status--active' : 'super-admin-td-status super-admin-td-status--inactive'}>
              {i.status ? 'Active' : 'Inactive'}
            </td>
            {openCard === 'doctors' && (
              <>
                <td
                  className={
                    i.approvalStatus === 'APPROVED'
                      ? 'super-admin-td-status super-admin-td-status--active'
                      : i.approvalStatus === 'REJECTED'
                        ? 'super-admin-td-status super-admin-td-status--inactive'
                        : 'super-admin-td-status super-admin-td-status--pending'
                  }
                >
                  {i.approvalStatus ?? 'APPROVED'}
                </td>
                <td className="super-admin-td-actions">
                  <div className="super-admin-row-actions">
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
      </DataTable>
    )
  }

  const renderTenantList = (tenants: SuperAdminTenant[]) => {
    if (tenants.length === 0) {
      return (
        <EmptyState
          className="super-admin-empty-state"
          icon={openCard === 'pharmacies' ? <PharmacyIcon size={22} /> : <LabIcon size={22} />}
          title={`No ${openCard === 'pharmacies' ? 'pharmacies' : 'labs'} yet`}
          message={`Use Add ${openCard === 'pharmacies' ? 'pharmacy' : 'lab'} above to onboard a new tenant.`}
        />
      )
    }

    return (
      <DataTable
        className="super-admin-data-table"
        columns={[
          { label: 'Business' },
          { label: 'Slug' },
          { label: 'Owner login' },
          { label: 'Phone' },
          { label: 'Status' },
          { label: 'Action', align: 'center' },
        ]}
        stickyHeader={tenants.length > 5}
      >
        {tenants.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.slug}</td>
            <td>
              {t.ownerEmail ?? '—'}
              {t.ownerName ? ` (${t.ownerName})` : ''}
            </td>
            <td>{t.phone ?? '—'}</td>
            <td className={t.status === 'ACTIVE' ? 'super-admin-td-status super-admin-td-status--active' : 'super-admin-td-status super-admin-td-status--inactive'}>
              {t.status}
            </td>
            {renderActions(
              () => openEditTenant(t),
              () => handleDeleteTenant(t)
            )}
          </tr>
        ))}
      </DataTable>
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
    <AppLayout
      showSidebar
      header={<Header clinicName="Super Admin Dashboard" doctorName={name} />}
      breadcrumb={(
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Super Admin' },
          ]}
        />
      )}
    >
      <main className="dashboard-main super-admin-dashboard-main">
        <section className="super-admin-dashboard-section">
          <PageHeader
            className="super-admin-page-header"
            title="Super Admin"
            subtitle="Add pharmacy and lab tenants, approve doctors, and manage staff. Fill shop address (city + pincode) so patients see km distance — use Fix km distance after adding shops."
          />

          {!!overview && overview.summary.pendingDoctorApprovals > 0 && (
            <Card className="dashboard-overview-card super-admin-alert-card">
              <p className="super-admin-alert-copy">
                {overview.summary.pendingDoctorApprovals} doctor approval request
                {overview.summary.pendingDoctorApprovals > 1 ? 's are' : ' is'} pending.
                Open <strong>Doctors</strong> below to approve or reject.
              </p>
            </Card>
          )}

          <div className="super-admin-stats">
            {CARD_KEYS.map((key) => {
              const card = summaryCards.find((c) => c.key === key)
              const isActive = openCard === key
              return (
                <StatCard
                  key={key}
                  className={`super-admin-stat-card${isActive ? ' super-admin-stat-card--active' : ''}`}
                  title={cardTitleMap[key]}
                  value={loading ? <Skeleton width={48} height={30} /> : (card?.count ?? '—')}
                  trend={
                    key === 'doctors' && overview && overview.summary.pendingDoctorApprovals > 0
                      ? {
                          label: `${overview.summary.pendingDoctorApprovals} pending approval`,
                          direction: 'neutral',
                        }
                      : undefined
                  }
                  disabled={loading}
                  onClick={() => {
                    setOpenCard(key)
                    resetFormState()
                  }}
                />
              )
            })}
          </div>

          {error && (
            <p className="dashboard-body super-admin-error-copy">{error}</p>
          )}

          {openCard && (
            <Card className="dashboard-overview-card super-admin-panel-card">
              <div className="super-admin-panel-header">
                <p className="dashboard-kicker super-admin-panel-kicker">{cardTitleMap[openCard]}</p>
                {canAddPartner && !showForm && (
                  <div className="super-admin-panel-actions">
                    <button
                      type="button"
                      className="ui-button ui-button-primary ui-button-sm"
                      onClick={openCreateForm}
                    >
                      {openCard === 'pharmacies' ? 'Add pharmacy' : 'Add lab'}
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary ui-button-sm"
                      disabled={geocoding}
                      onClick={() => void handleGeocodePartners()}
                    >
                      {geocoding ? 'Updating map…' : 'Fix km distance (save map pins)'}
                    </button>
                  </div>
                )}
              </div>

              {showForm && canAddPartner && renderPartnerForm()}

              <div className="super-admin-panel-body">
                {loading || geocoding ? (
                  <div className="super-admin-skeleton-stack" aria-busy="true" aria-label="Loading records">
                    <Skeleton lines={2} />
                    <Skeleton variant="rect" height={220} />
                  </div>
                ) : (
                  renderCardContent()
                )}
              </div>
            </Card>
          )}
        </section>
      </main>
    </AppLayout>
  )
}
