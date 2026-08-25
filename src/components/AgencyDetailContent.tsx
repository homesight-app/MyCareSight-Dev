'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Globe,
  MapPin,
  Hash,
  Briefcase,
  FileText,
  Users,
  Calendar,
  Download,
  Pencil,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  TrendingUp,
  ExternalLink,
  Search,
  MessageSquare,
  StickyNote,
  Eye,
  Layers,
  Lock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import { updateAgency, type AgencyFormData } from '@/app/actions/agencies'
import { isValidUSPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from '@/lib/validation'
import { assignPlanToAgency } from '@/app/actions/feature-plans'
import { AGENCY_FEATURES } from '@/lib/constants/feature-keys'
import { fetchLeadDocumentsAction, fetchLeadNotesAction } from '@/app/actions/leads'
import { LEAD_STAGES } from '@/lib/constants/lead-configs'
import CreateLicenseModal from './CreateLicenseModal'
import CertificationDetailModal from './CertificationDetailModal'
import AgencyAdminsSection from './AgencyAdminsSection'
import AgencyOnboardingLinkPanel from './AgencyOnboardingLinkPanel'
import AgencyPeopleTab from './AgencyPeopleTab'
import AgencyCaregiversTab from './AgencyCaregiversTab'
import AgencyNotesTab from './AgencyNotesTab'
import AgencyDocumentsTab from './AgencyDocumentsTab'
import ApplyForNewLicenseButton from './ApplyForNewLicenseButton'
import Modal from './Modal'
import type { OnboardingToken, AgencyKeyStaff } from '@/lib/supabase/query'
import { formatDateShort } from '@/lib/format-date'

interface Agency {
  id: string
  name: string
  business_type?: string | null
  tax_id?: string | null
  primary_license_number?: string | null
  website?: string | null
  physical_street_address?: string | null
  physical_city?: string | null
  physical_state?: string | null
  physical_zip_code?: string | null
  mailing_street_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip_code?: string | null
  same_as_physical?: boolean | null
  // Migration 115
  status?: string | null
  // Fields added in migration 112
  dba_name?: string | null
  hours_of_operation?: string | null
  fax_number?: string | null
  date_of_formation?: string | null
  npi?: string | null
  onboarding_status?: string | null
  state_specific_data?: Record<string, unknown> | null
  // Fields added in migration 113
  phone_number?: string | null
  primary_contact_first_name?: string | null
  primary_contact_last_name?: string | null
  email?: string | null
  region_service_area?: string | null
  is_on_call?: boolean | null
  previously_licensed?: boolean | null
  prev_license_closed_date?: string | null
  // Fields added in migration 122 — legal entity + licensed office
  legal_entity_name?: string | null
  entity_type?: string | null
  state_of_incorporation?: string | null
  date_of_incorporation?: string | null
  licensed_office_street?: string | null
  licensed_office_city?: string | null
  licensed_office_state?: string | null
  licensed_office_zip?: string | null
  licensed_same_as_physical?: boolean | null
}

interface LicenseDocument {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  created_at: string
}

interface LinkedApplication {
  id: string
  link_type: 'created_from' | 'renewal_of'
  linked_at: string
  applications: {
    id: string
    status: string
    application_name: string
    started_date: string | null
  } | null
}

interface License {
  id: string
  license_name: string
  license_number?: string | null
  state?: string | null
  status: string
  activated_date?: string | null
  first_issued_date?: string | null
  expiry_date?: string | null
  renewal_due_date?: string | null
  issuing_body?: string | null
  category?: { id: string; name: string } | null
  subcategory?: { id: string; name: string } | null
  previous_version_id?: string | null
  created_at: string
  license_documents?: LicenseDocument[] | null
  certification_applications?: LinkedApplication[] | null
}


interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage?: number | null
  submitted_date?: string | null
  started_date?: string | null
  last_updated_date?: string | null
  created_at: string
}

type ProgramItemStatus = 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'

interface Program {
  id: string
  application_name: string
  state: string
  status: string
  agency_id: string | null
  assigned_expert_id: string | null
  created_at: string
  application_playbook_items: { status: ProgramItemStatus; requirement_type: string }[]
}

interface AgencyAdmin {
  id: string
  contact_name?: string | null
  contact_email?: string | null
}

interface AgencyLead {
  id: string
  contact_first_name: string | null
  contact_last_name: string | null
  company_name: string | null
  service_type: string | null
  stage: string
  source: string | null
  price: number | null
  retainer_amount: number | null
  installment_amount: number | null
  signed_date: string | null
  converted_at: string | null
  created_at: string
}

interface AgencyLeadDocument {
  id: string
  lead_id: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  created_at: string
}

interface FetchedDocument {
  id: string
  document_name: string
  file_url: string
  file_name: string | null
  document_type: string | null
  description: string | null
  created_at: string
}

interface FetchedNote {
  id: string
  author_id: string
  content: string
  note_type: string
  created_at: string
  author: { full_name: string | null } | { full_name: string | null }[] | null
}

export interface FeaturePlanSummary {
  id: string
  name: string
  plan_features: { feature_key: string }[]
}

interface AgencyDetailContentProps {
  agency: Agency & { plan_id?: string | null }
  licenses: License[]
  programs?: Program[]
  agencyAdmins: AgencyAdmin[]
  availableAdmins: AgencyAdmin[]
  backPath: string
  canEdit?: boolean
  activeToken?: OnboardingToken | null
  keyStaff?: AgencyKeyStaff[]
  agencyLeads?: AgencyLead[]
  agencyLeadDocuments?: AgencyLeadDocument[]
  featurePlans?: FeaturePlanSummary[]
}

type OrgFormState = {
  companyName: string
  businessType: string
  taxId: string
  primaryLicenseNumber: string
  website: string
  physicalStreetAddress: string
  physicalCity: string
  physicalState: string
  physicalZipCode: string
  sameAsPhysical: boolean
  mailingStreetAddress: string
  mailingCity: string
  mailingState: string
  mailingZipCode: string
  // New fields (migrations 112 + 113)
  dbaName: string
  hoursOfOperation: string
  faxNumber: string
  dateOfFormation: string
  npi: string
  stateSpecificData: Record<string, unknown>
  phoneNumber: string
  primaryContactFirstName: string
  primaryContactLastName: string
  agencyEmail: string
  regionServiceArea: string
  isOnCall: boolean
  previouslyLicensed: boolean
  prevLicenseClosedDate: string
  // Legal entity fields (migration 122)
  legalEntityName: string
  entityType: string
  stateOfIncorporation: string
  dateOfIncorporation: string
  licensedOfficeStreet: string
  licensedOfficeCity: string
  licensedOfficeState: string
  licensedOfficeZip: string
  licensedSameAsPhysical: boolean
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-100 text-red-700',
}

type AgencySection = 'business' | 'addresses' | 'tax' | 'contacts' | 'additional' | 'plan_access'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const ENTITY_TYPES = ['LLC','S Corporation','C Corporation','Partnership','Sole Proprietorship','Non-profit']

const APP_STATUS_COLORS: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  under_review: 'bg-blue-100 text-blue-700',
  needs_revision: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-100 text-gray-600',
}


function isExpiringSoon(expiryDate?: string | null) {
  if (!expiryDate) return false
  const diff = new Date(expiryDate).getTime() - Date.now()
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000
}

interface FieldProps {
  label: string
  value: string
  isEditing: boolean
  onChange: (val: string) => void
  className?: string
}

function Field({ label, value, isEditing, onChange, className }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {isEditing ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      ) : (
        <p className="text-sm text-gray-900">{value || '—'}</p>
      )}
    </div>
  )
}



export default function AgencyDetailContent({
  agency,
  licenses,
  agencyAdmins,
  availableAdmins,
  backPath,
  canEdit = false,
  activeToken = null,
  keyStaff = [],
  agencyLeads = [],
  agencyLeadDocuments = [],
  programs = [],
  featurePlans = [],
}: AgencyDetailContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const initialTab: 'licenses' | 'organization' | 'people' | 'caregivers' | 'leads' | 'notes' | 'documents' =
    rawTab === 'organization' ? 'organization'
    : rawTab === 'people' ? 'people'
    : rawTab === 'caregivers' ? 'caregivers'
    : rawTab === 'leads' ? 'leads'
    : rawTab === 'notes' ? 'notes'
    : rawTab === 'documents' ? 'documents'
    : 'licenses'
  const [activeTab, setActiveTab] = useState<'licenses' | 'organization' | 'people' | 'caregivers' | 'leads' | 'notes' | 'documents'>(initialTab)
  const [peopleTabActivated, setPeopleTabActivated] = useState(initialTab === 'people')
  const [caregiversTabActivated, setCaregiversTabActivated] = useState(initialTab === 'caregivers')
  const [notesTabActivated, setNotesTabActivated] = useState(initialTab === 'notes')
  const [documentsTabActivated, setDocumentsTabActivated] = useState(initialTab === 'documents')

  const [docsPanel, setDocsPanel] = useState<{ leadId: string; leadName: string } | null>(null)
  const [notesPanel, setNotesPanel] = useState<{ leadId: string; leadName: string } | null>(null)
  const [docsCache, setDocsCache] = useState<Record<string, FetchedDocument[]>>({})
  const [notesCache, setNotesCache] = useState<Record<string, FetchedNote[]>>({})
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

  const openDocsPanel = async (leadId: string, leadName: string) => {
    setDocsPanel({ leadId, leadName })
    if (docsCache[leadId] !== undefined) return
    setLoadingDocs(true)
    const result = await fetchLeadDocumentsAction(leadId)
    if (result.data) setDocsCache(prev => ({ ...prev, [leadId]: result.data as FetchedDocument[] }))
    setLoadingDocs(false)
  }

  const openNotesPanel = async (leadId: string, leadName: string) => {
    setNotesPanel({ leadId, leadName })
    if (notesCache[leadId] !== undefined) return
    setLoadingNotes(true)
    const result = await fetchLeadNotesAction(leadId)
    if (result.data) setNotesCache(prev => ({ ...prev, [leadId]: result.data as FetchedNote[] }))
    setLoadingNotes(false)
  }

  const handleViewLeadDoc = async (fileUrl: string) => {
    const supabase = createClient()
    const url = await createSignedStorageUrl(supabase, STORAGE_BUCKET.LEAD, fileUrl)
    if (url) window.open(url, '_blank')
  }

  const handleDownloadLeadDoc = async (fileUrl: string, fileName: string) => {
    const supabase = createClient()
    const url = await createSignedStorageUrl(supabase, STORAGE_BUCKET.LEAD, fileUrl)
    if (!url) return
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName || 'document'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  const leadNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const l of agencyLeads) {
      map[l.id] = [l.contact_first_name, l.contact_last_name].filter(Boolean).join(' ') || l.company_name || l.id
    }
    return map
  }, [agencyLeads])
  const [activeSection, setActiveSection] = useState<AgencySection>('business')
  const [editingSection, setEditingSection] = useState<AgencySection | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(agency.plan_id ?? '')
  const [planSaveError, setPlanSaveError] = useState<string | null>(null)
  const [planSaving, startPlanSave] = useTransition()
  const [addLicenseOpen, setAddLicenseOpen] = useState(false)
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all')
  const [certCatFilter, setCertCatFilter] = useState<string>('all')

  // License table search + sort
  const [licSearch, setLicSearch] = useState('')
  const [licSortKey, setLicSortKey] = useState<'name' | 'state' | 'number' | 'activated' | 'expires' | 'status'>('name')
  const [licSortDir, setLicSortDir] = useState<'asc' | 'desc'>('asc')
  // Program table filter + sort
  const [programSearch, setProgramSearch] = useState('')
  const [programStatusFilter, setProgramStatusFilter] = useState('all')
  const [programSortKey, setProgramSortKey] = useState<'name' | 'state' | 'status' | 'progress' | 'items'>('name')
  const [programSortDir, setProgramSortDir] = useState<'asc' | 'desc'>('asc')

  function makeHandleSort<K extends string>(
    key: K,
    currentKey: K,
    setKey: (k: K) => void,
    currentDir: 'asc' | 'desc',
    setDir: (d: 'asc' | 'desc') => void
  ) {
    return () => {
      if (currentKey === key) setDir(currentDir === 'asc' ? 'desc' : 'asc')
      else { setKey(key); setDir('asc') }
    }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
    return dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  const buildInitialForm = (): OrgFormState => ({
    companyName: agency.name,
    businessType: agency.business_type ?? '',
    taxId: agency.tax_id ?? '',
    primaryLicenseNumber: agency.primary_license_number ?? '',
    website: agency.website ?? '',
    physicalStreetAddress: agency.physical_street_address ?? '',
    physicalCity: agency.physical_city ?? '',
    physicalState: agency.physical_state ?? '',
    physicalZipCode: agency.physical_zip_code ?? '',
    sameAsPhysical: agency.same_as_physical ?? true,
    mailingStreetAddress: agency.mailing_street_address ?? '',
    mailingCity: agency.mailing_city ?? '',
    mailingState: agency.mailing_state ?? '',
    mailingZipCode: agency.mailing_zip_code ?? '',
    dbaName: agency.dba_name ?? '',
    hoursOfOperation: agency.hours_of_operation ?? '',
    faxNumber: agency.fax_number ?? '',
    dateOfFormation: agency.date_of_formation ?? '',
    npi: agency.npi ?? '',
    stateSpecificData: agency.state_specific_data ?? {},
    phoneNumber: agency.phone_number ?? '',
    primaryContactFirstName: agency.primary_contact_first_name ?? '',
    primaryContactLastName: agency.primary_contact_last_name ?? '',
    agencyEmail: agency.email ?? '',
    regionServiceArea: agency.region_service_area ?? '',
    isOnCall: agency.is_on_call ?? false,
    previouslyLicensed: agency.previously_licensed ?? false,
    prevLicenseClosedDate: agency.prev_license_closed_date ?? '',
    legalEntityName: agency.legal_entity_name ?? '',
    entityType: agency.entity_type ?? '',
    stateOfIncorporation: agency.state_of_incorporation ?? '',
    dateOfIncorporation: agency.date_of_incorporation ?? '',
    licensedOfficeStreet: agency.licensed_office_street ?? '',
    licensedOfficeCity: agency.licensed_office_city ?? '',
    licensedOfficeState: agency.licensed_office_state ?? '',
    licensedOfficeZip: agency.licensed_office_zip ?? '',
    licensedSameAsPhysical: agency.licensed_same_as_physical ?? false,
  })

  const [orgForm, setOrgForm] = useState<OrgFormState>(buildInitialForm)

  const handleSave = async () => {
    if (orgForm.phoneNumber && !isValidUSPhone(orgForm.phoneNumber)) {
      setSaveError(PHONE_ERROR)
      return
    }
    if (orgForm.faxNumber && !isValidUSPhone(orgForm.faxNumber)) {
      setSaveError(`Fax: ${PHONE_ERROR}`)
      return
    }
    if (orgForm.agencyEmail && !isValidEmail(orgForm.agencyEmail)) {
      setSaveError(EMAIL_ERROR)
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const currentAdminIds = agencyAdmins.map(a => a.id)
      const payload: AgencyFormData = {
        companyName: orgForm.companyName,
        agencyAdminIds: currentAdminIds,
        businessType: orgForm.businessType,
        taxId: orgForm.taxId,
        primaryLicenseNumber: orgForm.primaryLicenseNumber,
        website: orgForm.website || undefined,
        physicalStreetAddress: orgForm.physicalStreetAddress,
        physicalCity: orgForm.physicalCity,
        physicalState: orgForm.physicalState,
        physicalZipCode: orgForm.physicalZipCode,
        sameAsPhysical: orgForm.sameAsPhysical,
        mailingStreetAddress: orgForm.mailingStreetAddress || undefined,
        mailingCity: orgForm.mailingCity || undefined,
        mailingState: orgForm.mailingState || undefined,
        mailingZipCode: orgForm.mailingZipCode || undefined,
        dbaName: orgForm.dbaName || undefined,
        hoursOfOperation: orgForm.hoursOfOperation || undefined,
        faxNumber: orgForm.faxNumber || undefined,
        dateOfFormation: orgForm.dateOfFormation || undefined,
        npi: orgForm.npi || undefined,
        stateSpecificData: orgForm.stateSpecificData,
        primaryContactFirstName: orgForm.primaryContactFirstName || undefined,
        primaryContactLastName: orgForm.primaryContactLastName || undefined,
        phoneNumber: orgForm.phoneNumber || undefined,
        agencyEmail: orgForm.agencyEmail || undefined,
        regionServiceArea: orgForm.regionServiceArea || undefined,
        isOnCall: orgForm.isOnCall,
        previouslyLicensed: orgForm.previouslyLicensed,
        prevLicenseClosedDate: orgForm.prevLicenseClosedDate || undefined,
        legalEntityName: orgForm.legalEntityName || undefined,
        entityType: orgForm.entityType || undefined,
        stateOfIncorporation: orgForm.stateOfIncorporation || undefined,
        dateOfIncorporation: orgForm.dateOfIncorporation || undefined,
        licensedOfficeStreet: orgForm.licensedOfficeStreet || undefined,
        licensedOfficeCity: orgForm.licensedOfficeCity || undefined,
        licensedOfficeState: orgForm.licensedOfficeState || undefined,
        licensedOfficeZip: orgForm.licensedOfficeZip || undefined,
        licensedSameAsPhysical: orgForm.licensedSameAsPhysical,
      }
      const { error } = await updateAgency(agency.id, payload, currentAdminIds)
      if (error) throw new Error(error)
      setEditingSection(null)
      router.refresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setOrgForm(buildInitialForm())
    setSaveError(null)
    setEditingSection(null)
  }

  const activeLicenses = licenses.filter((l) => l.status === 'active' && !isExpiringSoon(l.expiry_date))
  const expiringSoon = licenses.filter((l) => l.status === 'active' && isExpiringSoon(l.expiry_date))
  const expiredLicenses = licenses.filter((l) => l.status === 'expired')

  // Build category tabs dynamically from the actual licenses on this agency
  const certCategories = useMemo(() => {
    const seen = new Set<string>()
    const cats: { value: string; label: string }[] = [{ value: 'all', label: 'All' }]
    for (const l of licenses) {
      if (l.category?.name && !seen.has(l.category.name)) {
        seen.add(l.category.name)
        cats.push({ value: l.category.name, label: l.category.name })
      }
    }
    return cats
  }, [licenses])

  const displayedLicenses = useMemo(() => {
    const term = licSearch.trim().toLowerCase()
    const list = licenses.filter((l) => {
      if (statusFilter === 'active' && !(l.status === 'active' && !isExpiringSoon(l.expiry_date))) return false
      if (statusFilter === 'expiring' && !(l.status === 'active' && isExpiringSoon(l.expiry_date))) return false
      if (statusFilter === 'expired' && l.status !== 'expired') return false
      if (certCatFilter !== 'all' && (l.category?.name ?? '') !== certCatFilter) return false
      if (term && !l.license_name.toLowerCase().includes(term) && !(l.state ?? '').toLowerCase().includes(term) && !(l.license_number ?? '').toLowerCase().includes(term)) return false
      return true
    })
    return list.sort((a, b) => {
      let cmp = 0
      if (licSortKey === 'name') cmp = a.license_name.localeCompare(b.license_name)
      if (licSortKey === 'state') cmp = (a.state ?? '').localeCompare(b.state ?? '')
      if (licSortKey === 'number') cmp = (a.license_number ?? '').localeCompare(b.license_number ?? '')
      if (licSortKey === 'activated') cmp = (a.activated_date ?? '').localeCompare(b.activated_date ?? '')
      if (licSortKey === 'expires') cmp = (a.expiry_date ?? '').localeCompare(b.expiry_date ?? '')
      if (licSortKey === 'status') cmp = a.status.localeCompare(b.status)
      return licSortDir === 'asc' ? cmp : -cmp
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenses, statusFilter, certCatFilter, licSearch, licSortKey, licSortDir])

  // Programs: filter + sort
  const displayedPrograms = useMemo(() => {
    const term = programSearch.trim().toLowerCase()
    const list = programs.filter(p => {
      if (programStatusFilter !== 'all' && p.status !== programStatusFilter) return false
      if (term && !p.application_name.toLowerCase().includes(term) && !p.state.toLowerCase().includes(term)) return false
      return true
    })
    return list.sort((a, b) => {
      let cmp = 0
      if (programSortKey === 'name') cmp = a.application_name.localeCompare(b.application_name)
      if (programSortKey === 'state') cmp = a.state.localeCompare(b.state)
      if (programSortKey === 'status') cmp = a.status.localeCompare(b.status)
      if (programSortKey === 'progress') {
        const pctOf = (p: typeof a) => {
          const items = p.application_playbook_items ?? []
          const na = items.filter(i => i.status === 'not_applicable').length
          const countable = items.length - na
          const approved = items.filter(i => i.status === 'approved').length
          return countable > 0 ? Math.round((approved / countable) * 100) : 0
        }
        cmp = pctOf(a) - pctOf(b)
      }
      if (programSortKey === 'items') cmp = (a.application_playbook_items?.length ?? 0) - (b.application_playbook_items?.length ?? 0)
      return programSortDir === 'asc' ? cmp : -cmp
    })
  }, [programs, programSearch, programStatusFilter, programSortKey, programSortDir])

  // Unique statuses present in programs for filter dropdown
  const programStatuses = useMemo(() => Array.from(new Set(programs.map(p => p.status))).sort(), [programs])


  const physicalAddress = [
    agency.physical_street_address,
    agency.physical_city,
    agency.physical_state,
    agency.physical_zip_code,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={backPath}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agencies
      </Link>

      {/* Agency info card */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{agency.name}</h1>
            {agency.business_type && (
              <p className="text-sm text-gray-500 mt-0.5">{agency.business_type}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {agency.tax_id && (
            <div className="flex items-start gap-2">
              <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tax ID</p>
                <p className="text-gray-900">{agency.tax_id}</p>
              </div>
            </div>
          )}
          {agency.website && (
            <div className="flex items-start gap-2">
              <Globe className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Website</p>
                <a
                  href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {agency.website}
                </a>
              </div>
            </div>
          )}
          {physicalAddress && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Address</p>
                <p className="text-gray-900">{physicalAddress}</p>
              </div>
            </div>
          )}
          {agencyAdmins.length > 0 && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Agency Admins</p>
                <p className="text-gray-900">
                  {agencyAdmins
                    .map((a) => a.contact_name || a.contact_email || 'Unknown')
                    .join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {([
            { key: 'licenses', label: 'Certifications' },
            { key: 'leads', label: `Leads${agencyLeads.length > 0 ? ` (${agencyLeads.length})` : ''}` },
            { key: 'organization', label: 'Organization' },
            { key: 'people', label: 'People' },
            { key: 'caregivers', label: 'Caregivers' },
            { key: 'notes', label: 'Notes' },
            { key: 'documents', label: 'Documents' },
          ] as const).map(({ key: tab, label }) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
                if (tab === 'people') setPeopleTabActivated(true)
                if (tab === 'caregivers') setCaregiversTabActivated(true)
                if (tab === 'notes') setNotesTabActivated(true)
                if (tab === 'documents') setDocumentsTabActivated(true)
              }}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Licenses tab */}
      {activeTab === 'licenses' && (
        <>
          {/* License stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Certifications</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{activeLicenses.length}</p>
              </div>
              <CheckCircle2 className="w-9 h-9 text-green-500" />
            </div>
            <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Expiring Soon</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{expiringSoon.length}</p>
              </div>
              <Clock className="w-9 h-9 text-orange-400" />
            </div>
            <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Expired</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{expiredLicenses.length}</p>
              </div>
              <AlertCircle className="w-9 h-9 text-red-400" />
            </div>
          </div>

          {/* Client Licenses section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Certifications</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    value={licSearch}
                    onChange={e => setLicSearch(e.target.value)}
                    placeholder="Search…"
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-44"
                  />
                </div>
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="appearance-none pl-3 pr-7 py-1.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="expiring">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => setAddLicenseOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Certification
                </button>
              </div>
            </div>

            {/* Category filter pills */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
              {certCategories.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCertCatFilter(cat.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    certCatFilter === cat.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {licenses.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No certifications yet. Click &quot;Add Certification&quot; to create one.
              </div>
            ) : displayedLicenses.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No certifications match the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {([
                        ['name',      'Certification'],
                        ['state',     'State'],
                        ['number',    'Cert #'],
                        ['activated', 'Issued'],
                        ['expires',   'Expires'],
                        ['status',    'Status'],
                      ] as const).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => makeHandleSort(key, licSortKey, setLicSortKey, licSortDir, setLicSortDir)()}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900"
                        >
                          <span className="inline-flex items-center gap-1">
                            {label} <SortIcon active={licSortKey === key} dir={licSortDir} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedLicenses.map((license) => (
                      <tr
                        key={license.id}
                        onClick={() => setSelectedCertId(license.id)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {license.license_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {license.state ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {license.state}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Federal</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {license.license_number || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDateShort(license.activated_date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDateShort(license.expiry_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                              STATUS_COLORS[license.status] ?? 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isExpiringSoon(license.expiry_date) && license.status === 'active'
                              ? 'Expiring Soon'
                              : license.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Programs section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Programs</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    value={programSearch}
                    onChange={e => setProgramSearch(e.target.value)}
                    placeholder="Search…"
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-44"
                  />
                </div>
                <div className="relative">
                  <select
                    value={programStatusFilter}
                    onChange={e => setProgramStatusFilter(e.target.value)}
                    className="appearance-none pl-3 pr-7 py-1.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    {programStatuses.map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <ApplyForNewLicenseButton
                  agencyId={agency.id}
                  agencyName={agency.name}
                  label="New Program"
                  programsOnly
                />
              </div>
            </div>

            {programs.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No programs found for this agency.
              </div>
            ) : displayedPrograms.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">No programs match the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {([
                        ['name',     'Program Name'],
                        ['state',    'State'],
                        ['status',   'Status'],
                        ['progress', 'Progress'],
                        ['items',    'Items'],
                      ] as const).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => makeHandleSort(key, programSortKey, setProgramSortKey, programSortDir, setProgramSortDir)()}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                        >
                          <span className="inline-flex items-center gap-1">
                            {label} <SortIcon active={programSortKey === key} dir={programSortDir} />
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedPrograms.map((program) => {
                      const items = program.application_playbook_items ?? []
                      const na = items.filter(i => i.status === 'not_applicable').length
                      const countable = items.length - na
                      const approved = items.filter(i => i.status === 'approved').length
                      const pct = countable > 0 ? Math.round((approved / countable) * 100) : 0
                      const programDetailPath = `${backPath.startsWith('/pages/admin') ? '/pages/admin/programs' : '/pages/expert/programs'}/${program.id}`
                      return (
                        <tr key={program.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900">{program.application_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-sm text-gray-700">
                              <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              {program.state}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${APP_STATUS_COLORS[program.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {program.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {items.length} items
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Link
                              href={programDetailPath}
                              className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Organization tab */}
      {activeTab === 'organization' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100">
          <div className="flex min-h-[500px]">
            {/* Left sidebar */}
            <div className="w-48 flex-shrink-0 border-r border-gray-200 py-4 pr-2 space-y-1">
              {(([
                { id: 'business',    label: 'Business Info' },
                { id: 'addresses',   label: 'Addresses' },
                { id: 'tax',         label: 'Tax Info' },
                { id: 'contacts',    label: 'Contacts' },
                { id: 'additional',  label: 'Additional' },
                { id: 'plan_access', label: 'Plan & Access' },
              ]) as { id: AgencySection; label: string }[]).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (editingSection) { setOrgForm(buildInitialForm()); setSaveError(null) }
                    setEditingSection(null)
                    setActiveSection(s.id)
                  }}
                  className={`flex items-center w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === s.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Right content panel */}
            <div className="flex-1 p-6 min-w-0">
              {saveError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{saveError}</div>
              )}

              {/* ── Business Information ── */}
              {activeSection === 'business' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-gray-900">Business Information</h3>
                    {canEdit && editingSection !== 'business' && (
                      <button type="button" onClick={() => setEditingSection('business')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />Edit
                      </button>
                    )}
                    {canEdit && editingSection === 'business' && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Legal Entity Name" value={orgForm.legalEntityName} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, legalEntityName: val }))} className="sm:col-span-2" />
                    <Field label="DBA / Trade Name" value={orgForm.dbaName} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, dbaName: val }))} />
                    <Field label="Agency Name" value={orgForm.companyName} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, companyName: val }))} />
                    {editingSection === 'business' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Entity Type</label>
                        <select value={orgForm.entityType} onChange={e => setOrgForm(f => ({ ...f, entityType: e.target.value }))} className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                          <option value="">— Select —</option>
                          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Entity Type</label>
                        <p className="text-sm text-gray-900">{orgForm.entityType || '—'}</p>
                      </div>
                    )}
                    <Field label="Tax ID / FEIN" value={orgForm.taxId} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, taxId: val }))} />
                    <Field label="NPI" value={orgForm.npi} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, npi: val }))} />
                    <Field label="Date of Formation" value={orgForm.dateOfFormation} isEditing={editingSection === 'business'} onChange={val => setOrgForm(f => ({ ...f, dateOfFormation: val }))} />
                    {editingSection === 'business' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">State of Incorporation</label>
                        <select value={orgForm.stateOfIncorporation} onChange={e => setOrgForm(f => ({ ...f, stateOfIncorporation: e.target.value }))} className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
                          <option value="">— Select State —</option>
                          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">State of Incorporation</label>
                        <p className="text-sm text-gray-900">{orgForm.stateOfIncorporation || '—'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Addresses ── */}
              {activeSection === 'addresses' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-gray-900">Addresses</h3>
                    {canEdit && editingSection !== 'addresses' && (
                      <button type="button" onClick={() => setEditingSection('addresses')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />Edit
                      </button>
                    )}
                    {canEdit && editingSection === 'addresses' && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-6">
                    {/* Corporate */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Corporate Address</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Street" value={orgForm.physicalStreetAddress} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, physicalStreetAddress: val }))} className="sm:col-span-2" />
                        <Field label="City" value={orgForm.physicalCity} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, physicalCity: val }))} />
                        <Field label="State" value={orgForm.physicalState} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, physicalState: val }))} />
                        <Field label="ZIP Code" value={orgForm.physicalZipCode} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, physicalZipCode: val }))} />
                      </div>
                    </div>
                    {/* Licensed Office */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Office Address (Licensed)</p>
                      {editingSection === 'addresses' && (
                        <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer select-none">
                          <input type="checkbox" checked={orgForm.licensedSameAsPhysical} onChange={e => setOrgForm(f => ({ ...f, licensedSameAsPhysical: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          Same as corporate address
                        </label>
                      )}
                      {orgForm.licensedSameAsPhysical && editingSection !== 'addresses' ? (
                        <p className="text-sm text-gray-500 italic">Same as corporate address</p>
                      ) : !orgForm.licensedSameAsPhysical ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Street" value={orgForm.licensedOfficeStreet} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, licensedOfficeStreet: val }))} className="sm:col-span-2" />
                          <Field label="City" value={orgForm.licensedOfficeCity} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, licensedOfficeCity: val }))} />
                          <Field label="State" value={orgForm.licensedOfficeState} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, licensedOfficeState: val }))} />
                          <Field label="ZIP Code" value={orgForm.licensedOfficeZip} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, licensedOfficeZip: val }))} />
                        </div>
                      ) : null}
                    </div>
                    {/* Mailing */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Mailing Address</p>
                      {editingSection === 'addresses' && (
                        <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer select-none">
                          <input type="checkbox" checked={orgForm.sameAsPhysical} onChange={e => setOrgForm(f => ({ ...f, sameAsPhysical: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          Same as corporate address
                        </label>
                      )}
                      {orgForm.sameAsPhysical && editingSection !== 'addresses' ? (
                        <p className="text-sm text-gray-500 italic">Same as corporate address</p>
                      ) : !orgForm.sameAsPhysical ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Street" value={orgForm.mailingStreetAddress} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, mailingStreetAddress: val }))} className="sm:col-span-2" />
                          <Field label="City" value={orgForm.mailingCity} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, mailingCity: val }))} />
                          <Field label="State" value={orgForm.mailingState} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, mailingState: val }))} />
                          <Field label="ZIP Code" value={orgForm.mailingZipCode} isEditing={editingSection === 'addresses'} onChange={val => setOrgForm(f => ({ ...f, mailingZipCode: val }))} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tax Information ── */}
              {activeSection === 'tax' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-gray-900">Tax Information</h3>
                    {canEdit && editingSection !== 'tax' && (
                      <button type="button" onClick={() => setEditingSection('tax')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />Edit
                      </button>
                    )}
                    {canEdit && editingSection === 'tax' && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tax ID / FEIN</label>
                      <p className="text-sm text-gray-900">{agency.tax_id || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Edit in Business Info</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Entity Type</label>
                      <p className="text-sm text-gray-900">{agency.entity_type || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Edit in Business Info</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">State of Incorporation</label>
                      <p className="text-sm text-gray-900">{agency.state_of_incorporation || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Edit in Business Info</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    {editingSection === 'tax' ? (
                      <>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" checked={orgForm.previouslyLicensed} onChange={e => setOrgForm(f => ({ ...f, previouslyLicensed: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          Previously licensed
                        </label>
                        {orgForm.previouslyLicensed && (
                          <Field label="Previous License Closed Date" value={orgForm.prevLicenseClosedDate} isEditing onChange={val => setOrgForm(f => ({ ...f, prevLicenseClosedDate: val }))} />
                        )}
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Previously Licensed</label>
                        <p className="text-sm text-gray-900">
                          {agency.previously_licensed === true
                            ? `Yes${agency.prev_license_closed_date ? ` (closed ${formatDateShort(agency.prev_license_closed_date)})` : ''}`
                            : agency.previously_licensed === false ? 'No' : '—'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Contacts ── */}
              {activeSection === 'contacts' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-gray-900">Contacts</h3>
                    {canEdit && editingSection !== 'contacts' && (
                      <button type="button" onClick={() => setEditingSection('contacts')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />Edit
                      </button>
                    )}
                    {canEdit && editingSection === 'contacts' && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="First Name" value={orgForm.primaryContactFirstName} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, primaryContactFirstName: val }))} />
                    <Field label="Last Name" value={orgForm.primaryContactLastName} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, primaryContactLastName: val }))} />
                    <Field label="Phone Number" value={orgForm.phoneNumber} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, phoneNumber: val }))} />
                    <Field label="Email" value={orgForm.agencyEmail} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, agencyEmail: val }))} />
                    <Field label="Fax Number" value={orgForm.faxNumber} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, faxNumber: val }))} />
                    <Field label="Website" value={orgForm.website} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, website: val }))} />
                    <Field label="Region / Service Area" value={orgForm.regionServiceArea} isEditing={editingSection === 'contacts'} onChange={val => setOrgForm(f => ({ ...f, regionServiceArea: val }))} className="sm:col-span-2" />
                  </div>
                  <div className="mt-3">
                    {editingSection === 'contacts' ? (
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={orgForm.isOnCall} onChange={e => setOrgForm(f => ({ ...f, isOnCall: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        Agency provides on-call services
                      </label>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">On-Call Services</label>
                        <p className="text-sm text-gray-900">{agency.is_on_call === true ? 'Yes' : agency.is_on_call === false ? 'No' : '—'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Additional Details ── */}
              {activeSection === 'additional' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">Additional Details</h3>
                    {canEdit && editingSection !== 'additional' && (
                      <button type="button" onClick={() => setEditingSection('additional')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />Edit
                      </button>
                    )}
                    {canEdit && editingSection === 'additional' && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button type="button" onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                        </button>
                      </div>
                    )}
                  </div>
                  <Field label="Hours of Operation" value={orgForm.hoursOfOperation} isEditing={editingSection === 'additional'} onChange={val => setOrgForm(f => ({ ...f, hoursOfOperation: val }))} />
                  {canEdit && (
                    <AgencyOnboardingLinkPanel agencyId={agency.id} agencyName={agency.name} activeToken={activeToken} />
                  )}
                  
                </div>
              )}

              {/* ── Plan & Access ── */}
              {activeSection === 'plan_access' && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Layers className="w-5 h-5 text-slate-600" />
                    <h3 className="text-base font-semibold text-gray-900">Plan & Access</h3>
                  </div>

                  {featurePlans.length === 0 ? (
                    <p className="text-sm text-slate-500">No feature plans have been created yet. Go to Admin → Feature Plans to create one.</p>
                  ) : (
                    <div className="space-y-6 max-w-md">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Current Plan</label>
                        <div className="flex items-center gap-3">
                          <select
                            value={selectedPlanId}
                            onChange={e => { setSelectedPlanId(e.target.value); setPlanSaveError(null) }}
                            disabled={!canEdit}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600 disabled:bg-gray-50 disabled:text-gray-500"
                          >
                            <option value="">No plan (all features)</option>
                            {featurePlans.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {canEdit && (
                            <button
                              type="button"
                              disabled={planSaving}
                              onClick={() => {
                                setPlanSaveError(null)
                                startPlanSave(async () => {
                                  const result = await assignPlanToAgency(agency.id, selectedPlanId || null)
                                  if (result.error) setPlanSaveError(result.error)
                                })
                              }}
                              className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {planSaving ? 'Saving…' : 'Save'}
                            </button>
                          )}
                        </div>
                        {planSaveError && <p className="text-sm text-red-600 mt-2">{planSaveError}</p>}
                      </div>

                      {/* Feature list for the selected plan */}
                      {(() => {
                        const plan = featurePlans.find(p => p.id === selectedPlanId)
                        if (!plan) {
                          return (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-green-800 mb-1">Unrestricted access</p>
                              <p className="text-xs text-green-600">This agency has access to all features.</p>
                            </div>
                          )
                        }
                        const enabledKeys = new Set(plan.plan_features.map(f => f.feature_key))
                        const sectionFeatures = AGENCY_FEATURES.filter(f => f.parentKey === null)
                        return (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Features in this plan</label>
                            <div className="space-y-1.5">
                              {sectionFeatures.map(f => {
                                const enabled = enabledKeys.has(f.key)
                                return (
                                  <div key={f.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${enabled ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-400'}`}>
                                    {enabled ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                    ) : (
                                      <Lock className="w-4 h-4 text-gray-300 shrink-0" />
                                    )}
                                    <span>{f.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leads tab */}
      {activeTab === 'leads' && (() => {
        const stageColorMap = Object.fromEntries(LEAD_STAGES.map(s => [s.key, s.color]))
        const totalDeals = agencyLeads.length
        const totalValue = agencyLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
        const signedLeads = agencyLeads.filter(l => l.stage === 'signed' || l.converted_at)
        const signedValue = signedLeads.reduce((sum, l) => sum + (l.price ?? 0), 0)
        const retainerCollected = agencyLeads.reduce((sum, l) => sum + (l.retainer_amount ?? 0), 0)

        const fmtCurrency = (n: number) =>
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

        const leadNameMap = Object.fromEntries(
          agencyLeads.map(l => [l.id, `${l.contact_first_name ?? ''} ${l.contact_last_name ?? ''}`.trim() || l.company_name || '(No name)'])
        )

        return (
          <div className="space-y-6">
            {/* Revenue summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Deals', value: String(totalDeals), icon: <Briefcase className="w-8 h-8 text-blue-400" /> },
                { label: 'Total Value', value: fmtCurrency(totalValue), icon: <TrendingUp className="w-8 h-8 text-indigo-400" /> },
                { label: 'Signed Value', value: fmtCurrency(signedValue), icon: <CheckCircle2 className="w-8 h-8 text-green-500" /> },
                { label: 'Retainer Collected', value: fmtCurrency(retainerCollected), icon: <Hash className="w-8 h-8 text-orange-400" /> },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{card.label}</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
                  </div>
                  {card.icon}
                </div>
              ))}
            </div>

            {/* Deals table */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Deals</h2>
              </div>
              {agencyLeads.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No associated leads yet.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-36">Stage</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-40">Service Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-28">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-28">Signed Date</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agencyLeads.map(lead => {
                      const name = leadNameMap[lead.id]
                      return (
                        <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-gray-900">{name}</p>
                            {lead.company_name && (
                              <p className="text-xs text-gray-400 mt-0.5">{lead.company_name}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stageColorMap[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                              {LEAD_STAGES.find(s => s.key === lead.stage)?.label ?? lead.stage}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{lead.service_type ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{lead.price != null ? fmtCurrency(lead.price) : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {lead.signed_date ? new Date(lead.signed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                title="View documents"
                                onClick={() => openDocsPanel(lead.id, name)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="View notes"
                                onClick={() => openNotesPanel(lead.id, name)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <StickyNote className="w-4 h-4" />
                              </button>
                              <a
                                href={`/pages/admin/leads/${lead.id}`}
                                title="Open lead"
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors inline-flex"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {/* People tab — lazy-mounted on first activation, kept in DOM after that */}
      <div className={activeTab === 'people' ? '' : 'hidden'}>
        {peopleTabActivated && <AgencyPeopleTab agencyId={agency.id} />}
      </div>

      {/* Caregivers tab — lazy-mounted on first activation, kept in DOM after that */}
      <div className={activeTab === 'caregivers' ? '' : 'hidden'}>
        {caregiversTabActivated && <AgencyCaregiversTab agencyId={agency.id} />}
      </div>

      {/* Notes tab */}
      <div className={activeTab === 'notes' ? '' : 'hidden'}>
        {notesTabActivated && (
          <AgencyNotesTab
            agencyId={agency.id}
            leadIds={Object.keys(leadNameMap)}
            leadNameMap={leadNameMap}
          />
        )}
      </div>

      {/* Documents tab */}
      <div className={activeTab === 'documents' ? '' : 'hidden'}>
        {documentsTabActivated && (
          <AgencyDocumentsTab
            agencyId={agency.id}
            leadDocuments={agencyLeadDocuments}
            leadNameMap={leadNameMap}
          />
        )}
      </div>

      {/* Lead Documents panel */}
      {docsPanel && (
        <Modal
          isOpen={true}
          onClose={() => setDocsPanel(null)}
          title={`Documents — ${docsPanel.leadName}`}
          size="lg"
        >
          <div className="p-6">
            {loadingDocs && docsCache[docsPanel.leadId] === undefined ? (
              <div className="flex items-center justify-center py-10 gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading documents…</span>
              </div>
            ) : (docsCache[docsPanel.leadId] ?? []).length === 0 ? (
              <div className="py-10 text-center text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No documents attached to this lead.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Document</th>
                    <th className="pb-2 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-32">Type</th>
                    <th className="pb-2 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-32">Date</th>
                    <th className="pb-2 w-20 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(docsCache[docsPanel.leadId] ?? []).map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900">{doc.document_name}</span>
                        </div>
                        {doc.file_name && <p className="text-xs text-gray-400 ml-6 mt-0.5">{doc.file_name}</p>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{doc.document_type ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="View"
                            onClick={() => handleViewLeadDoc(doc.file_url)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Download"
                            onClick={() => handleDownloadLeadDoc(doc.file_url, doc.file_name ?? doc.document_name)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}

      {/* Lead Notes panel */}
      {notesPanel && (
        <Modal
          isOpen={true}
          onClose={() => setNotesPanel(null)}
          title={`Notes — ${notesPanel.leadName}`}
          size="lg"
        >
          <div className="p-6">
            {loadingNotes && notesCache[notesPanel.leadId] === undefined ? (
              <div className="flex items-center justify-center py-10 gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading notes…</span>
              </div>
            ) : (notesCache[notesPanel.leadId] ?? []).length === 0 ? (
              <div className="py-10 text-center text-gray-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No notes on this lead.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(notesCache[notesPanel.leadId] ?? []).map(note => {
                  const author = Array.isArray(note.author) ? note.author[0] : note.author
                  return (
                    <div key={note.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">{author?.full_name ?? 'Unknown'}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600 capitalize">
                            {note.note_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modals — always mounted regardless of active tab */}
      {selectedCertId && (() => {
        const cert = licenses.find(l => l.id === selectedCertId)
        return cert ? (
          <CertificationDetailModal
            license={cert}
            agencyId={agency.id}
            backPath={backPath}
            canEdit={canEdit}
            onClose={() => setSelectedCertId(null)}
          />
        ) : null
      })()}

      <CreateLicenseModal
        isOpen={addLicenseOpen}
        onClose={() => setAddLicenseOpen(false)}
        onSuccess={() => setAddLicenseOpen(false)}
        agencyId={agency.id}
        agencyName={agency.name}
        availablePrograms={programs.map(p => ({ id: p.id, application_name: p.application_name, status: p.status }))}
      />
    </div>
  )
}
