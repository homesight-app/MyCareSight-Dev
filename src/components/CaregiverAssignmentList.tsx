'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Clock, X, MapPin, Phone, SquareArrowOutUpRight, Loader2 } from 'lucide-react'
import type { CaregiverMatchOption, CaregiverAvailabilityStatus } from '@/lib/caregiver-matching'
import Button from '@/components/ui/PrimaryButton'

interface Props {
  options: CaregiverMatchOption[]
  requiredSkills: string[]
  selectedId?: string | null
  onSelect: (id: string) => void
  /** Passed to the external profile link (picker variant only). */
  clientId?: string
  isLoading?: boolean
  disabled?: boolean
  variant?: 'picker' | 'modal'
}

function AvailabilityPill({ status }: { status: CaregiverAvailabilityStatus }) {
  if (status === 'available')
    return (
      <span className="inline-flex items-center gap-1 border border-green-200 bg-green-50 text-green-700 rounded-md px-2 py-0.5 text-xs font-semibold">
        <Check className="w-3 h-3" />
        Available
      </span>
    )
  if (status === 'booked')
    return (
      <span className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 text-amber-700 rounded-md px-2 py-0.5 text-xs font-semibold">
        <Clock className="w-3 h-3" />
        Booked
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 border border-red-200 bg-red-50 text-red-700 rounded-md px-2 py-0.5 text-xs font-semibold">
      <X className="w-3 h-3" />
      Not Available
    </span>
  )
}

function ProgressBar({ label, value, barClass }: { label: string; value: number; barClass: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function SortFilterHeader({
  sort,
  setSort,
  filter,
  setFilter,
}: {
  sort: 'availability' | 'proximity'
  setSort: (v: 'availability' | 'proximity') => void
  filter: 'all' | 'available' | 'booked' | 'blocked'
  setFilter: (v: 'all' | 'available' | 'booked' | 'blocked') => void
}) {
  return (
    <div className="px-4 py-2 border-b border-gray-100 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          SORTED BY: {sort === 'proximity' ? 'PROXIMITY' : 'AVAILABILITY'}
        </div>
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-100/80 p-0.5">
          <button
            type="button"
            onClick={() => setSort('proximity')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
              sort === 'proximity' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-blue-700'
            }`}
          >
            Proximity
          </button>
          <button
            type="button"
            onClick={() => setSort('availability')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
              sort === 'availability' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-emerald-700'
            }`}
          >
            Availability
          </button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {(
          [
            { key: 'all', label: 'All', dot: 'bg-gray-400', text: 'text-gray-600' },
            { key: 'available', label: 'Available', dot: 'bg-green-500', text: 'text-green-700' },
            { key: 'booked', label: 'Booked', dot: 'bg-amber-500', text: 'text-amber-700' },
            { key: 'blocked', label: 'Not Available', dot: 'bg-red-500', text: 'text-red-700' },
          ] as const
        ).map(({ key, label, dot, text }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 border-0 bg-transparent p-0 ${text} ${filter === key ? 'font-semibold underline underline-offset-2' : ''}`}
          >
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CaregiverAssignmentList({
  options,
  requiredSkills,
  selectedId,
  onSelect,
  clientId,
  isLoading,
  disabled,
  variant = 'modal',
}: Props) {
  const [sort, setSort] = useState<'availability' | 'proximity'>('availability')
  const [filter, setFilter] = useState<'all' | 'available' | 'booked' | 'blocked'>('all')

  const filtered = options.filter((o) => filter === 'all' || o.availability === filter)
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'availability') {
      const rank = (s: CaregiverAvailabilityStatus) => (s === 'available' ? 0 : s === 'booked' ? 1 : 2)
      const byStatus = rank(a.availability) - rank(b.availability)
      if (byStatus !== 0) return byStatus
    }
    if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles
    return b.skillMatchPercent - a.skillMatchPercent
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
        <Loader2 className="animate-spin w-4 h-4" />
        Loading caregivers…
      </div>
    )
  }

  if (variant === 'picker') {
    return (
      <>
        <SortFilterHeader sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
        <div className="max-h-[240px] overflow-y-auto overflow-x-hidden">
          {sorted.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No caregivers found.</div>
          ) : (
            sorted.map((o, idx) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(o.id)
                  }
                }}
                className={`w-full px-4 py-2 border-b border-gray-50 hover:bg-gray-50 text-left cursor-pointer ${
                  selectedId === o.id ? 'bg-blue-50/60' : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4 min-w-0">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-[12px] font-semibold flex-shrink-0 ${
                        idx === 0
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{o.name}</div>
                        {idx === 0 && (
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                            Best
                          </span>
                        )}
                        {clientId && (
                          <Link
                            href={`/pages/agency/caregiver/${o.id}?clientId=${clientId}&embed=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 text-gray-400 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            aria-label="Open caregiver profile in new tab"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SquareArrowOutUpRight className="w-4 h-4" aria-hidden />
                          </Link>
                        )}
                      </div>
                      {o.title ? (
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{o.title}</div>
                      ) : null}
                      {o.phone ? (
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1 truncate">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{o.phone}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <AvailabilityPill status={o.availability} />
                    <div className="flex items-center gap-1 text-[12px] text-gray-500 mt-2 justify-end whitespace-nowrap">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{o.distanceLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </>
    )
  }

  // modal variant
  return (
    <div className="space-y-3">
      {requiredSkills !== undefined && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-semibold text-blue-700 mb-2">Client Required Skills</div>
          <div className="flex flex-wrap gap-2">
            {requiredSkills.length > 0 ? (
              requiredSkills.map((sk) => (
                <span key={sk} className="rounded-full bg-white border border-blue-200 text-blue-700 px-2 py-0.5 text-xs">
                  {sk}
                </span>
              ))
            ) : (
              <span className="text-xs text-blue-600">No required skills</span>
            )}
          </div>
        </div>
      )}
      <SortFilterHeader sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {sorted.length === 0 && (
          <div className="py-6 text-center text-sm text-gray-500">No caregivers found.</div>
        )}
        {sorted.map((o, idx) => (
          <div
            key={o.id}
            className={`rounded-xl border p-3 ${
              o.isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-gray-700">#{idx + 1}</span>
                  <span className="font-semibold text-gray-900">{o.name}</span>
                  <span className="text-sm text-gray-600">{o.title}</span>
                  {o.isCurrent && (
                    <span className="rounded-full border border-blue-200 text-blue-700 bg-blue-100 px-2 py-0.5 text-xs">
                      Currently Assigned
                    </span>
                  )}
                  <AvailabilityPill status={o.availability} />
                </div>
                <div className="max-w-sm mt-2 space-y-1">
                  <ProgressBar label="Overall Score" value={o.overallPercent} barClass="bg-blue-500" />
                  <ProgressBar label="Skill Match" value={o.skillMatchPercent} barClass="bg-violet-500" />
                  <ProgressBar label="Proximity" value={o.proximityPercent} barClass="bg-emerald-500" />
                </div>
                <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  {o.distanceLabel} away
                </div>
                {o.matchedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {o.matchedSkills.map((sk) => (
                      <span
                        key={sk}
                        className="rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 px-2 py-0.5 text-xs"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="primary"
                type="button"
                disabled={disabled}
                onClick={() => onSelect(o.id)}
              >
                {o.isCurrent ? 'Keep' : 'Assign'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
