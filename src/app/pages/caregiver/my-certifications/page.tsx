'use client'

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import AddCertificationModal from '@/components/AddCertificationModal'
import EditCertificationModal from '@/components/EditCertificationModal'
import EditCaregiverSkillsModal from '@/components/EditCaregiverSkillsModal'
import { getCertificationTypes } from '@/app/actions/certifications'
import { getCaregiverSkillCatalogAction } from '@/app/actions/reference-data'
import { getMyStaffCertifications } from '@/app/actions/staff-member-certifications'
import { createClient } from '@/lib/supabase/client'
import { CAREGIVER_SKILL_POINTS } from '@/lib/constants'
import { normalizeCaregiverSkillsList } from '@/lib/caregiver-skills'
import { Plus, Edit, Eye, Award, Loader2, Sparkles } from 'lucide-react'

interface Certification {
  id: string
  type: string
  license_number: string
  state: string | null
  issue_date: string | null
  expiration_date: string
  issuing_authority: string
  status: string
  document_url: string | null
  created_at: string
  updated_at: string
}

type CaregiverSelf = {
  id: string
  first_name: string
  last_name: string
  skills: string[] | null
}

const SKILL_TYPE_ORDER = [
  'Clinical Care',
  'Specialty Conditions',
  'Physical Support',
  'Daily Living',
  'Certifications',
  'Language',
]

const skillTypeToPillClass: Record<string, string> = {
  'Clinical Care': 'bg-red-50 text-red-800 border border-red-200',
  'Specialty Conditions': 'bg-blue-50 text-blue-800 border border-blue-200',
  'Physical Support': 'bg-amber-50 text-amber-800 border border-amber-200',
  'Daily Living': 'bg-green-50 text-green-800 border border-green-200',
  Certifications: 'bg-blue-50 text-blue-800 border border-blue-200',
  Language: 'bg-teal-50 text-teal-800 border border-teal-200',
  Other: 'bg-gray-100 text-gray-700 border border-gray-200',
}

const SKILL_NAME_TO_FALLBACK_TYPE = new Map(
  CAREGIVER_SKILL_POINTS.map((s) => [s.name, s.type])
)

function groupSkillsForDisplay(
  skillNames: string[],
  catalog: { type: string; name: string }[]
): { type: string; skills: string[] }[] {
  const nameToType = new Map<string, string>()
  for (const s of catalog) {
    const prev = nameToType.get(s.name)
    if (prev === undefined) nameToType.set(s.name, s.type)
    else if (prev === 'Other' && s.type !== 'Other') nameToType.set(s.name, s.type)
  }
  const byType = new Map<string, string[]>()
  for (const name of skillNames) {
    let t = nameToType.get(name)
    if (t === undefined || t === 'Other') {
      t = SKILL_NAME_TO_FALLBACK_TYPE.get(name) ?? t ?? 'Other'
    }
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t)!.push(name)
  }
  const rest = Array.from(byType.keys()).filter((k) => !SKILL_TYPE_ORDER.includes(k)).sort()
  const order = [...SKILL_TYPE_ORDER.filter((t) => byType.has(t)), ...rest]
  return order.map((type) => ({
    type,
    skills: (byType.get(type) ?? []).sort((a, b) => a.localeCompare(b)),
  }))
}

function MyCertificationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const action = searchParams.get('action')
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  type Column = 'type' | 'status' | 'license_number' | 'issue_date' | 'expiration_date' | 'state'
  const [sortBy, setSortBy] = useState<Column>('expiration_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null)
  const [hasStaffProfile, setHasStaffProfile] = useState(true)
  const [loadingCertificationId, setLoadingCertificationId] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'skills' | 'certifications'>('skills')
  const [caregiverSelf, setCaregiverSelf] = useState<CaregiverSelf | null>(null)
  const [skillsModalOpen, setSkillsModalOpen] = useState(false)

  const { data: certificationTypes = [] } = useQuery({
    queryKey: ['certification-types'],
    queryFn: async () => {
      const r = await getCertificationTypes()
      if (r.error) throw new Error(r.error)
      return (r.data ?? []) as Array<{ id: number; certification_type: string }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: skillCatalog = [] } = useQuery({
    queryKey: ['caregiver-skill-catalog'],
    queryFn: async () => {
      const r = await getCaregiverSkillCatalogAction()
      if (r.error) throw new Error(String(r.error))
      return (r.data ?? []) as { type: string; name: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (action === 'add') {
      setIsModalOpen(true)
      setActiveTab('certifications')
    }
  }, [action])

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      if (!currentUser) {
        router.push('/pages/auth/login')
        return
      }

      const [certsResult, memberRes] = await Promise.all([
        getMyStaffCertifications(),
        supabase.from('caregiver_members').select('id, first_name, last_name, skills').eq('user_id', currentUser.id).maybeSingle(),
      ])

      setHasStaffProfile(certsResult.hasStaffProfile)
      if (certsResult.data) {
        setCertifications(certsResult.data as Certification[])
      }

      if (memberRes.data) {
        const m = memberRes.data as CaregiverSelf
        setCaregiverSelf({
          id: m.id,
          first_name: m.first_name,
          last_name: m.last_name,
          skills: m.skills?.length ? normalizeCaregiverSkillsList(m.skills) : m.skills ?? null,
        })
      } else {
        setCaregiverSelf(null)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const skillNames = caregiverSelf?.skills ?? []
  const groupedSkills = useMemo(
    () => groupSkillsForDisplay(skillNames, skillCatalog),
    [skillNames, skillCatalog]
  )

  const skillsCount = skillNames.length
  const certCount = certifications.length

  const handleAddSuccess = () => {
    loadData()
  }

  const handleEditClick = (cert: Certification) => {
    setSelectedCertification(cert)
    setIsEditModalOpen(true)
  }

  const handleEditSuccess = () => {
    loadData()
    setIsEditModalOpen(false)
    setSelectedCertification(null)
  }

  const handleSkillsSaveSuccess = () => {
    loadData()
    setSkillsModalOpen(false)
  }

  const handleViewDetails = (certId: string) => {
    setLoadingCertificationId(certId)
    router.push(`/pages/caregiver/my-certifications/${certId}`)
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A'
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string, expirationDate: string) => {
    const today = new Date()
    const expiry = new Date(expirationDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (status === 'Expired' || daysUntilExpiry <= 0) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Expired</span>
      )
    } else if (daysUntilExpiry <= 90) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
          Expiring Soon
        </span>
      )
    } else {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>
      )
    }
  }

  const toggleSort = (col: Column) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const sortedCertifications = useMemo(() => {
    const arr = [...certifications]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      try {
        if (sortBy === 'status') return a.status.localeCompare(b.status) * dir
        if (sortBy === 'license_number')
          return (a.license_number || '').localeCompare(b.license_number || '') * dir
        if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '') * dir
        if (sortBy === 'state') return (a.state || '').localeCompare(b.state || '') * dir
        if (sortBy === 'issue_date') {
          const da = a.issue_date ? new Date(a.issue_date).getTime() : 0
          const db = b.issue_date ? new Date(b.issue_date).getTime() : 0
          return (da - db) * dir
        }
        if (sortBy === 'expiration_date') {
          const da = a.expiration_date ? new Date(a.expiration_date).getTime() : 0
          const db = b.expiration_date ? new Date(b.expiration_date).getTime() : 0
          return (da - db) * dir
        }
      } catch (e) {
        return 0
      }
      return 0
    })
    return arr
  }, [certifications, sortBy, sortDir])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-5 mt-20">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Skills & Certifications</h1>
          <p className="text-sm text-gray-600 mt-1">
            Showcase your skills and manage your professional licenses
          </p>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3.5 text-sm font-semibold transition-colors sm:px-6 ${
                activeTab === 'skills'
                  ? 'text-blue-700 bg-white border-b-2 border-blue-600 -mb-px'
                  : 'text-gray-600 bg-gray-50/90 border-b border-transparent hover:bg-gray-50'
              }`}
            >
              <Sparkles className={`w-4 h-4 shrink-0 ${activeTab === 'skills' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span>My Skills</span>
              <span
                className={`min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeTab === 'skills' ? 'bg-sky-100 text-blue-800' : 'bg-violet-100 text-violet-800'
                }`}
              >
                {skillsCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('certifications')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3.5 text-sm font-semibold transition-colors sm:px-6 ${
                activeTab === 'certifications'
                  ? 'text-blue-700 bg-white border-b-2 border-blue-600 -mb-px'
                  : 'text-gray-600 bg-gray-50/90 border-b border-transparent hover:bg-gray-50'
              }`}
            >
              <Award className={`w-4 h-4 shrink-0 ${activeTab === 'certifications' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="truncate">My Certifications</span>
              <span
                className={`min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeTab === 'certifications' ? 'bg-violet-100 text-violet-800' : 'bg-violet-100 text-violet-700'
                }`}
              >
                {certCount}
              </span>
            </button>
          </div>

          <div className="p-4 sm:p-6 bg-gray-50/50">
            {activeTab === 'skills' && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3 min-w-0">
                    <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
                      <Sparkles className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">My Skills</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Skills used to match you with the right clients and open visits.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => caregiverSelf && setSkillsModalOpen(true)}
                    disabled={!caregiverSelf}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Skills
                  </button>
                </div>

                {!hasStaffProfile || !caregiverSelf ? (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Your login is not linked to an agency caregiver profile, so skills cannot be edited here. Ask your
                    agency to link your account.
                  </div>
                ) : groupedSkills.length === 0 ? (
                  <p className="mt-6 text-sm text-gray-500">
                    No skills selected yet. Click <span className="font-medium text-gray-700">Edit Skills</span> to add
                    skills that help match you with visits.
                  </p>
                ) : (
                  <div className="mt-8 space-y-8">
                    {groupedSkills.map(({ type, skills }) => (
                      <div key={type}>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          {type.toUpperCase()}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {skills.map((name) => (
                            <span
                              key={name}
                              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                                skillTypeToPillClass[type] ?? skillTypeToPillClass.Other
                              }`}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'certifications' && (
              <div className="space-y-5">
                {!hasStaffProfile && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Your login is not linked to an agency staff profile. You can still see certifications saved to your
                    account before this change. Ask your agency to link your account so new entries match the agency
                    “Manage certifications” list (same database records).
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Certification
                  </button>
                </div>

                {certifications.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                          <th className="px-4 py-3">
                            Type
                            <button
                              onClick={() => toggleSort('type')}
                              className="ml-2 text-xs font-normal normal-case text-gray-400"
                            >
                              {sortBy === 'type' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            Status
                            <button
                              onClick={() => toggleSort('status')}
                              className="ml-2 text-xs font-normal normal-case text-gray-400"
                            >
                              {sortBy === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            License Number
                            <button
                              onClick={() => toggleSort('license_number')}
                              className="ml-2 text-xs font-normal normal-case text-gray-400"
                            >
                              {sortBy === 'license_number' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            Issue Date
                            <button
                              onClick={() => toggleSort('issue_date')}
                              className="ml-2 text-xs font-normal normal-case text-gray-400"
                            >
                              {sortBy === 'issue_date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                            </button>
                          </th>
                          <th className="px-4 py-3">Expiration Date</th>
                          <th className="px-4 py-3">
                            State
                            <button
                              onClick={() => toggleSort('state')}
                              className="ml-2 text-xs font-normal normal-case text-gray-400"
                            >
                              {sortBy === 'state' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                            </button>
                          </th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCertifications.map((cert) => (
                          <tr key={cert.id} className="border-t">
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm font-medium text-gray-900">{cert.type}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {getStatusBadge(cert.status, cert.expiration_date)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm text-gray-900">{cert.license_number}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm text-gray-900">{formatDate(cert.issue_date)}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm text-gray-900">{formatDate(cert.expiration_date)}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm text-gray-900">{cert.state ?? '—'}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditClick(cert)}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleViewDetails(cert.id)}
                                  disabled={loadingCertificationId === cert.id}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {loadingCertificationId === cert.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Loading...
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-4 h-4" />
                                      View
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-12 text-center shadow-md border border-gray-100">
                    <Award className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-base font-semibold text-gray-900 mb-2">No certifications yet</h3>
                    <p className="text-sm text-gray-600 mb-6">Get started by adding your first certification</p>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add New Certification
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {caregiverSelf && (
        <EditCaregiverSkillsModal
          isOpen={skillsModalOpen}
          onClose={() => setSkillsModalOpen(false)}
          caregiver={{
            id: caregiverSelf.id,
            first_name: caregiverSelf.first_name,
            last_name: caregiverSelf.last_name,
            skills: caregiverSelf.skills,
          }}
          onSuccess={handleSkillsSaveSuccess}
          subtitle="Choose the skills that describe your experience. They are used to match you with the right clients and open visits."
        />
      )}

      <AddCertificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddSuccess}
        certificationTypes={certificationTypes}
      />

      {selectedCertification && (
        <EditCertificationModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setSelectedCertification(null)
          }}
          onSuccess={handleEditSuccess}
          certificationTypes={certificationTypes}
          certification={selectedCertification}
        />
      )}
    </>
  )
}

export default function MyCertificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <MyCertificationsContent />
    </Suspense>
  )
}
