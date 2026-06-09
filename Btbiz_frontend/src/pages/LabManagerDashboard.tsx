import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { ClinicLocationSetup } from '../components/ClinicLocationSetup'
import { authStorage } from '../utils/authStorage'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { UserIcon } from '../components/ui/icons'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import { TextField } from '../components/ui/TextField'
import { CountryCodePhoneInput } from '../components/CountryCodePhoneInput'
import { authService, type AssistantSummary } from '../services/api'

export const LabManagerDashboard = () => {
  const navigate = useNavigate()
  const name = authStorage.getName() ?? 'Lab Manager'

  const [showAddLabAssistant, setShowAddLabAssistant] = useState(false)
  const [labName, setLabName] = useState('')
  const [labEmail, setLabEmail] = useState('')
  const [labCountryCode, setLabCountryCode] = useState('+91')
  const [labPhoneDigits, setLabPhoneDigits] = useState('')
  const [labPassword, setLabPassword] = useState('')
  const [labLoading, setLabLoading] = useState(false)
  const [labError, setLabError] = useState<string | null>(null)
  const [labSuccess, setLabSuccess] = useState<string | null>(null)
  const [labAssistants, setLabAssistants] = useState<AssistantSummary[]>([])
  const [assistantsLoading, setAssistantsLoading] = useState(true)
  const [labAssistantsOpen, setLabAssistantsOpen] = useState(true)
  const [deletingAssistantId, setDeletingAssistantId] = useState<string | null>(null)

  const loadLabAssistants = async () => {
    try {
      setAssistantsLoading(true)
      const list = await authService.listLabAssistants()
      setLabAssistants(list)
    } catch {
      // ignore
    } finally {
      setAssistantsLoading(false)
    }
  }

  useEffect(() => {
    void loadLabAssistants()
  }, [])

  const handleCreateLabAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    setLabError(null)
    setLabSuccess(null)
    if (!labName || !labEmail || !labPhoneDigits || !labPassword) {
      setLabError('Please fill all fields.')
      return
    }
    if (labPhoneDigits.length < 6) {
      setLabError('Please enter a valid mobile number.')
      return
    }
    try {
      setLabLoading(true)
      const normalizedPhone = `${labCountryCode}${labPhoneDigits}`
      await authService.createLabAssistant({
        name: labName,
        email: labEmail,
        phone: normalizedPhone,
        password: labPassword,
      })
      setLabSuccess('Lab assistant created successfully.')
      setLabName('')
      setLabEmail('')
      setLabPhoneDigits('')
      setLabPassword('')
      await loadLabAssistants()
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        'Unable to create lab assistant. Email/phone may already be used.'
      setLabError(msg)
    } finally {
      setLabLoading(false)
    }
  }

  const handleDeleteLabAssistant = async (assistantId: string) => {
    try {
      setDeletingAssistantId(assistantId)
      await authService.deleteLabAssistant(assistantId)
      setLabSuccess('Lab assistant deleted successfully.')
      await loadLabAssistants()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to delete lab assistant.'
      setLabError(msg)
    } finally {
      setDeletingAssistantId(null)
    }
  }

  return (
    <>
      <AppLayout
        showSidebar
        header={(
          <>
            <Header doctorName={name} />
            <div className="staff-clinic-setup-bar">
              <ClinicLocationSetup />
            </div>
          </>
        )}
        breadcrumb={(
          <Breadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Lab Assistants' },
            ]}
          />
        )}
      >
        <main className="dashboard-main lab-manager-dashboard-main">
          <section className="lab-manager-dashboard-section">
            <PageHeader
              className="lab-manager-page-header"
              title="Lab Assistants"
              subtitle="Manage your lab team, save shop location for patient distance, and open the lab workspace to fulfill test orders."
            />

            <div className="lab-manager-dashboard-stats">
              <StatCard
                title="Lab assistants"
                value={assistantsLoading ? <Skeleton width={40} height={30} /> : labAssistants.length}
              />
              <StatCard
                title="Lab owner"
                value={assistantsLoading ? <Skeleton width={120} height={30} /> : name}
              />
              <StatCard
                title="Lab workspace"
                value={assistantsLoading ? <Skeleton width={72} height={30} /> : 'Ready'}
                trend={{ label: 'Open to search patients & orders', direction: 'neutral' }}
              />
            </div>

            <Card className="dashboard-overview-card lab-manager-overview-card">
              <p className="dashboard-kicker">Lab Manager panel</p>
              <p className="lab-manager-onboard-note">
                Your lab is already registered (Super Admin onboarding). You are logged in as the lab owner — no need to
                register again on the home page.
              </p>
              <p className="dashboard-body">
                Open the lab workspace to search patients, record tests, and handle incoming orders — same as your lab
                assistants. Optionally add assistants below so they can sign in under Lab.
              </p>
              <Button
                type="button"
                className="lab-manager-open-workspace-btn"
                onClick={() => navigate('/lab')}
              >
                Open lab workspace
              </Button>
            </Card>

            <Card className="dashboard-overview-card lab-manager-assistants-card">
              <button
                type="button"
                onClick={() => setLabAssistantsOpen((o) => !o)}
                className="lab-manager-collapsible-header"
              >
                <p className="dashboard-kicker">Lab assistants</p>
                <span
                  className={`lab-manager-collapsible-chevron${
                    labAssistantsOpen ? ' lab-manager-collapsible-chevron--open' : ''
                  }`}
                >
                  ▾
                </span>
              </button>

              {labAssistantsOpen && (
                <>
                  {assistantsLoading ? (
                    <div className="lab-manager-skeleton-stack" aria-busy="true" aria-label="Loading lab assistants">
                      <Skeleton variant="rect" height={56} />
                      <Skeleton variant="rect" height={56} />
                      <Skeleton lines={2} />
                    </div>
                  ) : labAssistants.length === 0 ? (
                    <EmptyState
                      className="lab-manager-empty-state"
                      icon={<UserIcon size={22} />}
                      title="No lab assistants yet"
                      message="You can use the lab workspace yourself, or add assistants for extra staff logins."
                    />
                  ) : (
                    <>
                      <p className="dashboard-body lab-manager-assistant-count">
                        {labAssistants.length} lab assistant{labAssistants.length !== 1 ? 's' : ''} added
                      </p>
                      <DataTable
                        className="lab-manager-data-table"
                        columns={[
                          { label: 'Name' },
                          { label: 'Phone' },
                          { label: 'Added' },
                          { label: 'Action', align: 'center' },
                        ]}
                        stickyHeader={labAssistants.length > 5}
                      >
                        {labAssistants.map((c) => (
                          <tr key={c.id}>
                            <td className="lab-manager-td-name">{c.name}</td>
                            <td className="lab-manager-td-muted">{c.phone}</td>
                            <td className="lab-manager-td-muted">
                              {c.createdAt
                                ? new Date(c.createdAt).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td className="lab-manager-td-actions">
                              <button
                                type="button"
                                className="ui-button ui-button-danger-outline ui-button-sm"
                                disabled={deletingAssistantId === c.id}
                                onClick={() => void handleDeleteLabAssistant(c.id)}
                              >
                                {deletingAssistantId === c.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </DataTable>
                    </>
                  )}

                  {labSuccess && !showAddLabAssistant && (
                    <p className="lab-manager-inline-msg lab-manager-inline-msg--ok">{labSuccess}</p>
                  )}
                  {labError && !showAddLabAssistant && (
                    <p className="lab-manager-inline-msg lab-manager-inline-msg--err">{labError}</p>
                  )}

                  <Button
                    type="button"
                    className="lab-manager-add-btn"
                    onClick={() => {
                      setShowAddLabAssistant(true)
                      setLabError(null)
                      setLabSuccess(null)
                    }}
                  >
                    Add lab assistant
                  </Button>
                </>
              )}
            </Card>
          </section>
        </main>
      </AppLayout>

      {showAddLabAssistant && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h2 className="dialog-title">Add lab assistant</h2>
            <p className="dialog-body">
              Create a lab assistant account. They can search patients by mobile and add diagnostic tests for visits.
            </p>
            <form
              onSubmit={handleCreateLabAssistant}
              className="login-form"
              style={{ marginTop: 12 }}
            >
              <TextField
                id="lab-name"
                label="Full name"
                type="text"
                value={labName}
                onChange={(e) => setLabName(e.target.value)}
              />
              <TextField
                id="lab-email"
                label="Email"
                type="email"
                value={labEmail}
                onChange={(e) => setLabEmail(e.target.value)}
              />
              <CountryCodePhoneInput
                id="lab-phone"
                label="WhatsApp number"
                countryCode={labCountryCode}
                onCountryCodeChange={setLabCountryCode}
                phoneDigits={labPhoneDigits}
                onPhoneDigitsChange={setLabPhoneDigits}
              />
              <TextField
                id="lab-password"
                label="Temporary password"
                type="password"
                value={labPassword}
                onChange={(e) => setLabPassword(e.target.value)}
                canTogglePassword
              />
              {labError && (
                <p className="text-sm" style={{ color: '#c62828', marginTop: 4 }}>
                  {labError}
                </p>
              )}
              {labSuccess && (
                <p className="text-sm" style={{ color: '#2e7d32', marginTop: 4 }}>
                  {labSuccess}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => setShowAddLabAssistant(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="ui-button ui-button-primary"
                  disabled={labLoading}
                >
                  {labLoading ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
