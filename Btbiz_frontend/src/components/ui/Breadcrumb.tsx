import type { FC } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export const Breadcrumb: FC<BreadcrumbProps> = ({ items, className = '' }) => {
  if (items.length === 0) return null

  return (
    <nav className={`ui-breadcrumb ${className}`.trim()} aria-label="Breadcrumb">
      <ol className="ui-breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isCurrent = isLast || !item.href

          return (
            <li key={`${item.label}-${index}`} className="ui-breadcrumb-item">
              {index > 0 && (
                <span className="ui-breadcrumb-separator" aria-hidden="true">
                  /
                </span>
              )}
              {isCurrent ? (
                <span className="ui-breadcrumb-current" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="ui-breadcrumb-link">
                  {item.label}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
