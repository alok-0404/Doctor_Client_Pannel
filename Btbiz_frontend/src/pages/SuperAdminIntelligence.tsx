import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import {
  BellIcon,
  CalendarIcon,
  LabIcon,
  PharmacyIcon,
  UserIcon,
} from '../components/ui/icons'
import {
  authService,
  type IntelligencePeriod,
  type IntelligenceSummary,
} from '../services/api'
import { authStorage } from '../utils/authStorage'

const PERIOD_OPTIONS: { key: IntelligencePeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]

const KPI_META = [
  { key: 'appointments' as const, title: 'Appointments', icon: <CalendarIcon size={20} /> },
  { key: 'logins' as const, title: 'User logins', icon: <UserIcon size={20} /> },
  { key: 'labOrders' as const, title: 'Lab orders', icon: <LabIcon size={20} /> },
  { key: 'pharmacyOrders' as const, title: 'Pharmacy orders', icon: <PharmacyIcon size={20} /> },
  { key: 'payments' as const, title: 'Payments marked paid', icon: <BellIcon size={20} /> },
  { key: 'errors' as const, title: 'API errors', icon: <BellIcon size={20} /> },
]

const CHART_LINES = [
  { key: 'appointments', name: 'Appointments', color: '#0e8f7e' },
  { key: 'labOrders', name: 'Lab orders', color: '#2563eb' },
  { key: 'pharmacyOrders', name: 'Pharmacy', color: '#7c3aed' },
  { key: 'payments', name: 'Payments', color: '#d97706' },
  { key: 'logins', name: 'Logins', color: '#64748b' },
  { key: 'apiErrors', name: 'API errors', color: '#dc2626' },
] as const

function healthBadge(score: number | null): { label: string; className: string } {
  if (score == null) return { label: 'Pending data', className: '' }
  if (score >= 80) return { label: 'Healthy', className: ' super-admin-intelligence-health-badge--ok' }
  if (score >= 60) return { label: 'Fair', className: ' super-admin-intelligence-health-badge--warn' }
  return { label: 'Needs attention', className: ' super-admin-intelligence-health-badge--bad' }
}

function TrendsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="super-admin-intelligence-tooltip">
      <p className="super-admin-intelligence-tooltip-label">{label}</p>
      <ul>
        {payload.map((entry) => (
          <li key={entry.name}>
            <span style={{ background: entry.color }} />
            {entry.name}: <strong>{entry.value ?? 0}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const SuperAdminIntelligence = () => {
  const name = authStorage.getName() ?? 'Super Admin'
  const [period, setPeriod] = useState<IntelligencePeriod>('7d')
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async (selected: IntelligencePeriod) => {
    try {
      setLoading(true)
      setError(null)
      const data = await authService.getIntelligenceSummary(selected)
      setSummary(data)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to load intelligence summary.'
      setError(msg)
      setSummary(null)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary(period)
  }, [period, loadSummary])

  const kpis = summary?.kpis
  const score = summary?.healthScore ?? null
  const badge = healthBadge(loading ? null : score)
  const trendData = useMemo(() => summary?.trends ?? [], [summary])
  const hasTrendActivity = trendData.some(
    (p) =>
      p.appointments + p.labOrders + p.pharmacyOrders + p.payments + p.logins + p.apiErrors > 0
  )

  const kpiValue = (key: (typeof KPI_META)[number]['key']) => {
    if (loading) return <Skeleton width={48} height={30} />
    if (!kpis) return '—'
    if (key === 'errors') return kpis.apiErrors
    return kpis[key]
  }

  const trendSubtitle =
    period === 'today'
      ? 'Hourly activity for today (UTC buckets).'
      : period === '7d'
        ? 'Daily activity for the last 7 days.'
        : 'Daily activity for the last 30 days.'

  return (
    <AppLayout
      showSidebar
      header={<Header clinicName="Intelligence Dashboard" doctorName={name} />}
      breadcrumb={(
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Super Admin', href: '/super-admin' },
            { label: 'Intelligence' },
          ]}
        />
      )}
    >
      <main className="dashboard-main super-admin-intelligence-main">
        <section className="super-admin-intelligence-section">
          <PageHeader
            className="super-admin-page-header"
            title="Intelligence"
            subtitle="Platform health and usage from live clinic data and analytics events."
          />

          <div className="super-admin-intelligence-toolbar">
            <div
              className="super-admin-intelligence-period"
              role="tablist"
              aria-label="Time period"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={period === opt.key}
                  className={`super-admin-intelligence-period-btn${
                    period === opt.key ? ' super-admin-intelligence-period-btn--active' : ''
                  }`}
                  onClick={() => setPeriod(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ui-button ui-button-secondary ui-button-sm"
              disabled={loading}
              onClick={() => void loadSummary(period)}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {error ? (
            <p className="dashboard-body super-admin-error-copy">{error}</p>
          ) : null}

          <Card className="dashboard-overview-card super-admin-intelligence-health-card">
            <div className="super-admin-intelligence-health-inner">
              <div>
                <p className="dashboard-kicker">Health score</p>
                <p className="super-admin-intelligence-health-value">
                  {loading ? <Skeleton width={64} height={40} /> : (score ?? '—')}
                </p>
                <p className="dashboard-body super-admin-intelligence-health-hint">
                  Score from activity vs API errors and failed logins in the selected period.
                </p>
              </div>
              <span
                className={`super-admin-intelligence-health-badge${badge.className}`}
                aria-hidden="true"
              >
                {badge.label}
              </span>
            </div>
          </Card>

          <p className="dashboard-kicker super-admin-intelligence-kpi-label">Key metrics</p>
          <div className="super-admin-intelligence-stats">
            {KPI_META.map((kpi) => (
              <StatCard
                key={kpi.key}
                className="super-admin-stat-card super-admin-intelligence-stat-card"
                title={kpi.title}
                value={kpiValue(kpi.key)}
                icon={kpi.icon}
                trend={
                  loading
                    ? undefined
                    : {
                        label: period === 'today' ? 'Today' : period === '7d' ? 'Last 7 days' : 'Last 30 days',
                        direction: 'neutral',
                      }
                }
              />
            ))}
          </div>

          <Card className="dashboard-overview-card super-admin-intelligence-panel super-admin-intelligence-trends-card">
            <p className="dashboard-kicker">Trends</p>
            <h2 className="dashboard-heading">Activity over time</h2>
            <p className="dashboard-body super-admin-intelligence-panel-copy">{trendSubtitle}</p>

            {loading ? (
              <div className="super-admin-intelligence-chart-skeleton" aria-busy="true">
                <Skeleton variant="rect" height={260} />
              </div>
            ) : !hasTrendActivity ? (
              <p className="dashboard-body super-admin-intelligence-panel-copy">
                No activity in this period yet. Bookings, orders, logins, and errors will appear here as they happen.
              </p>
            ) : (
              <div className="super-admin-intelligence-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.35)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      interval={period === '30d' ? 3 : period === 'today' ? 2 : 0}
                      dy={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip content={<TrendsTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Legend
                      verticalAlign="bottom"
                      height={40}
                      iconType="circle"
                      wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
                    />
                    {CHART_LINES.map((line) => (
                      <Line
                        key={line.key}
                        type="monotone"
                        dataKey={line.key}
                        name={line.name}
                        stroke={line.color}
                        strokeWidth={2}
                        dot={period === '30d' ? false : { r: 3, strokeWidth: 2, fill: '#fff' }}
                        activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="dashboard-overview-card super-admin-intelligence-panel">
            <p className="dashboard-kicker">AI insights</p>
            <h2 className="dashboard-heading">Recommendations</h2>
            <p className="dashboard-body super-admin-intelligence-panel-copy">
              Phase 3: AI will read historical KPIs and suggest improvements. No automatic changes — review only.
            </p>
            <ul className="super-admin-intelligence-insight-list">
              <li className="super-admin-intelligence-insight-item super-admin-intelligence-insight-item--muted">
                Insights will show here after enough analytics history is collected.
              </li>
            </ul>
          </Card>
        </section>
      </main>
    </AppLayout>
  )
}
