'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, Clock, X, MapPin, Phone, Search, SquareArrowOutUpRight, Loader2 } from 'lucide-react'
import { isDirectAssignmentCandidate, type CaregiverMatchOption, type CaregiverAvailabilityStatus } from '@/lib/caregiver-matching'
import Button from '@/components/ui/PrimaryButton'

type CaregiverCandidateFilter = 'eligible' | 'all' | 'available' | 'booked' | 'blocked'

interface Props {
  options: CaregiverMatchOption[]
  requiredSkills: string[]
  preferredSkills?: string[]
  selectedId?: string | null
  selectedIds?: string[]
  onSelect: (id: string) => void
  /** Passed to the external profile link (picker variant only). */
  clientId?: string
  isLoading?: boolean
  disabled?: boolean
  variant?: 'picker' | 'modal'
  selectionMode?: 'single' | 'multiple'
  emptyMessage?: string
  /** Use `eligible` where availability and required skills are hard gates. */
  defaultFilter?: CaregiverCandidateFilter
  /** Direct assignment allows a manager to override missing availability or required skills. */
  assignmentMode?: 'open-shift' | 'direct'
}

function AvailabilityPill({ status, assignmentMode }: { status: CaregiverAvailabilityStatus; assignmentMode: 'open-shift' | 'direct' }) {
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
  if (assignmentMode === 'direct')
    return (
      <span className="inline-flex items-center gap-1 border border-gray-200 bg-gray-50 text-gray-700 rounded-md px-2 py-0.5 text-xs font-semibold">
        <Clock className="w-3 h-3" />
        No matching availability
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
  options,
  showEligibleFilter,
  assignmentMode,
}: {
  sort: 'availability' | 'proximity'
  setSort: (v: 'availability' | 'proximity') => void
  filter: CaregiverCandidateFilter
  setFilter: (v: CaregiverCandidateFilter) => void
  options: CaregiverMatchOption[]
  showEligibleFilter: boolean
  assignmentMode: 'open-shift' | 'direct'
}) {
  const isEligible = (option: CaregiverMatchOption) => assignmentMode === 'direct'
    ? isDirectAssignmentCandidate(option)
    : option.availability === 'available' && option.skillMatchPercent === 100
  const counts = {
    eligible: options.filter(isEligible).length,
    all: options.length,
    available: options.filter(option => option.availability === 'available').length,
    booked: options.filter(option => option.availability === 'booked').length,
    blocked: options.filter(option => option.availability === 'blocked').length,
  }
  const filters = showEligibleFilter
    ? [
        { key: 'eligible', label: assignmentMode === 'direct' ? 'Assignable' : 'Eligible', dot: 'bg-green-500', text: 'text-green-700' },
        { key: 'booked', label: 'Booked', dot: 'bg-amber-500', text: 'text-amber-700' },
        { key: 'blocked', label: assignmentMode === 'direct' ? 'No matching availability' : 'Not Available', dot: 'bg-red-500', text: 'text-red-700' },
        { key: 'all', label: 'All', dot: 'bg-gray-400', text: 'text-gray-600' },
      ] as const
    : [
        { key: 'all', label: 'All', dot: 'bg-gray-400', text: 'text-gray-600' },
        { key: 'available', label: 'Available', dot: 'bg-green-500', text: 'text-green-700' },
        { key: 'booked', label: 'Booked', dot: 'bg-amber-500', text: 'text-amber-700' },
        { key: 'blocked', label: assignmentMode === 'direct' ? 'No matching availability' : 'Not Available', dot: 'bg-red-500', text: 'text-red-700' },
      ] as const

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
        {filters.map(({ key, label, dot, text }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 border-0 bg-transparent p-0 ${text} ${filter === key ? 'font-semibold underline underline-offset-2' : ''}`}
          >
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {label} ({counts[key]})
          </button>
        ))}
      </div>
    </div>
  )
}

export function CaregiverAssignmentList({
  options,
  requiredSkills,
  preferredSkills = [],
  selectedId,
  selectedIds = [],
  onSelect,
  clientId,
  isLoading,
  disabled,
  variant = 'modal',
  selectionMode = 'single',
  emptyMessage = 'No caregivers found.',
  defaultFilter = 'all',
  assignmentMode = 'open-shift',
}: Props) {
  const [sort, setSort] = useState<'availability' | 'proximity'>('availability')
  const [filter, setFilter] = useState<CaregiverCandidateFilter>(defaultFilter)
  const [search, setSearch] = useState('')
  const [requiredSkillsExpanded, setRequiredSkillsExpanded] = useState(false)
  const [preferredSkillsExpanded, setPreferredSkillsExpanded] = useState(false)
  const [expandedCaregiverId, setExpandedCaregiverId] = useState<string | null>(null)
  const showEligibleFilter = defaultFilter === 'eligible'
  const isEligible = (option: CaregiverMatchOption) => assignmentMode === 'direct'
    ? isDirectAssignmentCandidate(option)
    : option.availability === 'available' && option.skillMatchPercent === 100
  const selectCandidate = (option: CaregiverMatchOption) => {
    if (assignmentMode === 'direct' && option.skillMatchPercent < 100) {
      const missingSkills = requiredSkills.filter(skill => !option.matchedSkills.includes(skill))
      const warning = `This caregiver has not verified every required client skill${missingSkills.length ? `: ${missingSkills.join(', ')}` : ''}. Select this caregiver anyway?`
      if (!window.confirm(warning)) return
    }
    onSelect(option.id)
  }

  const searchedOptions = variant === 'modal' && search.trim()
    ? options.filter((option) => `${option.name} ${option.title}`.toLowerCase().includes(search.trim().toLowerCase()))
    : options
  const filtered = searchedOptions.filter((option) => {
    if (filter === 'all') return true
    if (filter === 'eligible') {
      return isEligible(option)
    }
    return option.availability === filter
  })
  const filteredEmptyMessage = options.length === 0
    ? emptyMessage
    : searchedOptions.length === 0
      ? 'No caregivers match your search.'
    : filter === 'eligible'
      ? assignmentMode === 'direct'
        ? 'No caregivers are free from overlapping bookings for this visit.'
        : 'No caregivers are currently available, conflict-free, and matched to every required skill.'
      : 'No caregivers match this availability filter.'
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'availability') {
      const rank = (s: CaregiverAvailabilityStatus) => (s === 'available' ? 0 : s === 'booked' ? 1 : 2)
      const byStatus = rank(a.availability) - rank(b.availability)
      if (byStatus !== 0) return byStatus
    }
    if (sort === 'proximity' && a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles
    if (a.overallPercent !== b.overallPercent) return b.overallPercent - a.overallPercent
    return a.distanceMiles - b.distanceMiles
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
        <SortFilterHeader
          sort={sort}
          setSort={setSort}
          filter={filter}
          setFilter={setFilter}
          options={options}
          showEligibleFilter={showEligibleFilter}
          assignmentMode={assignmentMode}
        />
        <div className="max-h-[240px] overflow-y-auto overflow-x-hidden">
          {sorted.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">{filteredEmptyMessage}</div>
          ) : (
            sorted.map((o, idx) => (
              <button
                key={o.id}
                type="button"
                disabled={disabled || !isEligible(o)}
                onClick={() => selectCandidate(o)}
                className={`w-full px-4 py-2 border-b border-gray-50 text-left ${
                  isEligible(o)
                    ? 'cursor-pointer hover:bg-gray-50'
                    : 'cursor-not-allowed opacity-60'
                } ${
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
                    <AvailabilityPill status={o.availability} assignmentMode={assignmentMode} />
                    <div className="flex items-center gap-1 text-[12px] text-gray-500 mt-2 justify-end whitespace-nowrap">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{o.distanceLabel}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </>
    )
  }

  // modal variant
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50">
        <button
          type="button"
          aria-expanded={requiredSkillsExpanded}
          onClick={() => setRequiredSkillsExpanded((expanded) => !expanded)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span>Client Required Skills ({requiredSkills.length})</span>
          {requiredSkillsExpanded ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
        </button>
        {requiredSkillsExpanded ? (
          <div className="flex flex-wrap gap-2 border-t border-blue-200 px-3 py-2">
            {requiredSkills.length > 0
              ? requiredSkills.map((skill) => <span key={skill} className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs text-blue-700">{skill}</span>)
              : <span className="text-xs text-blue-700">No required skills</span>}
          </div>
        ) : null}
      </div>
      {preferredSkills.length > 0 ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50">
          <button
            type="button"
            aria-expanded={preferredSkillsExpanded}
            onClick={() => setPreferredSkillsExpanded((expanded) => !expanded)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <span>Client Preferred Skills ({preferredSkills.length})</span>
            {preferredSkillsExpanded ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
          {preferredSkillsExpanded ? (
            <div className="flex flex-wrap gap-2 border-t border-violet-200 px-3 py-2">
              {preferredSkills.map((skill) => <span key={skill} className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-xs text-violet-700">{skill}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          aria-label="Search caregivers by name or role"
          placeholder="Search caregivers..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
      <SortFilterHeader
        sort={sort}
        setSort={setSort}
        filter={filter}
        setFilter={setFilter}
        options={searchedOptions}
        showEligibleFilter={showEligibleFilter}
        assignmentMode={assignmentMode}
      />
      <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {sorted.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">{filteredEmptyMessage}</div>
        ) : null}
        {sorted.map((option, index) => {
          const isSelected = selectionMode === 'multiple' ? selectedIds.includes(option.id) : selectedId === option.id
          const isExpanded = expandedCaregiverId === option.id
          const matchedRequired = requiredSkills.filter((skill) => option.matchedSkills.includes(skill))
          const missingRequired = requiredSkills.filter((skill) => !option.matchedSkills.includes(skill))
          return (
            <div
              key={option.id}
              className={`rounded-lg border ${isSelected || option.isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex flex-wrap items-center gap-3 p-3">
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-gray-500">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-900">{option.name}</span>
                    <span className="text-xs text-gray-600">{option.title}</span>
                    <AvailabilityPill status={option.availability} assignmentMode={assignmentMode} />
                    {option.isCurrent ? <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Currently Assigned</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>{requiredSkills.length > 0 ? `Required skills ${matchedRequired.length} of ${requiredSkills.length}` : 'No required skills'}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{option.distanceLabel} away</span>
                    {missingRequired.length > 0 ? <span className="font-medium text-amber-700">{missingRequired.length} missing required</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant={isSelected && selectionMode === 'multiple' ? 'secondary' : 'primary'}
                    size="sm"
                    type="button"
                    disabled={disabled || !isEligible(option)}
                    onClick={() => selectCandidate(option)}
                  >
                    {selectionMode === 'multiple' ? isSelected ? 'Remove' : 'Select' : option.isCurrent ? 'Keep' : 'Assign'}
                  </Button>
                  <button
                    type="button"
                    aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${option.name}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedCaregiverId(isExpanded ? null : option.id)}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </div>
              {isExpanded ? (
                <div className="space-y-3 border-t border-gray-200 bg-gray-50/60 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ProgressBar label="Overall Score" value={option.overallPercent} barClass="bg-blue-500" />
                    <ProgressBar label="Skill Match" value={option.skillMatchPercent} barClass="bg-violet-500" />
                    <ProgressBar label="Proximity" value={option.proximityPercent} barClass="bg-emerald-500" />
                  </div>
                  {preferredSkills.length > 0 ? <ProgressBar label="Preferred Skills" value={option.preferredSkillMatchPercent} barClass="bg-fuchsia-500" /> : null}
                  <div className="grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Matching required skills ({matchedRequired.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {matchedRequired.length > 0 ? matchedRequired.map((skill) => <span key={skill} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{skill}</span>) : <span className="text-gray-500">None matched</span>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-semibold text-gray-700">Missing required skills ({missingRequired.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {missingRequired.length > 0 ? missingRequired.map((skill) => <span key={skill} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">{skill}</span>) : <span className="text-gray-500">None</span>}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">
                    {option.availability === 'booked'
                      ? 'Overlapping booking: assignment is unavailable.'
                      : option.availability === 'blocked'
                        ? 'No saved availability covers this visit.'
                        : 'Saved availability covers this visit.'}
                  </p>
                  {option.phone ? <p className="text-xs text-gray-600"><Phone className="mr-1 inline h-3 w-3" aria-hidden />{option.phone}</p> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
