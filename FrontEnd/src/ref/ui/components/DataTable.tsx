import { DataTable as UniversalTable } from '@/components/table/DataTable';
import type { ReactNode } from 'react'
import { Spinner } from './Spinner.tsx'
import { EmptyState } from './EmptyState.tsx'

export type Column<Row> = {
  key: string
  header: ReactNode
  /** Cell content. Omit to render `String(row[key])`. */
  render?: (row: Row) => ReactNode
  align?: 'start' | 'end' | 'center'
  width?: string
}

export type DataTableProps<Row> = {
  columns: Array<Column<Row>>
  rows: readonly Row[]
  /** Stable identity per row — required, because index keys break selection on re-sort. */
  rowKey: (row: Row) => string
  loading?: boolean
  error?: Error | undefined
  emptyMessage?: string
  selectedKey?: string | undefined
  onRowClick?: (row: Row) => void
}

/**
 * The table every console needs. Replaces the per-page innerHTML string builders, which
 * is also what removes the need for the hand-rolled HTML escaper each page carried:
 * React escapes cell values, so a bank name containing `&` or `<` can no longer break
 * the markup or inject anything.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyMessage = 'Nothing to show.',
  selectedKey,
  onRowClick,
}: DataTableProps<Row>) {
  if (error) {
    return <EmptyState tone="error" title="Could not load this list" detail={error.message} />
  }
  if (loading) {
    return (
      <div className="slc-table__status">
        <Spinner />
      </div>
    )
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} />
  }

  const interactive = Boolean(onRowClick)

  return (
    <div className="slc-table__scroll">
      <UniversalTable className="slc-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined} data-align={column.align}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            return (
              <tr
                key={key}
                className={key === selectedKey ? 'is-selected' : undefined}
                aria-selected={selectedKey !== undefined ? key === selectedKey : undefined}
                // Rows are reachable and activatable by keyboard when they are clickable;
                // a click handler on a <tr> alone is invisible to keyboard and screen-reader users.
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick?.(row)
                        }
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td key={column.key} data-align={column.align}>
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </UniversalTable>
    </div>
  )
}
