'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Search, Sparkles, X } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import { normalizeCaregiverSkillsList } from '@/lib/caregiver-skills'
import * as q from '@/lib/supabase/query'
import ModalWrapper from './Modal'
import { useRouter } from 'next/navigation'

interface Caregiver {
  id: string
  first_name: string
  last_name: string
  skills?: string[] | null
}

interface EditCaregiverSkillsModalProps {
  isOpen: boolean
  onClose: () => void
  caregiver: Caregiver
  onSuccess?: () => void
  /** When set, replaces the default subtitle under the modal title. */
  subtitle?: string | null
}

export default function EditCaregiverSkillsModal({
  isOpen,
  onClose,
  caregiver,
  onSuccess,
  subtitle: subtitleProp,
}: EditCaregiverSkillsModalProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>(() =>
    normalizeCaregiverSkillsList(caregiver.skills)
  )
  const [skillCatalog, setSkillCatalog] = useState<{ type: string; name: string }[]>([])
  const [openType, setOpenType] = useState<string | null>(null)
  /** Only the category row that currently has its dropdown open (toggle + panel + chips). */
  const openSkillCategoryRef = useRef<HTMLDivElement>(null)

  const skillsByType = useMemo(() => {
    return skillCatalog.reduce<Record<string, { type: string; name: string }[]>>((acc, s) => {
      if (!acc[s.type]) acc[s.type] = []
      acc[s.type].push(s)
      return acc
    }, {})
  }, [skillCatalog])

  const typeOrder = useMemo(() => {
    const preferred = ['Clinical Care', 'Specialty Conditions', 'Physical Support', 'Daily Living', 'Certifications', 'Language']
    const dynamic = Object.keys(skillsByType).filter((t) => !preferred.includes(t)).sort()
    return [...preferred.filter((t) => skillsByType[t]?.length), ...dynamic]
  }, [skillsByType])

  const categoryColors: Record<string, string> = {
    'Clinical Care': 'ring-red-500 bg-red-500 text-white',
    'Specialty Conditions': 'ring-blue-500 bg-blue-500 text-white',
    'Physical Support': 'ring-amber-600 bg-amber-600 text-white',
    'Daily Living': 'ring-green-600 bg-green-600 text-white',
    'Certifications': 'ring-blue-500 bg-blue-500 text-white',
    'Language': 'ring-teal-500 bg-teal-500 text-white',
  }

  const filteredSkillsByType = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: Record<string, { type: string; name: string }[]> = {}

    for (const type of typeOrder) {
      const skills = skillsByType[type] ?? []
      result[type] = skills.filter((s) => {
        if (!q) return true
        return s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
      })
    }

    return result
  }, [search, skillsByType, typeOrder])

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) => {
      const selected = new Set(prev)
      if (selected.has(skillName)) selected.delete(skillName)
      else selected.add(skillName)
      return Array.from(selected)
    })
  }

  const resetFromCaregiver = () => {
    setSearch('')
    setSelectedSkills(normalizeCaregiverSkillsList(caregiver.skills))
    setOpenType(null)
    setError(null)
  }

  const handleClose = () => {
    if (!isSaving) {
      resetFromCaregiver()
      onClose()
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: updateError } = await q.updateStaffMember(supabase, caregiver.id, {
        skills: normalizeCaregiverSkillsList(selectedSkills),
      })

      if (updateError) throw updateError

      router.refresh()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setError(err?.message || 'Failed to update caregiver skills.')
    } finally {
      setIsSaving(false)
    }
  }

  const skillsSignature = JSON.stringify(caregiver.skills ?? [])

  // Initialize when modal opens or stored skills change (stale selection if parent refetches).
  useEffect(() => {
    if (isOpen) resetFromCaregiver()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caregiver.id, skillsSignature])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      const { data } = await q.getCaregiverSkillCatalogFromTaskRequirements(supabase)
      if (!cancelled) setSkillCatalog(data ?? [])
    }
    run()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Close category dropdown when clicking outside that category (not the whole scroll list).
  useEffect(() => {
    if (!isOpen || !openType) return
    const onMouseDown = (e: MouseEvent) => {
      const root = openSkillCategoryRef.current
      if (root && !root.contains(e.target as Node)) {
        setOpenType(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen, openType])

  if (!isOpen) return null

  const modalSubtitle =
    subtitleProp !== undefined && subtitleProp !== null
      ? subtitleProp
      : `Select caregiver skills for ${caregiver.first_name} ${caregiver.last_name}.`

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit Skills`}
      subtitle={modalSubtitle}
      size="lg"
    >
      <div className="space-y-4">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        ) : null}

        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg shrink-0">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Caregiver Skills</h2>
            <p className="text-sm text-gray-500 mt-1">Choose all skills this caregiver should have.</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search caregiver skills..."
            className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isSaving}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
          {typeOrder.map((type) => {
            const skills = filteredSkillsByType[type] ?? []
            if (!skills.length) return null

            const selectedCount = skills.filter((s) => selectedSkills.includes(s.name)).length
            const allSelected = selectedCount > 0 && selectedCount === skills.length

            const colorClass = categoryColors[type] ?? 'ring-gray-400 bg-gray-400 text-white'

            return (
              <div key={type}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{type.toUpperCase()}</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const names = skills.map((s) => s.name)
                      setSelectedSkills((prev) => {
                        const selected = new Set(prev)
                        if (allSelected) names.forEach((n) => selected.delete(n))
                        else names.forEach((n) => selected.add(n))
                        return Array.from(selected)
                      })
                    }}
                    className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    disabled={isSaving}
                  >
                    {allSelected ? 'Clear All' : 'Select All'}
                  </button>
                </div>

                <div ref={openType === type ? openSkillCategoryRef : undefined}>
                  <div className="pl-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setOpenType((prev) => (prev === type ? null : type))}
                      className="w-full inline-flex items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                      disabled={isSaving}
                    >
                      <span className="font-medium">
                        {selectedCount > 0 ? `Selected (${selectedCount})` : `Select skills in ${type}...`}
                      </span>
                      <span className="text-gray-400">{openType === type ? '▲' : '▼'}</span>
                    </button>

                    {openType === type && (
                      <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-sm max-h-56 overflow-y-auto">
                        {skills.map((s) => {
                          const selected = selectedSkills.includes(s.name)
                          return (
                            <div
                              key={s.name}
                              className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 ${
                                selected ? 'bg-gray-50' : ''
                              }`}
                              onClick={() => {
                                if (!selected) toggleSkill(s.name)
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  if (!selected) toggleSkill(s.name)
                                }
                              }}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                              </div>

                              {selected ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleSkill(s.name)
                                  }}
                                  aria-label={`Remove ${s.name}`}
                                  className={`inline-flex items-center justify-center rounded-full ${colorClass} p-1`}
                                >
                                  <X className="h-3.5 w-3.5 text-white" />
                                </button>
                              ) : (
                                <span className="w-7" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 pl-2">
                    {skills
                      .filter((s) => selectedSkills.includes(s.name))
                      .map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => toggleSkill(s.name)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full ring-2 ${colorClass}`}
                        >
                          <span className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                            <X className="h-3 w-3 text-white" />
                          </span>
                          {s.name}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )
          })}
          {typeOrder.every((type) => (filteredSkillsByType[type] ?? []).length === 0) ? (
            <div className="py-8 text-center text-sm text-gray-500">No caregiver skills match your search.</div>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''} selected
          </p>

          <div className="flex items-center gap-3">
            <Button variant="secondary" type="button" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={handleSave} disabled={isSaving} loading={isSaving} icon={Save}>
              Save Skills
            </Button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  )
}

