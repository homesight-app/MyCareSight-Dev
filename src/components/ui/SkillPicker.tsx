'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { searchSkillCatalogAction } from '@/app/actions/skills'
import type { SkillCatalogOption } from '@/lib/skill-catalog'

type Props = {
  label: string
  description?: string
  selected: SkillCatalogOption[]
  onChange: (skills: SkillCatalogOption[]) => void
  excludeIds?: string[]
  disabled?: boolean
  error?: string
}

const PAGE_SIZE = 25

export default function SkillPicker({
  label,
  description,
  selected,
  onChange,
  excludeIds = [],
  disabled = false,
  error,
}: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SkillCatalogOption[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const listboxId = useId()
  const requestId = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const selectedIds = useMemo(() => new Set(selected.map(skill => skill.id)), [selected])
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const visibleItems = items.filter(skill => !selectedIds.has(skill.id) && !excluded.has(skill.id))

  useEffect(() => {
    if (!open) return
    const id = ++requestId.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setLoadError(null)
      const result = await searchSkillCatalogAction({
        query,
        offset: 0,
        limit: PAGE_SIZE,
        includeInactive: false,
      })
      if (id !== requestId.current) return
      setLoading(false)
      if (!result.success || !result.data) {
        setItems([])
        setNextOffset(null)
        setLoadError(result.error ?? 'Unable to load caregiver skills.')
        return
      }
      setItems(result.data.items)
      setNextOffset(result.data.nextOffset)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const loadMore = async () => {
    if (nextOffset === null || loading) return
    setLoading(true)
    const result = await searchSkillCatalogAction({
      query,
      offset: nextOffset,
      limit: PAGE_SIZE,
      includeInactive: false,
    })
    setLoading(false)
    if (!result.success || !result.data) {
      setLoadError(result.error ?? 'Unable to load more caregiver skills.')
      return
    }
    setItems(current => {
      const byId = new Map(current.map(skill => [skill.id, skill]))
      result.data!.items.forEach(skill => byId.set(skill.id, skill))
      return Array.from(byId.values())
    })
    setNextOffset(result.data.nextOffset)
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        {description ? <p className="text-xs text-gray-500">{description}</p> : null}
      </div>

      <div ref={rootRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={`Search ${label.toLowerCase()}`}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          placeholder="Search skills by name or category..."
          disabled={disabled}
          className="block w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
        />

        {open ? (
          <div id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-5 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading skills...
              </div>
            ) : loadError ? (
              <p className="p-4 text-sm text-red-600">{loadError}</p>
            ) : visibleItems.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                {query.trim() ? 'No skills match your search.' : 'No active skills are configured.'}
              </p>
            ) : (
              <>
                {visibleItems.map(skill => (
                  <button
                    key={skill.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => {
                      onChange([...selected, skill])
                      setQuery('')
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{skill.name}</span>
                      <span className="block text-xs text-gray-500">
                        {skill.categoryName}{skill.scope === 'agency' ? ' · Agency skill' : ''}
                      </span>
                    </span>
                    <Check className="h-4 w-4 shrink-0 text-blue-600" />
                  </button>
                ))}
                {nextOffset !== null ? (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full px-4 py-3 text-sm font-medium text-blue-600 hover:bg-gray-50 disabled:text-gray-400"
                  >
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex min-h-8 flex-wrap gap-2">
        {selected.length === 0 ? (
          <span className="text-xs text-gray-500">No skills selected.</span>
        ) : selected.map(skill => (
          <span key={skill.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
            {skill.name}
            <button
              type="button"
              aria-label={`Remove ${skill.name}`}
              disabled={disabled}
              onClick={() => onChange(selected.filter(item => item.id !== skill.id))}
              className="rounded-full p-0.5 hover:bg-blue-100 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">{selected.length} selected</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
