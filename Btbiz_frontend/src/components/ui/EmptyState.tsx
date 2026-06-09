import type { FC, ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  message?: string
  className?: string
}

export const EmptyState: FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  className = '',
}) => (
  <div className={`ui-empty-state ${className}`.trim()} role="status">
    {icon ? (
      <span className="ui-empty-state-icon" aria-hidden="true">
        {icon}
      </span>
    ) : null}
    <p className="ui-empty-state-title">{title}</p>
    {message ? <p className="ui-empty-state-message">{message}</p> : null}
  </div>
)
