import { DataTable as UniversalTable } from '@/components/table/DataTable';
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { looseMatch } from '@/ref/api-client'

export type FilterOption = { value: string; label: string }

export type FilterDef<Row> = {
  id: string
  ariaLabel: string
  allLabel: string
  options: FilterOption[]
  match: (row: Row, value: string) => boolean
}

export type Col<Row> = {
  header: string
  width: number
  cell: (row: Row) => ReactNode
  className?: string
}

export type TicketPanelProps<Row> = {
  title: string
  searchPlaceholder: string
  searchAriaLabel: string
  rows: readonly Row[]
  columns: Array<Col<Row>>
  filters: Array<FilterDef<Row>>
  rowKey: (row: Row) => string
  selectedKey: string | undefined
  onSelectRow: (row: Row) => void
  exportName: string
  minWidth?: number
  onFiltersCleared: () => void
  onExported: () => void
}

/**
 * One ticket list panel, reproducing legacy/OTTK.html's <section class="panel">: head with
 * title, record count, search, funnel and export buttons; the collapsible filter strip; a
 * table whose <colgroup> fixes every column width; and the foot with its pager.
 *
 * The pager is display-only, exactly as in the original — it renders a single disabled page.
 */
export function TicketPanel<Row extends Record<string, unknown>>({
  title,
  searchPlaceholder,
  searchAriaLabel,
  rows,
  columns,
  filters,
  rowKey,
  selectedKey,
  onSelectRow,
  exportName,
  minWidth,
  onFiltersCleared,
  onExported,
}: TicketPanelProps<Row>) {
  const [search, setSearch] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  const hits = useMemo(() => {
    const query = search.toLowerCase()
    return rows.filter((row) => {
      const hay = Object.values(row).join(' ').toLowerCase()
      if (!hay.includes(query)) return false
      return filters.every((filter) => {
        const value = values[filter.id]
        return !value || filter.match(row, value)
      })
    })
  }, [rows, filters, values, search])

  /** Reads the rendered table, so the CSV matches exactly what is on screen. */
  const exportCsv = () => {
    const table = tableRef.current
    if (!table) return
    const csv = [...table.querySelectorAll('tr')]
      .map((row) =>
        [...row.children]
          .map((cell) => `"${(cell.textContent ?? '').trim().replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `${exportName}-export.csv`
    link.click()
    URL.revokeObjectURL(href)
    onExported()
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="panel-title">{title}</span> <span className="panel-meta">{hits.length} records</span>
        </div>
        <div className="panel-tools">
          <input
            className="search"
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className={filtersOpen ? 'tool filter-btn active' : 'tool filter-btn'}
            title="Filter"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24">
              <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
            </svg>
          </button>
          <button type="button" className="tool export-btn" title="Export CSV" onClick={exportCsv}>
            <svg viewBox="0 0 24 24">
              <path d="M12 2v12l4-4 1.4 1.4L12 17l-5.4-5.6L8 10l3 4V2h1zm-8 17h16v3H4v-3z" />
            </svg>
          </button>
        </div>
      </div>

      <div className={filtersOpen ? 'advanced-filters open' : 'advanced-filters'}>
        <span className="filter-label">Filter by</span>
        {filters.map((filter) => (
          <select
            key={filter.id}
            aria-label={filter.ariaLabel}
            value={values[filter.id] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [filter.id]: event.target.value }))}
          >
            <option value="">{filter.allLabel}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
        <button
          type="button"
          className="filter-reset-btn"
          onClick={() => {
            setSearch('')
            setValues({})
            onFiltersCleared()
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="table-wrap">
        <UniversalTable ref={tableRef} style={minWidth ? { minWidth } : undefined}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.header} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.header}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hits.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className={key === selectedKey ? 'selected' : undefined}
                  onClick={() => onSelectRow(row)}
                >
                  {columns.map((column) => (
                    <td key={column.header} className={column.className}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </UniversalTable>
      </div>

      <div className="panel-foot">
        <span>
          Showing {hits.length} of {rows.length}
        </span>
        <div className="pager">
          <button type="button" disabled>
            ‹
          </button>
          <button type="button">1</button>
          <button type="button" disabled>
            ›
          </button>
        </div>
      </div>
    </section>
  )
}

/** Distinct values of a field, as options — the legacy fillFilterSelect(). */
export function derivedOptions<Row extends Record<string, unknown>>(
  rows: readonly Row[],
  field: keyof Row & string,
  textField?: keyof Row & string,
): FilterOption[] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    const value = row[field]
    if (value === undefined || value === null || value === '') continue
    const key = String(value)
    if (seen.has(key)) continue
    const text = textField ? row[textField] : undefined
    seen.set(key, text ? `${key} — ${String(text)}` : key)
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, label]) => ({ value, label }))
}

export function exact<Row>(field: keyof Row & string) {
  return (row: Row, value: string) => String(row[field] ?? '') === value
}

export function loose<Row>(field: keyof Row & string) {
  return (row: Row, value: string) => looseMatch(value, row[field])
}
