import type { FC, ReactNode } from 'react'

export interface DataTableColumn {
  label: string
  align?: 'left' | 'center' | 'right'
  className?: string
}

interface DataTableProps {
  columns: DataTableColumn[]
  children: ReactNode
  caption?: string
  className?: string
  stickyHeader?: boolean
}

export const DataTable: FC<DataTableProps> = ({
  columns,
  children,
  caption,
  className = '',
  stickyHeader = false,
}) => {
  return (
    <div className={`ui-data-table-wrap ${className}`.trim()}>
      <table className={`ui-data-table${stickyHeader ? ' ui-data-table--sticky-header' : ''}`}>
        {caption ? <caption className="ui-data-table-caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                className={`ui-data-table-th ui-data-table-th--${column.align ?? 'left'} ${column.className ?? ''}`.trim()}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
