'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface TablePaginationProps {
  page: number          // 0-indexed
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  entityLabel: string   // e.g. "caregivers"
}

export default function TablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  entityLabel,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between gap-4 px-1 pt-3 flex-wrap">
      <p className="text-sm text-gray-500">
        {totalCount === 0
          ? `No ${entityLabel} found`
          : `Showing ${from}–${to} of ${totalCount} ${entityLabel}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Page {page + 1} of {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
