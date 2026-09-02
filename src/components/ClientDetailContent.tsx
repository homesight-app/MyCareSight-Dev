'use client'

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight,
  Edit,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Users,
  Plus,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileText,
  Trash2,
  ExternalLink,
  Sparkles,
  Save,
  Upload,
  Download,
  Search,
  ClipboardList,
  Infinity,
  Check,
  Clock,
  TrendingUp,
  X,
  Timer,
  SquareArrowOutUpRight,
  Lock,
} from 'lucide-react'
import UpgradePromptModal from './UpgradePromptModal'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import { getThreeWeekRollingWindowPacific } from '@/lib/pct-week-horizon'
import { expandSeriesOccurrences } from '@/lib/recurrence-dates'
import * as q from '@/lib/supabase/query'
import type { PatientAddress } from '@/lib/supabase/query/patient-addresses'
import { upsertPatientCaregiverRequirementsAction } from '@/app/actions/patients'
import { uploadPatientDocumentsAction, deletePatientDocumentAction } from '@/app/actions/patient-documents'
import { markScheduleMissedAction, markScheduleCancelledAction, markScheduleOnHoldAction, reinstateScheduleAction } from '@/app/actions/schedule-assignment-requests'
import { addPatientAddressAction, updatePatientAddressAction, deletePatientAddressAction, setPrimaryPatientAddressAction } from '@/app/actions/patient-addresses'
import { updatePatientServiceContractBillRateAction } from '@/app/actions/payroll-billing-report'
import { getActiveBillingCodesAction } from '@/app/actions/billing'
import type { PatientRepresentative } from '@/lib/supabase/query/patients-representatives'
import type { PatientDocument } from '@/lib/supabase/query/patients'
import type { CaregiverRequirement } from '@/lib/supabase/query/caregiver-requirements'
import type { PatientIncident } from '@/lib/supabase/query/patient-incidents'
import type { PatientAdl, PatientAdlDaySchedule } from '@/lib/supabase/query/patient-adls'
import type { ScheduleRow } from '@/lib/supabase/query/schedules'
import type { CaregiverAvailabilitySlotRow } from '@/lib/supabase/query/caregiver-availability'
import { visitStatusBadgeClass, visitStatusFromScheduleRow } from '@/lib/visit-status-styles'
import { computeCaregiverMatches } from '@/lib/caregiver-matching'
import { CaregiverAssignmentList } from '@/components/CaregiverAssignmentList'
import type { PatientContractedHoursRow } from '@/lib/supabase/query/patient-contracted-hours'
import type { PatientSkilledTaskDaySchedule, SkilledCarePlanTask } from '@/lib/supabase/query/skilled-care-plan'
import type { PatientServiceContractRow } from '@/lib/supabase/query/patient-service-contracts'
import {
  patientServiceContractUiPhase,
  patientServiceContractsSelectableForBillingVisit,
} from '@/lib/patient-service-contract-effective'
import Modal from '@/components/Modal'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import PhoneInput from '@/components/ui/PhoneInput'
import InternalNotesPanel from '@/components/InternalNotesPanel'
import zipcodes from 'zipcodes'
import { patientFullName } from '@/lib/patient-name'
import { US_STATES } from '@/lib/constants'

const VISIT_TYPES = ['Routine', 'Medical', 'Therapy', 'Social', 'Other'] as const

/** Stable fallback when `skilledSchedules` prop is omitted — avoid `= []` default (new ref every render) clobbering local state in useEffect. */
const EMPTY_SKILLED_SCHEDULES: PatientSkilledTaskDaySchedule[] = []

/** Safe filename for the browser download attribute (original name minus illegal characters). */
function sanitizeDownloadFilename(name: string): string {
  const base = name.trim() || 'document'
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 255)
}

/** Order used in Add/Edit Visit → ADLs tab when ADL plan uses specific times (morning…night). */
const ADL_VISIT_TIME_SLOTS = [
  { key: 'morning' as const, label: 'Morning' },
  { key: 'afternoon' as const, label: 'Afternoon' },
  { key: 'evening' as const, label: 'Evening' },
  { key: 'night' as const, label: 'Night' },
]

type ScheduleSlotFields = Pick<
  PatientAdlDaySchedule,
  'schedule_type' | 'slot_morning' | 'slot_afternoon' | 'slot_evening' | 'slot_night'
>

function scheduleHasAdlSlot(
  schedule: ScheduleSlotFields | undefined,
  slotKey: (typeof ADL_VISIT_TIME_SLOTS)[number]['key']
): boolean {
  if (!schedule || schedule.schedule_type !== 'specific_times') return false
  switch (slotKey) {
    case 'morning':
      return !!schedule.slot_morning
    case 'afternoon':
      return !!schedule.slot_afternoon
    case 'evening':
      return !!schedule.slot_evening
    case 'night':
      return !!schedule.slot_night
    default:
      return false
  }
}

/** Stored in schedules.adl_codes so the same ADL can be chosen per time slot independently. */
const VISIT_ADL_SLOT_SEP = '::'

function dayOfWeekDbFromDateStr(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00').getDay()
  return d === 0 ? 7 : d
}

function encodeVisitAdlSlotKey(slotKey: string, adlCode: string): string {
  return `${slotKey}${VISIT_ADL_SLOT_SEP}${adlCode}`
}

/** Legacy rows used plain ADL names; map to one slot key for this weekday. */
function expandLegacyVisitAdlToken(
  adlCode: string,
  dayOfWeekDb: number,
  schedules: PatientAdlDaySchedule[]
): string {
  const s = schedules.find((x) => x.adl_code === adlCode && x.day_of_week === dayOfWeekDb)
  if (!s || s.schedule_type === 'never') return encodeVisitAdlSlotKey('any', adlCode)
  if (s.schedule_type === 'always') return encodeVisitAdlSlotKey('any', adlCode)
  if (s.schedule_type === 'as_needed') return encodeVisitAdlSlotKey('as_needed', adlCode)
  for (const { key } of ADL_VISIT_TIME_SLOTS) {
    if (scheduleHasAdlSlot(s, key)) return encodeVisitAdlSlotKey(key, adlCode)
  }
  return encodeVisitAdlSlotKey('any', adlCode)
}

function isUuidTaskToken(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim())
}

function expandLegacySkilledVisitToken(
  taskId: string,
  dayOfWeekDb: number,
  schedules: PatientSkilledTaskDaySchedule[]
): string {
  const s = schedules.find((x) => x.task_id === taskId && x.day_of_week === dayOfWeekDb)
  if (!s || s.schedule_type === 'never') return encodeVisitAdlSlotKey('any', taskId)
  if (s.schedule_type === 'always') return encodeVisitAdlSlotKey('any', taskId)
  if (s.schedule_type === 'as_needed') return encodeVisitAdlSlotKey('as_needed', taskId)
  for (const { key } of ADL_VISIT_TIME_SLOTS) {
    if (scheduleHasAdlSlot(s, key)) return encodeVisitAdlSlotKey(key, taskId)
  }
  return encodeVisitAdlSlotKey('any', taskId)
}

function normalizeScheduleTaskToken(
  token: string,
  dayOfWeekDb: number,
  adlSchedules: PatientAdlDaySchedule[],
  skilledSchedules: PatientSkilledTaskDaySchedule[]
): string {
  const trimmed = token.trim()
  const skilledPrefix = 'skilled::'
  if (trimmed.toLowerCase().startsWith(skilledPrefix)) {
    const id = trimmed.slice(skilledPrefix.length)
    return expandLegacySkilledVisitToken(id, dayOfWeekDb, skilledSchedules)
  }
  if (!trimmed.includes(VISIT_ADL_SLOT_SEP)) {
    if (isUuidTaskToken(trimmed)) {
      return expandLegacySkilledVisitToken(trimmed, dayOfWeekDb, skilledSchedules)
    }
    return expandLegacyVisitAdlToken(trimmed, dayOfWeekDb, adlSchedules)
  }
  return trimmed
}

function buildAssignedVisitTaskSlotSet(
  rows: ScheduleRow[],
  adlSchedules: PatientAdlDaySchedule[],
  skilledSchedules: PatientSkilledTaskDaySchedule[]
): Set<string> {
  const set = new Set<string>()
  for (const row of rows) {
    const dow = dayOfWeekDbFromDateStr(row.date)
    for (const token of row.adl_codes ?? []) {
      set.add(normalizeScheduleTaskToken(token, dow, adlSchedules, skilledSchedules))
    }
  }
  return set
}

interface SmallClient {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string
  age: number | null
  gender: string | null
  class: string | null
  street_address: string
  city: string
  state: string
  zip_code: string
  phone_number: string
  email_address: string
  emergency_contact_name: string
  emergency_phone: string
  primary_diagnosis: string | null
  current_medications: string | null
  allergies: string | null
  representative_1_name: string | null
  representative_1_relationship: string | null
  representative_1_phone: string | null
  representative_2_name: string | null
  representative_2_relationship: string | null
  representative_2_phone: string | null
  status: 'active' | 'inactive'
  login_access?: boolean
  documents?: PatientDocument[] | null
  created_at: string
}

type StaffMember = { id: string; user_id?: string; first_name?: string; last_name?: string; [key: string]: unknown }
type BillingCodeOption = { id: string; code: string; name: string; unit_type: 'hour' | 'visit' | '15_min_unit' }
const BILLING_CODE_PICKLIST_ORDER = ['S5125', 'S5126', 'T1019', 'T1020', 'G0156', 'G0159', '97110', '97530', '99509', 'W1726'] as const

interface ClientDetailContentProps {
  client: SmallClient
  allClients: Array<{ id: string; first_name: string; last_name: string }>
  representatives?: PatientRepresentative[]
  caregiverRequirements?: CaregiverRequirement | null
  incidents?: PatientIncident[] | null
  adls?: PatientAdl[] | null
  adlSchedules?: PatientAdlDaySchedule[] | null
  staff?: StaffMember[] | null
  contractedHours?: PatientContractedHoursRow[] | null
  skilledCarePlanTasks?: SkilledCarePlanTask[] | null
  skilledSchedules?: PatientSkilledTaskDaySchedule[] | null
  serviceContracts?: PatientServiceContractRow[] | null
  initialAddresses?: PatientAddress[]
  canManageNotes?: boolean
  agencyId?: string
  canSchedule?: boolean
}

export default function ClientDetailContent({ client, allClients, representatives = [], caregiverRequirements: initialCaregiverRequirements = null,
  incidents: initialIncidents = [], adls: initialAdls = [], adlSchedules: initialAdlSchedules = [], staff: staffList = [],
  contractedHours: initialContractedHours = [], skilledCarePlanTasks: initialSkilledCarePlanTasks = [],
  skilledSchedules: skilledSchedulesProp,
  serviceContracts: initialServiceContracts = [],
  initialAddresses = [],
  canManageNotes = false,
  agencyId,
  canSchedule = true }: ClientDetailContentProps) {
  const initialSkilledSchedules = skilledSchedulesProp ?? EMPTY_SKILLED_SCHEDULES
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const [isClientSwitching, setIsClientSwitching] = useState(false)
  const [localClient, setLocalClient] = useState<SmallClient>(client)
  const [activeTab, setActiveTab] = useState(tab ?? 'overview')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [clientStatus, setClientStatus] = useState(client.status)
  const [loginAccess, setLoginAccess] = useState(client.login_access ?? true)
  const [isEditingPersonal, setIsEditingPersonal] = useState(false)
  const [editPersonalForm, setEditPersonalForm] = useState({
    first_name: client.first_name,
    last_name: client.last_name,
    gender: client.gender ?? '',
    date_of_birth: client.date_of_birth,
    age: client.age ?? 0,
  })
  const [isSavingPersonal, setIsSavingPersonal] = useState(false)
  const [personalEditError, setPersonalEditError] = useState<string | null>(null)
  const [isEditingMedical, setIsEditingMedical] = useState(false)
  const [editMedicalForm, setEditMedicalForm] = useState({
    primary_diagnosis: client.primary_diagnosis ?? '',
    current_medications: client.current_medications ?? '',
    allergies: client.allergies ?? '',
  })
  const [isSavingMedical, setIsSavingMedical] = useState(false)
  const [medicalEditError, setMedicalEditError] = useState<string | null>(null)
  const [repModalOpen, setRepModalOpen] = useState(false)
  const [repModalSlot, setRepModalSlot] = useState<number>(1)
  const [repModalMode, setRepModalMode] = useState<'add' | 'edit'>('add')
  const [repModalEditingId, setRepModalEditingId] = useState<string | null>(null)
  const [repForm, setRepForm] = useState({ name: '', relationship: '', phone_number: '', email_address: '' })
  const [isSavingRep, setIsSavingRep] = useState(false)
  const [repFormError, setRepFormError] = useState<string | null>(null)
  const [deletingRepId, setDeletingRepId] = useState<string | null>(null)
  const [repToDelete, setRepToDelete] = useState<PatientRepresentative | null>(null)
  const [adlToDelete, setAdlToDelete] = useState<string | null>(null)
  const [pendingAdlDeletes, setPendingAdlDeletes] = useState<string[]>([])
  const [docToDelete, setDocToDelete] = useState<PatientDocument | null>(null)
  const [repListError, setRepListError] = useState<string | null>(null)
  const [localRepresentatives, setLocalRepresentatives] = useState<PatientRepresentative[]>(representatives)
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(null)
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)
  const [isDeletingDocId, setIsDeletingDocId] = useState<string | null>(null)
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null)
  const documentFileInputRef = useRef<HTMLInputElement>(null)
  const primaryDiagnosisInputRef = useRef<HTMLInputElement>(null)

  // --- Patient addresses ---
  const [addresses, setAddresses] = useState<PatientAddress[]>(initialAddresses)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<PatientAddress | null>(null)
  const [addressForm, setAddressForm] = useState({ label: 'Home', street_address: '', city: '', state: '', zip_code: '', is_primary: false })
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [caregiverRequirements, setCaregiverRequirements] = useState<string[]>(initialCaregiverRequirements?.skill_codes ?? [])
  const [caregiverReqsModalOpen, setCaregiverReqsModalOpen] = useState(false)
  const [caregiverReqsSelection, setCaregiverReqsSelection] = useState<string[]>([])
  const [caregiverReqsSearch, setCaregiverReqsSearch] = useState('')
  const [caregiverReqsDropdownOpen, setCaregiverReqsDropdownOpen] = useState<string | null>(null)
  /** Only the category row whose dropdown is open (toggle + panel + chips). */
  const caregiverReqsOpenCategoryRef = useRef<HTMLDivElement>(null)
  const [isSavingCaregiverReqs, setIsSavingCaregiverReqs] = useState(false)
  const [caregiverReqsError, setCaregiverReqsError] = useState<string | null>(null)
  const [localIncidents, setLocalIncidents] = useState<PatientIncident[]>(initialIncidents ?? [])
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [incidentForm, setIncidentForm] = useState({
    incident_date: '',
    reporting_date: '',
    primary_contact_person: '',
    description: '',
  })
  const [incidentFormFile, setIncidentFormFile] = useState<File | null>(null)
  const incidentFileInputRef = useRef<HTMLInputElement>(null)
  const [isSavingIncident, setIsSavingIncident] = useState(false)
  const [incidentFormError, setIncidentFormError] = useState<string | null>(null)
  const [incidentListError, setIncidentListError] = useState<string | null>(null)
  const [deletingIncidentId, setDeletingIncidentId] = useState<string | null>(null)
  const [downloadingIncidentId, setDownloadingIncidentId] = useState<string | null>(null)
  const [localAdls, setLocalAdls] = useState<PatientAdl[]>(initialAdls ?? [])
  const [localSkilledCarePlanTasks, setLocalSkilledCarePlanTasks] = useState<SkilledCarePlanTask[]>(
    initialSkilledCarePlanTasks ?? []
  )
  const [adlLists, setAdlLists] = useState<{ name: string; group: string }[]>([])
  const [skilledTaskLibrary, setSkilledTaskLibrary] = useState<
    Array<{ id: string; code: string; name: string; category: string; description: string | null }>
  >([])
  const [localAdlSchedules, setLocalAdlSchedules] = useState<PatientAdlDaySchedule[]>(initialAdlSchedules ?? [])
  const [localSkilledSchedules, setLocalSkilledSchedules] = useState<PatientSkilledTaskDaySchedule[]>(
    () => skilledSchedulesProp ?? EMPTY_SKILLED_SCHEDULES
  )
  const [pendingSkilledDeletes, setPendingSkilledDeletes] = useState<string[]>([])
  const [addAdlModalOpen, setAddAdlModalOpen] = useState(false)
  const [addAdlSearch, setAddAdlSearch] = useState('')
  const [addAdlCategoryFilter, setAddAdlCategoryFilter] = useState<'all' | 'ADL' | 'IADL'>('all')
  const [addAdlSelected, setAddAdlSelected] = useState<Set<string>>(new Set())
  const [selectTimeModalOpen, setSelectTimeModalOpen] = useState(false)
  const [selectTimeAdl, setSelectTimeAdl] = useState<{ name: string; group: string } | null>(null)
  const [selectTimeDay, setSelectTimeDay] = useState<number>(1)
  const [selectTimeDayLabel, setSelectTimeDayLabel] = useState<string>('Monday')
  const [adlNoteModalOpen, setAdlNoteModalOpen] = useState(false)
  const [adlNoteTarget, setAdlNoteTarget] = useState<{ name: string; group: string } | null>(null)
  const [adlNoteDraft, setAdlNoteDraft] = useState('')
  const [selectTimeForm, setSelectTimeForm] = useState({
    timesPerDay: 1 as 1 | 2 | 3 | 4,
    morning: false,
    afternoon: false,
    evening: false,
    night: false,
    slotMorning: 'always' as 'always' | 'as_needed',
    slotAfternoon: 'always' as 'always' | 'as_needed',
    slotEvening: 'always' as 'always' | 'as_needed',
    slotNight: 'always' as 'always' | 'as_needed',
  })
  const [isSavingAdlPlan, setIsSavingAdlPlan] = useState(false)
  const [adlPlanError, setAdlPlanError] = useState<string | null>(null)
  /** After save + `router.refresh()`, bump so the ADL hydration effect runs again (covers remount with stale RSC props). */
  const [adlHydrateNonce, setAdlHydrateNonce] = useState(0)
  const adlHydrateAbortRef = useRef<AbortController | null>(null)
  const [deletingAdlCode, setDeletingAdlCode] = useState<string | null>(null)
  const [skilledTaskModalOpen, setSkilledTaskModalOpen] = useState(false)
  const [skilledTaskSearch, setSkilledTaskSearch] = useState('')
  const [skilledTaskCategoryFilter, setSkilledTaskCategoryFilter] = useState('all')
  const [pendingSkilledTaskIds, setPendingSkilledTaskIds] = useState<Set<string>>(new Set())
  const [isSavingSkilledTasks, setIsSavingSkilledTasks] = useState(false)
  const [skilledTasksError, setSkilledTasksError] = useState<string | null>(null)
  const [selectTimeSkilledTask, setSelectTimeSkilledTask] = useState<SkilledCarePlanTask | null>(null)
  const [skilledNoteModalOpen, setSkilledNoteModalOpen] = useState(false)
  const [skilledNoteTarget, setSkilledNoteTarget] = useState<SkilledCarePlanTask | null>(null)
  const [skilledNoteDraft, setSkilledNoteDraft] = useState('')

  const getMonday = (d: Date) => {
    const date = new Date(d)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    return date
  }
  /** YYYY-MM-DD in local time (so schedule grid and ADL day_of_week 1=Mon..7=Sun match). */
  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [scheduleWeekStart, setScheduleWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [weekSchedules, setWeekSchedules] = useState<ScheduleRow[]>([])
  const [caregiverSkillCatalog, setCaregiverSkillCatalog] = useState<{ type: string; name: string }[]>([])
  const [serviceContracts, setServiceContracts] = useState<PatientServiceContractRow[]>(initialServiceContracts ?? [])
  const [serviceContractsModalOpen, setServiceContractsModalOpen] = useState(false)
  const [isSavingServiceContract, setIsSavingServiceContract] = useState(false)
  const [serviceContractError, setServiceContractError] = useState<string | null>(null)
  const [isSavingServiceContractRowAction, setIsSavingServiceContractRowAction] = useState(false)
  const [editServiceContractModalOpen, setEditServiceContractModalOpen] = useState(false)
  const [editingServiceContract, setEditingServiceContract] = useState<PatientServiceContractRow | null>(null)
  const [isSavingServiceContractEdit, setIsSavingServiceContractEdit] = useState(false)
  const [serviceContractEditError, setServiceContractEditError] = useState<string | null>(null)
  const [serviceContractEditForm, setServiceContractEditForm] = useState({
    contract_name: '',
    bill_rate: '',
    end_date: '',
    note: '',
    bill_mileage: false,
    mileage_bill_rate_per_mile: '',
  })
  const [billingCodeOptions, setBillingCodeOptions] = useState<BillingCodeOption[]>([])
  /** Set when billing_codes query fails or returns no active rows (empty <select> otherwise looks like a UI bug). */
  const [billingCodesLoadError, setBillingCodesLoadError] = useState<string | null>(null)
  const [serviceContractForm, setServiceContractForm] = useState({
    contract_name: '',
    contract_type: 'Private Pay',
    service_type: 'non_skilled' as 'non_skilled' | 'skilled',
    billing_code_id: '',
    bill_rate: '',
    bill_unit_type: 'hour' as 'hour' | 'visit' | '15_min_unit',
    weekly_hours_limit: '',
    effective_date: toLocalDateString(new Date()),
    end_date: '',
    note: '',
    bill_mileage: false,
    mileage_bill_rate_per_mile: '',
  })
  const [scheduleHover, setScheduleHover] = useState<{ dateStr: string; startHour: number; endHourExclusive: number } | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const scheduleGridRef = useRef<HTMLDivElement | null>(null)
  const [scheduleNowTick, setScheduleNowTick] = useState(() => Date.now())
  const [scheduleNowIndicator, setScheduleNowIndicator] = useState<{
    top: number
    left: number
    width: number
    label: string
  } | null>(null)
  const autoMarkingMissedVisitIdsRef = useRef<Set<string>>(new Set())
  const [addVisitModalOpen, setAddVisitModalOpen] = useState(false)
  const [addVisitTab, setAddVisitTab] = useState<'details' | 'adls'>('details')
  const [visitForm, setVisitForm] = useState({
    date: '',
    endDate: '',
    startTime: '09:00',
    endTime: '10:00',
    contractId: '',
    description: '',
    type: 'Routine' as string,
    caregiverId: '',
    notes: '',
    isRecurring: false,
    repeatFrequency: '',
    repeatDays: [] as number[],
    repeatMonthlyRules: [] as { ordinal: number | null; weekday: number | null }[],
    repeatStart: '',
    repeatEnd: '',
    addressId: '',
  })
  const [visitAdlSelected, setVisitAdlSelected] = useState<Set<string>>(new Set())
  const [isSavingVisit, setIsSavingVisit] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [manageLimitModalOpen, setManageLimitModalOpen] = useState(false)
  const [limitForm, setLimitForm] = useState({ totalHours: '', effectiveDate: '', note: '' })
  const [localContractedHours, setLocalContractedHours] = useState<PatientContractedHoursRow[]>(initialContractedHours ?? [])
  const [isSavingLimit, setIsSavingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [scheduleLimitWarning, setScheduleLimitWarning] = useState<string | null>(null)
  const [visitDateSchedules, setVisitDateSchedules] = useState<ScheduleRow[]>([])
  const [caregiverAvailabilitySlots, setCaregiverAvailabilitySlots] = useState<CaregiverAvailabilitySlotRow[]>([])
  const [editVisitModalOpen, setEditVisitModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null)
  const [visitStatusModal, setVisitStatusModal] = useState<'missed' | 'cancelled' | 'on_hold' | null>(null)
  const [visitStatusReason, setVisitStatusReason] = useState('')
  const [editRecurringApplyScope, setEditRecurringApplyScope] = useState<
    'this_visit' | 'this_and_future' | 'all_in_series' | 'weekday_in_series'
  >('this_visit')

  // Caregiver dropdown (Add/Edit Visit modal, Schedule tab).
  const [caregiverPickerOpen, setCaregiverPickerOpen] = useState(false)
  const caregiverPickerWrapRef = useRef<HTMLDivElement | null>(null)
  const caregiverPickerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const caregiverPickerDropdownRef = useRef<HTMLDivElement | null>(null)
  /** Fixed position for portaled menu (above trigger), so it can extend past the modal without clipping. */
  const [caregiverPickerMenuFixed, setCaregiverPickerMenuFixed] = useState<{
    left: number
    bottom: number
    width: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!caregiverPickerOpen) {
      setCaregiverPickerMenuFixed(null)
      return
    }
    const update = () => {
      const btn = caregiverPickerTriggerRef.current
      if (!btn || typeof window === 'undefined') return
      const r = btn.getBoundingClientRect()
      const margin = 8
      const minMenuWidth = 500
      let width = Math.max(r.width, minMenuWidth)
      width = Math.min(width, window.innerWidth - margin * 2)
      let left = r.left
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin)
      }
      setCaregiverPickerMenuFixed({
        left,
        width,
        bottom: window.innerHeight - r.top + margin,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [caregiverPickerOpen])

  useEffect(() => {
    if (!caregiverPickerOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      const wrap = caregiverPickerWrapRef.current
      const menu = caregiverPickerDropdownRef.current
      if (wrap?.contains(t) || menu?.contains(t)) return
      setCaregiverPickerOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [caregiverPickerOpen])

  // Required caregiver skills modal: close dropdown when clicking outside that category (not whole scroll list).
  useEffect(() => {
    if (!caregiverReqsModalOpen || caregiverReqsDropdownOpen == null) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      const root = caregiverReqsOpenCategoryRef.current
      if (root && !root.contains(t)) {
        setCaregiverReqsDropdownOpen(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [caregiverReqsModalOpen, caregiverReqsDropdownOpen])

  // Sync local client when switching to a different client (by id)
  useEffect(() => {
    setLocalClient(client)
  }, [client.id])

  useEffect(() => {
    setAdlHydrateNonce(0)
  }, [client.id])

  useEffect(() => {
    setIsClientSwitching(false)
  }, [client.id])

  // Sync local representatives when prop changes (e.g. after router.refresh or navigation)
  useEffect(() => {
    setLocalRepresentatives(representatives)
  }, [client.id, representatives])

  useEffect(() => {
    setCaregiverRequirements(initialCaregiverRequirements?.skill_codes ?? [])
  }, [client.id, initialCaregiverRequirements])

  // Only reset from RSC props when the patient changes. Do not depend on `initialIncidents`:
  // after `router.refresh()` in handleSaveIncident, Next can supply a cached payload without the
  // row just inserted, and this effect would overwrite `setLocalIncidents` and make it disappear.
  useEffect(() => {
    setLocalIncidents(initialIncidents ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: stale initialIncidents after refresh
  }, [client.id])

  /** Load non-skilled plan from Supabase on mount / patient change — not from RSC props alone. After
   * `router.refresh()`, Next can remount with a cached `initialAdls` payload; a client refetch matches DB truth.
   * Aborted when saving so a slow in-flight fetch cannot overwrite `handleSaveAdlPlan` results. */
  useEffect(() => {
    const ac = new AbortController()
    adlHydrateAbortRef.current = ac
    const supabase = createClient()
    ;(async () => {
      const [a, s] = await Promise.all([
        q.getAdlsByPatientId(supabase, localClient.id),
        q.getPatientAdlDaySchedulesByPatientId(supabase, localClient.id),
      ])
      if (ac.signal.aborted) return
      if (a.error || s.error) return
      if (a.data) setLocalAdls(a.data)
      if (s.data) setLocalAdlSchedules(s.data)
    })()
    return () => {
      ac.abort()
    }
  }, [localClient.id, adlHydrateNonce])

  useEffect(() => {
    setLocalSkilledCarePlanTasks(initialSkilledCarePlanTasks ?? [])
    setLocalSkilledSchedules(initialSkilledSchedules)
    setPendingSkilledDeletes([])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same pattern as non-skilled plan above
  }, [client.id])

  useEffect(() => {
    const supabase = createClient()
    q.getTaskCatalogAdlLists(supabase).then(({ data }) => {
      if (data) setAdlLists(data)
    })
    q.getTaskCatalogSkilledTasks(supabase).then(({ data }) => {
      if (data) setSkilledTaskLibrary(data)
    })
    q.getCaregiverSkillCatalogFromTaskRequirements(supabase).then(({ data }) => {
      if (data) setCaregiverSkillCatalog(data)
    })
  }, [])

  useEffect(() => {
    setLocalContractedHours(initialContractedHours ?? [])
  }, [client.id, initialContractedHours])

  useEffect(() => {
    setServiceContracts(initialServiceContracts ?? [])
  }, [client.id, initialServiceContracts])

  useEffect(() => {
    setPendingAdlDeletes([])
  }, [client.id])

  useEffect(() => {
    setActiveTab(tab ?? 'overview')
  }, [tab])

  const scheduleWeekEnd = new Date(scheduleWeekStart)
  scheduleWeekEnd.setDate(scheduleWeekEnd.getDate() + 6)
  const scheduleWeekStartStr = toLocalDateString(scheduleWeekStart)
  const scheduleWeekEndStr = toLocalDateString(scheduleWeekEnd)

  useEffect(() => {
    if (activeTab !== 'schedule') return
    setScheduleLoading(true)
    const supabase = createClient()
    q.getSchedulesByPatientIdAndDateRange(supabase, localClient.id, scheduleWeekStartStr, scheduleWeekEndStr)
      .then(({ data }) => { setWeekSchedules(data ?? []) })
      .finally(() => setScheduleLoading(false))
  }, [activeTab, localClient.id, scheduleWeekStartStr, scheduleWeekEndStr])

  useEffect(() => {
    if (activeTab !== 'schedule') return
    setScheduleNowTick(Date.now())
    const id = window.setInterval(() => setScheduleNowTick(Date.now()), 60 * 1000)
    return () => window.clearInterval(id)
  }, [activeTab, scheduleWeekStartStr])

  useLayoutEffect(() => {
    if (activeTab !== 'schedule') {
      setScheduleNowIndicator(null)
      return
    }
    const root = scheduleGridRef.current
    const table = root?.querySelector('table')
    if (!root || !table) {
      setScheduleNowIndicator(null)
      return
    }

    const updateIndicator = () => {
      const now = new Date(scheduleNowTick)
      const weekDates = getWeekDates()
      const todayStr = toLocalDateString(now)
      const todayIdx = weekDates.findIndex((d) => toLocalDateString(d) === todayStr)
      if (todayIdx < 0) {
        setScheduleNowIndicator(null)
        return
      }

      const rootRect = root.getBoundingClientRect()
      const currentHour = now.getHours()
      const currentHourCell = table.querySelector(
        `tbody td[data-time-hour="${currentHour}"]`
      ) as HTMLTableCellElement | null
      const nextHourCell = table.querySelector(
        `tbody td[data-time-hour="${Math.min(23, currentHour + 1)}"]`
      ) as HTMLTableCellElement | null
      const todayHeaderCell = table.querySelector(
        `thead tr[data-day-header-row="true"] th[data-day-col-index="${todayIdx}"]`
      ) as HTMLTableCellElement | null
      if (!currentHourCell || !todayHeaderCell) {
        setScheduleNowIndicator(null)
        return
      }
      const currentHourRect = currentHourCell.getBoundingClientRect()
      const nextHourRect = nextHourCell?.getBoundingClientRect() ?? null
      const todayHeaderRect = todayHeaderCell.getBoundingClientRect()

      const dynamicHourHeight =
        nextHourRect && nextHourRect.top > currentHourRect.top
          ? nextHourRect.top - currentHourRect.top
          : currentHourRect.height || 48
      const minuteOffsetFromTop = (now.getMinutes() / 60) * dynamicHourHeight
      const top = currentHourRect.top - rootRect.top + minuteOffsetFromTop
      const left = todayHeaderRect.left - rootRect.left
      const width = todayHeaderRect.width

      setScheduleNowIndicator({
        top,
        left,
        width,
        label: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      })
    }

    updateIndicator()
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateIndicator) : null
    resizeObserver?.observe(root)
    window.addEventListener('resize', updateIndicator)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeTab, scheduleNowTick, scheduleWeekStartStr, weekSchedules])

  const schedulingAgencyId = useMemo(() => {
    for (const s of staffList ?? []) {
      const agency = (s as any)?.agency_id
      if (typeof agency === 'string' && agency.trim()) return agency.trim()
    }
    for (const s of weekSchedules) {
      if (typeof s.agency_id === 'string' && s.agency_id.trim()) return s.agency_id.trim()
    }
    return null
  }, [staffList, weekSchedules])

  useEffect(() => {
    const dateForFetch = visitForm.isRecurring ? visitForm.repeatStart : visitForm.date
    if ((!addVisitModalOpen && !editVisitModalOpen) || !dateForFetch || !schedulingAgencyId) {
      setVisitDateSchedules([])
      setCaregiverAvailabilitySlots([])
      return
    }
    const supabase = createClient()
    q.getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(
      supabase,
      schedulingAgencyId,
      dateForFetch,
      dateForFetch
    ).then(
      ({ data }) => setVisitDateSchedules(data ?? [])
    )

    const caregiverIds = (staffList ?? []).map((s) => String(s.id)).filter(Boolean)
    q.getCaregiverAvailabilitySlotsByCaregiverIds(supabase, caregiverIds).then(({ data }) =>
      setCaregiverAvailabilitySlots((data ?? []) as CaregiverAvailabilitySlotRow[])
    )
  }, [
    addVisitModalOpen,
    editVisitModalOpen,
    visitForm.date,
    visitForm.isRecurring,
    visitForm.repeatStart,
    staffList,
    schedulingAgencyId,
  ])

  useEffect(() => {
    if (isEditingMedical) {
      primaryDiagnosisInputRef.current?.focus()
    }
  }, [isEditingMedical])

  const sortedRepresentatives = [...localRepresentatives].sort((a, b) => a.display_order - b.display_order)
  const nextRepDisplayOrder = sortedRepresentatives.length === 0
    ? 1
    : Math.max(...sortedRepresentatives.map((r) => r.display_order), 0) + 1

  // Sync from server after refresh
  useEffect(() => {
    setClientStatus(client.status)
    setLoginAccess(client.login_access ?? true)
  }, [client.id, client.status, client.login_access])

  // Find current client index
  const currentIndex = allClients.findIndex(c => c.id === localClient.id)
  const previousClient = currentIndex > 0 ? allClients[currentIndex - 1] : null
  const nextClient = currentIndex < allClients.length - 1 ? allClients[currentIndex + 1] : null

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const parseDateOnly = (dateString: string): Date => {
    const s = (dateString ?? '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    return new Date(dateString)
  }

  const formatDate = (dateString: string) => {
    const date = parseDateOnly(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatShortDate = (dateString: string) => {
    const date = parseDateOnly(dateString)
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    })
  }

  const formatMoney = (value: number) => `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`

  const ageFromDob = (dateOfBirth: string) => {
    const dob = new Date(dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
    return Math.max(0, age)
  }

  const dobFromAge = (age: number) => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - age)
    return toLocalDateString(d)
  }

  const handleStatusToggle = async (newStatus: 'active' | 'inactive') => {
    setClientStatus(newStatus)
    
    try {
      const supabase = createClient()
      const { error } = await q.updatePatientStatus(supabase, client.id, newStatus)

      if (error) {
        console.error('Error updating status:', error)
        setClientStatus(client.status) // Revert on error
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating status:', error)
      setClientStatus(client.status) // Revert on error
    }
  }

  const handleLoginAccessToggle = async (checked: boolean) => {
    setLoginAccess(checked)
    try {
      const supabase = createClient()
      const { error } = await q.updatePatientLoginAccess(supabase, client.id, checked)
      if (error) {
        console.error('Error updating login access:', error)
        setLoginAccess(!checked)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating login access:', error)
      setLoginAccess(!checked)
    }
  }

  const startEditPersonal = () => {
    const age = localClient.age ?? ageFromDob(localClient.date_of_birth)
    setEditPersonalForm({
      first_name: localClient.first_name,
      last_name: localClient.last_name,
      gender: localClient.gender ?? '',
      date_of_birth: localClient.date_of_birth,
      age,
    })
    setPersonalEditError(null)
    setIsEditingPersonal(true)
  }

  const cancelEditPersonal = () => {
    setIsEditingPersonal(false)
    setPersonalEditError(null)
  }

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPersonalForm.first_name.trim()) {
      setPersonalEditError('First name is required.')
      return
    }
    setIsSavingPersonal(true)
    setPersonalEditError(null)
    try {
      const supabase = createClient()
      const { error } = await q.updatePatient(supabase, client.id, {
        first_name: editPersonalForm.first_name.trim(),
        last_name: editPersonalForm.last_name.trim(),
        gender: editPersonalForm.gender || null,
        date_of_birth: editPersonalForm.date_of_birth,
      })
      if (error) throw error
      const newAge = editPersonalForm.date_of_birth ? ageFromDob(editPersonalForm.date_of_birth) : localClient.age
      setLocalClient((prev) => ({
        ...prev,
        first_name: editPersonalForm.first_name.trim(),
        last_name: editPersonalForm.last_name.trim(),
        gender: editPersonalForm.gender || null,
        date_of_birth: editPersonalForm.date_of_birth,
        age: newAge,
      }))
      setIsEditingPersonal(false)
      router.refresh()
    } catch (err: unknown) {
      setPersonalEditError(err instanceof Error ? err.message : 'Failed to update. Please try again.')
    } finally {
      setIsSavingPersonal(false)
    }
  }

  const startEditMedical = () => {
    setEditMedicalForm({
      primary_diagnosis: localClient.primary_diagnosis ?? '',
      current_medications: localClient.current_medications ?? '',
      allergies: localClient.allergies ?? '',
    })
    setMedicalEditError(null)
    setIsEditingMedical(true)
  }

  const cancelEditMedical = () => {
    setIsEditingMedical(false)
    setMedicalEditError(null)
  }

  const handleSaveMedical = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingMedical(true)
    setMedicalEditError(null)
    try {
      const supabase = createClient()
      const { error } = await q.updatePatientMedical(supabase, client.id, {
        primary_diagnosis: editMedicalForm.primary_diagnosis.trim() || null,
        current_medications: editMedicalForm.current_medications.trim() || null,
        allergies: editMedicalForm.allergies.trim() || null,
      })
      if (error) throw error
      setLocalClient((prev) => ({
        ...prev,
        primary_diagnosis: editMedicalForm.primary_diagnosis.trim() || null,
        current_medications: editMedicalForm.current_medications.trim() || null,
        allergies: editMedicalForm.allergies.trim() || null,
      }))
      setIsEditingMedical(false)
      router.refresh()
    } catch (err: unknown) {
      setMedicalEditError(err instanceof Error ? err.message : 'Failed to update. Please try again.')
    } finally {
      setIsSavingMedical(false)
    }
  }

  const openAddRep = (displayOrder: number) => {
    setRepModalSlot(displayOrder)
    setRepModalMode('add')
    setRepModalEditingId(null)
    setRepForm({ name: '', relationship: '', phone_number: '', email_address: '' })
    setRepFormError(null)
    setRepListError(null)
    setRepModalOpen(true)
  }

  const openEditRep = (rep: PatientRepresentative) => {
    setRepModalSlot(rep.display_order)
    setRepModalMode('edit')
    setRepModalEditingId(rep.id)
    setRepForm({
      name: rep.name ?? '',
      relationship: rep.relationship ?? '',
      phone_number: rep.phone_number ?? '',
      email_address: rep.email_address ?? '',
    })
    setRepFormError(null)
    setRepListError(null)
    setRepModalOpen(true)
  }

  const closeRepModal = () => {
    if (!isSavingRep) {
      setRepModalOpen(false)
      setRepFormError(null)
    }
  }

  const confirmDeleteRep = (rep: PatientRepresentative) => {
    setRepListError(null)
    setRepToDelete(rep)
  }

  const handleDeleteRep = async () => {
    if (!repToDelete) return
    const rep = repToDelete
    setDeletingRepId(rep.id)
    setRepListError(null)
    try {
      const supabase = createClient()
      const { error } = await q.deleteRepresentative(supabase, rep.id)
      if (error) throw error
      setLocalRepresentatives((prev) => prev.filter((r) => r.id !== rep.id))
      setRepToDelete(null)
      router.refresh()
    } catch (err: unknown) {
      setRepListError(err instanceof Error ? err.message : 'Failed to delete representative.')
    } finally {
      setDeletingRepId(null)
    }
  }

  const handleSaveRep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repForm.name.trim()) {
      setRepFormError('Name is required.')
      return
    }
    setIsSavingRep(true)
    setRepFormError(null)
    const payload = {
      name: repForm.name.trim() || null,
      relationship: repForm.relationship.trim() || null,
      phone_number: repForm.phone_number.trim() || null,
      email_address: repForm.email_address.trim() || null,
    }
    try {
      const supabase = createClient()
      if (repModalMode === 'edit' && repModalEditingId) {
        const { error } = await q.updateRepresentative(supabase, repModalEditingId, payload)
        if (error) throw error
        setLocalRepresentatives((prev) =>
          prev.map((r) =>
            r.id === repModalEditingId
              ? { ...r, ...payload }
              : r
          )
        )
      } else {
        const { data: inserted, error } = await q.insertRepresentative(supabase, {
          patient_id: client.id,
          ...payload,
          display_order: repModalSlot,
        })
        if (error) throw error
        if (inserted) {
          setLocalRepresentatives((prev) =>
            [...prev, inserted].sort((a, b) => a.display_order - b.display_order)
          )
        }
      }
      setRepModalOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setRepFormError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setIsSavingRep(false)
    }
  }

  const handleClientChange = (clientId: string) => {
    if (clientId === client.id) return
    setIsClientSwitching(true)
    router.push(`/pages/agency/clients/${clientId}`)
  }

  const handlePrevious = () => {
    if (previousClient && previousClient.id !== client.id) {
      setIsClientSwitching(true)
      router.push(`/pages/agency/clients/${previousClient.id}`)
    }
  }

  const handleNext = () => {
    if (nextClient && nextClient.id !== client.id) {
      setIsClientSwitching(true)
      router.push(`/pages/agency/clients/${nextClient.id}`)
    }
  }

  const patientDocuments: PatientDocument[] = Array.isArray(localClient.documents) ? localClient.documents : []

  const handleDocumentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length || !localClient.id) return
    const filesArray = Array.from(files)
    e.target.value = ''
    setDocumentUploadError(null)
    setIsUploadingDocument(true)
    try {
      const formData = new FormData()
      for (const file of filesArray) formData.append('file', file)
      const { error, data: nextDocs } = await uploadPatientDocumentsAction(localClient.id, formData, patientDocuments)
      if (error) throw new Error(error)
      setLocalClient((c) => ({ ...c, documents: nextDocs ?? c.documents }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setDocumentUploadError(message)
    } finally {
      setIsUploadingDocument(false)
    }
  }

  const handleDeleteDocument = async (doc: PatientDocument) => {
    if (!localClient.id) return
    setIsDeletingDocId(doc.id)
    setDocumentUploadError(null)
    try {
      const nextDocs = patientDocuments.filter((d) => d.id !== doc.id)
      const { error } = await deletePatientDocumentAction(localClient.id, doc.path, nextDocs)
      if (error) throw new Error(error)
      setLocalClient((c) => ({ ...c, documents: nextDocs }))
      setDocToDelete(null)
    } catch (err: unknown) {
      setDocumentUploadError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setIsDeletingDocId(null)
    }
  }

  const downloadPatientDocument = async (doc: PatientDocument) => {
    if (!doc.path) return
    setDownloadingDocId(doc.id)
    setDocumentUploadError(null)
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.PATIENT, doc.path)
      if (!signedUrl) throw new Error('Could not generate download link')
      const res = await fetch(signedUrl)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = sanitizeDownloadFilename(doc.name)
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      setDocumentUploadError('Could not download this document. Try again.')
    } finally {
      setDownloadingDocId(null)
    }
  }

  const openCaregiverReqsModal = () => {
    setCaregiverReqsSelection([...caregiverRequirements])
    setCaregiverReqsSearch('')
    setCaregiverReqsDropdownOpen(null)
    setCaregiverReqsError(null)
    setCaregiverReqsModalOpen(true)
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await q.getCaregiverRequirementsByPatientId(supabase, localClient.id)
        if (error) return
        const rawCodes: unknown[] = Array.isArray((data as { skill_codes?: unknown[] } | null)?.skill_codes)
          ? ((data as { skill_codes?: unknown[] }).skill_codes ?? [])
          : []
        const latest = Array.from(new Set(rawCodes.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0))).sort(
          (a, b) => a.localeCompare(b)
        )
        setCaregiverRequirements(latest)
        setCaregiverReqsSelection(latest)
      } catch {
        // Keep current local selection if refresh fails.
      }
    })()
  }

  const closeCaregiverReqsModal = () => {
    if (!isSavingCaregiverReqs) {
      setCaregiverReqsModalOpen(false)
      setCaregiverReqsDropdownOpen(null)
      setCaregiverReqsError(null)
    }
  }

  const toggleCaregiverSkill = (name: string) => {
    setCaregiverReqsSelection((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    )
  }

  const setCategorySkillSelection = (skills: { type: string; name: string }[], shouldSelect: boolean) => {
    const names = skills.map((s) => s.name)
    setCaregiverReqsSelection((prev) => {
      if (shouldSelect) return Array.from(new Set([...prev, ...names]))
      const remove = new Set(names)
      return prev.filter((name) => !remove.has(name))
    })
  }

  const handleSaveCaregiverReqs = async () => {
    setIsSavingCaregiverReqs(true)
    setCaregiverReqsError(null)
    try {
      const normalized = Array.from(new Set(caregiverReqsSelection.filter(Boolean))).sort((a, b) => a.localeCompare(b))
      const { error } = await upsertPatientCaregiverRequirementsAction(localClient.id, normalized)
      if (error) {
        setCaregiverReqsError(error)
        return
      }
      setCaregiverRequirements(normalized)
      setCaregiverReqsSelection(normalized)
      setCaregiverReqsModalOpen(false)
    } catch (err: unknown) {
      if (typeof err === 'string' && err.trim()) {
        setCaregiverReqsError(err)
      } else {
        setCaregiverReqsError(err instanceof Error ? err.message : 'Failed to save requirements.')
      }
    } finally {
      setIsSavingCaregiverReqs(false)
    }
  }

  const openReportIncidentModal = () => {
    const today = toLocalDateString(new Date())
    setIncidentForm({
      incident_date: today,
      reporting_date: today,
      primary_contact_person: '',
      description: '',
    })
    setIncidentFormFile(null)
    if (incidentFileInputRef.current) incidentFileInputRef.current.value = ''
    setIncidentFormError(null)
    setIncidentModalOpen(true)
  }

  const closeIncidentModal = () => {
    if (!isSavingIncident) {
      setIncidentModalOpen(false)
      setIncidentFormError(null)
    }
  }

  const ACCEPTED_INCIDENT_FILE_TYPES = '.pdf,.doc,.docx,.png,.jpg'

  const handleSaveIncident = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!incidentForm.incident_date.trim()) {
      setIncidentFormError('Incident date is required.')
      return
    }
    if (!incidentForm.reporting_date.trim()) {
      setIncidentFormError('Reporting date is required.')
      return
    }
    if (!incidentForm.primary_contact_person.trim()) {
      setIncidentFormError('Primary contact person is required.')
      return
    }
    if (!incidentForm.description.trim()) {
      setIncidentFormError('Description of incident is required.')
      return
    }
    if (!incidentFormFile) {
      setIncidentFormError('Please attach the incident report file.')
      return
    }
    setIsSavingIncident(true)
    setIncidentFormError(null)
    try {
      const supabase = createClient()
      const { data: inserted, error } = await q.insertIncident(supabase, {
        patient_id: localClient.id,
        incident_date: incidentForm.incident_date,
        reporting_date: incidentForm.reporting_date,
        primary_contact_person: incidentForm.primary_contact_person.trim(),
        description: incidentForm.description.trim(),
      })
      if (error) throw error
      if (!inserted) throw new Error('Insert failed')
      let file_path: string | null = null
      let file_name: string | null = null
      const safeName = incidentFormFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${localClient.id}/incidents/${inserted.id}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('patient-documents')
        .upload(path, incidentFormFile)
      if (uploadError) {
        await q.deleteIncident(supabase, inserted.id)
        throw uploadError
      }
      file_path = path
      file_name = incidentFormFile.name
      const { data: updated, error: updateError } = await q.updateIncident(supabase, inserted.id, { file_path, file_name })
      if (updateError) throw updateError
      const row = updated ?? { ...inserted, file_path, file_name }
      setLocalIncidents((prev) => [row, ...prev])
      setIncidentModalOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setIncidentFormError(err instanceof Error ? err.message : 'Failed to save incident.')
    } finally {
      setIsSavingIncident(false)
    }
  }

  const formatIncidentDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatIncidentUploadedAt = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const downloadIncidentFile = async (incident: PatientIncident) => {
    if (!incident.file_path) return
    const displayName = incident.file_name?.trim() || 'incident-report'
    setDownloadingIncidentId(incident.id)
    setIncidentListError(null)
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.PATIENT, incident.file_path)
      if (!signedUrl) throw new Error('Could not generate download link')
      const res = await fetch(signedUrl)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = sanitizeDownloadFilename(displayName)
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      setIncidentListError('Could not download this file. Try again or open it in a new tab.')
    } finally {
      setDownloadingIncidentId(null)
    }
  }

  const handleDeleteIncident = async (incident: PatientIncident) => {
    setDeletingIncidentId(incident.id)
    setIncidentListError(null)
    try {
      const supabase = createClient()
      const { error } = await q.deleteIncident(supabase, incident.id)
      if (error) throw error
      setLocalIncidents((prev) => prev.filter((i) => i.id !== incident.id))
      router.refresh()
    } catch (err: unknown) {
      setIncidentListError(err instanceof Error ? err.message : 'Failed to delete incident.')
    } finally {
      setDeletingIncidentId(null)
    }
  }

  const ADL_DAYS = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 7 },
  ] as const
  const DAY_LABELS: Record<number, string> = {
    1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
    5: 'Friday', 6: 'Saturday', 7: 'Sunday',
  }
  /** Weekly visit repeat uses JS getDay(): 0=Sun … 6=Sat. Buttons shown Mo → Su. */
  const VISIT_WEEKLY_REPEAT_DAYS_ORDER = [
    { getDay: 1, label: 'Mo' },
    { getDay: 2, label: 'Tu' },
    { getDay: 3, label: 'We' },
    { getDay: 4, label: 'Th' },
    { getDay: 5, label: 'Fr' },
    { getDay: 6, label: 'Sa' },
    { getDay: 0, label: 'Su' },
  ] as const
  const getSchedule = (adlCode: string, dayOfWeek: number) =>
    localAdlSchedules.find((s) => s.adl_code === adlCode && s.day_of_week === dayOfWeek)
  const getAdlNote = (adlCode: string): string => {
    const row = localAdlSchedules.find((s) => s.adl_code === adlCode && (s.adl_note ?? '').trim() !== '')
      ?? localAdlSchedules.find((s) => s.adl_code === adlCode && s.day_of_week === 1)
    return (row?.adl_note ?? '').trim()
  }

  const openAddAdlModal = () => {
    setAddAdlSearch('')
    setAddAdlCategoryFilter('all')
    setAddAdlSelected(new Set(localAdls.map((a) => a.adl_code)))
    setAddAdlModalOpen(true)
  }
  const closeAddAdlModal = () => {
    setAddAdlModalOpen(false)
  }
  /** Same pattern as Skilled Task Library: Apply only updates local state; DB writes happen on "Save NON-SKILLED Plan". */
  const applyAdlTaskSelection = () => {
    const selected = adlLists.filter((a) => addAdlSelected.has(a.name))
    const now = new Date().toISOString()
    const next: PatientAdl[] = selected.map((a, i) => ({
      id: `draft-${a.name}`,
      patient_id: localClient.id,
      adl_code: a.name,
      display_order: i,
      created_at: now,
      updated_at: now,
    }))
    setLocalAdls(next)
    setLocalAdlSchedules((prev) => {
      const kept = prev.filter((s) => next.some((t) => t.adl_code === s.adl_code))
      for (const t of next) {
        const hasRow = kept.some((s) => s.adl_code === t.adl_code)
        if (hasRow) continue
        for (let dow = 1; dow <= 7; dow++) {
          kept.push({
            id: `temp-${t.adl_code}-${dow}`,
            patient_id: localClient.id,
            adl_code: t.adl_code,
            day_of_week: dow,
            adl_note: null,
            schedule_type: 'never',
            times_per_day: null,
            slot_morning: null,
            slot_afternoon: null,
            slot_evening: null,
            slot_night: null,
            display_order: t.display_order,
            created_at: now,
            updated_at: now,
          })
        }
      }
      return kept
    })
    const nextCodes = new Set(next.map((t) => t.adl_code))
    setPendingAdlDeletes((prev) => prev.filter((c) => !nextCodes.has(c)))
    setAddAdlModalOpen(false)
  }

  const openSelectTimeModal = (adl: { name: string; group: string }, dayOfWeek: number, dayLabel: string) => {
    const existing = getSchedule(adl.name, dayOfWeek)
    setSelectTimeSkilledTask(null)
    setSelectTimeAdl(adl)
    setSelectTimeDay(dayOfWeek)
    setSelectTimeDayLabel(dayLabel)
    if (existing && existing.schedule_type === 'specific_times') {
      const slots = {
        morning: !!existing.slot_morning,
        afternoon: !!existing.slot_afternoon,
        evening: !!existing.slot_evening,
        night: !!existing.slot_night,
      }
      setSelectTimeForm({
        timesPerDay: Math.min(4, Math.max(1, existing.times_per_day ?? 1)) as 1 | 2 | 3 | 4,
        morning: slots.morning,
        afternoon: slots.afternoon,
        evening: slots.evening,
        night: slots.night,
        slotMorning: (existing.slot_morning === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotAfternoon: (existing.slot_afternoon === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotEvening: (existing.slot_evening === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotNight: (existing.slot_night === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
      })
    } else {
      setSelectTimeForm({
        timesPerDay: 1,
        morning: false,
        afternoon: false,
        evening: false,
        night: false,
        slotMorning: 'always',
        slotAfternoon: 'always',
        slotEvening: 'always',
        slotNight: 'always',
      })
    }
    setSelectTimeModalOpen(true)
  }
  const getSkilledSchedule = (taskId: string, dayOfWeek: number) =>
    localSkilledSchedules.find((s) => s.task_id === taskId && s.day_of_week === dayOfWeek)

  const openSkilledSelectTimeModal = (task: SkilledCarePlanTask, dayOfWeek: number, dayLabel: string) => {
    const existing = getSkilledSchedule(task.task_id, dayOfWeek)
    setSelectTimeAdl(null)
    setSelectTimeSkilledTask(task)
    setSelectTimeDay(dayOfWeek)
    setSelectTimeDayLabel(dayLabel)
    if (existing && existing.schedule_type === 'specific_times') {
      const slots = {
        morning: !!existing.slot_morning,
        afternoon: !!existing.slot_afternoon,
        evening: !!existing.slot_evening,
        night: !!existing.slot_night,
      }
      setSelectTimeForm({
        timesPerDay: Math.min(4, Math.max(1, existing.times_per_day ?? 1)) as 1 | 2 | 3 | 4,
        morning: slots.morning,
        afternoon: slots.afternoon,
        evening: slots.evening,
        night: slots.night,
        slotMorning: (existing.slot_morning === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotAfternoon: (existing.slot_afternoon === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotEvening: (existing.slot_evening === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
        slotNight: (existing.slot_night === 'as_needed' ? 'as_needed' : 'always') as 'always' | 'as_needed',
      })
    } else {
      setSelectTimeForm({
        timesPerDay: 1,
        morning: false,
        afternoon: false,
        evening: false,
        night: false,
        slotMorning: 'always',
        slotAfternoon: 'always',
        slotEvening: 'always',
        slotNight: 'always',
      })
    }
    setSelectTimeModalOpen(true)
  }

  const closeSelectTimeModal = () => {
    setSelectTimeModalOpen(false)
    setSelectTimeSkilledTask(null)
    setSelectTimeAdl(null)
  }
  const openAdlNoteModal = (adl: { name: string; group: string }) => {
    setAdlNoteTarget(adl)
    setAdlNoteDraft(getAdlNote(adl.name))
    setAdlNoteModalOpen(true)
  }
  const closeAdlNoteModal = () => {
    setAdlNoteModalOpen(false)
    setAdlNoteTarget(null)
  }
  const applyAdlNoteToLocalSchedule = (adlCode: string, note: string) => {
    const normalized = note.trim()
    const now = new Date().toISOString()
    setLocalAdlSchedules((prev) => {
      const forAdl = prev.filter((s) => s.adl_code === adlCode)
      if (forAdl.length === 0) return prev
      return prev.map((s) =>
        s.adl_code !== adlCode
          ? s
          : {
              ...s,
              adl_note: normalized || null,
              updated_at: now,
            }
      )
    })
    setAdlNoteModalOpen(false)
    setAdlNoteTarget(null)
  }
  const handleSaveAdlNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adlNoteTarget) return
    // applyAdlNoteToLocalSchedule(adlNoteTarget.name, adlNoteDraft)
    const id = localAdlSchedules.find((s) => s.adl_code === adlNoteTarget.name && s.day_of_week === selectTimeDay)?.id ?? ''
    
    applyAdlNoteToLocalSchedule(adlNoteTarget.name, adlNoteDraft)
    if (id === '') return
    const supabase = createClient()
    const { error } = await q.updatePatientAdlDaySchedule(supabase, {
      id,
      adl_note: adlNoteDraft,
    })

  }
  const handleRemoveAdlNote = () => {
    if (!adlNoteTarget) return
    applyAdlNoteToLocalSchedule(adlNoteTarget.name, '')
  }
  /** Updates local ADL or skilled day schedule; DB is updated on Save ADL / Skilled plan. */
  const applySelectTimeSchedule = (
    scheduleType: 'never' | 'always' | 'as_needed' | 'specific_times',
    payload?: {
      times_per_day?: number
      slot_morning?: string | null
      slot_afternoon?: string | null
      slot_evening?: string | null
      slot_night?: string | null
    }
  ) => {
    if (selectTimeSkilledTask) {
      const task = selectTimeSkilledTask
      const existing = localSkilledSchedules.find(
        (s) => s.task_id === task.task_id && s.day_of_week === selectTimeDay
      )
      const now = new Date().toISOString()
      const base = {
        id: existing?.id ?? `temp-${task.task_id}-${selectTimeDay}`,
        patient_id: localClient.id,
        task_id: task.task_id,
        day_of_week: selectTimeDay,
        task_note: existing?.task_note ?? null,
        display_order: existing?.display_order ?? task.display_order ?? 0,
        created_at: existing?.created_at || now,
        updated_at: now,
      }
      let row: PatientSkilledTaskDaySchedule
      if (scheduleType === 'specific_times' && payload) {
        row = {
          ...base,
          schedule_type: 'specific_times',
          times_per_day: payload.times_per_day ?? null,
          slot_morning: payload.slot_morning ?? null,
          slot_afternoon: payload.slot_afternoon ?? null,
          slot_evening: payload.slot_evening ?? null,
          slot_night: payload.slot_night ?? null,
        }
      } else {
        row = {
          ...base,
          schedule_type: scheduleType,
          times_per_day: null,
          slot_morning: null,
          slot_afternoon: null,
          slot_evening: null,
          slot_night: null,
        }
      }
      setLocalSkilledSchedules((prev) => {
        const rest = prev.filter((s) => !(s.task_id === task.task_id && s.day_of_week === selectTimeDay))
        return [...rest, row]
      })
      setSelectTimeModalOpen(false)
      setSelectTimeSkilledTask(null)
      return
    }
    if (!selectTimeAdl) return
    const existing = localAdlSchedules.find(
      (s) => s.adl_code === selectTimeAdl.name && s.day_of_week === selectTimeDay
    )
    const adlPlanRow = localAdls.find((a) => a.adl_code === selectTimeAdl.name)
    const now = new Date().toISOString()
    const base = {
      id: existing?.id ?? `temp-${selectTimeAdl.name}-${selectTimeDay}`,
      patient_id: localClient.id,
      adl_code: selectTimeAdl.name,
      day_of_week: selectTimeDay,
      adl_note: existing?.adl_note ?? null,
      display_order: existing?.display_order ?? adlPlanRow?.display_order ?? 0,
      created_at: existing?.created_at || now,
      updated_at: now,
    }
    let row: PatientAdlDaySchedule
    if (scheduleType === 'specific_times' && payload) {
      row = {
        ...base,
        schedule_type: 'specific_times',
        times_per_day: payload.times_per_day ?? null,
        slot_morning: payload.slot_morning ?? null,
        slot_afternoon: payload.slot_afternoon ?? null,
        slot_evening: payload.slot_evening ?? null,
        slot_night: payload.slot_night ?? null,
      }
    } else {
      row = {
        ...base,
        schedule_type: scheduleType,
        times_per_day: null,
        slot_morning: null,
        slot_afternoon: null,
        slot_evening: null,
        slot_night: null,
      }
    }
    setLocalAdlSchedules((prev) => {
      const rest = prev.filter((s) => !(s.adl_code === selectTimeAdl.name && s.day_of_week === selectTimeDay))
      return [...rest, row]
    })
    setSelectTimeModalOpen(false)
  }

  const handleDoneSelectTime = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectTimeSkilledTask) {
      const hasSlots = selectTimeForm.morning || selectTimeForm.afternoon || selectTimeForm.evening || selectTimeForm.night
      const scheduleType = hasSlots ? 'specific_times' : 'never'
      applySelectTimeSchedule(
        scheduleType,
        hasSlots
          ? {
              times_per_day: selectTimeForm.timesPerDay,
              slot_morning: selectTimeForm.morning ? selectTimeForm.slotMorning : null,
              slot_afternoon: selectTimeForm.afternoon ? selectTimeForm.slotAfternoon : null,
              slot_evening: selectTimeForm.evening ? selectTimeForm.slotEvening : null,
              slot_night: selectTimeForm.night ? selectTimeForm.slotNight : null,
            }
          : undefined
      )
      return
    }
    if (!selectTimeAdl) return
    const hasSlots = selectTimeForm.morning || selectTimeForm.afternoon || selectTimeForm.evening || selectTimeForm.night
    const scheduleType = hasSlots ? 'specific_times' : 'never'
    applySelectTimeSchedule(
      scheduleType,
      hasSlots
        ? {
            times_per_day: selectTimeForm.timesPerDay,
            slot_morning: selectTimeForm.morning ? selectTimeForm.slotMorning : null,
            slot_afternoon: selectTimeForm.afternoon ? selectTimeForm.slotAfternoon : null,
            slot_evening: selectTimeForm.evening ? selectTimeForm.slotEvening : null,
            slot_night: selectTimeForm.night ? selectTimeForm.slotNight : null,
          }
        : undefined
    )
  }

  const handleSelectTimeQuick = (scheduleType: 'always' | 'as_needed' | 'never') => {
    applySelectTimeSchedule(scheduleType)
  }

  const handleDeleteAdl = async (adlCode: string) => {
    setDeletingAdlCode(adlCode)
    setAdlPlanError(null)
    try {
      const supabase = createClient()
      const { error } = await q.deleteAdl(supabase, localClient.id, adlCode)
      if (error) throw error
      setLocalAdls((prev) => prev.filter((a) => a.adl_code !== adlCode))
      setLocalAdlSchedules((prev) => prev.filter((s) => s.adl_code !== adlCode))
      setAdlToDelete(null)
      router.refresh()
    } catch (err: unknown) {
      setAdlPlanError(err instanceof Error ? err.message : 'Failed to remove ADL.')
    } finally {
      setDeletingAdlCode(null)
    }
  }

  const handleAttemptRemoveAdlFromPlan = async (adlCode: string) => {
    setAdlPlanError(null)
    try {
      const supabase = createClient()
      const { data: schedules, error } = await q.getSchedulesByPatientId(supabase, localClient.id)
      if (error) throw error
      const scheduleRows = (schedules ?? []) as ScheduleRow[]
      const isUsedInSchedules = scheduleRows.some((s: ScheduleRow) =>
        (s.adl_codes ?? []).some((token: string) => token === adlCode || token.endsWith(`::${adlCode}`))
      )
      if (isUsedInSchedules) {
        setAdlPlanError('This ADL is already used in scheduled visits. Remove it from Schedule first before deleting from ADL plan.')
        return
      }
      setPendingAdlDeletes((prev) => (prev.includes(adlCode) ? prev : [...prev, adlCode]))
      setLocalAdls((prev) => prev.filter((a) => a.adl_code !== adlCode))
      setLocalAdlSchedules((prev) => prev.filter((s) => s.adl_code !== adlCode))
    } catch (err: unknown) {
      setAdlPlanError(err instanceof Error ? err.message : 'Failed to validate ADL usage in schedules.')
    }
  }

  const handleSaveAdlPlan = async () => {
    setIsSavingAdlPlan(true)
    setAdlPlanError(null)
    try {
      adlHydrateAbortRef.current?.abort()
      const supabase = createClient()
      const localCodeSet = new Set(localAdls.map((a) => a.adl_code))
      const { data: dbAdlRows, error: dbAdlErr } = await q.getAdlsByPatientId(supabase, localClient.id)
      if (dbAdlErr) throw dbAdlErr
      const dbCodeSetBefore = new Set((dbAdlRows ?? []).map((r) => r.adl_code))
      const toRemoveFromDb = Array.from(dbCodeSetBefore).filter((c) => !localCodeSet.has(c))
      for (const code of toRemoveFromDb) {
        const { error: delErr } = await q.deleteAdl(supabase, localClient.id, code)
        if (delErr) throw delErr
      }
      const { data: dbAfterDelete, error: dbAfterErr } = await q.getAdlsByPatientId(supabase, localClient.id)
      if (dbAfterErr) throw dbAfterErr
      const dbAfterSet = new Set((dbAfterDelete ?? []).map((r) => r.adl_code))
      const newAdlRows = localAdls
        .filter((a) => !dbAfterSet.has(a.adl_code))
        .sort((a, b) => a.display_order - b.display_order)
      const toAddCodes = newAdlRows.map((a) => a.adl_code)
      const keptRows = localAdls.filter((a) => dbAfterSet.has(a.adl_code))
      const startOrder =
        keptRows.length > 0 ? Math.max(...keptRows.map((a) => a.display_order)) + 1 : 0
      if (toAddCodes.length > 0) {
        const { error: insErr } = await q.insertAdls(supabase, localClient.id, toAddCodes, startOrder)
        if (insErr) throw insErr
      }
      setPendingAdlDeletes([])
      const scheduleRows = localAdlSchedules.filter((s) => localCodeSet.has(s.adl_code))
      const scheduleUpserts: q.PatientAdlDayScheduleUpsert[] = scheduleRows.map((s) => ({
        patient_id: s.patient_id,
        adl_code: s.adl_code,
        day_of_week: s.day_of_week,
        display_order: s.display_order,
        adl_note: s.adl_note,
        schedule_type: s.schedule_type,
        times_per_day: s.times_per_day,
        slot_morning: s.slot_morning,
        slot_afternoon: s.slot_afternoon,
        slot_evening: s.slot_evening,
        slot_night: s.slot_night,
      }))
      const { error: batchSchedErr } = await q.upsertPatientAdlDaySchedulesBatch(
        supabase,
        localClient.id,
        scheduleUpserts
      )
      if (batchSchedErr) throw batchSchedErr
      const [adlsRes, schedRes] = await Promise.all([
        q.getAdlsByPatientId(supabase, localClient.id),
        q.getPatientAdlDaySchedulesByPatientId(supabase, localClient.id),
      ])
      if (adlsRes.error) throw adlsRes.error
      if (schedRes.error) throw schedRes.error
      const adlD = adlsRes.data ?? []
      const schedD = schedRes.data ?? []
      flushSync(() => {
        setLocalAdls(adlD)
        setLocalAdlSchedules(schedD)
      })
      await new Promise((r) => setTimeout(r, 120))
      const supabase2 = createClient()
      const [adls2, sched2] = await Promise.all([
        q.getAdlsByPatientId(supabase2, localClient.id),
        q.getPatientAdlDaySchedulesByPatientId(supabase2, localClient.id),
      ])
      if (adls2.error) throw adls2.error
      if (sched2.error) throw sched2.error
      const finalAdls = adls2.data ?? adlD
      const finalSched = sched2.data ?? schedD
      flushSync(() => {
        setLocalAdls(finalAdls)
        setLocalAdlSchedules(finalSched)
      })
      router.refresh()
      setTimeout(() => {
        setAdlHydrateNonce((n) => n + 1)
      }, 0)
    } catch (err: unknown) {
      setAdlPlanError(err instanceof Error ? err.message : 'Failed to save ADL plan.')
    } finally {
      setIsSavingAdlPlan(false)
    }
  }

  const hasAdlPlanChanges = useMemo(() => {
    if (pendingAdlDeletes.length > 0) return true
    const initAdls = initialAdls ?? []
    const initSched = initialAdlSchedules ?? []
    const sortAdl = (a: PatientAdl, b: PatientAdl) => a.adl_code.localeCompare(b.adl_code)
    const localAdlSig = [...localAdls].sort(sortAdl).map((a) => ({ c: a.adl_code, o: a.display_order }))
    const initAdlSig = [...initAdls].sort(sortAdl).map((a) => ({ c: a.adl_code, o: a.display_order }))
    if (JSON.stringify(localAdlSig) !== JSON.stringify(initAdlSig)) return true
    const schedKey = (s: PatientAdlDaySchedule) => ({
      adl_code: s.adl_code,
      day_of_week: s.day_of_week,
      schedule_type: s.schedule_type,
      times_per_day: s.times_per_day,
      slot_morning: s.slot_morning,
      slot_afternoon: s.slot_afternoon,
      slot_evening: s.slot_evening,
      slot_night: s.slot_night,
      // adl_note: s.adl_note,
      display_order: s.display_order,
    })
    const sortSched = (a: PatientAdlDaySchedule, b: PatientAdlDaySchedule) =>
      a.adl_code.localeCompare(b.adl_code) || a.day_of_week - b.day_of_week
    const localSchedSig = [...localAdlSchedules].sort(sortSched).map(schedKey)
    const initSchedSig = [...initSched].sort(sortSched).map(schedKey)
    return JSON.stringify(localSchedSig) !== JSON.stringify(initSchedSig)
  }, [pendingAdlDeletes, localAdls, localAdlSchedules, initialAdls, initialAdlSchedules])

  const hasSkilledPlanChanges = useMemo(() => {
    if (pendingSkilledDeletes.length > 0) return true
    const initTasks = initialSkilledCarePlanTasks ?? []
    const initSched = initialSkilledSchedules
    const sortT = (a: SkilledCarePlanTask, b: SkilledCarePlanTask) => a.task_id.localeCompare(b.task_id)
    const localTSig = [...localSkilledCarePlanTasks].sort(sortT).map((t) => ({ id: t.task_id, o: t.display_order }))
    const initTSig = [...initTasks].sort(sortT).map((t) => ({ id: t.task_id, o: t.display_order }))
    if (JSON.stringify(localTSig) !== JSON.stringify(initTSig)) return true
    const schedKey = (s: PatientSkilledTaskDaySchedule) => ({
      task_id: s.task_id,
      day_of_week: s.day_of_week,
      schedule_type: s.schedule_type,
      times_per_day: s.times_per_day,
      slot_morning: s.slot_morning,
      slot_afternoon: s.slot_afternoon,
      slot_evening: s.slot_evening,
      slot_night: s.slot_night,
      task_note: s.task_note,
      display_order: s.display_order,
    })
    const sortSched = (a: PatientSkilledTaskDaySchedule, b: PatientSkilledTaskDaySchedule) =>
      a.task_id.localeCompare(b.task_id) || a.day_of_week - b.day_of_week
    const localSchedSig = [...localSkilledSchedules].sort(sortSched).map(schedKey)
    const initSchedSig = [...initSched].sort(sortSched).map(schedKey)
    return JSON.stringify(localSchedSig) !== JSON.stringify(initSchedSig)
  }, [
    pendingSkilledDeletes,
    localSkilledCarePlanTasks,
    localSkilledSchedules,
    initialSkilledCarePlanTasks,
    initialSkilledSchedules,
  ])

  type DayScheduleLike = Pick<
    PatientAdlDaySchedule,
    'schedule_type' | 'times_per_day' | 'slot_morning' | 'slot_afternoon' | 'slot_evening' | 'slot_night'
  >

  const formatAdlDaySummary = (schedule: DayScheduleLike | undefined): string | null => {
    if (!schedule || schedule.schedule_type === 'never') return null
    if (schedule.schedule_type === 'always') return 'Always'
    if (schedule.schedule_type === 'as_needed') return 'As Needed'
    return null
  }

  const getSpecificTimesSlots = (schedule: DayScheduleLike | undefined): { labels: string[]; timesPerDay: number } | null => {
    if (!schedule || schedule.schedule_type !== 'specific_times') return null
    const labels: string[] = []
    if (schedule.slot_morning) labels.push('Morning')
    if (schedule.slot_afternoon) labels.push('Afternoon')
    if (schedule.slot_evening) labels.push('Evening')
    if (schedule.slot_night) labels.push('Night')
    if (labels.length === 0) return null
    return { labels, timesPerDay: schedule.times_per_day ?? 1 }
  }

  const isAdlRowAllSelected = (adlCode: string) => {
    return [1, 2, 3, 4, 5, 6, 7].every((dow) => {
      const s = localAdlSchedules.find((x) => x.adl_code === adlCode && x.day_of_week === dow)
      return s && s.schedule_type === 'specific_times' && s.times_per_day === 1 && s.slot_morning
    })
  }

  const handleToggleAdlRowAll = (adlRow: { adl_code: string; display_order?: number }) => {
    const existingForAdl = localAdlSchedules.filter((s) => s.adl_code === adlRow.adl_code)
    const isAllSelected = isAdlRowAllSelected(adlRow.adl_code)
    const displayOrder = existingForAdl[0]?.display_order ?? adlRow.display_order ?? 0
    const rest = localAdlSchedules.filter((s) => s.adl_code !== adlRow.adl_code)
    const newEntries: PatientAdlDaySchedule[] = []
    for (let dow = 1; dow <= 7; dow++) {
      const existing = existingForAdl.find((x) => x.day_of_week === dow)
      const base = {
        id: existing?.id ?? `temp-${adlRow.adl_code}-${dow}`,
        patient_id: localClient.id,
        adl_code: adlRow.adl_code,
        day_of_week: dow,
        adl_note: existing?.adl_note ?? null,
        display_order: displayOrder,
        created_at: existing?.created_at ?? '',
        updated_at: existing?.updated_at ?? '',
      } as const
      if (isAllSelected) {
        newEntries.push({
          ...base,
          schedule_type: 'never',
          times_per_day: null,
          slot_morning: null,
          slot_afternoon: null,
          slot_evening: null,
          slot_night: null,
        })
      } else {
        newEntries.push({
          ...base,
          schedule_type: 'specific_times',
          times_per_day: 1,
          slot_morning: 'always',
          slot_afternoon: null,
          slot_evening: null,
          slot_night: null,
        })
      }
    }
    setLocalAdlSchedules([...rest, ...newEntries])
  }

  const formatWeekRangeLabel = (start: Date, end: Date) => {
    const m1 = start.toLocaleString('en-US', { month: 'short' })
    const m2 = end.toLocaleString('en-US', { month: 'short' })
    const y = start.getFullYear()
    return `${m1} ${start.getDate()} - ${m2} ${end.getDate()}, ${y}`
  }

  const MONTHLY_ORDINAL_LABELS = ['first', 'second', 'third', 'fourth', 'last'] as const
  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const getOrdinalAndWeekdayFromDate = (dateStr: string): { ordinal: 1 | 2 | 3 | 4 | 5; weekday: number } => {
    const d = new Date(dateStr + 'T12:00:00')
    const weekday = d.getDay()
    const year = d.getFullYear()
    const month = d.getMonth()
    const dayOfMonth = d.getDate()
    const sameWeekdayDates: number[] = []
    const lastDay = new Date(year, month + 1, 0).getDate()
    for (let date = 1; date <= lastDay; date++) {
      if (new Date(year, month, date).getDay() === weekday) sameWeekdayDates.push(date)
    }
    const occurrenceIndex = sameWeekdayDates.indexOf(dayOfMonth) + 1
    const isLast = occurrenceIndex === sameWeekdayDates.length && sameWeekdayDates.length >= 1
    const ordinal = isLast ? 5 : (Math.min(occurrenceIndex, 4) as 1 | 2 | 3 | 4)
    return { ordinal, weekday }
  }

  const getMonthlyRepeatLabel = (ordinal: number, weekday: number) =>
    ordinal === 0
      ? `Monthly on every ${WEEKDAY_NAMES[weekday]}`
      : `Monthly on the ${MONTHLY_ORDINAL_LABELS[(ordinal as 1 | 2 | 3 | 4 | 5) - 1]} ${WEEKDAY_NAMES[weekday]}`

  const getSundayFromMonday = (monday: Date): Date => {
    const d = new Date(monday)
    d.setDate(d.getDate() + 6)
    return d
  }

  const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const getWeekDates = () => {
    const dates: Date[] = []
    const d = new Date(scheduleWeekStart)
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  const getDayOfWeekDb = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00').getDay()
    return d === 0 ? 7 : d
  }

  const getDueTaskCountForDay = (dateStr: string) => {
    const dayOfWeekDb = getDayOfWeekDb(dateStr)
    let count = 0
    for (const a of localAdls) {
      const s = localAdlSchedules.find((x) => x.adl_code === a.adl_code && x.day_of_week === dayOfWeekDb)
      if (s && s.schedule_type !== 'never') count += 1
    }
    for (const t of localSkilledCarePlanTasks) {
      const s = localSkilledSchedules.find((x) => x.task_id === t.task_id && x.day_of_week === dayOfWeekDb)
      if (s && s.schedule_type !== 'never') count += 1
    }
    return count
  }

  const getUnassignedTaskCountForDay = (dateStr: string) => {
    const dayOfWeekDb = getDayOfWeekDb(dateStr)
    let expectedSlots = 0
    for (const a of localAdls) {
      const s = localAdlSchedules.find((x) => x.adl_code === a.adl_code && x.day_of_week === dayOfWeekDb)
      if (!s || s.schedule_type === 'never') continue
      if (s.schedule_type === 'always' || s.schedule_type === 'as_needed') {
        expectedSlots += 1
        continue
      }
      expectedSlots += [s.slot_morning, s.slot_afternoon, s.slot_evening, s.slot_night].filter(Boolean).length
    }
    for (const t of localSkilledCarePlanTasks) {
      const s = localSkilledSchedules.find((x) => x.task_id === t.task_id && x.day_of_week === dayOfWeekDb)
      if (!s || s.schedule_type === 'never') continue
      if (s.schedule_type === 'always' || s.schedule_type === 'as_needed') {
        expectedSlots += 1
        continue
      }
      expectedSlots += [s.slot_morning, s.slot_afternoon, s.slot_evening, s.slot_night].filter(Boolean).length
    }
    const dayRows = weekSchedules.filter((s) => s.date === dateStr && s.adl_codes?.length)
    let assignedSlots = 0
    for (const row of dayRows) {
      for (const token of row.adl_codes ?? []) {
        assignedSlots += 1
      }
    }
    return Math.max(0, expectedSlots - assignedSlots)
  }

  /** Add/Edit Visit modal — ADLs tab: selections are per (time slot × ADL), stored as `slotKey::adlCode` in visitAdlSelected. */
  const renderVisitAdlSelectionList = (dayOfWeekDb: number | null, assignedSlots: Set<string>) => {
    const dow = dayOfWeekDb ?? 1
    const candidates = localAdls.filter((a) => {
      if (!dayOfWeekDb) return true
      const s = localAdlSchedules.find((x) => x.adl_code === a.adl_code && x.day_of_week === dayOfWeekDb)
      return !!(s && s.schedule_type !== 'never')
    })

    const rowEntries: Array<{ adl: PatientAdl; rowKey: string; periodLabel: string; storageSlot: string; groupName: string }> = []
    for (const a of candidates) {
      const s = localAdlSchedules.find((x) => x.adl_code === a.adl_code && x.day_of_week === dow)
      const info = adlLists.find((x) => x.name === a.adl_code)
      const groupName = info?.group ?? 'General'
      if (s?.schedule_type === 'always') {
        const token = encodeVisitAdlSlotKey('any', a.adl_code)
        if (!assignedSlots.has(token)) {
          rowEntries.push({ adl: a, rowKey: `always-${a.adl_code}`, periodLabel: 'Any time', storageSlot: 'any', groupName })
        }
      } else if (s?.schedule_type === 'as_needed') {
        const token = encodeVisitAdlSlotKey('as_needed', a.adl_code)
        if (!assignedSlots.has(token)) {
          rowEntries.push({ adl: a, rowKey: `needed-${a.adl_code}`, periodLabel: 'As needed', storageSlot: 'as_needed', groupName })
        }
      } else if (s?.schedule_type === 'specific_times') {
        for (const { key, label } of ADL_VISIT_TIME_SLOTS) {
          if (!scheduleHasAdlSlot(s, key)) continue
          const token = encodeVisitAdlSlotKey(key, a.adl_code)
          if (assignedSlots.has(token)) continue
          rowEntries.push({ adl: a, rowKey: `${key}-${a.adl_code}`, periodLabel: label, storageSlot: key, groupName })
        }
      }
    }

    const periodBadgeClass =
      'inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-200/80'

    const renderRow = (a: PatientAdl, rowKey: string, periodBadges: string[], storageSlot: string) => {
      const info = adlLists.find((x) => x.name === a.adl_code) ?? { name: a.adl_code, group: 'General' }
      const token = encodeVisitAdlSlotKey(storageSlot, a.adl_code)
      const isChecked = visitAdlSelected.has(token)
      return (
        <label
          key={rowKey}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${isChecked ? 'border-green-500 bg-green-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              setVisitAdlSelected((prev) => {
                const next = new Set(prev)
                if (e.target.checked) next.add(token)
                else next.delete(token)
                return next
              })
            }}
            className="mt-1 rounded border-gray-300"
          />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">{info.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{info.group}</div>
            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs text-gray-600 border border-gray-100 ${info.group === 'ADL' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                {info.group}
              </span>
              {periodBadges.map((b) => (
                <span key={b} className={periodBadgeClass}>
                  <Clock className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                  {b}
                </span>
              ))}
            </div>
          </div>
        </label>
      )
    }

    if (rowEntries.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No ADLs available for this day of the week. Add NON-SKILLED in the NON-SKILLED TASKS tab and set them for this day, or all are already assigned to visits on this date.
        </p>
      )
    }

    return (
      <div className="space-y-4">
        {(() => {
          const grouped = rowEntries.reduce<Record<string, typeof rowEntries>>((acc, item) => {
            if (!acc[item.groupName]) acc[item.groupName] = []
            acc[item.groupName].push(item)
            return acc
          }, {})
          const groupOrder = ['ADL', 'IADL']
          const groups = Object.keys(grouped).sort((a, b) => {
            const ai = groupOrder.indexOf(a.toUpperCase())
            const bi = groupOrder.indexOf(b.toUpperCase())
            if (ai === -1 && bi === -1) return a.localeCompare(b)
            if (ai === -1) return 1
            if (bi === -1) return -1
            return ai - bi
          })
          return groups.map((groupName) => (
            <div key={groupName}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{groupName}</h4>
              <div className="space-y-2">
                {grouped[groupName].map((item) => renderRow(item.adl, item.rowKey, [item.periodLabel], item.storageSlot))}
              </div>
            </div>
          ))
        })()}
      </div>
    )
  }

  /** Add/Edit Visit — skilled contract: same slot×task pattern as ADLs; tokens are `slotKey::taskId`. */
  const renderVisitSkilledSelectionList = (dayOfWeekDb: number | null, assignedSlots: Set<string>) => {
    const dow = dayOfWeekDb ?? 1
    const candidates = localSkilledCarePlanTasks.filter((t) => {
      if (!dayOfWeekDb) return true
      const s = localSkilledSchedules.find((x) => x.task_id === t.task_id && x.day_of_week === dayOfWeekDb)
      return !!(s && s.schedule_type !== 'never')
    })

    const rowEntries: Array<{
      task: SkilledCarePlanTask
      rowKey: string
      periodLabel: string
      storageSlot: string
      groupName: string
    }> = []
    for (const t of candidates) {
      const s = localSkilledSchedules.find((x) => x.task_id === t.task_id && x.day_of_week === dow)
      const groupName = t.category || 'General'
      if (s?.schedule_type === 'always') {
        const token = encodeVisitAdlSlotKey('any', t.task_id)
        if (!assignedSlots.has(token)) {
          rowEntries.push({ task: t, rowKey: `always-${t.task_id}`, periodLabel: 'Any time', storageSlot: 'any', groupName })
        }
      } else if (s?.schedule_type === 'as_needed') {
        const token = encodeVisitAdlSlotKey('as_needed', t.task_id)
        if (!assignedSlots.has(token)) {
          rowEntries.push({ task: t, rowKey: `needed-${t.task_id}`, periodLabel: 'As needed', storageSlot: 'as_needed', groupName })
        }
      } else if (s?.schedule_type === 'specific_times') {
        for (const { key, label } of ADL_VISIT_TIME_SLOTS) {
          if (!scheduleHasAdlSlot(s, key)) continue
          const token = encodeVisitAdlSlotKey(key, t.task_id)
          if (assignedSlots.has(token)) continue
          rowEntries.push({ task: t, rowKey: `${key}-${t.task_id}`, periodLabel: label, storageSlot: key, groupName })
        }
      }
    }

    const periodBadgeClass =
      'inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-200/80'

    const renderRow = (t: SkilledCarePlanTask, rowKey: string, periodBadges: string[], storageSlot: string) => {
      const token = encodeVisitAdlSlotKey(storageSlot, t.task_id)
      const isChecked = visitAdlSelected.has(token)
      return (
        <label
          key={rowKey}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${isChecked ? 'border-green-500 bg-green-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              setVisitAdlSelected((prev) => {
                const next = new Set(prev)
                if (e.target.checked) next.add(token)
                else next.delete(token)
                return next
              })
            }}
            className="mt-1 rounded border-gray-300"
          />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">{t.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t.category}</div>
            <div className="flex flex-wrap gap-1 mt-1.5 items-center">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs text-gray-600 border border-gray-100 ${skilledTaskBadgeClassByCategory(t.category)}`}
              >
                {t.category}
              </span>
              {periodBadges.map((b) => (
                <span key={b} className={periodBadgeClass}>
                  <Clock className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                  {b}
                </span>
              ))}
            </div>
          </div>
        </label>
      )
    }

    if (rowEntries.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No skilled tasks available for this day. Add tasks in the Skilled Tasks tab and set their schedule for this day, or all are already assigned to visits on this date.
        </p>
      )
    }

    return (
      <div className="space-y-4">
        {(() => {
          const grouped = rowEntries.reduce<Record<string, typeof rowEntries>>((acc, item) => {
            if (!acc[item.groupName]) acc[item.groupName] = []
            acc[item.groupName].push(item)
            return acc
          }, {})
          const groups = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
          return groups.map((groupName) => (
            <div key={groupName}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{groupName}</h4>
              <div className="space-y-2">
                {grouped[groupName].map((item) => renderRow(item.task, item.rowKey, [item.periodLabel], item.storageSlot))}
              </div>
            </div>
          ))
        })()}
      </div>
    )
  }

  /** Billing contract(s) valid on the visit anchor date (visit date or repeat start), excluding weekly_hours-only rows. */
  const visitContractAsOfDate = useMemo(() => {
    if (editVisitModalOpen && editingSchedule?.date && /^\d{4}-\d{2}-\d{2}$/.test(editingSchedule.date)) {
      return editingSchedule.date
    }
    const raw = visitForm.isRecurring ? visitForm.repeatStart : visitForm.date
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    return toLocalDateString(new Date())
  }, [editVisitModalOpen, editingSchedule?.date, visitForm.isRecurring, visitForm.repeatStart, visitForm.date])

  const activeContracts = useMemo(
    () => patientServiceContractsSelectableForBillingVisit(serviceContracts, visitContractAsOfDate),
    [serviceContracts, visitContractAsOfDate]
  )

  const selectedVisitContract = useMemo(
    () => activeContracts.find((c) => c.id === visitForm.contractId) ?? null,
    [activeContracts, visitForm.contractId]
  )

  const serviceContractsModalStatusAsOf = toLocalDateString(new Date())

  useEffect(() => {
    const list = patientServiceContractsSelectableForBillingVisit(serviceContracts, visitContractAsOfDate)
    if (list.length === 0) {
      setVisitForm((p) => (p.contractId ? { ...p, contractId: '' } : p))
      return
    }
    setVisitForm((p) => {
      if (list.some((c) => c.id === p.contractId)) return p
      return { ...p, contractId: list[0]!.id }
    })
  }, [serviceContracts, visitContractAsOfDate])

  /** Pill segmented control for Details / ADLs in visit modals (matches design: grey track, white active segment). */
  const visitModalHeaderTabs = (
    <div className="flex w-full rounded-full bg-gray-100 p-1 gap-0.5">
      <button
        type="button"
        onClick={() => setAddVisitTab('details')}
        className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-all ${
          addVisitTab === 'details'
            ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        Details
      </button>
      <button
        type="button"
        onClick={() => setAddVisitTab('adls')}
        className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-all inline-flex items-center justify-center gap-1.5 ${
          addVisitTab === 'adls'
            ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        Tasks
        {visitAdlSelected.size > 0 && (
          <span className="rounded-full bg-green-100 text-green-800 text-xs px-1.5 py-0.5 font-semibold tabular-nums">
            {visitAdlSelected.size}
          </span>
        )}
      </button>
    </div>
  )

  /** US ZIP: first 5 digits for `zipcodes` lookup (strips ZIP+4). */
  const normalizeUsZipForLookup = (zip: unknown): string | null => {
    if (zip === null || zip === undefined) return null
    const s = String(zip).trim()
    if (!s) return null
    const digits = s.replace(/\D/g, '')
    if (digits.length < 5) return null
    return digits.slice(0, 5)
  }

  const utcTimeToLocalHmForDate = (raw: string | null | undefined, ymd: string): string => {
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
    const s = String(raw).trim().slice(0, 5)
    if (!/^\d{2}:\d{2}$/.test(s)) return ''
    const [y, m, d] = ymd.split('-').map(Number)
    const [hh, mm] = s.split(':').map(Number)
    const utcDate = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0))
    return `${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`
  }

  const caregiverMatchOptions = useMemo(() => {
    const visitDate = visitForm.isRecurring ? visitForm.repeatStart : visitForm.date
    const selectedAddr = addresses.find(a => a.id === visitForm.addressId)
    const clientZip = normalizeUsZipForLookup(selectedAddr?.zip_code ?? localClient.zip_code)

    const convertedSlots = caregiverAvailabilitySlots.map(slot => ({
      caregiver_member_id: slot.caregiver_member_id,
      is_recurring: slot.is_recurring,
      start_time: visitDate ? (utcTimeToLocalHmForDate(slot.start_time, visitDate) || slot.start_time) : slot.start_time,
      end_time: visitDate ? (utcTimeToLocalHmForDate(slot.end_time, visitDate) || slot.end_time) : slot.end_time,
      days_of_week: slot.days_of_week,
      repeat_start: slot.repeat_start,
      repeat_end: slot.repeat_end,
      specific_date: slot.specific_date,
    }))

    return computeCaregiverMatches({
      staff: (staffList ?? []).map(s => ({
        id: s.id,
        first_name: (s as any).first_name ?? null,
        last_name: (s as any).last_name ?? null,
        zip_code: (s as any).zip_code ?? (s as any).zipCode ?? null,
        skills: Array.isArray((s as any).skills) ? (s as any).skills : null,
        job_title: (s as any).job_title ?? null,
        role: (s as any).role ?? null,
        phone: (s as any).phone ?? null,
      })),
      slots: convertedSlots,
      conflicts: (visitDateSchedules ?? []).map(v => ({
        id: v.id,
        caregiver_id: v.caregiver_id,
        start_time: v.start_time,
        end_time: v.end_time,
      })),
      requiredSkills: caregiverRequirements ?? [],
      clientZip,
      visitDate,
      visitStart: visitForm.startTime,
      visitEnd: visitForm.endTime,
      currentCaregiverId: null,
      excludeConflictId: editingSchedule?.id ?? undefined,
    })
  }, [
    staffList,
    caregiverRequirements,
    localClient.zip_code,
    visitForm.startTime,
    visitForm.endTime,
    visitForm.date,
    visitForm.repeatStart,
    visitForm.isRecurring,
    visitForm.addressId,
    addresses,
    visitDateSchedules,
    caregiverAvailabilitySlots,
    editingSchedule?.id,
  ])

  const renderCaregiverPicker = () => {
    const selectedOption = caregiverMatchOptions.find(o => o.id === visitForm.caregiverId)
    const selectedName = selectedOption?.name ?? ''

    const menuPanel = (
      <div
        ref={caregiverPickerDropdownRef}
        className="fixed z-[10050] bg-white border border-gray-200 rounded-xl shadow-lg overflow-x-hidden"
        style={
          caregiverPickerMenuFixed
            ? {
                left: caregiverPickerMenuFixed.left,
                bottom: caregiverPickerMenuFixed.bottom,
                width: caregiverPickerMenuFixed.width,
              }
            : undefined
        }
      >
        <CaregiverAssignmentList
          variant="picker"
          options={caregiverMatchOptions}
          requiredSkills={caregiverRequirements ?? []}
          selectedId={visitForm.caregiverId || null}
          clientId={localClient.id}
          onSelect={(id) => {
            setVisitForm(p => ({ ...p, caregiverId: id }))
            setCaregiverPickerOpen(false)
          }}
        />
      </div>
    )

    return (
      <div ref={caregiverPickerWrapRef} className="relative">
        <button
          ref={caregiverPickerTriggerRef}
          type="button"
          onClick={() => setCaregiverPickerOpen((p) => !p)}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
          disabled={isSavingVisit}
        >
          <span className="block truncate" style={{ textAlign: 'left' }}>{selectedName || 'Select caregiver...'}</span>
        </button>

        {caregiverPickerOpen &&
          caregiverPickerMenuFixed &&
          typeof document !== 'undefined' &&
          createPortal(menuPanel, document.body)}
      </div>
    )
  }

  const getScheduleBlockColors = (type: string | null): { bg: string; border: string; text: string } => {
    const t = (type ?? 'Routine').toLowerCase()
    if (t === 'therapy') return { bg: '#f3e8ff', border: '#ad46ff', text: '#996cbb' }
    if (t === 'medical') return { bg: '#ffe2e2', border: '#fb2c36', text: '#c28082' }
    if (t === 'social') return { bg: '#fef9c2', border: '#f0b100', text: '#966d38' }
    if (t === 'other') return { bg: '#f3f4f6', border: '#6a7282', text: '#858a93' }
    return { bg: '#dbfce7', border: '#00c950', text: '#417e5a' }
  }

  const openAddVisitModal = () => {
    const today = toLocalDateString(new Date())
    const primaryAddr = addresses.find(a => a.is_primary)
    setCaregiverPickerOpen(false)
    setVisitForm({
      date: today,
      endDate: today,
      startTime: '09:00',
      endTime: '10:00',
      contractId: activeContracts[0]?.id ?? '',
      description: '',
      type: 'Routine',
      caregiverId: '',
      notes: '',
      isRecurring: false,
      repeatFrequency: '',
      repeatDays: [],
      repeatMonthlyRules: [{ ordinal: null, weekday: null }],
      repeatStart: today,
      repeatEnd: '',
      addressId: primaryAddr?.id ?? '',
    })
    setVisitAdlSelected(new Set())
    setAddVisitTab('details')
    setVisitError(null)
    setScheduleLimitWarning(null)
    setAddVisitModalOpen(true)
  }

  const openAddVisitModalForDate = (dateStr: string, hour: number) => {
    const primaryAddr = addresses.find(a => a.is_primary)
    const startTime = `${String(hour).padStart(2, '0')}:00`
    const endTime = hour < 23 ? `${String(hour + 1).padStart(2, '0')}:00` : '23:59'
    setCaregiverPickerOpen(false)
    setVisitForm({
      date: dateStr,
      endDate: dateStr,
      startTime,
      endTime,
      contractId: activeContracts[0]?.id ?? '',
      description: '',
      type: 'Routine',
      caregiverId: '',
      notes: '',
      isRecurring: false,
      repeatFrequency: '',
      repeatDays: [],
      repeatMonthlyRules: [{ ordinal: null, weekday: null }],
      repeatStart: dateStr,
      repeatEnd: '',
      addressId: primaryAddr?.id ?? '',
    })
    setVisitAdlSelected(new Set())
    setAddVisitTab('details')
    setVisitError(null)
    setScheduleLimitWarning(null)
    setAddVisitModalOpen(true)
  }

  const closeAddVisitModal = () => {
    if (!isSavingVisit) {
      setAddVisitModalOpen(false)
      setCaregiverPickerOpen(false)

    }
  }

  const openEditVisitModal = (schedule: ScheduleRow) => {
    const start = (schedule.start_time ?? '09:00').slice(0, 5)
    const end = (schedule.end_time ?? '10:00').slice(0, 5)
    setCaregiverPickerOpen(false)
    setEditingSchedule(schedule)
    setEditRecurringApplyScope(schedule.is_recurring ? 'weekday_in_series' : 'this_visit')
    setVisitForm({
      date: schedule.date,
      endDate: schedule.end_date ?? schedule.date,
      startTime: start,
      endTime: end,
      contractId: schedule.contract_id ?? '',
      description: schedule.description ?? '',
      type: (schedule.type ?? 'Routine') as string,
      caregiverId: schedule.caregiver_id ?? '',
      notes: schedule.notes ?? '',
      isRecurring: schedule.is_recurring ?? false,
      repeatFrequency: schedule.repeat_frequency ?? '',
      repeatDays: Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [],
      repeatMonthlyRules: (() => {
        const rules = (schedule as { repeat_monthly_rules?: { ordinal: number; weekday: number }[] }).repeat_monthly_rules
        if (Array.isArray(rules) && rules.length > 0) {
          return [...rules.map((r) => ({ ordinal: r.ordinal, weekday: r.weekday })), { ordinal: null as number | null, weekday: null as number | null }]
        }
        return [{ ordinal: null, weekday: null }]
      })(),
      repeatStart: schedule.repeat_start ?? schedule.date,
      repeatEnd: schedule.repeat_end ?? '',
      addressId: (schedule as { patient_address_id?: string }).patient_address_id ?? addresses.find(a => a.is_primary)?.id ?? '',
    })
    {
      const dow = getDayOfWeekDb(schedule.date)
      const next = new Set<string>()
      for (const t of schedule.adl_codes ?? []) {
        next.add(normalizeScheduleTaskToken(t, dow, localAdlSchedules, localSkilledSchedules))
      }
      setVisitAdlSelected(next)
    }
    setAddVisitTab('details')
    setVisitError(null)
    setScheduleLimitWarning(null)
    setEditVisitModalOpen(true)
  }

  const closeEditVisitModal = () => {
    if (!isSavingVisit) {
      setEditVisitModalOpen(false)
      setEditingSchedule(null)
      setEditRecurringApplyScope('this_visit')
      setCaregiverPickerOpen(false)

    }
  }

  const openManageLimitModal = () => {
    setServiceContractError(null)
    setServiceContractsModalOpen(true)
  }

  useEffect(() => {
    if (!serviceContractsModalOpen) return
    let isMounted = true
    const loadModalData = async () => {
      setBillingCodesLoadError(null)
      const supabase = createClient()
      const [{ data: codes, error: codesError }, { data: contracts, error: contractsError }] = await Promise.all([
        getActiveBillingCodesAction(),
        q.getPatientServiceContractsByPatientId(supabase, localClient.id),
      ])
      if (!isMounted) return
      if (codesError) {
        setBillingCodeOptions([])
        setBillingCodesLoadError(codesError || 'Could not load billing codes.')
      } else {
        const rows = (codes ?? []) as BillingCodeOption[]
        setBillingCodeOptions(rows)
        if (rows.length === 0) {
          setBillingCodesLoadError(
            'No active billing codes are in the database. Run migration 080_seed_billing_codes_reference (or insert rows into billing_codes), then reopen this dialog.'
          )
        }
      }
      if (!contractsError) setServiceContracts((contracts ?? []) as PatientServiceContractRow[])
    }
    void loadModalData()
    return () => {
      isMounted = false
    }
  }, [serviceContractsModalOpen, localClient.id])

  const closeManageLimitModal = () => {
    if (!isSavingServiceContract && !isSavingServiceContractRowAction && !isSavingServiceContractEdit) {
      setServiceContractsModalOpen(false)
    }
  }

  const billingCodeSelectOptions = useMemo(() => {
    const byCode = new Map(billingCodeOptions.map((row) => [row.code.toUpperCase(), row]))
    const ordered = BILLING_CODE_PICKLIST_ORDER
      .map((code) => byCode.get(code))
      .filter((row): row is BillingCodeOption => !!row)
    const remaining = billingCodeOptions.filter((row) => !BILLING_CODE_PICKLIST_ORDER.includes(row.code.toUpperCase() as (typeof BILLING_CODE_PICKLIST_ORDER)[number]))
    return [...ordered, ...remaining]
  }, [billingCodeOptions])

  const handleSaveServiceContract = async () => {
    if (!serviceContractForm.billing_code_id) {
      setServiceContractError('Please select billing code.')
      return
    }
    if (!serviceContractForm.contract_type.trim()) {
      setServiceContractError('Please select contract type.')
      return
    }
    if (!serviceContractForm.effective_date) {
      setServiceContractError('Please set effective date.')
      return
    }
    setServiceContractError(null)
    setIsSavingServiceContract(true)
    try {
      const supabase = createClient()
      const { data, error } = await q.insertPatientServiceContract(supabase, {
        patient_id: localClient.id,
        contract_name: serviceContractForm.contract_name || null,
        contract_type: serviceContractForm.contract_type,
        service_type: serviceContractForm.service_type,
        billing_code_id: serviceContractForm.billing_code_id,
        bill_rate: serviceContractForm.bill_rate ? Number(serviceContractForm.bill_rate) : null,
        bill_unit_type: serviceContractForm.bill_unit_type,
        weekly_hours_limit: serviceContractForm.weekly_hours_limit ? Number(serviceContractForm.weekly_hours_limit) : null,
        effective_date: serviceContractForm.effective_date,
        end_date: serviceContractForm.end_date || null,
        note: serviceContractForm.note || null,
        bill_mileage: serviceContractForm.bill_mileage,
        mileage_bill_rate_per_mile: serviceContractForm.mileage_bill_rate_per_mile
          ? Number(serviceContractForm.mileage_bill_rate_per_mile)
          : null,
      })
      if (error || !data) {
        setServiceContractError(error?.message ?? 'Failed to save contract.')
        return
      }
      // Guardrail: if contract starts today/past, enforce it as active so older same-service rows become inactive.
      if (serviceContractForm.effective_date <= toLocalDateString(new Date())) {
        const _statusRes = await q.updatePatientServiceContractStatus(
          supabase,
          (data as PatientServiceContractRow).id,
          'active'
        )
        if (_statusRes.error) {
          setServiceContractError(_statusRes.error.message ?? 'Saved contract, but failed to sync active status.')
        }
      }
      const { data: refreshed, error: refetchErr } = await q.getPatientServiceContractsByPatientId(supabase, localClient.id)
      if (!refetchErr && refreshed) {
        setServiceContracts((refreshed ?? []) as PatientServiceContractRow[])
      } else {
        setServiceContracts((prev) => {
          const inserted = data as PatientServiceContractRow
          return [inserted, ...prev.filter((x) => x.id !== inserted.id)]
        })
      }
      setVisitForm((p) => ({ ...p, contractId: (data as PatientServiceContractRow).id }))
      setServiceContractForm((p) => ({
        ...p,
        contract_name: '',
        billing_code_id: '',
        bill_rate: '',
        weekly_hours_limit: '',
        end_date: '',
        note: '',
      }))
    } catch (e) {
      setServiceContractError(e instanceof Error ? e.message : 'Failed to save contract.')
    } finally {
      setIsSavingServiceContract(false)
    }
  }

  const handleDoneServiceContracts = () => {
    if (isSavingServiceContract || isSavingServiceContractRowAction || isSavingServiceContractEdit) return
    setServiceContractsModalOpen(false)
  }

  const openEditServiceContractModal = (row: PatientServiceContractRow) => {
    setEditingServiceContract(row)
    setServiceContractEditForm({
      contract_name: row.contract_name ?? '',
      bill_rate: row.bill_rate != null ? String(Number(row.bill_rate)) : '',
      end_date: row.end_date ?? '',
      note: row.note ?? '',
      bill_mileage: row.bill_mileage ?? false,
      mileage_bill_rate_per_mile: row.mileage_bill_rate_per_mile != null
        ? String(Number(row.mileage_bill_rate_per_mile))
        : '',
    })
    setServiceContractEditError(null)
    setEditServiceContractModalOpen(true)
  }

  const closeEditServiceContractModal = () => {
    if (isSavingServiceContractEdit) return
    setEditServiceContractModalOpen(false)
    setEditingServiceContract(null)
    setServiceContractEditError(null)
  }

  const handleSaveServiceContractEdit = async () => {
    if (!editingServiceContract) return
    const nextRateRaw = serviceContractEditForm.bill_rate.trim()
    const nextRate = nextRateRaw ? Number(nextRateRaw) : NaN
    if (nextRateRaw && (!Number.isFinite(nextRate) || nextRate < 0)) {
      setServiceContractEditError('Bill rate must be a valid non-negative number.')
      return
    }
    const nextEnd = serviceContractEditForm.end_date.trim()
    if (nextEnd && nextEnd < editingServiceContract.effective_date) {
      setServiceContractEditError('End date cannot be before effective date.')
      return
    }
    setServiceContractEditError(null)
    setIsSavingServiceContractEdit(true)
    try {
      if (nextRateRaw) {
        const rateRes = await updatePatientServiceContractBillRateAction(editingServiceContract.id, nextRate)
        if (rateRes.error) {
          setServiceContractEditError(rateRes.error || 'Failed to save bill rate.')
          return
        }
      }
      const supabase = createClient()
      const res = await q.updatePatientServiceContractDetails(supabase, editingServiceContract.id, {
        contract_name: serviceContractEditForm.contract_name.trim() || null,
        end_date: nextEnd || null,
        note: serviceContractEditForm.note.trim() || null,
        bill_mileage: serviceContractEditForm.bill_mileage,
        mileage_bill_rate_per_mile: serviceContractEditForm.mileage_bill_rate_per_mile.trim()
          ? Number(serviceContractEditForm.mileage_bill_rate_per_mile)
          : null,
      })
      if (res.error) {
        setServiceContractEditError(res.error.message || 'Failed to save contract details.')
        return
      }
      const { data: refreshed, error: refreshErr } = await q.getPatientServiceContractsByPatientId(supabase, localClient.id)
      if (refreshErr) {
        setServiceContractEditError(refreshErr.message || 'Saved but failed to refresh contracts.')
        return
      }
      setServiceContracts((refreshed ?? []) as PatientServiceContractRow[])
      setEditServiceContractModalOpen(false)
      setEditingServiceContract(null)
    } finally {
      setIsSavingServiceContractEdit(false)
    }
  }

  const handleSetServiceContractStatus = async (
    row: PatientServiceContractRow,
    nextStatus: 'active' | 'inactive'
  ) => {
    if (isSavingServiceContractEdit || isSavingServiceContract || isSavingServiceContractRowAction) return
    if ((row.status ?? '').toLowerCase() === nextStatus) return
    setIsSavingServiceContractRowAction(true)
    const supabase = createClient()
    const res = await q.updatePatientServiceContractStatus(supabase, row.id, nextStatus)
    if (res.error) {
      setServiceContractError(res.error.message || 'Failed to update contract status.')
      setIsSavingServiceContractRowAction(false)
      return
    }
    const { data: refreshed, error: refreshErr } = await q.getPatientServiceContractsByPatientId(supabase, localClient.id)
    if (refreshErr) {
      setServiceContractError(refreshErr.message || 'Status updated but refresh failed.')
      setIsSavingServiceContractRowAction(false)
      return
    }
    setServiceContracts((refreshed ?? []) as PatientServiceContractRow[])
    setIsSavingServiceContractRowAction(false)
  }

  const handleDeleteServiceContract = async (row: PatientServiceContractRow) => {
    if (isSavingServiceContractEdit || isSavingServiceContract || isSavingServiceContractRowAction) return
    const confirmed =
      typeof window !== 'undefined' &&
      window.confirm('Delete this contract permanently? This action cannot be undone.')
    if (!confirmed) return
    setIsSavingServiceContractRowAction(true)
    const supabase = createClient()
    const res = await q.deletePatientServiceContract(supabase, row.id)
    if (res.error) {
      setServiceContractError(res.error.message || 'Failed to delete contract.')
      setIsSavingServiceContractRowAction(false)
      return
    }
    const { data: refreshed, error: refreshErr } = await q.getPatientServiceContractsByPatientId(supabase, localClient.id)
    if (refreshErr) {
      setServiceContractError(refreshErr.message || 'Deleted but refresh failed.')
      setIsSavingServiceContractRowAction(false)
      return
    }
    setServiceContracts((refreshed ?? []) as PatientServiceContractRow[])
    setIsSavingServiceContractRowAction(false)
  }

  const normalizeToWeekStart = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return toLocalDateString(getMonday(d))
  }

  const handleAddVisitSubmit = async () => {
    if (!visitForm.startTime || !visitForm.endTime) {
      setVisitError('Please set start time and end time.')
      return
    }
    if (!visitForm.contractId) {
      setVisitError('Please select a billing contract.')
      return
    }
    if (visitAdlSelected.size === 0) {
      setVisitError(
        selectedVisitContract?.service_type === 'skilled'
          ? 'Please select at least one skilled task in the Tasks tab.'
          : 'Please select at least one ADL task in the Tasks tab.'
      )
      return
    }
    if (!visitForm.isRecurring && !visitForm.date) {
      setVisitError('Please set date.')
      return
    }
    if (visitForm.isRecurring && !visitForm.repeatStart) {
      setVisitError('Please set Start Date in the Recurring section.')
      return
    }
    if (visitForm.isRecurring && visitForm.repeatFrequency === 'daily' && !visitForm.repeatEnd) {
      setVisitError('Please set End Date in the Recurring section for daily recurrence.')
      return
    }
    if (visitForm.isRecurring && visitForm.repeatFrequency === 'weekly' && visitForm.repeatDays.length === 0) {
      setVisitError('Please select at least one day of the week.')
      return
    }
    setVisitError(null)
    setScheduleLimitWarning(null)

    const startTime = visitForm.startTime.length === 5 ? visitForm.startTime : visitForm.startTime.slice(0, 5)
    const endTime = visitForm.endTime.length === 5 ? visitForm.endTime : visitForm.endTime.slice(0, 5)
    const selectedContract = activeContracts.find((c) => c.id === visitForm.contractId) ?? null
    const selectedServiceType = selectedContract?.service_type ?? 'non_skilled'
    const startParts = visitForm.startTime.split(':').map(Number)
    const endParts = visitForm.endTime.split(':').map(Number)
    const newMins = (endParts[0] * 60 + (endParts[1] ?? 0)) - (startParts[0] * 60 + (startParts[1] ?? 0))

    let datesToInsert: string[] = []
    if (!visitForm.isRecurring) {
      datesToInsert = [visitForm.date]
    } else {
      const repStart = visitForm.repeatStart!
      const { windowStart, horizonEnd } = getThreeWeekRollingWindowPacific()
      let monthlyRules: { ordinal: number; weekday: number }[] = []
      if (visitForm.repeatFrequency === 'monthly') {
        monthlyRules = visitForm.repeatMonthlyRules.filter(
          (r): r is { ordinal: number; weekday: number } => r.ordinal != null && r.weekday != null
        )
        if (monthlyRules.length === 0) {
          setVisitError('Please add at least one week and day for monthly repeat.')
          return
        }
      }
      datesToInsert = expandSeriesOccurrences(
        {
          repeat_frequency: visitForm.repeatFrequency,
          repeat_start: repStart,
          repeat_end: visitForm.repeatEnd?.trim() ? visitForm.repeatEnd : null,
          days_of_week:
            visitForm.repeatFrequency === 'weekly' && visitForm.repeatDays.length
              ? visitForm.repeatDays
              : null,
          repeat_monthly_rules: visitForm.repeatFrequency === 'monthly' ? monthlyRules : null,
          rangeStart: windowStart,
          rangeEnd: horizonEnd,
        },
        'initial'
      )
    }

    if (visitForm.isRecurring && datesToInsert.length === 0) {
      setVisitError('No dates in the selected range. Check Start Date and End Date.')
      return
    }

    const minDate = datesToInsert[0]
    const maxDate = datesToInsert[datesToInsert.length - 1]
    setScheduleLimitWarning(null)

    const timeToMins = (t: string) => {
      const [h, m] = (t ?? '0:0').split(':').map(Number)
      return h * 60 + (m ?? 0)
    }
    const newStartMins = timeToMins(startTime)
    const newEndMins = timeToMins(endTime)
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && aEnd > bStart

    const supabase = createClient()
    const { data: existingInRange } = await q.getSchedulesByPatientIdAndDateRange(
      supabase,
      localClient.id,
      minDate,
      maxDate
    )
    const overlappingIds = new Set<string>()
    for (const dateStr of datesToInsert) {
      for (const s of existingInRange ?? []) {
        if (s.date !== dateStr) continue
        const sStart = timeToMins(s.start_time ?? '0:0')
        const sEnd = timeToMins(s.end_time ?? '0:0')
        if (overlaps(newStartMins, newEndMins, sStart, sEnd)) overlappingIds.add(s.id)
      }
    }
    if (overlappingIds.size > 0) {
      const ok = typeof window !== 'undefined' && window.confirm(
        'Schedule for this time is already added. Do you replace it?'
      )
      if (!ok) return
    }

    setIsSavingVisit(true)
    try {
      const idsToReplace = Array.from(overlappingIds)
      for (const rid of idsToReplace) {
        const { error: delErr } = await q.deleteSchedule(supabase, rid)
        if (delErr) {
          setVisitError(
            delErr.message ??
              'Could not remove the existing visit before replacing. Check permissions or try again.'
          )
          return
        }
      }
      const basePayload = {
        patient_id: localClient.id,
        start_time: startTime,
        end_time: endTime,
        contract_id: visitForm.contractId,
        service_type: selectedServiceType,
        description: visitForm.description || null,
        type: visitForm.type || 'Routine',
        caregiver_id: visitForm.caregiverId || null,
        notes: visitForm.notes || null,
        adl_codes: Array.from(visitAdlSelected),
        is_recurring: visitForm.isRecurring,
        repeat_frequency: visitForm.isRecurring ? visitForm.repeatFrequency || null : null,
        days_of_week:
          visitForm.isRecurring && visitForm.repeatFrequency === 'weekly' && visitForm.repeatDays.length
            ? visitForm.repeatDays
            : null,
        repeat_monthly_rules:
          visitForm.isRecurring && visitForm.repeatFrequency === 'monthly'
            ? visitForm.repeatMonthlyRules.filter(
                (r): r is { ordinal: number; weekday: number } => r.ordinal != null && r.weekday != null
              )
            : null,
        repeat_start: visitForm.isRecurring ? visitForm.repeatStart || null : null,
        repeat_end: visitForm.isRecurring && visitForm.repeatEnd ? visitForm.repeatEnd : null,
        patient_address_id: visitForm.addressId || null,
        end_date: visitForm.endDate && visitForm.endDate > visitForm.date ? visitForm.endDate : null,
        end_day_offset: visitForm.endDate && visitForm.endDate > visitForm.date
          ? Math.max(0, Math.round((new Date(visitForm.endDate + 'T12:00:00').getTime() - new Date(visitForm.date + 'T12:00:00').getTime()) / 86_400_000))
          : 0,
        mileage_miles: (() => {
          if (!visitForm.caregiverId || !visitForm.addressId) return null
          const selectedVisitAddr = addresses.find(a => a.id === visitForm.addressId)
          const assignedCaregiver = (staffList ?? []).find(s => s.id === visitForm.caregiverId)
          if (!selectedVisitAddr?.zip_code || !(assignedCaregiver as any)?.zip_code) return null
          const from = normalizeUsZipForLookup((assignedCaregiver as any).zip_code)
          const to = normalizeUsZipForLookup(selectedVisitAddr.zip_code)
          if (!from || !to) return null
          const d = zipcodes.distance(from, to)
          return d != null && Number.isFinite(d) ? Math.round(d * 100) / 100 : null
        })(),
      }
      if (visitForm.isRecurring) {
        const repeatStart = visitForm.repeatStart || datesToInsert[0]
        /** Empty = open-ended (refill fills rolling 21-day window). Set = series stops at that date. */
        const repeatEndForSeries = visitForm.repeatEnd?.trim() ? visitForm.repeatEnd : null
        const { error } = await q.insertRecurringSchedulesFromSeries(supabase, {
          ...basePayload,
          dates: datesToInsert,
          repeat_start: repeatStart,
          repeat_end: repeatEndForSeries,
        })
        if (error) {
          setVisitError(error.message ?? 'Failed to add recurring visit.')
          return
        }
      } else {
        for (const dateStr of datesToInsert) {
          const { error } = await q.insertSchedule(supabase, { ...basePayload, date: dateStr })
          if (error) {
            setVisitError(error.message ?? 'Failed to add visit.')
            return
          }
        }
      }
      if (maxDate >= scheduleWeekStartStr && minDate <= scheduleWeekEndStr) {
        const { data } = await q.getSchedulesByPatientIdAndDateRange(
          supabase,
          localClient.id,
          scheduleWeekStartStr,
          scheduleWeekEndStr
        )
        setWeekSchedules(data ?? [])
      }
      setAddVisitModalOpen(false)
      router.refresh()
    } catch (e) {
      setVisitError(e instanceof Error ? e.message : 'Failed to add visit.')
    } finally {
      setIsSavingVisit(false)
    }
  }

  const handleUpdateVisitSubmit = async () => {
    if (!editingSchedule) return
    if (!visitForm.startTime || !visitForm.endTime) {
      setVisitError('Please set start time and end time.')
      return
    }
    if (!visitForm.contractId) {
      setVisitError('Please select a billing contract.')
      return
    }
    const selectedContract = activeContracts.find((c) => c.id === visitForm.contractId) ?? null
    const selectedServiceType = selectedContract?.service_type ?? 'non_skilled'
    if (visitAdlSelected.size === 0) {
      setVisitError(
        selectedVisitContract?.service_type === 'skilled'
          ? 'Please select at least one skilled task in the Tasks tab.'
          : 'Please select at least one ADL task in the Tasks tab.'
      )
      return
    }
    if (!visitForm.isRecurring && !visitForm.date) {
      setVisitError('Please set date.')
      return
    }
    setVisitError(null)
    setScheduleLimitWarning(null)
    const dateToSave = visitForm.isRecurring ? editingSchedule.date : visitForm.date!
    const newStartParts = visitForm.startTime.split(':').map(Number)
    const newEndParts = visitForm.endTime.split(':').map(Number)
    const newVisitMins = (newEndParts[0] * 60 + (newEndParts[1] ?? 0)) - (newStartParts[0] * 60 + (newStartParts[1] ?? 0))
    setIsSavingVisit(true)
    try {
      const supabase = createClient()
      const updatePatch = {
        date: dateToSave,
        start_time: visitForm.startTime.length === 5 ? visitForm.startTime : visitForm.startTime.slice(0, 5),
        end_time: visitForm.endTime.length === 5 ? visitForm.endTime : visitForm.endTime.slice(0, 5),
        contract_id: visitForm.contractId,
        service_type: selectedServiceType,
        description: visitForm.description || null,
        type: visitForm.type || 'Routine',
        caregiver_id: visitForm.caregiverId || null,
        notes: visitForm.notes || null,
        adl_codes: Array.from(visitAdlSelected),
        is_recurring: visitForm.isRecurring,
        repeat_frequency: visitForm.isRecurring ? visitForm.repeatFrequency || null : null,
        days_of_week:
          visitForm.isRecurring && visitForm.repeatFrequency === 'weekly' && visitForm.repeatDays.length
            ? visitForm.repeatDays
            : null,
        repeat_monthly_rules:
          visitForm.isRecurring && visitForm.repeatFrequency === 'monthly'
            ? visitForm.repeatMonthlyRules.filter(
                (r): r is { ordinal: number; weekday: number } => r.ordinal != null && r.weekday != null
              )
            : null,
        repeat_start: visitForm.isRecurring ? visitForm.repeatStart || null : null,
        repeat_end: visitForm.isRecurring && visitForm.repeatEnd ? visitForm.repeatEnd : null,
        end_date: visitForm.endDate && visitForm.endDate > dateToSave ? visitForm.endDate : null,
      }
      if (editingSchedule.is_recurring && editRecurringApplyScope !== 'this_visit') {
        // Keep each occurrence on its own calendar day for bulk recurring edits.
        const bulkPatch = {
          ...updatePatch,
          date: undefined,
        }
        const bulk = await q.updateRecurringSchedulesByScope(supabase, {
          seed_schedule_id: editingSchedule.id,
          scope: editRecurringApplyScope,
          apply_from_date: editingSchedule.date,
          patch: bulkPatch,
        })
        if (bulk.error) {
          setVisitError(bulk.error.message ?? 'Failed to update recurring visits.')
          return
        }
      } else {
        const { error } = await q.updateSchedule(supabase, editingSchedule.id, updatePatch)
        if (error) {
          setVisitError(error.message ?? 'Failed to update visit.')
          return
        }
      }
      if (dateToSave >= scheduleWeekStartStr && dateToSave <= scheduleWeekEndStr) {
        const { data } = await q.getSchedulesByPatientIdAndDateRange(
          supabase,
          localClient.id,
          scheduleWeekStartStr,
          scheduleWeekEndStr
        )
        setWeekSchedules(data ?? [])
      }
      setEditVisitModalOpen(false)
      setEditingSchedule(null)
      router.refresh()
    } catch (e) {
      setVisitError(e instanceof Error ? e.message : 'Failed to update visit.')
    } finally {
      setIsSavingVisit(false)
    }
  }

  const refreshWeekSchedules = async () => {
    const supabase = createClient()
    const { data } = await q.getSchedulesByPatientIdAndDateRange(
      supabase,
      localClient.id,
      scheduleWeekStartStr,
      scheduleWeekEndStr
    )
    setWeekSchedules(data ?? [])
  }

  const handleConfirmVisitStatusChange = async () => {
    if (!editingSchedule || !visitStatusModal) return
    setIsSavingVisit(true)
    try {
      const id = editingSchedule.id
      const reason = visitStatusReason
      let result: { ok?: true; error?: string }
      if (visitStatusModal === 'missed') result = await markScheduleMissedAction(id, reason)
      else if (visitStatusModal === 'cancelled') result = await markScheduleCancelledAction(id, reason)
      else result = await markScheduleOnHoldAction(id, reason)
      if (result.error) {
        setVisitError(result.error)
      } else {
        setVisitStatusModal(null)
        setVisitStatusReason('')
        await refreshWeekSchedules()
        setEditVisitModalOpen(false)
        setEditingSchedule(null)
        router.refresh()
      }
    } catch (e) {
      setVisitError(e instanceof Error ? e.message : 'Failed to update visit status.')
    } finally {
      setIsSavingVisit(false)
    }
  }

  const handleMarkVisitMissed = () => {
    setVisitStatusModal('missed')
    setVisitStatusReason('')
  }

  const handleMarkVisitUnmissed = async () => {
    if (!editingSchedule) return
    setIsSavingVisit(true)
    try {
      const result = await reinstateScheduleAction(editingSchedule.id)
      if (result.error) {
        setVisitError(result.error)
      } else {
        await refreshWeekSchedules()
        setEditVisitModalOpen(false)
        setEditingSchedule(null)
        router.refresh()
      }
    } catch (e) {
      setVisitError(e instanceof Error ? e.message : 'Failed to reinstate visit.')
    } finally {
      setIsSavingVisit(false)
    }
  }

  const handleDeleteVisit = async () => {
    if (!editingSchedule) return
    if (!confirm('Delete this visit? This cannot be undone.')) return
    setIsSavingVisit(true)
    try {
      const supabase = createClient()
      const { error: delErr } = await q.deleteSchedule(supabase, editingSchedule.id)
      if (delErr) {
        setVisitError(delErr.message ?? 'Could not delete this visit.')
        return
      }
      setWeekSchedules((prev) => prev.filter((s) => s.id !== editingSchedule.id))
      setEditVisitModalOpen(false)
      setEditingSchedule(null)
      router.refresh()
    } catch (e) {
      setVisitError(e instanceof Error ? e.message : 'Failed to delete visit.')
    } finally {
      setIsSavingVisit(false)
    }
  }

  const handleSaveLimit = async () => {
    const total = parseFloat(limitForm.totalHours)
    if (Number.isNaN(total) || total <= 0) {
      setLimitError('Please enter a valid total amount of hours.')
      return
    }
    if (!limitForm.effectiveDate) {
      setLimitError('Effective date is required.')
      return
    }
    setLimitError(null)
    setIsSavingLimit(true)
    try {
      const supabase = createClient()
      const effectiveWeekStart = normalizeToWeekStart(limitForm.effectiveDate)
      const { data, error } = await q.insertPatientContractedHours(supabase, {
        patient_id: localClient.id,
        total_hours: total,
        effective_date: effectiveWeekStart,
        end_date: null,
        note: limitForm.note || null,
      })
      if (error) {
        setLimitError(error.message ?? 'Failed to save.')
        return
      }
      if (data) setLocalContractedHours((prev) => [data, ...prev])
      setManageLimitModalOpen(false)
      router.refresh()
    } catch (e) {
      setLimitError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setIsSavingLimit(false)
    }
  }

  const handleDeleteLimit = async (id: string) => {
    try {
      const supabase = createClient()
      await q.deletePatientContractedHours(supabase, id)
      setLocalContractedHours((prev) => prev.filter((l) => l.id !== id))
      router.refresh()
    } catch (_) {}
  }

  /** Schedule + overview: most recently added limit (matches top row in Limit History). */
  const latestAddedContractLimit = useMemo((): PatientContractedHoursRow | null => {
    const rows = localContractedHours
    if (rows.length === 0) return null
    let best = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const L = rows[i]
      const cmp = (L.created_at ?? '').localeCompare(best.created_at ?? '')
      if (cmp > 0 || (cmp === 0 && L.id.localeCompare(best.id) > 0)) best = L
    }
    return best
  }, [localContractedHours])

  /**
   * Schedule tab: for the selected week, use the limit that actually governs that week.
   * - If the latest-added row (Limit History "Current") applies to this week, use it — so new limits
   *   match the modal as soon as their effective week is this week or earlier.
   * - If the selected week is before that row's effective date, fall back to the newest limit that
   *   does apply (by effective_date), so past weeks don't show a future-dated limit.
   */
  const limitAppliesToWeekStart = (row: PatientContractedHoursRow, weekStart: string) =>
    row.effective_date <= weekStart && (row.end_date == null || row.end_date >= weekStart)

  const currentLimitForWeek = useMemo((): PatientContractedHoursRow | null => {
    const weekStart = scheduleWeekStartStr
    if (
      latestAddedContractLimit &&
      limitAppliesToWeekStart(latestAddedContractLimit, weekStart)
    ) {
      return latestAddedContractLimit
    }
    const applicable = localContractedHours.filter((row) => limitAppliesToWeekStart(row, weekStart))
    if (applicable.length === 0) return null
    let best = applicable[0]
    for (let i = 1; i < applicable.length; i++) {
      const L = applicable[i]
      const cmp = L.effective_date.localeCompare(best.effective_date)
      if (cmp > 0 || (cmp === 0 && L.id.localeCompare(best.id) > 0)) best = L
    }
    return best
  }, [latestAddedContractLimit, localContractedHours, scheduleWeekStartStr])

  const scheduledHoursForWeek = useMemo(() => {
    return weekSchedules.reduce((acc, s) => {
      const [sh, sm] = (s.start_time ?? '0:0').split(':').slice(0, 2).map(Number)
      const [eh, em] = (s.end_time ?? '0:0').split(':').slice(0, 2).map(Number)
      return acc + (eh * 60 + em - sh * 60 - sm) / 60
    }, 0)
  }, [weekSchedules])

  const scheduledHoursForWeekByServiceType = useMemo(
    () =>
      weekSchedules.reduce(
        (acc, s) => {
          const [sh, sm] = (s.start_time ?? '0:0').split(':').slice(0, 2).map(Number)
          const [eh, em] = (s.end_time ?? '0:0').split(':').slice(0, 2).map(Number)
          const dur = (eh * 60 + em - sh * 60 - sm) / 60
          if (!Number.isFinite(dur) || dur <= 0) return acc
          const key = s.service_type === 'skilled' ? 'skilled' : 'non_skilled'
          acc[key] += dur
          return acc
        },
        { non_skilled: 0, skilled: 0 } as Record<'non_skilled' | 'skilled', number>
      ),
    [weekSchedules]
  )

  /**
   * UI-level fallback status derivation for schedule grid:
   * if a visit is still scheduled/unassigned but its local end time has passed,
   * render it as missed immediately (without waiting for DB cron sync).
   */
  const getEffectiveScheduleStatus = (s: ScheduleRow): ReturnType<typeof visitStatusFromScheduleRow> => {
    const base = visitStatusFromScheduleRow(s)
    if (base === 'completed' || base === 'missed' || base === 'in_progress') return base

    const date = String(s.date ?? '').trim()
    const endTimeRaw = String(s.end_time ?? s.start_time ?? '').trim()
    const time = endTimeRaw.slice(0, 5)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return base

    const endAt = new Date(`${date}T${time}:00`)
    if (Number.isNaN(endAt.getTime())) return base

    const now = new Date(scheduleNowTick)
    return endAt.getTime() < now.getTime() ? 'missed' : base
  }

  const scheduleStatusLabel = (status: ReturnType<typeof visitStatusFromScheduleRow>) =>
    status === 'in_progress' ? 'In progress' : status.charAt(0).toUpperCase() + status.slice(1)

  useEffect(() => {
    if (activeTab !== 'schedule' || weekSchedules.length === 0) return

    const candidates = weekSchedules.filter((s) => {
      const effective = getEffectiveScheduleStatus(s)
      if (effective !== 'missed') return false
      const raw = String(s.status ?? '').trim().toLowerCase()
      if (raw === 'missed') return false
      if (raw === 'in_progress' || raw === 'in progress') return false
      if (autoMarkingMissedVisitIdsRef.current.has(s.id)) return false
      return true
    })
    if (candidates.length === 0) return

    const candidateIds = new Set(candidates.map((s) => s.id))
    setWeekSchedules((prev) =>
      prev.map((s) => (candidateIds.has(s.id) ? { ...s, status: 'missed' } : s))
    )

    for (const s of candidates) {
      autoMarkingMissedVisitIdsRef.current.add(s.id)
    }

    void (async () => {
      const supabase = createClient()
      const results = await Promise.allSettled(
        candidates.map((s) => q.updateSchedule(supabase, s.id, { status: 'missed' }))
      )
      results.forEach((res, idx) => {
        const id = candidates[idx]?.id
        if (!id) return
        autoMarkingMissedVisitIdsRef.current.delete(id)
        if (res.status === 'rejected' || res.value.error) {
          setWeekSchedules((prev) =>
            prev.map((s) => (s.id === id && String(s.status ?? '').toLowerCase() === 'missed' ? { ...s, status: candidates[idx]?.status ?? null } : s))
          )
        }
      })
    })()
  }, [activeTab, scheduleNowTick, weekSchedules])

  const weeklyLimitRows = useMemo(
    () =>
      serviceContracts.filter(
        (r) =>
          r.weekly_hours_limit != null &&
          Number.isFinite(Number(r.weekly_hours_limit)) &&
          Number(r.weekly_hours_limit) >= 0
      ),
    [serviceContracts]
  )

  /**
   * Schedule tab: weekly hour limit row per service type for the **selected calendar week**.
   * Includes historical rows: timeline is `effective_date` / `end_date` (RPC does not rely on `status`).
   * Pick among rows with a limit whose window overlaps the week, latest effective_date
   * (then created_at, id) so past weeks use the contract that was in force then.
   */
  const currentWeeklyLimitByServiceType = useMemo(() => {
    const weekStart = scheduleWeekStartStr
    const weekEnd = scheduleWeekEndStr
    const overlapsWeek = (r: PatientServiceContractRow) =>
      r.effective_date <= weekEnd && (r.end_date == null || r.end_date >= weekStart)
    const pickFor = (serviceType: 'non_skilled' | 'skilled') => {
      const rows = weeklyLimitRows.filter((r) => r.service_type === serviceType)
      if (rows.length === 0) return null
      const applicable = rows.filter((r) => overlapsWeek(r))
      if (applicable.length === 0) return null
      return [...applicable].sort((a, b) => {
        const byEffective = b.effective_date.localeCompare(a.effective_date)
        if (byEffective !== 0) return byEffective
        const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '')
        if (byCreated !== 0) return byCreated
        return b.id.localeCompare(a.id)
      })[0]
    }
    return {
      non_skilled: pickFor('non_skilled'),
      skilled: pickFor('skilled'),
    } as Record<'non_skilled' | 'skilled', PatientServiceContractRow | null>
  }, [weeklyLimitRows, scheduleWeekStartStr, scheduleWeekEndStr])

  /** Overview tab: most recently saved weekly limit per service type (from patient_service_contracts). */
  const latestOverviewWeeklyByServiceType = useMemo(() => {
    const pick = (st: 'non_skilled' | 'skilled') => {
      const rows = weeklyLimitRows.filter((r) => r.service_type === st)
      if (rows.length === 0) return null
      return [...rows].sort((a, b) => {
        const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '')
        if (byCreated !== 0) return byCreated
        const byEffective = b.effective_date.localeCompare(a.effective_date)
        if (byEffective !== 0) return byEffective
        return b.id.localeCompare(a.id)
      })[0]
    }
    return {
      non_skilled: pick('non_skilled'),
      skilled: pick('skilled'),
    } as Record<'non_skilled' | 'skilled', PatientServiceContractRow | null>
  }, [weeklyLimitRows])

  const overviewPreviousWeeklyByServiceType = useMemo(() => {
    const rest = (st: 'non_skilled' | 'skilled') => {
      const rows = weeklyLimitRows
        .filter((r) => r.service_type === st)
        .sort((a, b) => {
          const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '')
          if (byCreated !== 0) return byCreated
          return b.effective_date.localeCompare(a.effective_date)
        })
      return rows.slice(1)
    }
    return { non_skilled: rest('non_skilled'), skilled: rest('skilled') }
  }, [weeklyLimitRows])

  const overviewHasWeeklyContractLimits =
    latestOverviewWeeklyByServiceType.non_skilled != null ||
    latestOverviewWeeklyByServiceType.skilled != null

  const skillsByType = caregiverSkillCatalog.reduce<Record<string, { type: string; name: string }[]>>((acc, s) => {
    if (!acc[s.type]) acc[s.type] = []
    acc[s.type].push(s)
    return acc
  }, {})
  const CAREGIVER_REQUIREMENTS_TYPE_ORDER = [
    'Clinical Care',
    'Specialty Conditions',
    'Physical Support',
    'Daily Living',
    'Certifications',
    'Language',
    ...Object.keys(skillsByType).filter(
      (t) =>
        ![
          'Clinical Care',
          'Specialty Conditions',
          'Physical Support',
          'Daily Living',
          'Certifications',
          'Language',
        ].includes(t)
    ),
  ]
  const categoryColors: Record<string, string> = {
    'Clinical Care': 'ring-red-500 bg-red-500 text-white',
    'Specialty Conditions': 'ring-blue-500 bg-blue-500 text-white',
    'Physical Support': 'ring-amber-600 bg-amber-600 text-white',
    'Daily Living': 'ring-green-600 bg-green-600 text-white',
    'Certifications': 'ring-blue-500 bg-blue-500 text-white',
    'Language': 'ring-teal-500 bg-teal-500 text-white',
  }
  const skilledTaskBadgePalette = [
    'bg-red-100 text-red-700',
    'bg-orange-100 text-orange-700',
    'bg-amber-100 text-amber-700',
    'bg-yellow-100 text-yellow-700',
    'bg-lime-100 text-lime-700',
    'bg-green-100 text-green-700',
    'bg-emerald-100 text-emerald-700',
    'bg-teal-100 text-teal-700',
    'bg-cyan-100 text-cyan-700',
    'bg-sky-100 text-sky-700',
    'bg-blue-100 text-blue-700',
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-fuchsia-100 text-fuchsia-700',
    'bg-pink-100 text-pink-700',
    'bg-rose-100 text-rose-700',
  ] as const
  const skilledTaskBadgeClassByCategory = (category: string) => {
    const known: Record<string, string> = {
      ADL: 'bg-blue-100 text-blue-700',
      IADL: 'bg-rose-100 text-rose-700',
      'Wound Care': 'bg-rose-100 text-rose-700',
      'Medication Management': 'bg-blue-100 text-blue-700',
      'Vital Signs & Monitoring': 'bg-emerald-100 text-emerald-700',
      'Respiratory Care': 'bg-cyan-100 text-cyan-700',
      'Physical / OT': 'bg-amber-100 text-amber-700',
      'Nutrition Support': 'bg-lime-100 text-lime-700',
      'Catheter & Elimination': 'bg-orange-100 text-orange-700',
      'Lab & Diagnostics': 'bg-teal-100 text-teal-700',
    }
    if (known[category]) return known[category]
    let hash = 0
    for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
    return skilledTaskBadgePalette[hash % skilledTaskBadgePalette.length]
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'medical', label: 'Medical Info' },
    { id: 'representatives', label: 'Representatives' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'adls', label: 'Non-Skilled Tasks' },
    { id: 'skilled-tasks', label: 'Skilled Tasks' },
    { id: 'documents', label: 'Documents' },
    { id: 'caregiver-requirements', label: 'Caregiver Competencies' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'notes', label: 'Notes' },
  ]

  const openSkilledTaskModal = () => {
    setSkilledTasksError(null)
    setSkilledTaskSearch('')
    setSkilledTaskCategoryFilter('all')
    setPendingSkilledTaskIds(new Set(localSkilledCarePlanTasks.map((t) => t.task_id)))
    setSkilledTaskModalOpen(true)
  }

  const applySkilledTaskSelection = () => {
    const selected = skilledTaskLibrary.filter((t) => pendingSkilledTaskIds.has(t.id))
    const next = selected.map((t, i) => ({
      id: `draft-${t.id}`,
      patient_id: localClient.id,
      task_id: t.id,
      category: t.category || 'General',
      name: t.name,
      description: t.description ?? null,
      display_order: i,
    }))
    setLocalSkilledCarePlanTasks(next)
    setLocalSkilledSchedules((prev) => {
      const kept = prev.filter((s) => next.some((t) => t.task_id === s.task_id))
      const now = new Date().toISOString()
      for (const t of next) {
        const hasRow = kept.some((s) => s.task_id === t.task_id)
        if (hasRow) continue
        for (let dow = 1; dow <= 7; dow++) {
          kept.push({
            id: `temp-${t.task_id}-${dow}`,
            patient_id: localClient.id,
            task_id: t.task_id,
            day_of_week: dow,
            task_note: null,
            schedule_type: 'never',
            times_per_day: null,
            slot_morning: null,
            slot_afternoon: null,
            slot_evening: null,
            slot_night: null,
            display_order: t.display_order,
            created_at: now,
            updated_at: now,
          })
        }
      }
      return kept
    })
    setSkilledTaskModalOpen(false)
  }

  const handleSaveSkilledCarePlan = async () => {
    setSkilledTasksError(null)
    setIsSavingSkilledTasks(true)
    try {
      const supabase = createClient()
      if (pendingSkilledDeletes.length > 0) {
        const { error: delBatchErr } = await q.deleteSkilledTaskPlanRowsBatch(
          supabase,
          localClient.id,
          pendingSkilledDeletes
        )
        if (delBatchErr) throw delBatchErr
      }
      setPendingSkilledDeletes([])
      const skilledUpserts: q.PatientSkilledTaskDayScheduleUpsert[] = localSkilledSchedules.map((s) => ({
        patient_id: s.patient_id,
        task_id: s.task_id,
        day_of_week: s.day_of_week,
        display_order: s.display_order,
        task_note: s.task_note,
        schedule_type: s.schedule_type,
        times_per_day: s.times_per_day,
        slot_morning: s.slot_morning,
        slot_afternoon: s.slot_afternoon,
        slot_evening: s.slot_evening,
        slot_night: s.slot_night,
      }))
      const { error: skilledBatchErr } = await q.upsertPatientSkilledTaskDaySchedulesBatch(
        supabase,
        localClient.id,
        skilledUpserts
      )
      if (skilledBatchErr) throw skilledBatchErr
      const tasksRes = await q.getPatientSkilledCarePlanTasks(supabase, localClient.id)
      const schedRes = await q.getPatientSkilledDaySchedulesByPatientId(supabase, localClient.id)
      if (tasksRes.data) setLocalSkilledCarePlanTasks(tasksRes.data)
      if (schedRes.data) setLocalSkilledSchedules(schedRes.data)
      router.refresh()
    } catch (e) {
      setSkilledTasksError(e instanceof Error ? e.message : 'Failed to save care plan.')
    } finally {
      setIsSavingSkilledTasks(false)
    }
  }

  const getSkilledTaskNote = (taskId: string): string => {
    const row =
      localSkilledSchedules.find((s) => s.task_id === taskId && (s.task_note ?? '').trim() !== '') ??
      localSkilledSchedules.find((s) => s.task_id === taskId && s.day_of_week === 1)
    return (row?.task_note ?? '').trim()
  }

  const applySkilledNoteToLocalSchedule = (taskId: string, note: string) => {
    const normalized = note.trim()
    const now = new Date().toISOString()
    setLocalSkilledSchedules((prev) =>
      prev.map((s) =>
        s.task_id !== taskId
          ? s
          : {
              ...s,
              task_note: normalized || null,
              updated_at: now,
            }
      )
    )
    setSkilledNoteModalOpen(false)
    setSkilledNoteTarget(null)
  }

  const openSkilledNoteModal = (task: SkilledCarePlanTask) => {
    setSkilledNoteTarget(task)
    setSkilledNoteDraft(getSkilledTaskNote(task.task_id))
    setSkilledNoteModalOpen(true)
  }

  const closeSkilledNoteModal = () => {
    setSkilledNoteModalOpen(false)
    setSkilledNoteTarget(null)
  }

  const handleSaveSkilledNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!skilledNoteTarget) return
    const taskId = skilledNoteTarget.task_id
    const id =
      localSkilledSchedules.find((s) => s.task_id === taskId && s.day_of_week === 1)?.id ?? ''
    applySkilledNoteToLocalSchedule(taskId, skilledNoteDraft)
    if (!id || id.startsWith('temp-')) return
    const supabase = createClient()
    await q.updatePatientSkilledTaskDayScheduleNote(supabase, { id, task_note: skilledNoteDraft })
  }

  const handleRemoveSkilledNote = async () => {
    if (!skilledNoteTarget) return
    const taskId = skilledNoteTarget.task_id
    const id =
      localSkilledSchedules.find((s) => s.task_id === taskId && s.day_of_week === 1)?.id ?? ''
    applySkilledNoteToLocalSchedule(taskId, '')
    if (!id || id.startsWith('temp-')) return
    const supabase = createClient()
    await q.updatePatientSkilledTaskDayScheduleNote(supabase, { id, task_note: '' })
  }

  const taskTokenReferencesTaskId = (token: string, taskId: string): boolean => {
    if (token === taskId) return true
    if (token === `skilled::${taskId}`) return true
    if (token.endsWith(`${VISIT_ADL_SLOT_SEP}${taskId}`)) return true
    return false
  }

  const handleAttemptRemoveSkilledFromPlan = async (taskId: string) => {
    setSkilledTasksError(null)
    try {
      const supabase = createClient()
      const { data: schedules, error } = await q.getSchedulesByPatientId(supabase, localClient.id)
      if (error) throw error
      const scheduleRows = (schedules ?? []) as ScheduleRow[]
      const isUsedInSchedules = scheduleRows.some((s: ScheduleRow) =>
        (s.adl_codes ?? []).some((token: string) => taskTokenReferencesTaskId(token, taskId))
      )
      if (isUsedInSchedules) {
        setSkilledTasksError(
          'This skilled task is already used in scheduled visits. Remove it from Schedule first before deleting from the care plan.'
        )
        return
      }
      setPendingSkilledDeletes((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))
      setLocalSkilledCarePlanTasks((prev) => prev.filter((t) => t.task_id !== taskId))
      setLocalSkilledSchedules((prev) => prev.filter((s) => s.task_id !== taskId))
    } catch (err: unknown) {
      setSkilledTasksError(err instanceof Error ? err.message : 'Failed to validate skilled task usage in schedules.')
    }
  }

  const isSkilledRowAllSelected = (taskId: string) => {
    return [1, 2, 3, 4, 5, 6, 7].every((dow) => {
      const s = localSkilledSchedules.find((x) => x.task_id === taskId && x.day_of_week === dow)
      return s && s.schedule_type === 'specific_times' && s.times_per_day === 1 && s.slot_morning
    })
  }

  const handleToggleSkilledRowAll = (taskRow: SkilledCarePlanTask) => {
    const existingForTask = localSkilledSchedules.filter((s) => s.task_id === taskRow.task_id)
    const isAllSelected = isSkilledRowAllSelected(taskRow.task_id)
    const displayOrder = existingForTask[0]?.display_order ?? taskRow.display_order ?? 0
    const rest = localSkilledSchedules.filter((s) => s.task_id !== taskRow.task_id)
    const newEntries: PatientSkilledTaskDaySchedule[] = []
    const now = new Date().toISOString()
    for (let dow = 1; dow <= 7; dow++) {
      const existing = existingForTask.find((x) => x.day_of_week === dow)
      const base = {
        id: existing?.id ?? `temp-${taskRow.task_id}-${dow}`,
        patient_id: localClient.id,
        task_id: taskRow.task_id,
        day_of_week: dow,
        task_note: existing?.task_note ?? null,
        display_order: displayOrder,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      if (isAllSelected) {
        newEntries.push({
          ...base,
          schedule_type: 'never',
          times_per_day: null,
          slot_morning: null,
          slot_afternoon: null,
          slot_evening: null,
          slot_night: null,
        })
      } else {
        newEntries.push({
          ...base,
          schedule_type: 'specific_times',
          times_per_day: 1,
          slot_morning: 'always',
          slot_afternoon: null,
          slot_evening: null,
          slot_night: null,
        })
      }
    }
    setLocalSkilledSchedules([...rest, ...newEntries])
  }

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/pages/agency/clients"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Clients
          </Link>

          {/* Previous/Next Navigation */}
          <div
            className="relative flex items-stretch gap-0 border border-gray-300 rounded-lg min-h-[42px]"
            aria-busy={isClientSwitching}
          >
            {isClientSwitching ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-white/80 backdrop-blur-[1px]"
                aria-live="polite"
              >
                <Loader2 className="w-5 h-5 animate-spin text-gray-700 shrink-0" aria-hidden />
                <span className="text-sm font-medium text-gray-700">Loading client…</span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handlePrevious}
              disabled={!previousClient || isClientSwitching}
              className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-l-lg"
              aria-label="Previous client"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <select
              value={localClient.id}
              onChange={(e) => handleClientChange(e.target.value)}
              disabled={isClientSwitching}
              className="min-w-0 flex-1 px-4 py-2 border-0 border-l border-r border-gray-200 text-gray-900 focus:ring-0 focus:outline-none bg-transparent cursor-pointer disabled:cursor-wait disabled:opacity-70"
            >
              {allClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {patientFullName(c)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNext}
              disabled={!nextClient || isClientSwitching}
              className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-r-lg"
              aria-label="Next client"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Client Overview Header */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-xl">
            {getInitials(patientFullName(localClient))}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{patientFullName(localClient)}</h1>
              <span className={`px-3 py-1 text-xs font-semibold rounded ${
                clientStatus === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {clientStatus === 'active' ? 'Active' : 'Inactive'}
              </span>
              {localClient.class && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                  {localClient.class}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600 mb-4">
              <MapPin className="w-4 h-4" />
              <span>{localClient.street_address}, {localClient.city}, {localClient.state} {localClient.zip_code}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span><strong>Date of Birth:</strong> {formatShortDate(localClient.date_of_birth)} (Age {localClient.age || 'N/A'})</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span><strong>Gender:</strong> {localClient.gender || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span><strong>Phone:</strong> {localClient.phone_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span><strong>Email:</strong> {localClient.email_address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span><strong>Enrolled:</strong> {formatShortDate(localClient.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => {
              const isLocked = tab.id === 'schedule' && !canSchedule
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (isLocked) { setUpgradeOpen(true); return }
                    setActiveTab(tab.id)
                  }}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    isLocked
                      ? 'border-transparent text-gray-400 cursor-not-allowed'
                      : activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {isLocked && <Lock className="w-3 h-3" />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Information Card */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                  {isEditingPersonal ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelEditPersonal}
                        disabled={isSavingPersonal}
                        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <Button
                        variant="primary"
                        type="submit"
                        form="form-personal"
                        disabled={isSavingPersonal}
                        loading={isSavingPersonal}
                        size="sm"
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditPersonal}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      aria-label="Edit personal information"
                    >
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button>
                  )}
                </div>
                {isEditingPersonal ? (
                  <form id="form-personal" onSubmit={handleSavePersonal} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {personalEditError && (
                      <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                        {personalEditError}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">First Name</label>
                      <input
                        type="text"
                        value={editPersonalForm.first_name}
                        onChange={(e) => setEditPersonalForm((p) => ({ ...p, first_name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingPersonal}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={editPersonalForm.last_name}
                        onChange={(e) => setEditPersonalForm((p) => ({ ...p, last_name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingPersonal}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Gender</label>
                      <select
                        value={editPersonalForm.gender}
                        onChange={(e) => setEditPersonalForm((p) => ({ ...p, gender: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingPersonal}
                      >
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={editPersonalForm.date_of_birth}
                        onChange={(e) => {
                          const date_of_birth = e.target.value
                          setEditPersonalForm((p) => ({
                            ...p,
                            date_of_birth,
                            age: date_of_birth ? ageFromDob(date_of_birth) : 0,
                          }))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingPersonal}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Age</label>
                      <input
                        type="number"
                        min={0}
                        max={150}
                        value={editPersonalForm.age || ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                          const age = isNaN(v) ? 0 : Math.min(150, Math.max(0, v))
                          setEditPersonalForm((p) => ({ ...p, age, date_of_birth: dobFromAge(age) }))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingPersonal}
                        placeholder="Age"
                      />
                    </div>
                  </form>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Full Name:</span>
                      <p className="text-sm font-medium text-gray-900">{patientFullName(localClient)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Gender:</span>
                      <p className="text-sm font-medium text-gray-900">{localClient.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Date of Birth:</span>
                      <p className="text-sm font-medium text-gray-900">{formatDate(localClient.date_of_birth)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Age:</span>
                      <p className="text-sm font-medium text-gray-900">{localClient.age || 'N/A'} years</p>
                  </div>
                </div>
                )}
              </div>

              {/* Status Management Card */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Management</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Client Status</p>
                      <p className="text-xs text-gray-500">Set whether this client is actively receiving care</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clientStatus === 'active'}
                        onChange={(e) => handleStatusToggle(e.target.checked ? 'active' : 'inactive')}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {/* <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Login Access</p>
                      <p className="text-xs text-gray-500">Control portal login access for this client</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loginAccess}
                        onChange={(e) => handleLoginAccessToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div> */}
                </div>
              </div>

              {/* Contracted Weekly Hours Card */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-blue-600" aria-hidden />
                    <h3 className="text-lg font-bold text-gray-900">Contracted Weekly Hours</h3>
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={openManageLimitModal}
                    icon={Plus}
                  >
                    Set Limit
                  </Button>
                </div>
                {!overviewHasWeeklyContractLimits ? (
                  <div className="p-6">
                    <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 flex flex-col items-center justify-center min-h-[140px]">
                      <Timer className="w-12 h-12 text-gray-300 mb-3" aria-hidden />
                      <p className="text-sm font-medium text-gray-500 mb-4">No weekly hours limit set</p>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={openManageLimitModal}
                        icon={Plus}
                      >
                        Set Hours Limit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {(['non_skilled', 'skilled'] as const).map((key) => {
                      const row = latestOverviewWeeklyByServiceType[key]
                      const label = key === 'skilled' ? 'Skilled' : 'Non-skilled'
                      const prevRows = overviewPreviousWeeklyByServiceType[key]
                      const ocAsOf = toLocalDateString(new Date())
                      const rowPhase = row ? patientServiceContractUiPhase(row, serviceContracts, ocAsOf) : null
                      return (
                        <div key={key} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                            {row && rowPhase ? (
                              <span
                                className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                  rowPhase === 'current'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : rowPhase === 'future'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                {rowPhase === 'current' ? 'Current' : rowPhase === 'future' ? 'Future' : 'Ended'}
                              </span>
                            ) : null}
                          </div>
                          {row ? (
                            <>
                              <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-2xl font-bold text-gray-900">
                                  {Number(row.weekly_hours_limit ?? 0)}
                                </span>
                                <span className="text-sm text-gray-500">hrs / week</span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                Billing rate:{' '}
                                <span className="font-semibold text-gray-900">
                                  {row.bill_rate != null ? `${formatMoney(Number(row.bill_rate))}/${row.bill_unit_type}` : '—'}
                                </span>
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Effective {formatShortDate(row.effective_date)}
                              </p>
                              {prevRows.length > 0 ? (
                                <ul className="mt-2 space-y-1 border-t border-gray-200/80 pt-2">
                                  {prevRows.map((p) => (
                                    <li
                                      key={p.id}
                                      className="flex items-center justify-between gap-2 text-[11px] text-gray-500"
                                    >
                                      <span>
                                        {Number(p.weekly_hours_limit ?? 0)} hrs ·{' '}
                                        {p.bill_rate != null ? `${formatMoney(Number(p.bill_rate))}/${p.bill_unit_type}` : '—'} ·{' '}
                                        <span className="text-gray-400">
                                          {patientServiceContractUiPhase(p, serviceContracts, ocAsOf)}
                                        </span>
                                      </span>
                                      <span className="shrink-0 tabular-nums">{formatShortDate(p.effective_date)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-sm text-gray-400 mt-2">Not set</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Contact Information Card */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Contact Information</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-gray-600">Phone Number:</span>
                    <p className="text-sm font-medium text-gray-900">{localClient.phone_number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Email Address:</span>
                    <p className="text-sm font-medium text-gray-900">{localClient.email_address}</p>
                  </div>
                </div>
              </div>

              {/* Addresses Card */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Addresses</h3>
                  <button
                    onClick={() => {
                      setEditingAddress(null)
                      setAddressForm({ label: 'Home', street_address: '', city: '', state: '', zip_code: '', is_primary: addresses.length === 0 })
                      setAddressError(null)
                      setAddressModalOpen(true)
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    Add Address
                  </button>
                </div>
                {addresses.length === 0 ? (
                  <p className="text-sm text-gray-400">No addresses on file.</p>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((addr) => (
                      <div key={addr.id} className="flex items-start justify-between gap-2 p-3 bg-white rounded border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-gray-800">{addr.label}</span>
                            {addr.is_primary && (
                              <span className="text-xs font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Primary</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{addr.street_address}, {addr.city}, {addr.state} {addr.zip_code}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!addr.is_primary && (
                            <button
                              title="Set as primary"
                              onClick={async () => {
                                const prev = addresses
                                setAddresses(addresses.map(a => ({ ...a, is_primary: a.id === addr.id })))
                                const { error } = await setPrimaryPatientAddressAction(localClient.id, addr.id)
                                if (error) setAddresses(prev)
                              }}
                              className="text-xs text-blue-700 hover:underline px-2 py-1 rounded hover:bg-blue-50"
                            >
                              Set Primary
                            </button>
                          )}
                          <button
                            title="Edit address"
                            onClick={() => {
                              setEditingAddress(addr)
                              setAddressForm({ label: addr.label, street_address: addr.street_address, city: addr.city, state: addr.state, zip_code: addr.zip_code, is_primary: addr.is_primary })
                              setAddressError(null)
                              setAddressModalOpen(true)
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded"
                          >
                            <Edit className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          {!addr.is_primary && addresses.length > 1 && (
                            <button
                              title="Delete address"
                              onClick={async () => {
                                if (!confirm('Delete this address?')) return
                                const prev = addresses
                                setAddresses(addresses.filter(a => a.id !== addr.id))
                                const { error } = await deletePatientAddressAction(addr.id, localClient.id)
                                if (error) { setAddresses(prev); alert(error) }
                              }}
                              className="p-1.5 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Emergency Contact Card */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Emergency Contact</h3>
                  {/* <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button> */}
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-gray-600">Contact Name:</span>
                    <p className="text-sm font-medium text-gray-900">{localClient.emergency_contact_name}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Phone Number:</span>
                    <p className="text-sm font-medium text-gray-900">{localClient.emergency_phone}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'medical' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Medical Information</h3>
                  {isEditingMedical ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelEditMedical}
                        disabled={isSavingMedical}
                        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <Button
                        variant="primary"
                        type="submit"
                        form="form-medical"
                        disabled={isSavingMedical}
                        loading={isSavingMedical}
                        size="sm"
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditMedical}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                      aria-label="Edit medical information"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingMedical ? (
                  <form id="form-medical" onSubmit={handleSaveMedical} className="space-y-4">
                    {medicalEditError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                        {medicalEditError}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Primary Diagnosis</label>
                      <input
                        ref={primaryDiagnosisInputRef}
                        type="text"
                        value={editMedicalForm.primary_diagnosis}
                        onChange={(e) => setEditMedicalForm((p) => ({ ...p, primary_diagnosis: e.target.value }))}
                        className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSavingMedical}
                        placeholder="e.g. Alzheimer's Disease, Stage 2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Medications</label>
                      <textarea
                        rows={3}
                        value={editMedicalForm.current_medications}
                        onChange={(e) => setEditMedicalForm((p) => ({ ...p, current_medications: e.target.value }))}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent whitespace-pre-line"
                        disabled={isSavingMedical}
                        placeholder="e.g. Donepezil 10mg daily, Lisinopril 20mg daily"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                      <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-300 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden />
                        <input
                          type="text"
                          value={editMedicalForm.allergies}
                          onChange={(e) => setEditMedicalForm((p) => ({ ...p, allergies: e.target.value }))}
                          className="flex-1 bg-transparent border-0 text-sm font-medium text-red-700 placeholder-red-400 focus:ring-0 focus:outline-none"
                          disabled={isSavingMedical}
                          placeholder="e.g. Penicillin"
                        />
                      </div>
                    </div>
                  </form>
                ) : (
                <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Primary Diagnosis</label>
                      <div className="mt-1 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-gray-900">
                          {localClient.primary_diagnosis || 'Not specified'}
                        </p>
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Medications</label>
                      <div className="mt-1 px-4 py-3 bg-white border border-gray-300 rounded-lg">
                        <p className="text-sm font-medium text-gray-900 whitespace-pre-line">
                          {localClient.current_medications || 'None listed'}
                        </p>
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                      <div className="mt-1 px-4 py-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden />
                        <p className="text-sm font-medium text-red-700 whitespace-pre-line">
                          {localClient.allergies || 'None listed'}
                    </p>
                  </div>
                </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'representatives' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {repListError && (
                <div className="md:col-span-2 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
                  {repListError}
                </div>
              )}
              {sortedRepresentatives.map((rep, index) => (
                <div key={rep.id} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900">Representative #{index + 1}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditRep(rep)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label={`Edit representative ${index + 1}`}
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeleteRep(rep)}
                        disabled={deletingRepId === rep.id}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        aria-label={`Delete representative ${index + 1}`}
                      >
                        {deletingRepId === rep.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="block text-xs text-gray-500 mb-0.5">Name</span>
                      <p className="text-sm font-medium text-gray-900">{rep.name || '—'}</p>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 mb-0.5">Relationship</span>
                      <p className="text-sm font-medium text-gray-900">{rep.relationship || '—'}</p>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 mb-0.5">Phone Number</span>
                      <p className="text-sm font-medium text-gray-900">{rep.phone_number || '—'}</p>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 mb-0.5">Email Address</span>
                      <p className="text-sm font-medium text-gray-900">{rep.email_address || '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
              {/* Empty card for adding next representative */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900">Representative #{sortedRepresentatives.length + 1}</h3>
                  <button
                    type="button"
                    onClick={() => openAddRep(nextRepDisplayOrder)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors opacity-0 hover:opacity-100"
                    aria-label={`Add representative ${sortedRepresentatives.length + 1}`}
                  >
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500 mb-4">No representative added</p>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => openAddRep(nextRepDisplayOrder)}
                    icon={Plus}
                  >
                    Add Representative
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="w-full">
              <div className="text-center mb-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Document Management</h3>
                <p className="text-sm text-gray-500 mb-6">Upload and manage client documents and files. You can select multiple files at once.</p>
                {documentUploadError && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
                    {documentUploadError}
                  </div>
                )}
                <input
                  ref={documentFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleDocumentFileChange}
                />
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => documentFileInputRef.current?.click()}
                  disabled={isUploadingDocument}
                  loading={isUploadingDocument}
                  icon={Plus}
                >
                  Upload Documents
                </Button>
                      </div>
              {patientDocuments.length > 0 ? (
                <ul className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                  {patientDocuments.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-white hover:bg-gray-50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                          {doc.uploaded_at && (
                            <p className="text-xs text-gray-500">
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          )}
                    </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.path && (
                          <button
                            type="button"
                            onClick={() => downloadPatientDocument(doc)}
                            disabled={downloadingDocId === doc.id}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                            aria-label={`Download ${doc.name}`}
                          >
                            {downloadingDocId === doc.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setDocumentUploadError(null)
                            setDocToDelete(doc)
                          }}
                          disabled={isDeletingDocId === doc.id}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          aria-label="Delete document"
                        >
                          {isDeletingDocId === doc.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : ''}
            </div>
          )}

          {activeTab === 'caregiver-requirements' && (
            <div className="w-full">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Required Caregiver Skills</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Skills a caregiver must have to be matched to {patientFullName(localClient)}.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={openCaregiverReqsModal}
                    icon={Edit}
                  >
                    Edit Requirements
                  </Button>
                </div>
                <div className="p-6">
                  <div className={`border-2 border-dashed border-gray-200 rounded-lg min-h-[200px] flex flex-col py-12 px-4 ${caregiverRequirements.length > 0 ? 'items-start justify-start' : 'items-center justify-center'}`}>
                    {caregiverRequirements.length > 0 ? (
                      <div className="w-full space-y-4">
                        {CAREGIVER_REQUIREMENTS_TYPE_ORDER.map((type) => {
                          const skillsInType = caregiverRequirements.filter((code) => {
                            const skill = caregiverSkillCatalog.find((s) => s.name === code)
                            return skill?.type === type
                          })
                          if (skillsInType.length === 0) return null
                          const color = categoryColors[type] ?? 'ring-gray-400 bg-gray-400 text-white'
                          return (
                            <div key={type}>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {type.toUpperCase()}
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {skillsInType.map((code) => (
                                  <span
                                    key={code}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ring-2 ${color}`}
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        <p className="text-sm text-gray-500 pt-2">
                          {caregiverRequirements.length} skill{caregiverRequirements.length !== 1 ? 's' : ''} required
                        </p>
                      </div>
                    ) : (
                      <>
                        <Sparkles className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-sm text-gray-500 mb-4">No caregiver skills required yet.</p>
                        <Button
                          variant="primary"
                          type="button"
                          onClick={openCaregiverReqsModal}
                          icon={Plus}
                        >
                          Add Requirements
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'incidents' && (
            <div className="w-full space-y-4">
              {/* Warning banner */}
              <div className="rounded-lg border border-amber-400 bg-[#FFF8E5] px-4 py-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-gray-900">
                  Important: Incident reports must also be stored outside this system — in your agency&apos;s physical records, secure file server, or compliance storage — in accordance with applicable regulations.
                </p>
                      </div>

              {/* Section header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
                    Incident Reports
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {localIncidents.length === 0
                      ? 'No incident reports on file.'
                      : `${localIncidents.length} report${localIncidents.length === 1 ? '' : 's'} on file.`}
                  </p>
                </div>
                <Button
                  variant="primary"
                  type="button"
                  onClick={openReportIncidentModal}
                  icon={Plus}
                >
                  Report Incident
                </Button>
              </div>

              {incidentListError && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
                  {incidentListError}
                    </div>
                  )}

              {localIncidents.length > 0 ? (
                <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-2.5">Incident Date</th>
                          <th className="px-4 py-2.5">Reporting Date</th>
                          <th className="px-4 py-2.5">Primary Contact</th>
                          <th className="px-4 py-2.5">Description</th>
                          <th className="px-4 py-2.5">File</th>
                          <th className="px-4 py-2.5">Uploaded</th>
                          <th className="px-4 py-2.5 text-right">Download</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {localIncidents.map((incident) => {
                          const hasFile = !!incident.file_path
                          return (
                            <tr key={incident.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-3 text-gray-900">{formatIncidentDate(incident.incident_date)}</td>
                              <td className="px-4 py-3 text-gray-900">{formatIncidentDate(incident.reporting_date)}</td>
                              <td className="px-4 py-3 text-gray-900">{incident.primary_contact_person}</td>
                              <td className="px-4 py-3 text-gray-900 max-w-xs truncate" title={incident.description}>{incident.description}</td>
                              <td className="px-4 py-3">
                                {incident.file_name && hasFile ? (
                                  <button
                                    type="button"
                                    onClick={() => downloadIncidentFile(incident)}
                                    disabled={downloadingIncidentId === incident.id}
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
                                  >
                                    <FileText className="w-4 h-4 shrink-0" />
                                    {incident.file_name}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{formatIncidentUploadedAt(incident.created_at)}</td>
                              <td className="px-4 py-3 text-right">
                                {hasFile ? (
                                  <button
                                    type="button"
                                    onClick={() => downloadIncidentFile(incident)}
                                    disabled={downloadingIncidentId === incident.id}
                                    className="inline-flex p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                    aria-label={incident.file_name ? `Download ${incident.file_name}` : 'Download file'}
                                  >
                                    {downloadingIncidentId === incident.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Download className="w-4 h-4" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                </div>
              </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white p-12 flex flex-col items-center justify-center text-center">
                  <AlertTriangle className="w-12 h-12 text-gray-300 mb-4" aria-hidden />
                  <p className="text-gray-500 mb-6">No incident reports have been filed for this client.</p>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={openReportIncidentModal}
                    icon={Plus}
                  >
                    File First Report
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && agencyId && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                Internal notes are visible only to agency admins and care coordinators — never to the client or caregiver.
              </div>
              <InternalNotesPanel
                subjectType="patient"
                subjectId={localClient.id}
                agencyId={agencyId}
                canManage={canManageNotes}
              />
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="w-full space-y-4">
              {/* Weekly Contracted Hours card by service type */}
              {(() => {
                const rows = [
                  { key: 'non_skilled' as const, label: 'Non-Skilled', tone: 'blue' as const },
                  { key: 'skilled' as const, label: 'Skilled', tone: 'purple' as const },
                ]
                const hasAnyAppliedLimit = rows.some((r) => currentWeeklyLimitByServiceType[r.key])
                return (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-100 text-blue-500">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        THIS WEEK – {formatWeekRangeLabel(scheduleWeekStart, scheduleWeekEnd).toUpperCase()}
                      </p>
                      <h3 className="text-base font-bold text-gray-900">Weekly Contracted Hours</h3>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={openManageLimitModal}
                    icon={Edit}
                  >
                    Manage Limit
                  </Button>
                </div>
                {hasAnyAppliedLimit ? (
                  <>
                    <div className="mt-4 space-y-4">
                      {rows.map((row) => {
                        const limit = currentWeeklyLimitByServiceType[row.key]
                        const contracted = limit ? Number(limit.weekly_hours_limit ?? 0) : 0
                        const scheduled = Number(scheduledHoursForWeekByServiceType[row.key] ?? 0)
                        const usedPct = contracted > 0 ? Math.min(100, (scheduled / contracted) * 100) : 0
                        const isOverLimit = limit ? scheduled > contracted : false
                        const isAtLimit = limit ? Math.abs(scheduled - contracted) < 0.0001 : false
                        const toneClass =
                          row.tone === 'purple'
                            ? isOverLimit
                              ? 'border-red-300 bg-red-50/30'
                              : isAtLimit
                                ? 'border-amber-300 bg-amber-50/30'
                                : 'border-blue-200 bg-blue-50/40'
                            : isOverLimit
                              ? 'border-red-300 bg-red-50/30'
                              : isAtLimit
                                ? 'border-amber-300 bg-amber-50/30'
                                : 'border-blue-200 bg-blue-50/40'
                        const progressBg =
                          isOverLimit ? 'bg-red-200' : isAtLimit ? 'bg-amber-200' : row.tone === 'purple' ? 'bg-blue-200' : 'bg-blue-200'
                        const progressFill =
                          isOverLimit ? 'bg-red-500' : isAtLimit ? 'bg-amber-500' : row.tone === 'purple' ? 'bg-blue-500' : 'bg-blue-500'
                        return (
                          <div key={row.key} className={`rounded-lg border p-3 ${toneClass}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                              {limit ? (
                                <span className="text-xs text-gray-500">
                                  Effective {formatShortDate(limit.effective_date)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">No active limit</span>
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                              <div className="rounded border border-gray-200 bg-white p-2">
                                <p className="text-xl font-bold text-gray-900">{contracted.toFixed(1)}</p>
                                <p className="text-[11px] text-gray-500">Contracted</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white p-2">
                                <p className={`text-xl font-bold ${isOverLimit ? 'text-red-600' : 'text-gray-900'}`}>
                                  {scheduled.toFixed(1)}
                                </p>
                                <p className="text-[11px] text-gray-500">Scheduled</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white p-2">
                                <p className={`text-xl font-bold ${isOverLimit ? 'text-red-600' : isAtLimit ? 'text-amber-600' : 'text-gray-900'}`}>
                                  {limit ? (isOverLimit ? `+${(scheduled - contracted).toFixed(1)}` : Math.max(0, contracted - scheduled).toFixed(1)) : '—'}
                                </p>
                                <p className="text-[11px] text-gray-500">{isOverLimit ? 'Over' : 'Remaining'}</p>
                              </div>
                            </div>
                            {limit ? (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className={isOverLimit ? 'text-red-600' : 'text-gray-500'}>
                                    {usedPct.toFixed(0)}% used
                                  </span>
                                  {isOverLimit ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-red-600">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Over limit
                                    </span>
                                  ) : isAtLimit ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                                      <AlertCircle className="h-3.5 w-3.5" />
                                      At limit
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 font-medium text-green-600">
                                      <Check className="h-3.5 w-3.5" />
                                      Within limit
                                    </span>
                                  )}
                                </div>
                                <div className={`mt-1.5 h-2 w-full overflow-hidden rounded-full ${progressBg}`}>
                                  <div
                                    className={`h-full rounded-full ${progressFill} transition-all`}
                                    style={{ width: `${usedPct}%` }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    {weeklyLimitRows.length > 0 ? (
                      <>
                        No limit applies to this calendar week — the selected week is before your newest
                        limit&apos;s effective week, or older limits have ended. Use week navigation to view a
                        week on or after the effective date, or add a limit whose effective week includes this
                        week.
                      </>
                    ) : (
                      <>No weekly hours limit set for this client. Click &apos;Manage Limit&apos; to configure.</>
                    )}
                  </div>
                )}
              </div>
                )
              })()}

              {/* Weekly Care Schedule */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Weekly Care Schedule</h3>
                    <p className="text-sm text-gray-500">Client tasks (ADLs, skilled) and appointments</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      type="button"
                      onClick={openAddVisitModal}
                      icon={Plus}
                    >
                      Add Visit
                    </Button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(scheduleWeekStart)
                          d.setDate(d.getDate() - 7)
                          setScheduleWeekStart(getMonday(d))
                        }}
                        className="rounded border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50"
                        aria-label="Previous week"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(scheduleWeekStart)
                          d.setDate(d.getDate() + 7)
                          setScheduleWeekStart(getMonday(d))
                        }}
                        className="rounded border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50"
                        aria-label="Next week"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScheduleWeekStart(getMonday(new Date()))}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Today
                    </button>
                  </div>
                </div>

                {/* Calendar grid with unassigned task counts */}
                <div ref={scheduleGridRef} className="relative border border-gray-200 rounded overflow-hidden">
                  <table className="w-full border-collapse text-sm table-fixed">
                    <colgroup>
                      <col className="w-24 text-center" />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-100 text-center w-full">
                        <th className="w-24 border-b border-r border-gray-200 p-2 text-xs font-medium text-gray-500 align-middle text-center">
                          Unassigned tasks
                        </th>
                        {getWeekDates().map((d) => {
                          const dateStr = toLocalDateString(d)
                          const dueCount = getDueTaskCountForDay(dateStr)
                          const unassignedCount = getUnassignedTaskCountForDay(dateStr)
                          const isToday =
                            dateStr === toLocalDateString(new Date())
                          return (
                            <th
                              key={dateStr}
                              className={`border-b border-r border-gray-200 p-2 text-center text-sm font-medium last:border-r-0 align-middle ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}`}
                            >
                              {dueCount === 0 ? (
                                <span className="text-gray-400">—</span>
                              ) : unassignedCount === 0 ? (
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600" aria-label="Task quota achieved">
                                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </span>
                              ) : (
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                                  {unassignedCount}
                                </span>
                              )}
                            </th>
                          )
                        })}
                      </tr>
                      <tr className="bg-gray-50" data-day-header-row="true">
                        <th className="w-24 border-b border-r border-gray-200 p-2 text-center text-xs font-medium text-gray-500" />
                        {getWeekDates().map((d, colIdx) => {
                          const dateStr = toLocalDateString(d)
                          const isToday =
                            dateStr === toLocalDateString(new Date())
                          const isDayHeaderHighlighted = scheduleHover?.dateStr === dateStr
                          return (
                            <th
                              key={dateStr}
                              data-day-col-index={colIdx}
                              className={`border-b border-r border-gray-200 p-2 text-center text-xs font-medium last:border-r-0 transition-colors ${isToday ? 'text-blue-600' : 'text-gray-700'}`}
                              style={isDayHeaderHighlighted ? { backgroundColor: '#8ab0ed' } : undefined}
                            >
                              {DAY_LABELS_SHORT[d.getDay()].toUpperCase()} {d.getDate()}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const weekDates = getWeekDates()
                        const parseStartHour = (t: string) => {
                          const [h] = (t || '00:00').split(':').map(Number)
                          return h
                        }
                        const parseEndHourExclusive = (t: string) => {
                          const parts = (t || '00:00').split(':').map(Number)
                          const h = parts[0] ?? 0
                          const m = parts[1] ?? 0
                          if (h === 0 && m === 0) return 24
                          return m > 0 ? h + 1 : h
                        }
                        const isTimeCellHighlighted = scheduleHover && hour >= scheduleHover.startHour && hour < scheduleHover.endHourExclusive
                        return (
                          <tr key={hour} style={{ height: '3rem' }}>
                            <td
                              data-time-hour={hour}
                              className="w-24 border-b border-r border-gray-200 p-1 text-center text-xs text-gray-500 align-top transition-colors align-middle"
                              style={{ height: '3rem', ...(isTimeCellHighlighted ? { backgroundColor: '#8ab0ed' } : {}) }}
                            >
                              {hour === 0
                                ? '12 AM'
                                : hour < 12
                                  ? `${hour} AM`
                                  : hour === 12
                                    ? '12 PM'
                                    : `${hour - 12} PM`}
                            </td>
                            {weekDates.map((d, colIdx) => {
                              const dateStr = toLocalDateString(d)

                              // For multi-day visits: compute the effective start/end hour for this specific day.
                              const getSegment = (s: typeof weekSchedules[0]) => {
                                const startDate = s.date
                                const endDate = s.end_date ?? s.date
                                if (dateStr < startDate || dateStr > endDate) return null
                                const isFirst = dateStr === startDate
                                const isLast = dateStr === endDate
                                const segStartH = isFirst ? parseStartHour(s.start_time ?? '00:00') : 0
                                const segEndH = isLast ? parseEndHourExclusive(s.end_time ?? '00:00') || 24 : 24
                                const totalDays = Math.round((new Date(endDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86_400_000) + 1
                                const dayIndex = Math.round((new Date(dateStr + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86_400_000) + 1
                                return { segStartH, segEndH, rowSpan: Math.max(1, segEndH - segStartH), totalDays, dayIndex }
                              }

                              const block = weekSchedules.find((s) => {
                                const seg = getSegment(s)
                                return seg !== null && seg.segStartH === hour
                              })
                              const spanning = weekSchedules.some((s) => {
                                const seg = getSegment(s)
                                return seg !== null && seg.segStartH < hour && seg.segStartH + seg.rowSpan > hour
                              })
                              if (spanning) return null
                              if (block) {
                                const seg = getSegment(block)!
                                const { segStartH: sh, rowSpan } = seg
                                const endHourExclusive = sh + rowSpan
                                const isFirst = block.date === dateStr
                                const startParts = (block.start_time ?? '0:0').split(':').slice(0, 2).map(Number)
                                const endParts = (block.end_time ?? '0:0').split(':').slice(0, 2).map(Number)
                                const sm = isFirst ? (startParts[1] || 0) : 0
                                const eh = endParts[0] || 0
                                const em = endParts[1] || 0
                                const isLast = (block.end_date ?? block.date) === dateStr
                                const segDurationMins = isFirst && isLast
                                  ? Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
                                  : isFirst ? (24 * 60 - (sh * 60 + sm))
                                  : isLast ? (eh * 60 + em)
                                  : 24 * 60
                                return (
                                  <td
                                    key={dateStr}
                                    rowSpan={rowSpan}
                                    className="border-b border-r border-gray-200 p-0 align-top last:border-r-0 relative"
                                    style={{ height: `${rowSpan * 3}rem`, verticalAlign: 'top' }}
                                  >
                                    {(() => {
                                      const colors = getScheduleBlockColors(block.type)
                                      const effectiveStatus = getEffectiveScheduleStatus(block)
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => openEditVisitModal(block)}
                                          onMouseEnter={() => setScheduleHover({ dateStr, startHour: sh, endHourExclusive })}
                                          onMouseLeave={() => setScheduleHover(null)}
                                          className="relative w-full flex flex-col rounded border-l-4 p-2 pr-24 text-left focus:outline-none focus:ring-2 box-border"
                                          style={{
                                            backgroundColor: colors.bg,
                                            borderLeftColor: colors.border,
                                            color: colors.text,
                                            height: '100%',
                                            minHeight: '100%',
                                          }}
                                        >
                                          <div className="min-w-0 flex-1 flex flex-col">
                                            <div className="font-medium">
                                              {block.start_time?.slice(0, 5)} - {block.end_time?.slice(0, 5)}
                                            </div>
                                            {seg.totalDays > 1 && (
                                              <div className="text-xs opacity-70">Day {seg.dayIndex} of {seg.totalDays}</div>
                                            )}
                                            <div className="text-xs" style={{ color: colors.text }}>
                                              {block.type || 'Routine'}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-1 text-xs opacity-90" style={{ color: colors.text }}>
                                              <Clock className="w-3 h-3" />
                                              {segDurationMins >= 60 ? `${Math.floor(segDurationMins / 60)}h` : `${segDurationMins}m`}
                                            </div>
                                          </div>
                                          <span
                                            className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${visitStatusBadgeClass(
                                              effectiveStatus
                                            )}`}
                                          >
                                            {scheduleStatusLabel(effectiveStatus)}
                                          </span>
                                        </button>
                                      )
                                    })()}
                                  </td>
                                )
                              }
                              return (
                                <td
                                  key={dateStr}
                                  className="border-b border-r border-gray-200 p-0 text-center last:border-r-0 cursor-pointer hover:bg-blue-50 group"
                                  style={{ height: '3rem' }}
                                  onClick={() => openAddVisitModalForDate(dateStr, hour)}
                                  title="Click to add a visit"
                                >
                                  <span className="flex items-center justify-center h-full text-blue-300 text-xl leading-none select-none opacity-0 group-hover:opacity-100">+</span>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {scheduleNowIndicator && (
                    <div
                      className="pointer-events-none absolute z-20"
                      style={{
                        top: `${scheduleNowIndicator.top}px`,
                        left: `${scheduleNowIndicator.left}px`,
                        width: `${scheduleNowIndicator.width}px`,
                      }}
                    >
                      <div className="relative">
                        <div className="w-full border-t-2 border-blue-500/90" />
                        <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border border-white bg-blue-500" />
                        <span className="absolute right-1 -top-5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {scheduleNowIndicator.label}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {scheduleLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'adls' && (
            <div className="w-full space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Activities of Daily Living ({localAdls.length})
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage client care tasks and schedules. Use <strong>Save NON-SKILLED Plan</strong> to write library
                    changes, trashed tasks, and the weekly grid to the database (same idea as the Skilled Tasks tab).
                  </p>
                </div>
                <Button
                  variant="primary"
                  type="button"
                  onClick={openAddAdlModal}
                  icon={Plus}
                >
                  ADD NON-SKILLED TASK
                </Button>
              </div>

              {adlPlanError && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
                  {adlPlanError}
                </div>
              )}

              <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                {localAdls.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <ClipboardList className="w-12 h-12 text-gray-300 mb-4" aria-hidden />
                    <p className="text-gray-700 font-medium mb-1">No ADL tasks added yet</p>
                    <p className="text-sm text-gray-500 mb-0">Click &quot;ADD NON-SKILLED TASKS&quot; to get started.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600">
                          <th className="px-4 py-3 bg-gray-50">Name</th>
                          {ADL_DAYS.map((d) => (
                            <th key={d.value} className="px-2 py-3 text-center bg-gray-50">
                              {d.label}
                            </th>
                          ))}
                          <th className="px-2 py-3 text-center w-14 bg-gray-100 text-gray-800 font-medium">
                            ALL
                          </th>
                          <th className="px-2 py-3 text-center w-14 bg-gray-50">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {localAdls.map((adlRow) => {
                          const adlInfo = adlLists.find((a) => a.name === adlRow.adl_code) ?? { name: adlRow.adl_code, group: 'General' }
                          const adlNote = getAdlNote(adlRow.adl_code)
                          return (
                            <tr key={adlRow.id} className="bg-white hover:bg-gray-50">
                              <td className="px-4 py-3 w-[15rem] max-w-full">
                                <div className="font-semibold text-gray-900">{adlInfo.name}</div>
                                <div className={`text-xs text-gray-500 py-1 px-2 rounded-full w-[3rem] flex justify-center items-center ${adlInfo.group === 'ADL' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>{adlInfo.group}</div>
                                <div className="mt-2">
                                  {adlNote ? (
                                    <div className="w-[240px] max-w-full rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-start gap-1.5">
                                          <FileText className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                                          <p className="leading-snug break-words">{adlNote}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => openAdlNoteModal(adlInfo)}
                                          className="p-0.5 text-amber-500 hover:text-amber-700 rounded"
                                          aria-label={`Edit note for ${adlInfo.name}`}
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openAdlNoteModal(adlInfo)}
                                      className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Add client note...
                                    </button>
                                  )}
                                </div>
                              </td>
                              {ADL_DAYS.map((d) => {
                                const s = getSchedule(adlRow.adl_code, d.value)
                                const summary = formatAdlDaySummary(s)
                                const specificSlots = getSpecificTimesSlots(s)
                                const type = s?.schedule_type ?? 'never'
                                return (
                                  <td key={d.value} className="px-2 py-3 text-left align-center">
                                    <button
                                      type="button"
                                      onClick={() => openSelectTimeModal(adlInfo, d.value, DAY_LABELS[d.value])}
                                      className="inline-flex flex-row items-start gap-1.5 p-1 rounded hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 min-w-0"
                                      aria-label={`Set schedule for ${adlInfo.name} on ${d.label}`}
                                    >
                                      {type === 'never' && (
                                        <span className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white inline-block shrink-0" />
                                      )}
                                      {type === 'always' && (
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center shrink-0">
                                          <Infinity className="w-3.5 h-3.5" />
                                        </span>
                                      )}
                                      {type === 'as_needed' && (
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-xs font-bold shrink-0">
                                          *
                                        </span>
                                      )}
                                      {type === 'specific_times' && (
                                        <>
                                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center shrink-0">
                                            <Check className="w-3.5 h-3.5" />
                                          </span>
                                          {specificSlots && (
                                            <div className="flex flex-col items-start text-[10px] text-gray-600 leading-tight text-left">
                                              {specificSlots.labels.map((label) => (
                                                <span key={label}>{label}</span>
                                              ))}
                                              <span className="text-blue-600 font-medium mt-0.5">{specificSlots.timesPerDay}x</span>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      {summary && !specificSlots && (
                                        <span className="text-[10px] text-gray-600 leading-tight block">
                                          {summary}
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                )
                              })}
                              <td className="px-2 py-3 text-center align-middle border-l border-gray-200 bg-gray-100">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAdlRowAll(adlRow)}
                                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                                    isAdlRowAllSelected(adlRow.adl_code)
                                      ? 'bg-blue-600'
                                      : 'bg-gray-300'
                                  }`}
                                  aria-label={isAdlRowAllSelected(adlRow.adl_code) ? `Unselect all days for ${adlInfo.name}` : `Select all days (morning 1x) for ${adlInfo.name}`}
                                >
                                  <span
                                    className={`w-3 h-3 rounded-full border-2 ${
                                      isAdlRowAllSelected(adlRow.adl_code)
                                        ? 'border-white bg-white'
                                        : 'border-gray-400 bg-white/80'
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className="px-2 py-3 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => { void handleAttemptRemoveAdlFromPlan(adlRow.adl_code) }}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                                  aria-label={`Remove ${adlInfo.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* <div className="border border-gray-200 rounded-lg bg-white px-4 py-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Legend:</p>
                <div className="flex flex-wrap gap-4">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-gray-400 bg-white" aria-hidden />
                    <span className="text-xs text-gray-600">Never</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white inline-flex items-center justify-center">
                      <Infinity className="w-3 h-3" />
                    </span>
                    <span className="text-xs text-gray-600">Always</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[10px] font-bold">*</span>
                    <span className="text-xs text-gray-600">As Needed</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white inline-flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                    <span className="text-xs text-gray-600">Specific Times</span>
                  </span>
                </div>
              </div> */}

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setLocalAdls(initialAdls ?? [])
                    setLocalAdlSchedules(initialAdlSchedules ?? [])
                    setPendingAdlDeletes([])
                    setAdlPlanError(null)
                    router.refresh()
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleSaveAdlPlan}
                  disabled={isSavingAdlPlan || !hasAdlPlanChanges}
                  loading={isSavingAdlPlan}
                >
                  Save NON-SKILLED Plan
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'skilled-tasks' && (
            <div className="w-full space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Skilled Tasks ({localSkilledCarePlanTasks.length})
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage skilled care tasks and weekly schedule. Scheduled visits use a <strong>Skilled</strong> service contract.
                  </p>
                </div>
                <Button
                  variant="primary"
                  type="button"
                  onClick={openSkilledTaskModal}
                  icon={Plus}
                >
                  ADD SKILLED TASK
                </Button>
              </div>

              {skilledTasksError && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">{skilledTasksError}</div>
              )}

              <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                {localSkilledCarePlanTasks.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <ClipboardList className="w-12 h-12 text-gray-300 mb-4" aria-hidden />
                    <p className="text-gray-700 font-medium mb-1">No skilled tasks added yet</p>
                    <p className="text-sm text-gray-500 mb-0">Click &quot;ADD SKILLED TASK&quot; to get started.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[15rem]" />
                        {ADL_DAYS.map((d) => (
                          <col key={d.value} />
                        ))}
                        <col className="w-14" />
                        <col className="w-14" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600">
                          <th className="px-4 py-3 bg-gray-50">Name</th>
                          {ADL_DAYS.map((d) => (
                            <th key={d.value} className="px-2 py-3 text-left bg-gray-50">
                              {d.label}
                            </th>
                          ))}
                          <th className="px-2 py-3 text-center w-14 bg-gray-100 text-gray-800 font-medium">ALL</th>
                          <th className="px-2 py-3 text-center w-14 bg-gray-50">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {localSkilledCarePlanTasks.map((taskRow) => {
                          const taskNote = getSkilledTaskNote(taskRow.task_id)
                          return (
                            <tr key={taskRow.task_id} className="bg-white hover:bg-gray-50">
                              <td className="px-4 py-3 w-[15rem] max-w-full">
                                <div className="font-semibold text-gray-900">{taskRow.name}</div>
                                <div
                                  className={`text-xs py-1 px-2 rounded-full w-fit flex justify-center items-center mt-1 ${skilledTaskBadgeClassByCategory(taskRow.category)}`}
                                >
                                  {taskRow.category}
                                </div>
                                {taskRow.description ? (
                                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{taskRow.description}</div>
                                ) : null}
                                <div className="mt-2">
                                  {taskNote ? (
                                    <div className="w-[240px] max-w-full rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-start gap-1.5">
                                          <FileText className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                                          <p className="leading-snug break-words">{taskNote}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => openSkilledNoteModal(taskRow)}
                                          className="p-0.5 text-amber-500 hover:text-amber-700 rounded"
                                          aria-label={`Edit note for ${taskRow.name}`}
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openSkilledNoteModal(taskRow)}
                                      className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Add client note...
                                    </button>
                                  )}
                                </div>
                              </td>
                              {ADL_DAYS.map((d) => {
                                const s = getSkilledSchedule(taskRow.task_id, d.value)
                                const summary = formatAdlDaySummary(s)
                                const specificSlots = getSpecificTimesSlots(s)
                                const type = s?.schedule_type ?? 'never'
                                return (
                                  <td key={d.value} className="px-2 py-3 align-middle min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => openSkilledSelectTimeModal(taskRow, d.value, DAY_LABELS[d.value])}
                                      className="inline-flex w-full min-w-0 flex-row items-start gap-1.5 p-1 rounded text-left hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                                      aria-label={`Set schedule for ${taskRow.name} on ${d.label}`}
                                    >
                                      {type === 'never' && (
                                        <span className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white inline-block shrink-0" />
                                      )}
                                      {type === 'always' && (
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center shrink-0">
                                          <Infinity className="w-3.5 h-3.5" />
                                        </span>
                                      )}
                                      {type === 'as_needed' && (
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-xs font-bold shrink-0">
                                          *
                                        </span>
                                      )}
                                      {type === 'specific_times' && (
                                        <>
                                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white inline-flex items-center justify-center shrink-0">
                                            <Check className="w-3.5 h-3.5" />
                                          </span>
                                          {specificSlots && (
                                            <div className="flex min-w-0 flex-1 flex-col items-start break-words text-[10px] text-gray-600 leading-tight">
                                              {specificSlots.labels.map((label) => (
                                                <span key={label}>{label}</span>
                                              ))}
                                              <span className="text-blue-600 font-medium mt-0.5">{specificSlots.timesPerDay}x</span>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      {summary && !specificSlots && (
                                        <span className="min-w-0 flex-1 break-words text-[10px] text-gray-600 leading-tight">
                                          {summary}
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                )
                              })}
                              <td className="px-2 py-3 text-center align-middle border-l border-gray-200 bg-gray-100">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSkilledRowAll(taskRow)}
                                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                                    isSkilledRowAllSelected(taskRow.task_id) ? 'bg-blue-600' : 'bg-gray-300'
                                  }`}
                                  aria-label={
                                    isSkilledRowAllSelected(taskRow.task_id)
                                      ? `Unselect all days for ${taskRow.name}`
                                      : `Select all days (morning 1x) for ${taskRow.name}`
                                  }
                                >
                                  <span
                                    className={`w-3 h-3 rounded-full border-2 ${
                                      isSkilledRowAllSelected(taskRow.task_id)
                                        ? 'border-white bg-white'
                                        : 'border-gray-400 bg-white/80'
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className="px-2 py-3 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleAttemptRemoveSkilledFromPlan(taskRow.task_id)
                                  }}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                                  aria-label={`Remove ${taskRow.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setLocalSkilledCarePlanTasks(initialSkilledCarePlanTasks ?? [])
                    setLocalSkilledSchedules(initialSkilledSchedules)
                    setPendingSkilledDeletes([])
                    setSkilledTasksError(null)
                    router.refresh()
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleSaveSkilledCarePlan}
                  disabled={isSavingSkilledTasks || !hasSkilledPlanChanges}
                  loading={isSavingSkilledTasks}
                >
                  Save Skilled Plan
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={skilledTaskModalOpen}
        onClose={() => setSkilledTaskModalOpen(false)}
        title="Skilled Task Library"
        subtitle="Select skilled nursing or therapy tasks to add to the care plan"
        size="md"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={skilledTaskSearch}
                onChange={(e) => setSkilledTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={skilledTaskCategoryFilter}
              onChange={(e) => setSkilledTaskCategoryFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {Array.from(new Set(skilledTaskLibrary.map((t) => t.category))).sort().map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
            {Object.entries(
              skilledTaskLibrary
                .filter((t) => {
                  const q = skilledTaskSearch.trim().toLowerCase()
                  if (skilledTaskCategoryFilter !== 'all' && t.category !== skilledTaskCategoryFilter) return false
                  if (!q) return true
                  const hay = `${t.name} ${t.category} ${t.description ?? ''}`.toLowerCase()
                  return hay.includes(q)
                })
                .reduce<Record<string, typeof skilledTaskLibrary>>((acc, item) => {
                  if (!acc[item.category]) acc[item.category] = []
                  acc[item.category].push(item)
                  return acc
                }, {})
            ).map(([category, tasks]) => (
              <div key={category} className="space-y-2">
                <div
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${skilledTaskBadgeClassByCategory(
                    category
                  )}`}
                >
                  {category}
                </div>
                {tasks.map((task) => {
                  const selected = pendingSkilledTaskIds.has(task.id)
                  return (
                    <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{task.name}</div>
                        {task.description ? <div className="mt-0.5 text-xs text-gray-500">{task.description}</div> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingSkilledTaskIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(task.id)) next.delete(task.id)
                            else next.add(task.id)
                            return next
                          })
                        }
                        className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                      >
                        {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setSkilledTaskModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={applySkilledTaskSelection}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Representative Add/Edit Modal */}
      <Modal
        isOpen={repModalOpen}
        onClose={closeRepModal}
        title={repModalMode === 'add' ? `Add Representative #${repModalSlot}` : `Edit Representative #${repModalSlot}`}
        size="md"
      >
        <form onSubmit={handleSaveRep} className="space-y-4">
          {repFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {repFormError}
            </div>
          )}
          <div>
            <label htmlFor="rep-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="rep-name"
              type="text"
              value={repForm.name}
              onChange={(e) => setRepForm((p) => ({ ...p, name: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingRep}
            />
          </div>
          <div>
            <label htmlFor="rep-relationship" className="block text-sm font-medium text-gray-700 mb-1">
              Relationship
            </label>
            <input
              id="rep-relationship"
              type="text"
              value={repForm.relationship}
              onChange={(e) => setRepForm((p) => ({ ...p, relationship: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingRep}
              placeholder="e.g. Wife, Son"
            />
          </div>
          <div>
            <label htmlFor="rep-phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <PhoneInput
              id="rep-phone"
              value={repForm.phone_number}
              onChange={(e) => setRepForm((p) => ({ ...p, phone_number: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingRep}
            />
          </div>
          <div>
            <label htmlFor="rep-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="rep-email"
              type="email"
              value={repForm.email_address}
              onChange={(e) => setRepForm((p) => ({ ...p, email_address: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingRep}
              placeholder="e.g. linda.c@email.com"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              type="button"
              onClick={closeRepModal}
              disabled={isSavingRep}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSavingRep}
              loading={isSavingRep}
            >
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation (Representative, ADL, or Document) */}
      <Modal
        isOpen={!!repToDelete || !!adlToDelete || !!docToDelete}
        onClose={() => {
          setRepToDelete(null)
          setAdlToDelete(null)
          setDocToDelete(null)
        }}
        title={repToDelete ? 'Delete Representative?' : adlToDelete ? 'Remove ADL?' : docToDelete ? 'Delete Document?' : ''}
        size="sm"
      >
        <div className="space-y-4">
          {repToDelete ? (
            <p className="text-gray-600">
              Are you sure you want to remove{' '}
              <strong>{(repToDelete.name && repToDelete.name.trim()) || 'this representative'}</strong>
              {' '}as a representative? This cannot be undone.
            </p>
          ) : adlToDelete ? (
            <p className="text-gray-600">
              Are you sure you want to remove{' '}
              <strong>{adlLists.find((a) => a.name === adlToDelete)?.name ?? adlToDelete}</strong>
              {' '}from this client&apos;s ADL plan? This cannot be undone.
            </p>
          ) : docToDelete ? (
            <p className="text-gray-600">
              Are you sure you want to delete the document{' '}
              <strong>{docToDelete.name || 'this file'}</strong>
              ? This cannot be undone.
            </p>
          ) : null}
          {(repToDelete && repListError) || (adlToDelete && adlPlanError) || (docToDelete && documentUploadError) ? (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">
              {repToDelete ? repListError : adlToDelete ? adlPlanError : documentUploadError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setRepToDelete(null)
                setAdlToDelete(null)
                setDocToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                if (repToDelete) {
                  handleDeleteRep()
                } else if (adlToDelete) {
                  handleDeleteAdl(adlToDelete)
                } else if (docToDelete) {
                  handleDeleteDocument(docToDelete)
                }
              }}
              disabled={(!!repToDelete && deletingRepId === repToDelete.id) || (!!adlToDelete && deletingAdlCode === adlToDelete) || (!!docToDelete && isDeletingDocId === docToDelete.id)}
              loading={(!!repToDelete && deletingRepId === repToDelete.id) || (!!adlToDelete && deletingAdlCode === adlToDelete) || (!!docToDelete && isDeletingDocId === docToDelete.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Caregiver Requirements Modal */}
      <Modal
        isOpen={caregiverReqsModalOpen}
        onClose={closeCaregiverReqsModal}
        title="Required Caregiver Skills"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Required Caregiver Skills — {patientFullName(localClient)}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select all skills a caregiver must have to be assigned to this client.
              </p>
            </div>
          </div>
          {caregiverReqsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {caregiverReqsError}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={caregiverReqsSearch}
              onChange={(e) => setCaregiverReqsSearch(e.target.value)}
              placeholder="Search caregiver skills..."
              className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingCaregiverReqs}
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
            {CAREGIVER_REQUIREMENTS_TYPE_ORDER.map((type) => {
              const skills = (skillsByType[type] ?? []).filter((s) => {
                const q = caregiverReqsSearch.trim().toLowerCase()
                if (!q) return true
                return s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
              })
              if (!skills?.length) return null
              const selectedCount = skills.filter((s) => caregiverReqsSelection.includes(s.name)).length
              const allSelected = selectedCount > 0 && selectedCount === skills.length
              return (
                <div key={type}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {type.toUpperCase()}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCategorySkillSelection(skills, !allSelected)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      disabled={isSavingCaregiverReqs}
                    >
                      {allSelected ? 'Clear All' : 'Select All'}
                    </button>
                  </div>
                  <div ref={caregiverReqsDropdownOpen === type ? caregiverReqsOpenCategoryRef : undefined}>
                    <div className="pl-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => setCaregiverReqsDropdownOpen((prev) => (prev === type ? null : type))}
                        className="w-full inline-flex items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                        disabled={isSavingCaregiverReqs}
                      >
                        <span className="font-medium">
                          {caregiverReqsSelection.filter((n) => skills.some((s) => s.name === n)).length > 0
                            ? `Selected (${caregiverReqsSelection.filter((n) => skills.some((s) => s.name === n)).length})`
                            : `Select skills in ${type}...`}
                        </span>
                        <span className="text-gray-400">{caregiverReqsDropdownOpen === type ? '▲' : '▼'}</span>
                      </button>
                      {caregiverReqsDropdownOpen === type && (
                        <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-sm max-h-56 overflow-y-auto">
                          {skills.map((s) => {
                            const selected = caregiverReqsSelection.includes(s.name)
                            const colorClass = categoryColors[type] ?? 'ring-gray-400 bg-gray-400 text-white'
                            return (
                              <div
                                key={s.name}
                                className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 ${
                                  selected ? 'bg-gray-50' : ''
                                }`}
                                onClick={() => {
                                  if (!selected) toggleCaregiverSkill(s.name)
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    if (!selected) toggleCaregiverSkill(s.name)
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
                                      toggleCaregiverSkill(s.name)
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
                        .filter((s) => caregiverReqsSelection.includes(s.name))
                        .map((s) => {
                          const colorClass = categoryColors[type] ?? 'ring-gray-400 bg-gray-400 text-white'
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => toggleCaregiverSkill(s.name)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full ring-2 ${colorClass}`}
                            >
                              <span className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                <X className="h-3 w-3 text-white" />
                              </span>
                              {s.name}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                </div>
              )
            })}
            {CAREGIVER_REQUIREMENTS_TYPE_ORDER.every((type) => {
              const q = caregiverReqsSearch.trim().toLowerCase()
              const skills = skillsByType[type] ?? []
              return !skills.some((s) => !q || s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q))
            }) && (
              <div className="py-8 text-center text-sm text-gray-500">
                No caregiver skills match your search.
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {caregiverReqsSelection.length} skill{caregiverReqsSelection.length !== 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                type="button"
                onClick={closeCaregiverReqsModal}
                disabled={isSavingCaregiverReqs}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleSaveCaregiverReqs}
                disabled={isSavingCaregiverReqs}
                loading={isSavingCaregiverReqs}
                icon={Save}
              >
                Save Requirements
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* File Incident Report Modal */}
      <Modal
        isOpen={incidentModalOpen}
        onClose={closeIncidentModal}
        title={`File Incident Report — ${patientFullName(localClient)}`}
        size="md"
      >
        <form onSubmit={handleSaveIncident} className="space-y-4">
          <p className="text-sm text-gray-600">Complete all fields and attach the incident report file.</p>

          <div className="rounded-lg border border-amber-400 bg-[#FFF8E5] px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-gray-900">
              <strong>Reminder:</strong> This report must also be stored outside this system in your agency&apos;s compliance records.
            </p>
          </div>

          {incidentFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {incidentFormError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="incident-incident_date" className="block text-sm font-bold text-gray-700 mb-1">
                Incident Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="incident-incident_date"
                  type="date"
                  value={incidentForm.incident_date}
                  onChange={(e) => setIncidentForm((p) => ({ ...p, incident_date: e.target.value }))}
                  className="block w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSavingIncident}
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label htmlFor="incident-reporting_date" className="block text-sm font-bold text-gray-700 mb-1">
                Reporting Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="incident-reporting_date"
                  type="date"
                  value={incidentForm.reporting_date}
                  onChange={(e) => setIncidentForm((p) => ({ ...p, reporting_date: e.target.value }))}
                  className="block w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSavingIncident}
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="incident-primary_contact" className="block text-sm font-bold text-gray-700 mb-1">
              Primary Contact Person <span className="text-red-500">*</span>
            </label>
            <input
              id="incident-primary_contact"
              type="text"
              value={incidentForm.primary_contact_person}
              onChange={(e) => setIncidentForm((p) => ({ ...p, primary_contact_person: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingIncident}
              placeholder="Full name of primary contact for this incident"
            />
          </div>

          <div>
            <label htmlFor="incident-description" className="block text-sm font-bold text-gray-700 mb-1">
              Description of Incident <span className="text-red-500">*</span>
            </label>
            <textarea
              id="incident-description"
              rows={4}
              value={incidentForm.description}
              onChange={(e) => setIncidentForm((p) => ({ ...p, description: e.target.value }))}
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSavingIncident}
              placeholder="Describe what occurred, when, where, and who was involved..."
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Attach Incident Report File <span className="text-red-500">*</span>
            </label>
            <input
              ref={incidentFileInputRef}
              type="file"
              accept={ACCEPTED_INCIDENT_FILE_TYPES}
              onChange={(e) => {
                const file = e.target.files?.[0]
                setIncidentFormFile(file ?? null)
              }}
              className="hidden"
            />
            {!incidentFormFile ? (
              <button
                type="button"
                onClick={() => incidentFileInputRef.current?.click()}
                disabled={isSavingIncident}
                className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 py-6 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Upload className="w-8 h-8" />
                <span>Click to upload</span>
                <span className="text-xs">PDF, DOC, DOCX, PNG, JPG</span>
              </button>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-green-400 bg-green-50/30 py-3 px-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-gray-900 truncate">{incidentFormFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIncidentFormFile(null)
                    if (incidentFileInputRef.current) incidentFileInputRef.current.value = ''
                  }}
                  disabled={isSavingIncident}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  aria-label="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              type="button"
              onClick={closeIncidentModal}
              disabled={isSavingIncident}
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isSavingIncident}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {isSavingIncident ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Submit Report
            </button>
          </div>
        </form>
      </Modal>

      {/* Add ADL Task Modal — same flow as Skilled: Apply = local only; Save plan persists to DB */}
      <Modal
        isOpen={addAdlModalOpen}
        onClose={closeAddAdlModal}
        title="Non-Skilled Task Library"
        subtitle="Select daily living activities to add to the care plan"
        size="md"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={addAdlSearch}
                onChange={(e) => setAddAdlSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={addAdlCategoryFilter}
              onChange={(e) => setAddAdlCategoryFilter(e.target.value as 'all' | 'ADL' | 'IADL')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="ADL">ADL</option>
              <option value="IADL">IADL</option>
            </select>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
            {(() => {
              const query = addAdlSearch.toLowerCase().trim()
              const available = adlLists.filter(
                (a) =>
                  (addAdlCategoryFilter === 'all' || a.group === addAdlCategoryFilter) &&
                  (query === '' ||
                    a.name.toLowerCase().includes(query) ||
                    a.group.toLowerCase().includes(query))
              )
              if (available.length === 0) {
                return (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No tasks to add. Already added or no match.
                  </div>
                )
              }
              const grouped = available.reduce<Record<string, typeof available>>((acc, item) => {
                if (!acc[item.group]) acc[item.group] = []
                acc[item.group].push(item)
                return acc
              }, {})
              return Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, tasks]) => (
                  <div key={category} className="space-y-2">
                    <div
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${skilledTaskBadgeClassByCategory(
                        category
                      )}`}
                    >
                      {category}
                    </div>
                    {tasks.map((a) => {
                      const selected = addAdlSelected.has(a.name)
                      return (
                        <div
                          key={a.name}
                          className="rounded-xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{a.name}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setAddAdlSelected((prev) => {
                                const next = new Set(prev)
                                if (next.has(a.name)) next.delete(a.name)
                                else next.add(a.name)
                                return next
                              })
                            }
                            className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                          >
                            {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))
            })()}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={closeAddAdlModal}
            >
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={applyAdlTaskSelection}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Select Time Modal — no Frequency section; times per day 1–4 */}
      <Modal
        isOpen={selectTimeModalOpen}
        onClose={closeSelectTimeModal}
        title="Select Time"
        size="md"
      >
        <form onSubmit={handleDoneSelectTime} className="space-y-4">
          {(selectTimeAdl || selectTimeSkilledTask) && (
            <p className="text-sm text-gray-600">
              Choose when <span className="font-medium">{selectTimeSkilledTask?.name ?? selectTimeAdl?.name}</span> should happen on {selectTimeDayLabel}
            </p>
          )}
          
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800">Times per Day</label>
                <p className="mt-1 text-xs text-gray-500">How many times this task should be performed on {selectTimeDayLabel}</p>
              </div>
              <select
                value={selectTimeForm.timesPerDay}
                onChange={(e) => {
                  const next = Number(e.target.value) as 1 | 2 | 3 | 4
                  setSelectTimeForm((p) => {
                    const count = [p.morning, p.afternoon, p.evening, p.night].filter(Boolean).length
                    if (count <= next) return { ...p, timesPerDay: next }
                    const updated = { ...p, timesPerDay: next }
                    const order: ('night' | 'evening' | 'afternoon' | 'morning')[] = ['night', 'evening', 'afternoon', 'morning']
                    let toUncheck = count - next
                    for (const k of order) {
                      if (toUncheck > 0 && updated[k]) {
                        updated[k] = false
                        toUncheck--
                      }
                    }
                    return updated
                  })
                }}
                className="shrink-0 rounded border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-2 text-xs font-medium text-gray-500">OR SELECT SPECIFIC TIME</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Specific Times (select up to {selectTimeForm.timesPerDay})</p>
            <div className="space-y-2">
              {[
                { key: 'morning' as const, label: 'Morning', range: '6 AM - 12 PM', slotKey: 'slotMorning' as const },
                { key: 'afternoon' as const, label: 'Afternoon', range: '12 PM - 6 PM', slotKey: 'slotAfternoon' as const },
                { key: 'evening' as const, label: 'Evening', range: '6 PM - 10 PM', slotKey: 'slotEvening' as const },
                { key: 'night' as const, label: 'Night', range: '10 PM - 5 AM', slotKey: 'slotNight' as const },
              ].map(({ key, label, range, slotKey }) => {
                const selectedCount = [selectTimeForm.morning, selectTimeForm.afternoon, selectTimeForm.evening, selectTimeForm.night].filter(Boolean).length
                const atLimit = selectedCount >= selectTimeForm.timesPerDay
                const canCheck = !selectTimeForm[key] && atLimit ? false : true
                const toggleSlot = () => {
                  if (selectTimeForm[key]) {
                    setSelectTimeForm((p) => ({ ...p, [key]: false }))
                  } else {
                    if (atLimit) return
                    setSelectTimeForm((p) => ({ ...p, [key]: true }))
                  }
                }
                return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={toggleSlot}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSlot() } }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectTimeForm[key]}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelectTimeForm((p) => {
                        if (checked) {
                          const n = [p.morning, p.afternoon, p.evening, p.night].filter(Boolean).length
                          if (n >= p.timesPerDay) return p
                        }
                        return { ...p, [key]: checked }
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={canCheck === false}
                    className="rounded border-gray-300 text-brand focus:ring-brand disabled:opacity-50 pointer-events-none"
                  />
                  <div className="flex-1 pointer-events-none">
                    <span className="font-medium text-gray-900">{label}</span>
                    <span className="text-sm text-gray-500 ml-2">{range}</span>
                  </div>
                  <select
                    value={selectTimeForm[slotKey]}
                    onChange={(e) => setSelectTimeForm((p) => ({ ...p, [slotKey]: e.target.value as 'always' | 'as_needed' }))}
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    disabled={!selectTimeForm[key]}
                  >
                    <option value="always">Always</option>
                    <option value="as_needed">As Needed</option>
                  </select>
                </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="primary" type="submit">
              Done
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={adlNoteModalOpen}
        onClose={closeAdlNoteModal}
        title={`Note — ${adlNoteTarget?.name ?? ''}`}
        subtitle="Add client-specific instructions for this ADL. Caregivers will see this note during the visit."
        size="md"
      >
        <form onSubmit={handleSaveAdlNote} className="space-y-4">
          <textarea
            value={adlNoteDraft}
            onChange={(e) => setAdlNoteDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            placeholder="Add note for caregivers..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={closeAdlNoteModal}
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleRemoveAdlNote}
              className="px-4 py-2 text-sm font-medium text-red-500 hover:text-red-600"
            >
              Remove
            </button>
            <Button variant="primary" type="submit">
              Save Note
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={skilledNoteModalOpen}
        onClose={closeSkilledNoteModal}
        title={`Note — ${skilledNoteTarget?.name ?? ''}`}
        subtitle="Add client-specific instructions for this skilled task. Caregivers will see this note during the visit."
        size="md"
      >
        <form onSubmit={handleSaveSkilledNote} className="space-y-4">
          <textarea
            value={skilledNoteDraft}
            onChange={(e) => setSkilledNoteDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            placeholder="Add note for caregivers..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={closeSkilledNoteModal}
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleRemoveSkilledNote}
              className="px-4 py-2 text-sm font-medium text-red-500 hover:text-red-600"
            >
              Remove
            </button>
            <Button variant="primary" type="submit">
              Save Note
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Visit Modal */}
      <Modal
        isOpen={addVisitModalOpen}
        onClose={closeAddVisitModal}
        title="Add Visit"
        subtitle={`Add a new visit for ${patientFullName(localClient)}.`}
        headerAccessory={visitModalHeaderTabs}
        size="lg"
      >
        {addVisitTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date {!visitForm.isRecurring && '*'}</label>
                <input
                  type="date"
                  value={visitForm.date}
                  onChange={(e) => setVisitForm((p) => ({ ...p, date: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isSavingVisit || visitForm.isRecurring}
                />
                {visitForm.isRecurring && (
                  <p className="mt-1 text-xs text-gray-500">Ignored when Recurring is on. Use Start/End Date in Recurring section.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date {!visitForm.isRecurring && '*'}</label>
                <input
                  type="date"
                  value={visitForm.endDate}
                  min={visitForm.date}
                  onChange={(e) => setVisitForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isSavingVisit || visitForm.isRecurring}
                />
                {visitForm.endDate > visitForm.date && (
                  <p className="mt-1 text-xs text-blue-600">
                    {Math.round((new Date(visitForm.endDate + 'T12:00:00').getTime() - new Date(visitForm.date + 'T12:00:00').getTime()) / 86_400_000) + 1}-day visit
                    {visitForm.isRecurring && ' · each occurrence runs this many days'}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                <input
                  type="time"
                  value={visitForm.startTime}
                  onChange={(e) => setVisitForm((p) => ({ ...p, startTime: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  disabled={isSavingVisit}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                <input
                  type="time"
                  value={visitForm.endTime}
                  onChange={(e) => setVisitForm((p) => ({ ...p, endTime: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  disabled={isSavingVisit}
                />
              </div>
            </div>
            {addresses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Visit Location</label>
                <select
                  value={visitForm.addressId}
                  onChange={(e) => setVisitForm((p) => ({ ...p, addressId: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                  disabled={isSavingVisit}
                >
                  <option value="">— No address selected —</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}{a.is_primary ? ' (Primary)' : ''} — {a.street_address}, {a.city}, {a.state} {a.zip_code}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Billing Contract <span className="text-red-500">*</span></label>
                <button
                  type="button"
                  onClick={() => setServiceContractsModalOpen(true)}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Manage contracts
                </button>
              </div>
              <select
                value={visitForm.contractId}
                onChange={(e) => setVisitForm((p) => ({ ...p, contractId: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                disabled={isSavingVisit}
              >
                <option value="">Select contract...</option>
                {activeContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.contract_name?.trim() || c.contract_type)} - {c.service_type === 'skilled' ? 'Skilled' : 'Non-Skilled'} - {c.bill_unit_type}
                  </option>
                ))}
              </select>
              {activeContracts.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  No billing contract covers this visit date. Add or adjust contracts in Manage contracts.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={visitForm.description}
                onChange={(e) => setVisitForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                placeholder="Optional"
                disabled={isSavingVisit}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={visitForm.type}
                  onChange={(e) => setVisitForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                  disabled={isSavingVisit}
                >
                  {VISIT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caregiver</label>
                {renderCaregiverPicker()}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={visitForm.notes}
                onChange={(e) => setVisitForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                placeholder="Optional"
                disabled={isSavingVisit}
              />
            </div>
            {/* Recurring — toggle only (top box) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-sm font-semibold text-gray-900">Recurring</span>
                  <span className="text-xs text-blue-600">Repeat this visit on a schedule</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visitForm.isRecurring}
                  onClick={() => setVisitForm((p) => ({ ...p, isRecurring: !p.isRecurring }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${visitForm.isRecurring ? 'bg-gray-900 border-gray-900' : 'bg-gray-200 border-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white border shadow transition-transform ${visitForm.isRecurring ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            {/* Recurring configuration (bottom box) */}
            {visitForm.isRecurring && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                {editingSchedule?.is_recurring ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Apply Changes To</label>
                    <select
                      value={editRecurringApplyScope}
                      onChange={(e) =>
                        setEditRecurringApplyScope(
                          e.target.value as
                            | 'this_visit'
                            | 'this_and_future'
                            | 'all_in_series'
                            | 'weekday_in_series'
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      disabled={isSavingVisit}
                    >
                      <option value="this_visit">This visit only</option>
                      <option value="this_and_future">This and future visits</option>
                      <option value="all_in_series">All visits in series</option>
                      <option value="weekday_in_series">
                        All {new Date(`${editingSchedule.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })} visits
                      </option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Use weekday option to update one day pattern (for example all Fridays) in one action.
                    </p>
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repeat Frequency</label>
                  <select
                    value={visitForm.repeatFrequency}
                    onChange={(e) => {
                      const v = e.target.value
                      setVisitForm((p) => {
                        const next = { ...p, repeatFrequency: v }
                        if (v === 'daily') {
                          const today = toLocalDateString(new Date())
                          next.repeatStart = today
                          next.repeatEnd = today
                        } else if (v === 'weekly') {
                          const mon = getMonday(new Date())
                          next.repeatStart = toLocalDateString(mon)
                          /** Open-ended by default; first batch uses 21-day Pacific window. User may set End Date for a fixed range. */
                          next.repeatEnd = ''
                        } 
                        // else if (v === 'monthly') {
                        //   const d = new Date()
                        //   const y = d.getFullYear()
                        //   const m = d.getMonth()
                        //   next.repeatStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
                        //   const lastDay = new Date(y, m + 1, 0).getDate()
                        //   next.repeatEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
                        // }
                        return next
                      })
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select...</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    {/* <option value="monthly">Monthly</option> */}
                  </select>
                </div>
                {visitForm.repeatFrequency === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Days of the Week</label>
                    <div className="flex flex-wrap gap-2">
                      {VISIT_WEEKLY_REPEAT_DAYS_ORDER.map(({ getDay: d, label }) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const has = visitForm.repeatDays.includes(d)
                            setVisitForm((p) => ({
                              ...p,
                              repeatDays: has ? p.repeatDays.filter((x) => x !== d) : [...p.repeatDays, d],
                            }))
                          }}
                          className={`min-w-[2.5rem] h-10 rounded-full text-sm font-medium border transition-colors ${visitForm.repeatDays.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {visitForm.repeatFrequency === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Repeat on (week + day)</label>
                    <div className="space-y-2">
                      {(visitForm.repeatMonthlyRules.length === 0 ? [{ ordinal: null, weekday: null }] : visitForm.repeatMonthlyRules).map((rule, i) => (
                        <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <select
                            value={rule.ordinal ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const ord = v === '' ? null : Number(v)
                              setVisitForm((p) => {
                                const rules = [...(p.repeatMonthlyRules.length === 0 ? [{ ordinal: null as number | null, weekday: null as number | null }] : p.repeatMonthlyRules)]
                                rules[i] = { ...rules[i], ordinal: ord }
                                const isLast = i === rules.length - 1
                                if (isLast && ord != null && rules[i].weekday != null && rules.length > 0) rules.push({ ordinal: null, weekday: null })
                                return { ...p, repeatMonthlyRules: rules }
                              })
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 min-w-[120px]"
                          >
                            <option value="">Week...</option>
                            <option value={0}>All Weeks</option>
                            {([1, 2, 3, 4, 5] as const).map((ord) => (
                              <option key={ord} value={ord}>{MONTHLY_ORDINAL_LABELS[ord - 1]}</option>
                            ))}
                          </select>
                          <select
                            value={rule.weekday ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const wd = v === '' ? null : Number(v)
                              setVisitForm((p) => {
                                const rules = [...(p.repeatMonthlyRules.length === 0 ? [{ ordinal: null as number | null, weekday: null as number | null }] : p.repeatMonthlyRules)]
                                rules[i] = { ...rules[i], weekday: wd }
                                const isLast = i === rules.length - 1
                                if (isLast && wd != null && rules[i].ordinal != null) rules.push({ ordinal: null, weekday: null })
                                return { ...p, repeatMonthlyRules: rules }
                              })
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 min-w-[120px]"
                          >
                            <option value="">Day Of Week...</option>
                            {WEEKDAY_NAMES.map((name, wd) => (
                              <option key={wd} value={wd}>{name}</option>
                            ))}
                          </select>
                          {rule.ordinal != null && rule.weekday != null && (
                            <button
                              type="button"
                              onClick={() => {
                                setVisitForm((p) => {
                                  const rules = p.repeatMonthlyRules.filter((_, idx) => idx !== i)
                                  return { ...p, repeatMonthlyRules: rules.length === 0 ? [{ ordinal: null, weekday: null }] : rules }
                                })
                              }}
                              className="text-gray-400 hover:text-red-600 p-1"
                              aria-label="Remove"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={visitForm.repeatStart}
                        onChange={(e) => setVisitForm((p) => ({ ...p, repeatStart: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900"
                      />
                      <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={visitForm.repeatEnd}
                        onChange={(e) => setVisitForm((p) => ({ ...p, repeatEnd: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="mm/dd/yyyy"
                      />
                      <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {addVisitTab === 'adls' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {selectedVisitContract?.service_type === 'skilled'
                  ? 'Select Skilled Tasks'
                  : 'Select ADL Tasks'} <span className="text-red-500">*</span>
              </span>
              {visitAdlSelected.size > 0 && (
                <span className="text-green-600 font-medium">✓ {visitAdlSelected.size} tasks selected</span>
              )}
            </div>
            <div className="max-h-160 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2">
              {selectedVisitContract?.service_type === 'skilled'
                ? localSkilledCarePlanTasks.length === 0 ? (
                    <p className="text-sm text-gray-500 p-3">
                      No skilled tasks configured. Add them in the Skilled Tasks tab and set days/times first.
                    </p>
                  ) : (
                    (() => {
                      const visitDate = visitForm.isRecurring ? visitForm.repeatStart : visitForm.date
                      const dayOfWeekDb = visitDate
                        ? (() => {
                            const d = new Date(visitDate + 'T12:00:00').getDay()
                            return d === 0 ? 7 : d
                          })()
                        : null
                      const assignedSlots = buildAssignedVisitTaskSlotSet(
                        visitDateSchedules ?? [],
                        localAdlSchedules,
                        localSkilledSchedules
                      )
                      return renderVisitSkilledSelectionList(dayOfWeekDb, assignedSlots)
                    })()
                  )
                : (() => {
                    const visitDate = visitForm.isRecurring ? visitForm.repeatStart : visitForm.date
                    const dayOfWeekDb = visitDate
                      ? (() => {
                          const d = new Date(visitDate + 'T12:00:00').getDay()
                          return d === 0 ? 7 : d
                        })()
                      : null
                    const assignedSlots = buildAssignedVisitTaskSlotSet(
                      visitDateSchedules ?? [],
                      localAdlSchedules,
                      localSkilledSchedules
                    )
                    return renderVisitAdlSelectionList(dayOfWeekDb, assignedSlots)
                  })()}
            </div>
            {(visitForm.isRecurring ? visitForm.repeatStart : visitForm.date) && (
              <p className="text-xs text-gray-500">
                {selectedVisitContract?.service_type === 'skilled'
                  ? 'Only showing skilled task slots that are not already assigned to other visits on '
                  : 'Only showing ADL/IADL slots that are not already assigned to other visits on '}
                {new Date((visitForm.isRecurring ? visitForm.repeatStart : visitForm.date)! + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
              </p>
            )}
          </div>
        )}

        {visitError && (
          <p className="mt-4 text-sm text-yellow-600 bg-yellow-100 border border-yellow-200 p-2 rounded">{visitError}</p>
        )}
        {scheduleLimitWarning && (
          <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">{scheduleLimitWarning}</p>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="secondary"
            type="button"
            onClick={closeAddVisitModal}
            disabled={isSavingVisit}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleAddVisitSubmit}
            disabled={isSavingVisit}
            loading={isSavingVisit}
          >
            Add Visit
          </Button>
        </div>
      </Modal>

      {/* Edit Visit Modal */}
      <Modal
        isOpen={editVisitModalOpen}
        onClose={closeEditVisitModal}
        title="Edit Visit"
        subtitle={`Edit visit for ${patientFullName(localClient)}.`}
        headerAccessory={visitModalHeaderTabs}
        size="lg"
      >
        {addVisitTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date {!visitForm.isRecurring && '*'}</label>
                <input
                  type="date"
                  value={visitForm.date}
                  onChange={(e) => setVisitForm((p) => ({ ...p, date: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isSavingVisit || visitForm.isRecurring}
                />
                {visitForm.isRecurring && (
                  <p className="mt-1 text-xs text-gray-500">Ignored when Recurring is on. Use Start/End Date in Recurring section.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date {!visitForm.isRecurring && '*'}</label>
                <input
                  type="date"
                  value={visitForm.endDate}
                  min={visitForm.date}
                  onChange={(e) => setVisitForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isSavingVisit || visitForm.isRecurring}
                />
                {visitForm.endDate > visitForm.date && (
                  <p className="mt-1 text-xs text-blue-600">
                    {Math.round((new Date(visitForm.endDate + 'T12:00:00').getTime() - new Date(visitForm.date + 'T12:00:00').getTime()) / 86_400_000) + 1}-day visit
                    {visitForm.isRecurring && ' · each occurrence runs this many days'}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                <input
                  type="time"
                  value={visitForm.startTime}
                  onChange={(e) => setVisitForm((p) => ({ ...p, startTime: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  disabled={isSavingVisit}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                <input
                  type="time"
                  value={visitForm.endTime}
                  onChange={(e) => setVisitForm((p) => ({ ...p, endTime: e.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  disabled={isSavingVisit}
                />
              </div>
            </div>
            {addresses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Visit Location</label>
                <select
                  value={visitForm.addressId}
                  onChange={(e) => setVisitForm((p) => ({ ...p, addressId: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                  disabled={isSavingVisit}
                >
                  <option value="">— No address selected —</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}{a.is_primary ? ' (Primary)' : ''} — {a.street_address}, {a.city}, {a.state} {a.zip_code}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Billing Contract <span className="text-red-500">*</span></label>
                <button
                  type="button"
                  onClick={() => setServiceContractsModalOpen(true)}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Manage contracts
                </button>
              </div>
              <select
                value={visitForm.contractId}
                onChange={(e) => setVisitForm((p) => ({ ...p, contractId: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                disabled={isSavingVisit}
              >
                <option value="">Select contract...</option>
                {activeContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.contract_name?.trim() || c.contract_type)} - {c.service_type === 'skilled' ? 'Skilled' : 'Non-Skilled'} - {c.bill_unit_type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={visitForm.description}
                onChange={(e) => setVisitForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                placeholder="Optional"
                disabled={isSavingVisit}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={visitForm.type}
                  onChange={(e) => setVisitForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900"
                  disabled={isSavingVisit}
                >
                  {VISIT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caregiver</label>
                {renderCaregiverPicker()}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={visitForm.notes}
                onChange={(e) => setVisitForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                placeholder="Optional"
                disabled={isSavingVisit}
              />
            </div>
            {/* Recurring — toggle only (top box) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-sm font-semibold text-gray-900">Recurring</span>
                  <span className="text-xs text-blue-600">Repeat this visit on a schedule</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visitForm.isRecurring}
                  onClick={() => setVisitForm((p) => ({ ...p, isRecurring: !p.isRecurring }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${visitForm.isRecurring ? 'bg-gray-900 border-gray-900' : 'bg-gray-200 border-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white border shadow transition-transform ${visitForm.isRecurring ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            {/* Recurring configuration (bottom box) */}
            {visitForm.isRecurring && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repeat Frequency</label>
                  <select
                    value={visitForm.repeatFrequency}
                    onChange={(e) => {
                      const v = e.target.value
                      setVisitForm((p) => {
                        const next = { ...p, repeatFrequency: v }
                        if (v === 'daily') {
                          const today = toLocalDateString(new Date())
                          next.repeatStart = today
                          next.repeatEnd = today
                        } else if (v === 'weekly') {
                          const mon = getMonday(new Date())
                          next.repeatStart = toLocalDateString(mon)
                          /** Open-ended by default; first batch uses 21-day Pacific window. User may set End Date for a fixed range. */
                          next.repeatEnd = ''
                        } 
                        // else if (v === 'monthly') {
                        //   const d = new Date()
                        //   const y = d.getFullYear()
                        //   const m = d.getMonth()
                        //   next.repeatStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
                        //   const lastDay = new Date(y, m + 1, 0).getDate()
                        //   next.repeatEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
                        // }
                        return next
                      })
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select...</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    {/* <option value="monthly">Monthly</option> */}
                  </select>
                </div>
                {visitForm.repeatFrequency === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Days of the Week</label>
                    <div className="flex flex-wrap gap-2">
                      {VISIT_WEEKLY_REPEAT_DAYS_ORDER.map(({ getDay: d, label }) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const has = visitForm.repeatDays.includes(d)
                            setVisitForm((p) => ({
                              ...p,
                              repeatDays: has ? p.repeatDays.filter((x) => x !== d) : [...p.repeatDays, d],
                            }))
                          }}
                          className={`min-w-[2.5rem] h-10 rounded-full text-sm font-medium border transition-colors ${visitForm.repeatDays.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {visitForm.repeatFrequency === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Repeat on (week + day)</label>
                    <div className="space-y-2">
                      {(visitForm.repeatMonthlyRules.length === 0 ? [{ ordinal: null, weekday: null }] : visitForm.repeatMonthlyRules).map((rule, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <select
                            value={rule.ordinal ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const ord = v === '' ? null : Number(v)
                              setVisitForm((p) => {
                                const rules = [...(p.repeatMonthlyRules.length === 0 ? [{ ordinal: null as number | null, weekday: null as number | null }] : p.repeatMonthlyRules)]
                                rules[i] = { ...rules[i], ordinal: ord }
                                const isLast = i === rules.length - 1
                                if (isLast && ord != null && rules[i].weekday != null && rules.length > 0) rules.push({ ordinal: null, weekday: null })
                                return { ...p, repeatMonthlyRules: rules }
                              })
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 min-w-[120px]"
                          >
                            <option value="">Week...</option>
                            <option value={0}>All</option>
                            {([1, 2, 3, 4, 5] as const).map((ord) => (
                              <option key={ord} value={ord}>{MONTHLY_ORDINAL_LABELS[ord - 1]}</option>
                            ))}
                          </select>
                          <select
                            value={rule.weekday ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const wd = v === '' ? null : Number(v)
                              setVisitForm((p) => {
                                const rules = [...(p.repeatMonthlyRules.length === 0 ? [{ ordinal: null as number | null, weekday: null as number | null }] : p.repeatMonthlyRules)]
                                rules[i] = { ...rules[i], weekday: wd }
                                const isLast = i === rules.length - 1
                                if (isLast && wd != null && rules[i].ordinal != null) rules.push({ ordinal: null, weekday: null })
                                return { ...p, repeatMonthlyRules: rules }
                              })
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 min-w-[120px]"
                          >
                            <option value="">Day...</option>
                            {WEEKDAY_NAMES.map((name, wd) => (
                              <option key={wd} value={wd}>{name}</option>
                            ))}
                          </select>
                          {rule.ordinal != null && rule.weekday != null && (
                            <button
                              type="button"
                              onClick={() => {
                                setVisitForm((p) => {
                                  const rules = p.repeatMonthlyRules.filter((_, idx) => idx !== i)
                                  return { ...p, repeatMonthlyRules: rules.length === 0 ? [{ ordinal: null, weekday: null }] : rules }
                                })
                              }}
                              className="text-gray-400 hover:text-red-600 p-1"
                              aria-label="Remove"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={visitForm.repeatStart}
                        onChange={(e) => setVisitForm((p) => ({ ...p, repeatStart: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900"
                      />
                      <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={visitForm.repeatEnd}
                        onChange={(e) => setVisitForm((p) => ({ ...p, repeatEnd: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 placeholder:text-gray-400"
                        placeholder="mm/dd/yyyy"
                      />
                      <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {addVisitTab === 'adls' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {selectedVisitContract?.service_type === 'skilled'
                  ? 'Select Skilled Tasks'
                  : 'Select ADL Tasks'} <span className="text-red-500">*</span>
              </span>
              {visitAdlSelected.size > 0 && (
                <span className="text-green-600 font-medium">✓ {visitAdlSelected.size} tasks selected</span>
              )}
            </div>
            <div className="max-h-160 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2">
              {selectedVisitContract?.service_type === 'skilled'
                ? localSkilledCarePlanTasks.length === 0 ? (
                    <p className="text-sm text-gray-500 p-3">
                      No skilled tasks configured. Add them in the Skilled Tasks tab and set days/times first.
                    </p>
                  ) : (
                    (() => {
                      const visitDate = visitForm.date
                      const dayOfWeekDb = visitDate
                        ? (() => {
                            const d = new Date(visitDate + 'T12:00:00').getDay()
                            return d === 0 ? 7 : d
                          })()
                        : null
                      const otherVisitsOnDate = (visitDateSchedules ?? []).filter((s) => s.id !== editingSchedule?.id)
                      const assignedSlots = buildAssignedVisitTaskSlotSet(
                        otherVisitsOnDate,
                        localAdlSchedules,
                        localSkilledSchedules
                      )
                      return renderVisitSkilledSelectionList(dayOfWeekDb, assignedSlots)
                    })()
                  )
                : (() => {
                    const visitDate = visitForm.date
                    const dayOfWeekDb = visitDate
                      ? (() => {
                          const d = new Date(visitDate + 'T12:00:00').getDay()
                          return d === 0 ? 7 : d
                        })()
                      : null
                    const otherVisitsOnDate = (visitDateSchedules ?? []).filter((s) => s.id !== editingSchedule?.id)
                    const assignedSlots = buildAssignedVisitTaskSlotSet(
                      otherVisitsOnDate,
                      localAdlSchedules,
                      localSkilledSchedules
                    )
                    return renderVisitAdlSelectionList(dayOfWeekDb, assignedSlots)
                  })()}
            </div>
            {(visitForm.isRecurring ? visitForm.repeatStart : visitForm.date) && (
              <p className="text-xs text-gray-500">
                {selectedVisitContract?.service_type === 'skilled'
                  ? 'Only showing skilled task slots that are not already assigned to other visits on '
                  : 'Only showing ADL/IADL slots that are not already assigned to other visits on '}
                {new Date((visitForm.isRecurring ? visitForm.repeatStart : visitForm.date)! + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
              </p>
            )}
          </div>
        )}

        {visitError && (
          <p className="mt-4 text-sm text-yellow-600 bg-yellow-100 border border-yellow-200 p-2 rounded">{visitError}</p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-6">
          {editingSchedule?.status === 'missed' || editingSchedule?.status === 'cancelled' || editingSchedule?.status === 'on_hold' ? (
            <button
              type="button"
              onClick={handleMarkVisitUnmissed}
              disabled={isSavingVisit}
              className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-gray-400 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Reinstate
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleMarkVisitMissed}
                disabled={isSavingVisit}
                className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-orange-500 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Missed
              </button>
              <button
                type="button"
                onClick={() => { setVisitStatusModal('on_hold'); setVisitStatusReason('') }}
                disabled={isSavingVisit}
                className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-yellow-400 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-50 disabled:opacity-50"
              >
                On Hold
              </button>
              <button
                type="button"
                onClick={() => { setVisitStatusModal('cancelled'); setVisitStatusReason('') }}
                disabled={isSavingVisit}
                className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-rose-400 text-rose-600 rounded-lg text-sm font-medium hover:bg-rose-50 disabled:opacity-50"
              >
                Cancel Visit
              </button>
            </>
          )}
          <Button
            variant="danger"
            type="button"
            onClick={handleDeleteVisit}
            disabled={isSavingVisit}
            icon={Trash2}
          >
            Delete Visit
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={closeEditVisitModal}
            disabled={isSavingVisit}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleUpdateVisitSubmit}
            disabled={isSavingVisit}
            loading={isSavingVisit}
          >
            {editingSchedule?.is_recurring && editRecurringApplyScope !== 'this_visit' ? 'Update Visits' : 'Update Visit'}
          </Button>
        </div>
      </Modal>

      {/* Visit status-change reason modal (Missed / On Hold / Cancel) */}
      <Modal
        isOpen={!!visitStatusModal}
        onClose={() => { setVisitStatusModal(null); setVisitStatusReason('') }}
        title={
          visitStatusModal === 'missed' ? 'Mark Visit as Missed'
          : visitStatusModal === 'cancelled' ? 'Cancel Visit'
          : 'Put Visit On Hold'
        }
        size="md"
      >
        {visitStatusModal && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-3 text-sm ${
              visitStatusModal === 'missed' ? 'border-orange-200 bg-orange-50 text-orange-900'
              : visitStatusModal === 'cancelled' ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-yellow-200 bg-yellow-50 text-yellow-900'
            }`}>
              <div className="font-semibold">{patientFullName(localClient)}</div>
              {editingSchedule && (
                <div className="text-xs mt-0.5 opacity-80">{editingSchedule.date} · {editingSchedule.start_time ?? ''}{editingSchedule.end_time ? ` – ${editingSchedule.end_time}` : ''}</div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Reason
                {visitStatusModal !== 'missed' && <span className="text-red-500 ml-0.5">*</span>}
                {visitStatusModal === 'missed' && <span className="text-gray-400 ml-1">(optional)</span>}
              </label>
              <textarea
                value={visitStatusReason}
                onChange={(e) => setVisitStatusReason(e.target.value)}
                placeholder={
                  visitStatusModal === 'missed' ? 'e.g. Client hospitalized, caregiver no-show, weather...'
                  : visitStatusModal === 'cancelled' ? 'e.g. Client request, scheduling conflict, duplicate booking...'
                  : 'e.g. Awaiting authorization, client unavailable, pending assessment...'
                }
                rows={4}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-500">This will be logged in the audit trail with your name, timestamp, and reason, and will be traceable to this visit and client.</p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => { setVisitStatusModal(null); setVisitStatusReason('') }}
              >
                Back
              </Button>
              <button
                type="button"
                disabled={isSavingVisit || (visitStatusModal !== 'missed' && !visitStatusReason.trim())}
                onClick={handleConfirmVisitStatusChange}
                className={`rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60 flex items-center gap-2 ${
                  visitStatusModal === 'missed' ? 'bg-orange-600 hover:bg-orange-700'
                  : visitStatusModal === 'cancelled' ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {isSavingVisit && <Loader2 className="w-4 h-4 animate-spin" />}
                {visitStatusModal === 'missed' ? 'Confirm Missed' : visitStatusModal === 'cancelled' ? 'Confirm Cancellation' : 'Confirm On Hold'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={serviceContractsModalOpen}
        onClose={closeManageLimitModal}
        title={`Manage Service Contracts — ${patientFullName(localClient)}`}
        size="xl"
        closeOnBackdropClick={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 -mt-2">
            Track billing contracts by service type. Current vs ended is determined from effective and end dates (same timeline rules as the database).
          </p>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-900">New Contract</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Name</label>
                <input value={serviceContractForm.contract_name} onChange={(e) => setServiceContractForm((p) => ({ ...p, contract_name: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Medicaid Non-Skilled 2025" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Type *</label>
                <select value={serviceContractForm.contract_type} onChange={(e) => setServiceContractForm((p) => ({ ...p, contract_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white">
                  <option>Private Pay</option><option>Medicaid</option><option>Insurance</option><option>Medicare</option><option>Veterans Affairs</option><option>Waiver</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Type *</label>
                <select value={serviceContractForm.service_type} onChange={(e) => setServiceContractForm((p) => ({ ...p, service_type: e.target.value as 'non_skilled' | 'skilled' }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white">
                  <option value="non_skilled">Non-Skilled</option>
                  <option value="skilled">Skilled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Code *</label>
                <select
                  value={serviceContractForm.billing_code_id}
                  onChange={(e) => setServiceContractForm((p) => ({ ...p, billing_code_id: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select code</option>
                  {billingCodeSelectOptions.map((row) => (
                    <option key={row.id} value={row.id}>{row.code}</option>
                  ))}
                </select>
                {billingCodesLoadError ? (
                  <p className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{billingCodesLoadError}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Rate ($)</label>
                <input type="number" min={0} step={0.01} value={serviceContractForm.bill_rate} onChange={(e) => setServiceContractForm((p) => ({ ...p, bill_rate: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type *</label>
                <select value={serviceContractForm.bill_unit_type} onChange={(e) => setServiceContractForm((p) => ({ ...p, bill_unit_type: e.target.value as 'hour' | 'visit' | '15_min_unit' }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white">
                  <option value="hour">Hour</option>
                  <option value="visit">Visit</option>
                  <option value="15_min_unit">15-Min Unit</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weekly Hours Limit</label>
                <input type="number" min={0} step={0.25} value={serviceContractForm.weekly_hours_limit} onChange={(e) => setServiceContractForm((p) => ({ ...p, weekly_hours_limit: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. 40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date *</label>
                <input type="date" value={serviceContractForm.effective_date} onChange={(e) => setServiceContractForm((p) => ({ ...p, effective_date: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date (optional)</label>
                <input type="date" value={serviceContractForm.end_date} onChange={(e) => setServiceContractForm((p) => ({ ...p, end_date: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea value={serviceContractForm.note} onChange={(e) => setServiceContractForm((p) => ({ ...p, note: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={serviceContractForm.bill_mileage}
                  onChange={(e) => setServiceContractForm((p) => ({ ...p, bill_mileage: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Bill mileage to this client</span>
              </label>
              {serviceContractForm.bill_mileage && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mileage rate per mile (leave blank to use agency default)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="e.g. 0.67"
                    value={serviceContractForm.mileage_bill_rate_per_mile}
                    onChange={(e) => setServiceContractForm((p) => ({ ...p, mileage_bill_rate_per_mile: e.target.value }))}
                    className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              For the same contract type and service type, saving a new effective date closes the previous open-ended row on that date and starts the new row.
            </div>
            {serviceContractError ? <p className="text-sm text-red-600">{serviceContractError}</p> : null}
            <div className="flex justify-end">
              <Button variant="primary" type="button" onClick={handleSaveServiceContract} disabled={isSavingServiceContract} loading={isSavingServiceContract}>
                Save Contract
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {serviceContracts.length === 0 ? (
              <div className="p-10 text-center text-gray-500">No service contracts yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="w-10 px-2" />
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing Rate</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Weekly Hrs</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Effective</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {serviceContracts.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="w-10 px-2 py-3">
                        <RecordActionsMenu
                          label={`Actions for ${row.contract_name || row.contract_type}`}
                          actions={[
                            { label: 'Edit Contract', icon: Edit, onClick: () => openEditServiceContractModal(row) },
                            { label: 'Delete Contract', icon: Trash2, onClick: () => void handleDeleteServiceContract(row), destructive: true },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3">{row.contract_name || row.contract_type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${row.service_type === 'skilled' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {row.service_type === 'skilled' ? 'Skilled' : 'Non-Skilled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.bill_rate != null ? `${formatMoney(Number(row.bill_rate))}/${row.bill_unit_type}` : '—'}
                      </td>
                      <td className="px-4 py-3">{row.weekly_hours_limit ?? '—'}</td>
                      <td className="px-4 py-3">{formatShortDate(row.effective_date)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="inline-flex rounded-md border border-gray-200 bg-gray-100/80 p-0.5">
                            <button
                              type="button"
                              onClick={() => void handleSetServiceContractStatus(row, 'active')}
                              disabled={isSavingServiceContractRowAction}
                              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                row.status === 'active'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-gray-600 hover:text-emerald-700'
                              }`}
                            >
                              Active
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSetServiceContractStatus(row, 'inactive')}
                              disabled={isSavingServiceContractRowAction}
                              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                row.status === 'inactive'
                                  ? 'bg-gray-600 text-white shadow-sm'
                                  : 'text-gray-600 hover:text-gray-800'
                              }`}
                            >
                              Inactive
                            </button>
                          </div>
                          {row.status === 'scheduled' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-violet-100 text-violet-700">
                              Scheduled
                            </span>
                          ) : null}
                          {(() => {
                            const ph = patientServiceContractUiPhase(row, serviceContracts, serviceContractsModalStatusAsOf)
                            const label = ph === 'current' ? 'Current' : ph === 'future' ? 'Future' : 'Ended'
                            const cls =
                              ph === 'current'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ph === 'future'
                                  ? 'bg-sky-100 text-sky-700'
                                  : 'bg-gray-100 text-gray-600'
                            return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              type="button"
              onClick={handleDoneServiceContracts}
              disabled={isSavingServiceContract || isSavingServiceContractRowAction || isSavingServiceContractEdit}
              loading={isSavingServiceContractRowAction}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editServiceContractModalOpen}
        onClose={closeEditServiceContractModal}
        title={`Edit Contract — ${editingServiceContract?.contract_name || editingServiceContract?.contract_type || ''}`}
        size="md"
        closeOnBackdropClick={false}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Name</label>
              <input
                value={serviceContractEditForm.contract_name}
                onChange={(e) => setServiceContractEditForm((p) => ({ ...p, contract_name: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Rate ($)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={serviceContractEditForm.bill_rate}
                onChange={(e) => setServiceContractEditForm((p) => ({ ...p, bill_rate: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Unit type: {editingServiceContract?.bill_unit_type ?? 'hour'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                type="date"
                value={editingServiceContract?.effective_date ?? ''}
                disabled
                className="w-full rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={serviceContractEditForm.end_date}
                onChange={(e) => setServiceContractEditForm((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={serviceContractEditForm.note}
              onChange={(e) => setServiceContractEditForm((p) => ({ ...p, note: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={serviceContractEditForm.bill_mileage}
                onChange={(e) => setServiceContractEditForm((p) => ({ ...p, bill_mileage: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Bill mileage to this client</span>
            </label>
            {serviceContractEditForm.bill_mileage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mileage rate per mile (leave blank to use agency default)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="e.g. 0.67"
                  value={serviceContractEditForm.mileage_bill_rate_per_mile}
                  onChange={(e) => setServiceContractEditForm((p) => ({ ...p, mileage_bill_rate_per_mile: e.target.value }))}
                  className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
          {serviceContractEditError ? <p className="text-sm text-red-600">{serviceContractEditError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={closeEditServiceContractModal}
              disabled={isSavingServiceContractEdit}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleSaveServiceContractEdit}
              disabled={isSavingServiceContractEdit}
              loading={isSavingServiceContractEdit}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Address Add / Edit Modal */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-bold text-gray-900">{editingAddress ? 'Edit Address' : 'Add Address'}</h2>
              <button onClick={() => setAddressModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {addressError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{addressError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                <select
                  value={addressForm.label}
                  onChange={(e) => setAddressForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option>Home</option>
                  <option>Work</option>
                  <option>Facility</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                <input
                  type="text"
                  value={addressForm.street_address}
                  onChange={(e) => setAddressForm(f => ({ ...f, street_address: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Austin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
                  <input
                    type="text"
                    value={addressForm.zip_code}
                    onChange={(e) => setAddressForm(f => ({ ...f, zip_code: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="78701"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <select
                  value={addressForm.state}
                  onChange={(e) => setAddressForm(f => ({ ...f, state: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addr-is-primary"
                  checked={addressForm.is_primary}
                  disabled={editingAddress?.is_primary || addresses.length === 0}
                  onChange={(e) => setAddressForm(f => ({ ...f, is_primary: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="addr-is-primary" className="text-sm text-gray-700">Set as primary address</label>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddressModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                disabled={isSavingAddress}
                loading={isSavingAddress}
                onClick={async () => {
                  if (!addressForm.street_address.trim() || !addressForm.city.trim() || !addressForm.state || !addressForm.zip_code.trim()) {
                    setAddressError('Street address, city, state, and ZIP code are required.')
                    return
                  }
                  setIsSavingAddress(true)
                  setAddressError(null)
                  if (editingAddress) {
                    const prev = addresses
                    const updated = addresses.map(a => a.id === editingAddress.id
                      ? { ...a, ...addressForm }
                      : addressForm.is_primary ? { ...a, is_primary: false } : a)
                    setAddresses(updated)
                    const { error } = await updatePatientAddressAction(editingAddress.id, localClient.id, addressForm)
                    if (error) { setAddresses(prev); setAddressError(error) }
                    else setAddressModalOpen(false)
                  } else {
                    const { error, id } = await addPatientAddressAction(localClient.id, {
                      patient_id: localClient.id,
                      ...addressForm,
                    })
                    if (error) { setAddressError(error) }
                    else {
                      // Optimistically append the new address (server action revalidated path)
                      const newAddr: PatientAddress = {
                        id: id ?? crypto.randomUUID(),
                        patient_id: localClient.id,
                        agency_id: '',
                        ...addressForm,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      }
                      setAddresses(prev =>
                        addressForm.is_primary
                          ? [...prev.map(a => ({ ...a, is_primary: false })), newAddr]
                          : [...prev, newAddr]
                      )
                      setAddressModalOpen(false)
                    }
                  }
                  setIsSavingAddress(false)
                }}
              >
                {editingAddress ? 'Save Changes' : 'Add Address'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <UpgradePromptModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
