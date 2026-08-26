'use client'

import { useState, useCallback, useMemo } from 'react'

interface TableSort {
  key: string
  dir: 'asc' | 'desc'
}

interface UseTableStateOptions {
  defaultSort?: TableSort
  pageSize?: number
}

export function useTableState(options: UseTableStateOptions = {}) {
  const { defaultSort = null, pageSize = 50 } = options

  const [search, setSearchRaw] = useState('')
  const [sort, setSortRaw] = useState<TableSort | null>(defaultSort)
  const [page, setPageRaw] = useState(0)

  const setSearch = useCallback((v: string) => {
    setSearchRaw(v)
    setPageRaw(0)
  }, [])

  const setSort = useCallback((key: string) => {
    setSortRaw(prev => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: 'asc' }
    })
    setPageRaw(0)
  }, [])

  const setPage = useCallback((n: number) => setPageRaw(n), [])

  const resetPage = useCallback(() => setPageRaw(0), [])

  // Apply a sort function and return a sorted copy
  const applySortedData = useCallback(<T>(
    rows: T[],
    sortFn: (key: string, dir: 'asc' | 'desc') => (a: T, b: T) => number
  ): T[] => {
    if (!sort) return rows
    return [...rows].sort(sortFn(sort.key, sort.dir))
  }, [sort])

  // Slice a (already sorted + filtered) array for the current page
  const applyPageSlice = useCallback(<T>(rows: T[]): { slice: T[]; totalCount: number } => {
    const totalCount = rows.length
    const from = page * pageSize
    const slice = rows.slice(from, from + pageSize)
    return { slice, totalCount }
  }, [page, pageSize])

  return {
    search,
    setSearch,
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    resetPage,
    applySortedData,
    applyPageSlice,
  }
}
