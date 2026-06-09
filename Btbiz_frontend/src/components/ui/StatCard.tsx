import type { FC, KeyboardEvent, ReactNode } from 'react'

export interface StatCardTrend {
  label: string
  direction?: 'up' | 'down' | 'neutral'
}

interface StatCardProps {
  title: string
  value: ReactNode
  icon?: ReactNode
  trend?: StatCardTrend
  className?: string
  onClick?: () => void
  disabled?: boolean
}

export const StatCard: FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  className = '',
  onClick,
  disabled = false,
}) => {
  const interactive = Boolean(onClick)
  const trendClass = trend?.direction
    ? ` ui-stat-card-trend--${trend.direction}`
    : ''

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive || disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <section
      className={`ui-stat-card${interactive ? ' ui-stat-card--interactive' : ''} ${className}`.trim()}
      onClick={interactive && !disabled ? onClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
    >
      <div className="ui-stat-card-header">
        <p className="ui-stat-card-title">{title}</p>
        {icon ? <span className="ui-stat-card-icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <p className="ui-stat-card-value">{value}</p>
      {trend ? (
        <p className={`ui-stat-card-trend${trendClass}`.trim()}>
          {trend.direction === 'up' && <span className="ui-stat-card-trend-arrow" aria-hidden="true">↑</span>}
          {trend.direction === 'down' && <span className="ui-stat-card-trend-arrow" aria-hidden="true">↓</span>}
          {trend.label}
        </p>
      ) : null}
    </section>
  )
}
