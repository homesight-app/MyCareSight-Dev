'use client'

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface SortableColumnHeaderProps {
  label: string
  sortKey: string
  currentSort: { key: string; dir: 'asc' | 'desc' } | null
  onSort: (key: string) => void
  className?: string
  /** Opt-in keyboard control for DataTable; existing tables keep their markup. */
  buttonHeader?: boolean
  disabled?: boolean
}

export default function SortableColumnHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  className = '',
  buttonHeader = false,
  disabled = false,
}: SortableColumnHeaderProps) {
  const active = currentSort?.key === sortKey
  const dir = active ? currentSort!.dir : null

  const content = <span className="inline-flex items-center gap-1">
    {label}
    {dir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-500" aria-hidden="true" />
      : dir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-blue-500" aria-hidden="true" />
      : <ChevronsUpDown className="w-3 h-3 text-gray-300" aria-hidden="true" />}
  </span>
  return (
    <th
      scope={buttonHeader ? 'col' : undefined}
      aria-sort={buttonHeader ? dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none' : undefined}
      className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
      onClick={buttonHeader ? undefined : () => { if (!disabled) onSort(sortKey) }}
    >
      {buttonHeader ? <button type="button" disabled={disabled} aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => onSort(sortKey)}>{content}</button> : content}
    </th>
  )
}
