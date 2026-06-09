import type { FC, ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: ReactNode
  actions?: ReactNode
  className?: string
}

export const PageHeader: FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  actions,
  className = '',
}) => {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      {breadcrumb ? <div className="ui-page-header-breadcrumb">{breadcrumb}</div> : null}
      <div className="ui-page-header-row">
        <div className="ui-page-header-copy">
          <h1 className="ui-page-header-title">{title}</h1>
          {subtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
      </div>
    </header>
  )
}
