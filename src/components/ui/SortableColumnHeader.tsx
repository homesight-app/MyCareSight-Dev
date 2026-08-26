'use client'

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface SortableColumnHeaderProps {
  label: string
  sortKey: string
  currentSort: { key: string; dir: 'asc' | 'desc' } | null
  onSort: (key: string) => void
  className?: string
}

export default function SortableColumnHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  className = '',
}: SortableColumnHeaderProps) {
  const active = currentSort?.key === sortKey
  const dir = active ? currentSort!.dir : null

  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {dir === 'asc'
          ? <ChevronUp className="w-3 h-3 text-blue-500" />
          : dir === 'desc'
          ? <ChevronDown className="w-3 h-3 text-blue-500" />
          : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
      </span>
    </th>
  )
}
