'use client'

import type { ReactNode } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import SearchInput from '@/components/ui/SearchInput'
import FilterSelect, { type SelectOption } from '@/components/ui/FilterSelect'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import RecordActionsMenu, { type RecordAction } from '@/components/ui/RecordActionsMenu'
import TablePagination from '@/components/ui/TablePagination'

export interface DataTableColumn<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  sortable?: boolean
  /** Status badges/actions retain their emphasis when other data is dimmed. */
  retainEmphasis?: boolean
  className?: string
}

export interface DataTableFilter {
  key: string
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}

export interface DataTableProps<T> {
  label: string
  entityLabel: string
  /** Already-authorized current page. This component never fetches or slices data. */
  rows: readonly T[]
  columns: readonly DataTableColumn<T>[]
  getRowKey: (row: T) => string
  getRowLabel: (row: T) => string
  pagination: { page: number; pageSize: number; totalCount: number; onPageChange: (page: number) => void }
  search?: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }
  filters?: readonly DataTableFilter[]
  sort?: { value: { key: string; dir: 'asc' | 'desc' } | null; onChange: (key: string) => void }
  addAction?: { label: string; onClick: () => void; disabled?: boolean }
  /** Existing feature-owned action/flow. No data or workflow logic belongs in the table. */
  toolbarActions?: ReactNode
  onRefresh?: () => void
  onRetry?: () => void
  rowNavigation?: { columnKey: string; onOpen: (row: T) => void; getLabel?: (row: T) => string }
  rowActions?: (row: T) => RecordAction[]
  isRowInactive?: (row: T) => boolean
  loading?: boolean
  disabled?: boolean
  error?: string | null
  emptyMessage?: string
}

/** Shared, controlled table UI. Query rules, authorization and workflows stay with the caller. */
export default function DataTable<T>({ label, entityLabel, rows, columns, getRowKey, getRowLabel, pagination, search,
  filters = [], sort, addAction, toolbarActions, onRefresh, onRetry = onRefresh, rowNavigation, rowActions, isRowInactive,
  loading = false, disabled = false, error, emptyMessage = `No ${entityLabel} found.` }: DataTableProps<T>) {
  const span = columns.length + (rowActions ? 1 : 0)
  const hasToolbar = !!search || filters.length > 0 || !!onRefresh || !!addAction || !!toolbarActions
  const resetPage = () => pagination.onPageChange(0)
  return <div className="space-y-4">
    <div className="rounded-xl border border-secondary-border bg-white overflow-hidden">
      {hasToolbar && <fieldset disabled={disabled} aria-label={`${label} controls`} className="flex flex-wrap items-center gap-3 p-4 min-w-0">
        {search && <label className="flex-1 min-w-48"><span className="sr-only">{search.label ?? `Search ${entityLabel}`}</span>
          <SearchInput value={search.value} placeholder={search.placeholder} onChange={value => { if (!disabled) { search.onChange(value); resetPage() } }} />
        </label>}
        {filters.map(filter => <FilterSelect key={filter.key} aria-label={filter.label} value={filter.value} options={filter.options}
          disabled={disabled} onChange={value => { if (!disabled) { filter.onChange(value); resetPage() } }} />)}
        {onRefresh && <Button type="button" variant="secondary" disabled={loading || disabled} onClick={onRefresh} icon={RefreshCw}>Refresh</Button>}
        {addAction && <Button type="button" disabled={disabled || addAction.disabled} onClick={addAction.onClick} icon={Plus}>{addAction.label}</Button>}
        {toolbarActions}
      </fieldset>}
      <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={label} aria-busy={loading}>
        <thead><tr className="border-b border-gray-100 bg-gray-50/60">
          {rowActions && <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>}
          {columns.map(column => column.sortable && sort
            ? <SortableColumnHeader key={column.key} label={column.label} sortKey={column.key} currentSort={sort.value}
              buttonHeader disabled={disabled} className={column.className} onSort={key => { if (!disabled) { sort.onChange(key); resetPage() } }} />
            : <th key={column.key} scope="col" className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide ${column.className ?? ''}`}>{column.label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {loading ? <tr><td colSpan={span} className="px-5 py-8"><p role="status">Loading {entityLabel}…</p></td></tr>
            : error ? <tr><td colSpan={span} className="px-5 py-8"><div role="alert">{error} {onRetry && <Button type="button" variant="secondary" onClick={onRetry} disabled={disabled}>Retry</Button>}</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan={span} className="px-5 py-8 text-center text-foreground-muted">{emptyMessage}</td></tr>
            : rows.map(row => <tr key={getRowKey(row)} className={rowNavigation && !disabled ? 'cursor-pointer hover:bg-gray-50/50' : ''}
              onClick={event => {
                if (!rowNavigation || disabled || !(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
                if (event.target.closest('button,a,input,select,textarea,label,[role="button"],[role="menuitem"],[contenteditable="true"],[data-table-no-row-click]')) return
                rowNavigation.onOpen(row)
              }}>
              {rowActions && <td className="w-10 px-2 py-3" onClick={event => event.stopPropagation()}>
                {!disabled && <RecordActionsMenu label={`Actions for ${getRowLabel(row)}`} actions={rowActions(row)} />}
              </td>}
              {columns.map(column => <td key={column.key} className={`px-4 py-3 ${isRowInactive?.(row) && !column.retainEmphasis ? 'opacity-60' : ''} ${column.className ?? ''}`}>
                {rowNavigation?.columnKey === column.key
                  ? <button type="button" disabled={disabled} aria-label={rowNavigation.getLabel?.(row) ?? `Open ${getRowLabel(row)}`}
                    onClick={() => rowNavigation.onOpen(row)} className="text-left font-medium hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">{column.render(row)}</button>
                  : column.render(row)}
              </td>)}
            </tr>)}
        </tbody>
      </table></div>
    </div>
    {!error && (!loading || pagination.totalCount > 0) && <TablePagination {...pagination} disabled={loading || disabled}
      onPageChange={page => { if (!loading && !disabled) pagination.onPageChange(page) }} entityLabel={entityLabel} />}
  </div>
}
