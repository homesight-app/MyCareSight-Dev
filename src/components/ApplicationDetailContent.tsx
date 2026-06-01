'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import * as q from '@/lib/supabase/query'
import {
  copyExpertStepsFromRequirementToApplication,
  getAllLicenseRequirements,
  getExpertStepsFromRequirement,
  getAllExpertStepsWithRequirementInfo,
  copySelectedExpertStepsFromRequirementToApplication,
  copyExpertStepsFromApplicationStepsToApplication,
  type ExpertStepWithRequirementInfo,
} from '@/app/actions/license-requirements'
import { EXPERT_STEP_PHASES, DEFAULT_EXPERT_STEP_PHASE } from '@/lib/constants'
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
  CheckSquare,
  Send,
  Users,
  User,
  Mail,
  Upload,
  X,
  Check,
  Plus,
  ChevronDown,
  Copy,
  Search,
  Lock,
  Info,
  Building2,
} from 'lucide-react'
import { closeApplication, approveApplication } from '@/app/actions/applications'
import UploadDocumentModal from './UploadDocumentModal'
import Modal from './Modal'
import ExpertStepsPanel from './ExpertStepsPanel'

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
  submitted_date: string | Date | null
  license_type_id?: string | null
  assigned_expert_id?: string | null
  company_owner_id?: string
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
  description?: string | null
  expert_review_notes?: string | null
  license_requirement_document_id?: string | null
}

interface RequirementDocument {
  id: string
  document_name: string
  document_type: string | null
  description: string | null
  is_required: boolean
}

interface RequirementTemplate {
  id: string
  template_name: string
  description: string | null
  file_url: string
  file_name: string
  created_at: string
}

// Dev Strict Mode can mount effects twice; dedupe in-flight conversation lookups per application.
const conversationLookupInFlightByApp = new Map<string, Promise<string | null>>()

async function getConversationIdByApplicationDeduped(supabase: ReturnType<typeof createClient>, applicationId: string) {
  const inFlight = conversationLookupInFlightByApp.get(applicationId)
  if (inFlight) return inFlight

  const lookupPromise = (async () => {
    const { data: existingConv } = await q.getConversationByApplicationId(supabase, applicationId)
    return existingConv?.id ?? null
  })()

  conversationLookupInFlightByApp.set(applicationId, lookupPromise)
  try {
    return await lookupPromise
  } finally {
    conversationLookupInFlightByApp.delete(applicationId)
  }
}

interface Step {
  id: string
  step_name: string
  step_order: number
  description: string | null
  is_completed?: boolean
  is_expert_step?: boolean
  created_by_expert_id?: string | null
  phase?: string | null
  instructions?: string | null
}

interface ApplicationDetailContentProps {
  application: Application
  documents: Document[]
  activeTab?: 'overview' | 'checklist' | 'documents' |  'next-steps' | 'requirements' | 'templates' | 'message' | 'expert-process'
  onTabChange?: (tab:  'next-steps' | 'documents' | 'requirements' | 'templates' | 'message' | 'expert-process') => void
  showInlineTabs?: boolean // If true, show tabs under summary blocks instead of in sidebar
  agencyName?: string | null
  ownerProfile?: { id: string; full_name: string | null; email: string | null } | null
  assignedExpertProfile?: { id: string; full_name: string | null; email: string | null } | null
}

type TabType =  'next-steps' | 'documents' | 'requirements' | 'templates' | 'message' | 'expert-process'

export default function ApplicationDetailContent({
  application,
  documents: initialDocuments,
  activeTab: externalActiveTab,
  onTabChange,
  showInlineTabs = false,
  agencyName,
  ownerProfile,
  assignedExpertProfile,
}: ApplicationDetailContentProps) {
  const [infoModalStep, setInfoModalStep] = useState<any | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>(showInlineTabs ? 'next-steps' : 'message')
  const activeTab = externalActiveTab ?? internalActiveTab
  const fromNotification = searchParams?.get('fromNotification') === 'true'
  
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)

  const handleTabChange = (tab: TabType) => {
    if (tab === 'message') setUnreadMessageCount(0)
    if (onTabChange) {
      onTabChange(tab)
    } else {
      setInternalActiveTab(tab)
    }
  }
  const [documents, setDocuments] = useState(initialDocuments)
  const [requirementDocuments, setRequirementDocuments] = useState<RequirementDocument[]>([])
  const [isLoadingRequirementDocuments, setIsLoadingRequirementDocuments] = useState(false)
  const [templates, setTemplates] = useState<RequirementTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [isLoadingSteps, setIsLoadingSteps] = useState(false)
  const [documentFilter, setDocumentFilter] = useState<'all' | 'pending' | 'drafts' | 'completed'>('all')
  const [licenseType, setLicenseType] = useState<any>(null)
  const [uploadForRequirementDoc, setUploadForRequirementDoc] = useState<RequirementDocument | null>(null)
  const [replacingAdHocDocId, setReplacingAdHocDocId] = useState<string | null>(null)
  const [isLoadingLicenseType, setIsLoadingLicenseType] = useState(false)
  const [expertProfile, setExpertProfile] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null)
  const [clientProfile, setClientProfile] = useState<{ id: string; full_name: string | null; email: string | null } | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [messageContent, setMessageContent] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [isCompletingStep, setIsCompletingStep] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedDocumentForReview, setSelectedDocumentForReview] = useState<Document | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const [expertSteps, setExpertSteps] = useState<Step[]>([])
  const [isLoadingExpertSteps, setIsLoadingExpertSteps] = useState(false)
  const [expertStepFormData, setExpertStepFormData] = useState<{ stepName: string; description: string; phase: string }>({ stepName: '', description: '', phase: DEFAULT_EXPERT_STEP_PHASE })
  const [isSubmittingExpertStep, setIsSubmittingExpertStep] = useState(false)
  const [showAddExpertStepModal, setShowAddExpertStepModal] = useState(false)
  const [addExpertStepModalTab, setAddExpertStepModalTab] = useState<'new' | 'copy' | 'browse'>('new')
  // Copy from Another License (expert steps)
  const [availableLicenseRequirements, setAvailableLicenseRequirements] = useState<Array<{ id: string; state: string; license_type: string }>>([])
  const [selectedSourceRequirementId, setSelectedSourceRequirementId] = useState('')
  const [availableExpertSteps, setAvailableExpertSteps] = useState<Step[]>([])
  const [selectedExpertStepIds, setSelectedExpertStepIds] = useState<Set<string>>(new Set())
  const [isLoadingCopyData, setIsLoadingCopyData] = useState(false)
  const [expertStepsCopyError, setExpertStepsCopyError] = useState<string | null>(null)
  // Browse All Expert Steps
  const [browseExpertStepsSearch, setBrowseExpertStepsSearch] = useState('')
  const [allBrowseExpertSteps, setAllBrowseExpertSteps] = useState<ExpertStepWithRequirementInfo[]>([])
  const [selectedBrowseExpertStepIds, setSelectedBrowseExpertStepIds] = useState<Set<string>>(new Set())
  const [isLoadingBrowseExpertSteps, setIsLoadingBrowseExpertSteps] = useState(false)
  const [browseExpertStepsError, setBrowseExpertStepsError] = useState<string | null>(null)
  // List selection and copy to another application (same as admin)
  const [selectedListExpertStepIds, setSelectedListExpertStepIds] = useState<Set<string>>(new Set())
  const [showCopyExpertStepsModal, setShowCopyExpertStepsModal] = useState(false)
  const [availableApplications, setAvailableApplications] = useState<Array<{ id: string; application_name: string; state: string }>>([])
  const [selectedTargetApplicationId, setSelectedTargetApplicationId] = useState('')
  const [isLoadingApplications, setIsLoadingApplications] = useState(false)
  const [isCopyingExpertSteps, setIsCopyingExpertSteps] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  // Unified progress — computed inline here so canClose/canApprove can use it at component init.
  // The full calculations (completedSteps, etc.) are re-declared below in the render section;
  // these early ones are for the button conditions only and use the same state sources.
  const _useTemplate = !!(application?.license_type_id && application?.state)
  const _earlyCompletedSteps = steps.filter(s => s.is_completed).length
  const _earlyCompletedExpertSteps = expertSteps.filter(s => s.is_completed).length
  const _earlyTotalDocs = _useTemplate ? requirementDocuments.length : documents.length
  const _earlyTotalAll = steps.length + expertSteps.length + _earlyTotalDocs
  const _earlyCompletedDocs = _useTemplate
    ? requirementDocuments.filter(rd => documents.some(d => d.license_requirement_document_id === rd.id && (d.status === 'approved' || d.status === 'completed'))).length
    : documents.filter(d => d.status === 'approved' || d.status === 'completed').length
  const earlyComputedProgress = _earlyTotalAll === 0 ? (application.progress_percentage ?? 0) : Math.round((_earlyCompletedSteps + _earlyCompletedExpertSteps + _earlyCompletedDocs) / _earlyTotalAll * 100)

  const canCloseApplication = currentUserRole === 'expert' && earlyComputedProgress === 100 && application.status !== 'closed'
  const canApproveApplication = currentUserRole === 'admin' && application.status === 'under_review' && earlyComputedProgress === 100

  const handleCloseApplication = async () => {
    if (!canCloseApplication || isClosing) return
    if (!confirm('Close this application? It will be marked as closed.')) return
    setIsClosing(true)
    try {
      const { error } = await closeApplication(application.id)
      if (error) {
        alert(error)
        return
      }
      router.refresh()
    } finally {
      setIsClosing(false)
    }
  }

  const handleApproveApplication = async () => {
    if (!canApproveApplication || isApproving) return
    if (!confirm('Approve this application? It will be marked as approved.')) return
    setIsApproving(true)
    try {
      const { error } = await approveApplication(application.id)
      if (error) { alert(error); return }
      router.refresh()
    } finally {
      setIsApproving(false)
    }
  }

  // Refresh documents
  const refreshDocuments = useCallback(async () => {
    if (!application.id) return
    try {
      const { data, error } = await q.getApplicationDocumentsByApplicationId(supabase, application.id)
      if (error) throw error
      if (data) {
        setDocuments(data.map((doc: any) => ({
          id: doc.id,
          document_name: doc.document_name,
          document_url: doc.document_url,
          document_type: doc.document_type,
          status: doc.status,
          created_at: doc.created_at,
          description: doc.description || null,
          expert_review_notes: doc.expert_review_notes || null,
          license_requirement_document_id: doc.license_requirement_document_id ?? null
        })))
      }
    } catch (error) {
      console.error('Error refreshing documents:', error)
    }
  }, [application.id, supabase])

  const handleReplaceAdHocDocument = async (e: React.ChangeEvent<HTMLInputElement>, doc: Document) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReplacingAdHocDocId(doc.id)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${application.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('application-documents').upload(filePath, file)
      if (uploadError) throw uploadError
      const { error: updateError } = await q.updateApplicationDocumentFile(supabase, doc.id, application.id, {
        document_url: filePath,
        document_name: doc.document_name,
        document_type: doc.document_type,
        description: doc.description ?? null,
      })
      if (updateError) {
        await supabase.storage.from('application-documents').remove([filePath])
        throw updateError
      }
      await refreshDocuments()
    } catch (err: unknown) {
      alert('Failed to replace document: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setReplacingAdHocDocId(null)
    }
  }


  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Fetch steps for the application
  const fetchSteps = useCallback(async () => {
    if (!application) return
    
    setIsLoadingSteps(true)
    try {
      // First, try to fetch application_steps (steps specific to this application)
      const { data: applicationSteps, error: appStepsError } = await q.getApplicationStepsByApplicationId(supabase, application.id)

      if (appStepsError) {
        console.error('Error fetching application steps:', appStepsError)
      }

      // If application_steps exist, separate regular steps from expert steps
      if (applicationSteps && applicationSteps.length > 0) {
        const regularSteps = applicationSteps
          .filter((step: any) => !step.is_expert_step)
          .map((step: any) => ({
            id: step.id,
            step_name: step.step_name,
            step_order: step.step_order,
            description: step.description,
            instructions: step.instructions ?? null,
            is_completed: step.is_completed,
            is_expert_step: false
          }))
        
        const expertStepsData = applicationSteps
          .filter((step: any) => step.is_expert_step)
          .map((step: any) => ({
            id: step.id,
            step_name: step.step_name,
            step_order: step.step_order,
            description: step.description,
            is_completed: step.is_completed,
            phase: step.phase ?? null,
            is_expert_step: true,
            created_by_expert_id: step.created_by_expert_id
          }))

        
        setSteps(regularSteps)
        setExpertSteps(expertStepsData)
        setIsLoadingSteps(false)
        return
      }

      // If no application_steps exist, fetch required steps from license_requirement_steps
      if (application.license_type_id) {
        const { data: licenseType, error: licenseTypeError } = await q.getLicenseTypeById(supabase, application.license_type_id)

        if (licenseTypeError || !licenseType || !licenseType.name) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        const requirementState = licenseType.state ?? application.state
        if (!requirementState) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndTypeSingle(supabase, requirementState, licenseType.name)

        if (reqError || !licenseRequirement) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        const { data: allRequirementSteps, error: stepsError } = await q.getStepsFromRequirement(supabase, licenseRequirement.id)
        const requiredSteps = (allRequirementSteps || []).filter((s: { is_expert_step?: boolean }) => !s.is_expert_step)

        if (stepsError) {
          console.error('Error fetching required steps:', stepsError)
          setSteps([])
        } else {
          setSteps(requiredSteps.map((step: any) => ({
            id: step.id,
            step_name: step.step_name,
            step_order: step.step_order,
            description: step.description,
            is_completed: false
          })))
        }
      } else {
        setSteps([])
      }
    } catch (error) {
      console.error('Error fetching steps:', error)
      setSteps([])
    } finally {
      setIsLoadingSteps(false)
    }
  }, [application, supabase])

  useEffect(() => {
    fetchSteps()
  }, [fetchSteps])

  // Fetch license requirement documents (template for Documents tab)
  // Match license_requirements by license type's (state, name), same as admin dashboard
  const fetchRequirementDocuments = useCallback(async () => {
    if (!application?.license_type_id) {
      setRequirementDocuments([])
      return
    }
    setIsLoadingRequirementDocuments(true)
    try {
      const { data: licenseTypeRow, error: licenseTypeError } = await q.getLicenseTypeById(supabase, application.license_type_id)
      if (licenseTypeError || !licenseTypeRow?.name) {
        setRequirementDocuments([])
        return
      }
      const requirementState = licenseTypeRow.state ?? application.state
      if (!requirementState) {
        setRequirementDocuments([])
        return
      }
      const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndTypeSingle(supabase, requirementState, licenseTypeRow.name)
      if (reqError || !licenseRequirement) {
        setRequirementDocuments([])
        return
      }
      const { data: reqDocs, error: docsError } = await q.getRequirementDocumentsForDisplay(supabase, licenseRequirement.id)
      if (docsError) {
        setRequirementDocuments([])
        return
      }
      setRequirementDocuments((reqDocs || []).map((d: any) => ({
        id: d.id,
        document_name: d.document_name,
        document_type: d.document_type ?? null,
        description: null,
        is_required: d.is_required ?? true
      })))
    } catch (e) {
      console.error('Error fetching requirement documents:', e)
      setRequirementDocuments([])
    } finally {
      setIsLoadingRequirementDocuments(false)
    }
  }, [application?.license_type_id, application?.state, supabase])

  useEffect(() => {
    fetchRequirementDocuments()
  }, [fetchRequirementDocuments])

  // Re-fetch requirement documents when user opens Documents tab so current application always shows template
  useEffect(() => {
    if (activeTab === 'documents' && application?.license_type_id && application?.state) {
      fetchRequirementDocuments()
    }
  }, [activeTab, application?.license_type_id, application?.state, fetchRequirementDocuments])

  // Fetch license requirement templates (admin-uploaded templates for download)
  const fetchRequirementTemplates = useCallback(async () => {
    if (!application?.license_type_id) {
      setTemplates([])
      return
    }
    setIsLoadingTemplates(true)
    try {
      const { data: licenseTypeRow, error: licenseTypeError } = await q.getLicenseTypeById(supabase, application.license_type_id)
      if (licenseTypeError || !licenseTypeRow?.name) {
        setTemplates([])
        return
      }
      const requirementState = licenseTypeRow.state ?? application.state
      if (!requirementState) {
        setTemplates([])
        return
      }
      const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndTypeSingle(supabase, requirementState, licenseTypeRow.name)
      if (reqError || !licenseRequirement) {
        setTemplates([])
        return
      }
      const { data: templateRows, error: templatesError } = await q.getRequirementTemplatesForDisplay(supabase, licenseRequirement.id)
      if (templatesError) {
        setTemplates([])
        return
      }
      setTemplates((templateRows || []).map((t: any) => ({
        id: t.id,
        template_name: t.template_name,
        description: t.description ?? null,
        file_url: t.file_url,
        file_name: t.file_name,
        created_at: t.created_at,
      })))
    } catch (e) {
      console.error('Error fetching requirement templates:', e)
      setTemplates([])
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [application?.license_type_id, application?.state, supabase])

  useEffect(() => {
    fetchRequirementTemplates()
  }, [fetchRequirementTemplates])

  useEffect(() => {
    if (activeTab === 'templates' && application?.license_type_id) {
      fetchRequirementTemplates()
    }
  }, [activeTab, application?.license_type_id, fetchRequirementTemplates])

  // Fetch expert steps separately. If application has a license type but no expert steps yet, copy from requirement (e.g. backfill for existing apps or when license type was assigned later).
  const fetchExpertSteps = useCallback(async () => {
    if (!application.id) return
    
    setIsLoadingExpertSteps(true)
    try {
      const { data: allSteps, error } = await q.getApplicationStepsByApplicationId(supabase, application.id)
      const expertStepsData = (allSteps || []).filter((s: { is_expert_step?: boolean }) => s.is_expert_step)

      if (error) {
        console.error('Error fetching expert steps:', error)
        setExpertSteps([])
        return
      }

      const steps = expertStepsData || []
      if (steps.length === 0 && application.license_type_id && application.state) {
        const { data: licenseType } = await q.getLicenseTypeById(supabase, application.license_type_id)
        if (licenseType?.name) {
          await copyExpertStepsFromRequirementToApplication(application.id, application.state, licenseType.name)
          const { data: refetched, error: refetchErr } = await q.getApplicationStepsByApplicationId(supabase, application.id)
          const refetchedExpert = (refetched || []).filter((s: { is_expert_step?: boolean }) => s.is_expert_step)
          if (!refetchErr && refetchedExpert?.length) {
            setExpertSteps(refetchedExpert.map((step: any) => ({
              id: step.id,
              step_name: step.step_name,
              step_order: step.step_order,
              description: step.description,
              is_completed: step.is_completed,
              is_expert_step: true,
              created_by_expert_id: step.created_by_expert_id,
              phase: step.phase ?? null,
            })))
            return
          }
        }
      }

      setExpertSteps(steps.map((step: any) => ({
        id: step.id,
        step_name: step.step_name,
        step_order: step.step_order,
        description: step.description,
        is_completed: step.is_completed,
        is_expert_step: true,
        created_by_expert_id: step.created_by_expert_id,
        phase: step.phase ?? null,
      })))
    } catch (error) {
      console.error('Error fetching expert steps:', error)
      setExpertSteps([])
    } finally {
      setIsLoadingExpertSteps(false)
    }
  }, [application.id, application.license_type_id, application.state, supabase])

  const refreshExpertStepsSilently = useCallback(async () => {
    if (!application.id) return
    try {
      const { data: allSteps, error } = await q.getApplicationStepsByApplicationId(supabase, application.id)
      if (error || !allSteps) return
      const expertStepsData = allSteps.filter((s: { is_expert_step?: boolean }) => s.is_expert_step)
      setExpertSteps(expertStepsData.map((step: any) => ({
        id: step.id,
        step_name: step.step_name,
        step_order: step.step_order,
        description: step.description,
        is_completed: step.is_completed,
        is_expert_step: true,
        created_by_expert_id: step.created_by_expert_id,
        phase: step.phase ?? null,
      })))
    } catch {
      // silent — optimistic update in ExpertStepsPanel already shows correct state
    }
  }, [application.id, supabase])

  // Load expert steps on mount so progress percentage is accurate immediately
  useEffect(() => {
    fetchExpertSteps()
  }, [fetchExpertSteps])

  // Re-fetch when the Expert Process tab is opened (picks up any changes made elsewhere)
  useEffect(() => {
    if (activeTab === 'expert-process') {
      fetchExpertSteps()
    }
  }, [activeTab, fetchExpertSteps])

  const openAddExpertStepModal = () => {
    setShowAddExpertStepModal(true)
    setAddExpertStepModalTab('new')
    setExpertStepFormData({ stepName: '', description: '', phase: DEFAULT_EXPERT_STEP_PHASE })
    setExpertStepsCopyError(null)
    setBrowseExpertStepsError(null)
  }

  const closeAddExpertStepModal = () => {
    setShowAddExpertStepModal(false)
    setAddExpertStepModalTab('new')
    setExpertStepFormData({ stepName: '', description: '', phase: DEFAULT_EXPERT_STEP_PHASE })
    setAvailableExpertSteps([])
    setSelectedExpertStepIds(new Set())
    setSelectedSourceRequirementId('')
    setBrowseExpertStepsSearch('')
    setAllBrowseExpertSteps([])
    setSelectedBrowseExpertStepIds(new Set())
    setExpertStepsCopyError(null)
    setBrowseExpertStepsError(null)
  }

  const loadCopyExpertStepsData = async () => {
    setSelectedSourceRequirementId('')
    setAvailableExpertSteps([])
    setSelectedExpertStepIds(new Set())
    setExpertStepsCopyError(null)
    setIsLoadingCopyData(true)
    try {
      const result = await getAllLicenseRequirements()
      if (result.error) {
        setExpertStepsCopyError(result.error)
      } else {
        setAvailableLicenseRequirements(result.data ?? [])
      }
    } catch (err) {
      setExpertStepsCopyError(err instanceof Error ? err.message : 'Failed to load license requirements')
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const handleSourceRequirementChangeForExpertSteps = async (reqId: string) => {
    setSelectedSourceRequirementId(reqId)
    setSelectedExpertStepIds(new Set())
    if (!reqId) {
      setAvailableExpertSteps([])
      return
    }
    setIsLoadingCopyData(true)
    try {
      const result = await getExpertStepsFromRequirement(reqId)
      if (result.error) {
        setExpertStepsCopyError(result.error)
        setAvailableExpertSteps([])
      } else {
        setAvailableExpertSteps(result.data ?? [])
      }
    } catch (err) {
      setExpertStepsCopyError(err instanceof Error ? err.message : 'Failed to load expert steps')
      setAvailableExpertSteps([])
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const toggleExpertStepSelection = (stepId: string) => {
    const next = new Set(selectedExpertStepIds)
    if (next.has(stepId)) next.delete(stepId)
    else next.add(stepId)
    setSelectedExpertStepIds(next)
  }

  const handleCopyExpertStepsFromRequirement = async () => {
    if (!application.id || selectedExpertStepIds.size === 0) return
    setIsSubmittingExpertStep(true)
    setExpertStepsCopyError(null)
    try {
      const result = await copySelectedExpertStepsFromRequirementToApplication(
        application.id,
        selectedSourceRequirementId,
        Array.from(selectedExpertStepIds)
      )
      if (result.error) {
        setExpertStepsCopyError(result.error)
      } else {
        closeAddExpertStepModal()
        await fetchExpertSteps()
      }
    } catch (err) {
      setExpertStepsCopyError(err instanceof Error ? err.message : 'Failed to copy expert steps')
    } finally {
      setIsSubmittingExpertStep(false)
    }
  }

  const loadBrowseExpertStepsData = async () => {
    setBrowseExpertStepsSearch('')
    setSelectedBrowseExpertStepIds(new Set())
    setBrowseExpertStepsError(null)
    setIsLoadingBrowseExpertSteps(true)
    try {
      const result = await getAllExpertStepsWithRequirementInfo(undefined)
      if (result.error) {
        setBrowseExpertStepsError(result.error)
        setAllBrowseExpertSteps([])
      } else {
        setAllBrowseExpertSteps(result.data ?? [])
      }
    } catch (err) {
      setBrowseExpertStepsError(err instanceof Error ? err.message : 'Failed to load expert steps')
      setAllBrowseExpertSteps([])
    } finally {
      setIsLoadingBrowseExpertSteps(false)
    }
  }

  const filteredBrowseExpertSteps = useMemo(() => {
    if (!browseExpertStepsSearch.trim()) return allBrowseExpertSteps
    const q = browseExpertStepsSearch.toLowerCase()
    return allBrowseExpertSteps.filter(
      (s) =>
        s.step_name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false) ||
        (s.phase?.toLowerCase().includes(q) ?? false) ||
        s.state.toLowerCase().includes(q) ||
        s.license_type.toLowerCase().includes(q)
    )
  }, [allBrowseExpertSteps, browseExpertStepsSearch])

  const toggleBrowseExpertStepSelection = (stepId: string) => {
    const next = new Set(selectedBrowseExpertStepIds)
    if (next.has(stepId)) next.delete(stepId)
    else next.add(stepId)
    setSelectedBrowseExpertStepIds(next)
  }

  const handleAddBrowseExpertSteps = async () => {
    if (!application.id || selectedBrowseExpertStepIds.size === 0) return
    setIsSubmittingExpertStep(true)
    setBrowseExpertStepsError(null)
    try {
      const result = await copyExpertStepsFromApplicationStepsToApplication(
        application.id,
        Array.from(selectedBrowseExpertStepIds)
      )
      if (result.error) {
        setBrowseExpertStepsError(result.error)
      } else {
        closeAddExpertStepModal()
        await fetchExpertSteps()
      }
    } catch (err) {
      setBrowseExpertStepsError(err instanceof Error ? err.message : 'Failed to add expert steps')
    } finally {
      setIsSubmittingExpertStep(false)
    }
  }

  const handleCopyExpertStepsToApplication = async (targetApplicationId: string) => {
    if (selectedListExpertStepIds.size === 0 || !targetApplicationId || isCopyingExpertSteps) return
    setIsCopyingExpertSteps(true)
    try {
      const stepsToCopy = expertSteps.filter((step) => selectedListExpertStepIds.has(step.id))
      if (stepsToCopy.length === 0) {
        alert('Please select at least one expert step to copy')
        setIsCopyingExpertSteps(false)
        return
      }
      const { data: existingSteps } = await q.getMaxApplicationExpertStepOrder(supabase, targetApplicationId)
      let nextOrder = existingSteps?.length ? existingSteps[0].step_order + 1 : 1
      const stepsToInsert = stepsToCopy.map((step) => ({
        application_id: targetApplicationId,
        step_name: step.step_name,
        step_order: nextOrder++,
        description: step.description ?? null,
        phase: step.phase ?? null,
        is_expert_step: true,
        is_completed: false,
        created_by_expert_id: currentUserId ?? null,
      }))
      const { error: insertError } = await q.insertApplicationStepsRows(supabase, stepsToInsert)
      if (insertError) throw insertError
      alert(`Successfully copied ${stepsToCopy.length} expert step(s)`)
      setSelectedListExpertStepIds(new Set())
    } catch (error: any) {
      console.error('Error copying expert steps:', error)
      alert('Failed to copy expert steps: ' + (error?.message || 'Unknown error'))
    } finally {
      setIsCopyingExpertSteps(false)
    }
  }

  // Handle expert step operations
  const handleAddExpertStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!application.id || !currentUserId || isSubmittingExpertStep) return
    if (!expertStepFormData.stepName.trim()) {
      alert('Please enter a step name')
      return
    }

    setIsSubmittingExpertStep(true)
    try {
      const { data: existingSteps } = await q.getMaxApplicationExpertStepOrder(supabase, application.id)
      const nextOrder = existingSteps && existingSteps.length > 0 ? existingSteps[0].step_order + 1 : 1

      const { error: insertError } = await q.insertApplicationStepRow(supabase, {
        application_id: application.id,
        step_name: expertStepFormData.stepName.trim(),
        step_order: nextOrder,
        description: expertStepFormData.description.trim() || null,
        phase: expertStepFormData.phase || null,
        is_expert_step: true,
        created_by_expert_id: currentUserId,
        is_completed: false,
      })

      if (insertError) throw insertError

      // Reset form, close modal, and refresh
      setExpertStepFormData({ stepName: '', description: '', phase: DEFAULT_EXPERT_STEP_PHASE })
      closeAddExpertStepModal()
      await fetchExpertSteps()
    } catch (error: any) {
      console.error('Error adding expert step:', error)
      alert('Failed to add expert step: ' + (error.message || 'Unknown error'))
    } finally {
      setIsSubmittingExpertStep(false)
    }
  }



  // Fetch license type data
  useEffect(() => {
    const fetchLicenseType = async () => {
      if (!application.license_type_id) return
      
      setIsLoadingLicenseType(true)
      try {
        const { data, error } = await q.getLicenseTypeByIdFull(supabase, application.license_type_id)

        if (error) throw error
        setLicenseType(data)
      } catch (error) {
        console.error('Error fetching license type:', error)
      } finally {
        setIsLoadingLicenseType(false)
      }
    }

    fetchLicenseType()
  }, [application.license_type_id, supabase])

  // Fetch expert profile (for clients)
  useEffect(() => {
    const fetchExpertProfile = async () => {
      if (!application.assigned_expert_id) {
        setExpertProfile(null)
        return
      }
      
      try {
        const { data, error } = await q.getUserProfileById(supabase, application.assigned_expert_id)

        if (error) throw error
        setExpertProfile(data)
      } catch (error) {
        console.error('Error fetching expert profile:', error)
        setExpertProfile(null)
      } 
    }

    fetchExpertProfile()
  }, [application.assigned_expert_id, supabase])

  // Fetch client profile (for experts)
  useEffect(() => {
    const fetchClientProfile = async () => {
      if (!application.company_owner_id) {
        setClientProfile(null)
        return
      }
      try {
        const { data, error } = await q.getUserProfileById(supabase, application.company_owner_id)

        if (error) throw error
        setClientProfile(data)
      } catch (error) {
        console.error('Error fetching client profile:', error)
        setClientProfile(null)
      } 
    }

    fetchClientProfile()
  }, [application.company_owner_id, supabase])

  // Get current user ID and role
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: profile } = await q.getUserProfileRoleById(supabase, user.id)
        if (profile) {
          setCurrentUserRole(profile.role)
        }
      }
    }
    getCurrentUser()
  }, [supabase])

  // Fetch or create conversation for application-based group chat
  useEffect(() => {
    const setupConversation = async () => {
      if (!application.id || !currentUserId) {
        setMessages([])
        setConversationId(null)
        return
      }

      setIsLoadingConversation(true)
      try {
        // Find or create conversation for this application
        let convId = conversationId

        if (!convId) {
          const existingConvId = await getConversationIdByApplicationDeduped(supabase, application.id)

          if (existingConvId) {
            convId = existingConvId
            setConversationId(convId)
          } else {
            // Resolve client_id if there is a company owner; null is allowed
            // for admin/expert-created applications (agency_id takes over for access control)
            const clientId = application.company_owner_id
              ? ((await q.getClientByCompanyOwnerId(supabase, application.company_owner_id)).data?.id ?? null)
              : null

            const { data: newConv, error: convError } = await q.insertConversation(supabase, {
              client_id: clientId,
              application_id: application.id,
            })

            if (convError) {
              if (convError.code === '23505') {
                const existingConvIdAfterConflict = await getConversationIdByApplicationDeduped(supabase, application.id)
                if (existingConvIdAfterConflict) {
                  convId = existingConvIdAfterConflict
                  setConversationId(convId)
                } else {
                  console.error('Error creating conversation:', convError)
                  setMessages([])
                  setConversationId(null)
                  setIsLoadingConversation(false)
                  return
                }
              } else {
                console.error('Error creating conversation:', convError)
                setMessages([])
                setConversationId(null)
                setIsLoadingConversation(false)
                return
              }
            } else {
              convId = newConv.id
              setConversationId(convId)
            }
          }
        }

        if (!convId) {
          setMessages([])
          setIsLoadingConversation(false)
          return
        }
        // Load existing messages
        const { data: messagesData, error: messagesError } = await q.getMessagesByConversationId(supabase, convId)

        if (messagesError) {
          console.error('Error loading messages:', messagesError)
          setMessages([])
        } else if (!messagesData || messagesData.length === 0) {
          setMessages([])
        } else {
          // Get sender profiles
          const senderIds = Array.from(new Set(messagesData.map(m => m.sender_id)))
          const { data: userProfiles, error: profilesError } = senderIds.length > 0 ? await q.getUserProfilesByIds(supabase, senderIds) : { data: [], error: null }

          if (profilesError) {
            console.error('Error fetching user profiles:', profilesError)
          }

          type ProfileRow = { id: string; full_name?: string | null; role?: string | null }
          const profilesList = (userProfiles ?? []) as unknown as ProfileRow[]
          const profilesById: Record<string, ProfileRow> = {}
          profilesList.forEach(p => {
            profilesById[p.id] = p
          })

          const messagesWithSenders = messagesData.map(msg => ({
            ...msg,
            sender: {
              id: msg.sender_id,
              user_profiles: profilesById[msg.sender_id] || null
            },
            is_own: msg.sender_id === currentUserId
          }))

          setMessages(messagesWithSenders)

          // Mark messages as read by adding current user ID to is_read array
          // Use RPC function to add user ID to array for all unread messages
          const unreadMessages = messagesWithSenders.filter(msg =>
            msg.sender_id !== currentUserId &&
            (!msg.is_read || !Array.isArray(msg.is_read) || !msg.is_read.includes(currentUserId))
          )

          if (activeTab !== 'message') {
            setUnreadMessageCount(unreadMessages.length)
          }

          if (unreadMessages.length > 0) {
            const ids = unreadMessages.map((m) => m.id).filter((id) => typeof id === 'string' && id.length > 0)
            if (ids.length > 0) {
              const { error: markReadErr } = await q.rpcMarkMessagesAsReadByUser(supabase, ids, currentUserId)
              if (markReadErr) console.error('Error marking messages read:', markReadErr)
            }
          }
        }
      } catch (error) {
        console.error('Error setting up conversation:', error)
        setMessages([])
        setConversationId(null)
      } finally {
        setIsLoadingConversation(false)
      }
    }

    setupConversation()
  }, [application.id, currentUserId, supabase])

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!conversationId || !currentUserId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          const newMessage = payload.new as any

          const { data: userProfile } = await q.getUserProfilesByIds(supabase, [newMessage.sender_id])
          const senderProfile = userProfile?.[0] ?? null

          const messageWithSender = {
            ...newMessage,
            sender: {
              id: newMessage.sender_id,
              user_profiles: senderProfile || null
            },
            is_own: newMessage.sender_id === currentUserId
          }

          // Add new message (avoid duplicates)
          setMessages(prevMessages => {
            const exists = prevMessages.some(m => m.id === newMessage.id)
            if (exists) return prevMessages

            const updated = [...prevMessages, messageWithSender]
            return updated.sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          })

          // Increment badge when message from another user arrives and Messages tab is not active
          if (newMessage.sender_id !== currentUserId && activeTab !== 'message') {
            setUnreadMessageCount(prev => prev + 1)
          }

          // Scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, supabase])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // If coming from notification, scroll immediately after a short delay to ensure DOM is ready
      const delay = fromNotification ? 500 : 0
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: fromNotification ? 'auto' : 'smooth' })
      }, delay)
    }
  }, [messages, fromNotification])


  const handleSendMessage = async () => {
    if (!messageContent.trim() || isSendingMessage || !currentUserId || !application.id) return

    setIsSendingMessage(true)
    try {
      let convId = conversationId

      // If no conversation exists, create one

      if (!convId) {
        const existingConvId = await getConversationIdByApplicationDeduped(supabase, application.id)

        if (existingConvId) {
          convId = existingConvId
          setConversationId(convId)
        } else {
          const clientId = application.company_owner_id
            ? ((await q.getClientByCompanyOwnerId(supabase, application.company_owner_id)).data?.id ?? null)
            : null

          const { data: newConv, error: convError } = await q.insertConversation(supabase, {
            client_id: clientId,
            application_id: application.id,
          })

          if (convError) {
            if (convError.code === '23505') {
              const existingConvIdAfterConflict = await getConversationIdByApplicationDeduped(supabase, application.id)
              if (existingConvIdAfterConflict) {
                convId = existingConvIdAfterConflict
                setConversationId(convId)
              } else {
                throw new Error('Failed to create conversation. Please try again.')
              }
            } else {
              throw new Error('Failed to create conversation. Please try again.')
            }
          } else {
            convId = newConv!.id
            setConversationId(convId)
          }
        }
      }

      if (!convId || !currentUserId) {
        throw new Error('Conversation or user not available.')
      }
      const { data: currentUserProfileRows } = await q.getUserProfilesByIds(supabase, [currentUserId])
      const currentUserProfile = currentUserProfileRows?.[0] ?? null

      const { data: newMessage, error: messageError } = await q.insertMessage(supabase, {
        conversation_id: convId,
        sender_id: currentUserId,
        content: messageContent.trim(),
      })

      if (messageError) throw messageError

      await q.updateConversationLastMessageAt(supabase, convId)

      // Add message optimistically (real-time subscription will also catch it)
      if (newMessage) {
        const optimisticMessage = {
          ...newMessage,
          is_read: Array.isArray(newMessage.is_read) ? newMessage.is_read : [currentUserId], // Ensure array format
          sender: {
            id: currentUserId,
            user_profiles: currentUserProfile || null
          },
          is_own: true
        }
        setMessages(prev => [...prev, optimisticMessage])
      }

      // Clear message
      setMessageContent('')
    } catch (error: any) {
      console.error('Error sending message:', error)
      alert(error.message || 'Failed to send message. Please try again.')
    } finally {
      setIsSendingMessage(false)
    }
  }

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${month} ${day}, ${time}`
  }

  const getSenderName = (message: any) => {
    // Use sender's actual profile information
    if (message.sender?.user_profiles?.full_name) {
      return message.sender.user_profiles.full_name
    }
    // Fallback to role-based names if no full name
    if (message.sender?.user_profiles?.role === 'expert') {
      return 'Expert'
    }
    if (message.sender?.user_profiles?.role === 'company_owner') {
      return 'Business Owner'
    }
    if (message.sender?.user_profiles?.role === 'admin') {
      return 'Admin'
    }
    return 'User'
  }

  const getSenderRole = (message: any) => {
    // Determine role based on sender's actual role from user_profiles
    const senderRole = message.sender?.user_profiles?.role
    
    if (senderRole === 'expert') {
      return 'Expert'
    }
    if (senderRole === 'company_owner') {
      return 'Owner'
    }
    if (senderRole === 'admin') {
      return 'Admin'
    }
    // Default fallback - try to infer from application context
    // If sender is the company owner, they're an Owner
    if (message.sender?.id === application.company_owner_id) {
      return 'Owner'
    }
    // If sender is the assigned expert, they're an Expert
    if (message.sender?.id === application.assigned_expert_id) {
      return 'Expert'
    }
    // Last resort default
    return 'User'
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (name: string, role: string) => {
    // Generate consistent color based on name
    const colors = [
      'bg-purple-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-red-500'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const getRoleTagColor = (role: string) => {
    if (role === 'Expert') {
      return 'bg-purple-100 text-purple-700 border-purple-200'
    }
    if (role === 'Admin') {
      return 'bg-green-100 text-green-700 border-green-200'
    }
    if (role === 'Owner') {
      return 'bg-blue-100 text-blue-700 border-blue-200'
    }
    return 'bg-gray-100 text-gray-700 border-gray-200'
  }

  // Handle step completion
  const handleCompleteStep = async (isCompleted: boolean, stepId: string) => {
    if (!stepId || !application.id || isCompletingStep) return

    setIsCompletingStep(true)
    try {
      // Find the selected step
      const selectedStep = steps.find(s => s.id === stepId)
      if (!selectedStep) {
        throw new Error('Step not found')
      }

      const { data: existingAppStep } = await q.getApplicationStepByAppAndId(supabase, application.id, stepId)

      if (existingAppStep) {
        const { error: updateError } = await q.updateApplicationStepComplete(
          supabase,
          stepId,
          application.id,
          isCompleted,
          new Date().toISOString()
        )
        if (updateError) throw updateError
      } else {
        const { data: existingByName } = await q.getApplicationStepByAppNameOrder(
          supabase,
          application.id,
          selectedStep.step_name,
          selectedStep.step_order
        )

        if (existingByName) {
          const { error: updateError } = await q.updateApplicationStepComplete(
            supabase,
            existingByName.id,
            application.id,
            isCompleted,
            isCompleted ? new Date().toISOString() : null
          )
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await q.insertApplicationStepRow(supabase, {
            application_id: application.id,
            step_name: selectedStep.step_name,
            step_order: selectedStep.step_order,
            description: selectedStep.description,
            is_completed: isCompleted,
            completed_at: isCompleted ? new Date().toISOString() : null,
            is_expert_step: selectedStep.is_expert_step,
            created_by_expert_id: selectedStep.created_by_expert_id,
          })
          if (insertError) throw insertError
        }
      }

      // Optimistic update: update local state so UI updates without full refetch (avoids page "refresh" / loading spinner)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, is_completed: isCompleted } : s
        )
      )
    } catch (error: any) {
      console.error('Error completing step:', error)
      alert('Failed to complete step: ' + (error.message || 'Unknown error'))
    } finally {
      setIsCompletingStep(false)
    }
  }

  // Calculate statistics
  const completedSteps = steps.filter(s => s.is_completed).length
  const totalSteps = steps.length
  const completedExpertSteps = expertSteps.filter(s => s.is_completed).length
  const totalExpertSteps = expertSteps.length
  const pendingTasks = totalSteps - completedSteps
  // When we have requirement documents (template), count completed as requirement slots with an approved upload
  // Use template for Documents whenever current application has a license (state + license_type_id)
  const useTemplateForDocuments = !!(application?.license_type_id && application?.state)
  const totalDocuments = useTemplateForDocuments ? requirementDocuments.length : documents.length
  const completedDocuments = useTemplateForDocuments
    ? requirementDocuments.filter(rd => documents.some(d => d.license_requirement_document_id === rd.id && (d.status === 'approved' || d.status === 'completed'))).length
    : documents.filter(d => d.status === 'approved' || d.status === 'completed').length

  const computedProgress = earlyComputedProgress

  // For template view: each row is a requirement doc; linked upload may exist. Filter rows by linked doc status.
  const getLinkedDocument = (requirementDocId: string) =>
    documents.find(d => d.license_requirement_document_id === requirementDocId)
  const filteredRequirementDocuments = requirementDocuments.filter(rd => {
    const linked = getLinkedDocument(rd.id)
    if (documentFilter === 'all') return true
    if (documentFilter === 'completed') return linked && (linked.status === 'approved' || linked.status === 'completed')
    if (documentFilter === 'pending') return linked && linked.status === 'pending'
    // Drafts: show requirement slots with no upload yet OR with a draft/rejected upload
    if (documentFilter === 'drafts') return !linked || linked.status === 'draft' || linked.status === 'rejected'
    return true
  })

  // Filter documents (legacy list when no requirement template) based on selected filter
  const filteredDocuments = documents.filter(doc => {
    if (documentFilter === 'all') return true
    if (documentFilter === 'completed') return doc.status === 'approved' || doc.status === 'completed'
    if (documentFilter === 'pending') return doc.status === 'pending'
    if (documentFilter === 'drafts') return doc.status === 'draft' || doc.status === 'rejected'
    return true
  })

  // Ad-hoc documents: uploaded by expert/admin without linking to a requirement slot
  const filteredAdHocDocuments = documents
    .filter(doc => !doc.license_requirement_document_id)
    .filter(doc => {
      if (documentFilter === 'all') return true
      if (documentFilter === 'completed') return doc.status === 'approved' || doc.status === 'completed'
      if (documentFilter === 'pending') return doc.status === 'pending'
      if (documentFilter === 'drafts') return doc.status === 'draft' || doc.status === 'rejected'
      return true
    })

  const handleDownload = async (documentPath: string, documentName: string) => {
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documentPath)
      if (!signedUrl) throw new Error('Could not generate download link')
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = documentName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Failed to download document. Please try again.')
    }
  }

  const handleDownloadAll = () => {
    documents.forEach(doc => {
      setTimeout(() => handleDownload(doc.document_url, doc.document_name), 100)
    })
  }

  // UI status: draft = just uploaded; pending = submitted for expert review; completed = expert approved. Expert reject sets back to draft.
  const getDocumentStatus = (status: string) => {
    if (status === 'approved' || status === 'completed') return 'completed'
    if (status === 'pending') return 'pending'
    if (status === 'rejected') return 'draft' // legacy or expert rejected -> show as draft so owner can resubmit
    return status === 'draft' ? 'draft' : 'draft'
  }

  // Owner submits document for expert review (draft -> pending); notifies assigned expert
  const [submittingDocumentId, setSubmittingDocumentId] = useState<string | null>(null)
  const handleSubmitDocument = async (documentId: string) => {
    if (!application?.id || submittingDocumentId) return
    setSubmittingDocumentId(documentId)
    try {
      const { data: app } = await q.getApplicationAssignedExpertId(supabase, application.id)
      if (!app?.assigned_expert_id) {
        alert('An expert must be assigned to this application before you can submit documents. Please contact support.')
        return
      }
      const { error } = await q.updateApplicationDocumentStatus(supabase, documentId, application.id, 'pending')

      if (error) throw error
      await refreshDocuments()
    } catch (error: any) {
      console.error('Error submitting document:', error)
      alert('Failed to submit document: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmittingDocumentId(null)
    }
  }

  // Handle document approval/rejection by expert: approve -> completed (approved); reject -> back to draft
  const handleDocumentReview = async (action: 'approve' | 'reject') => {
    if (!selectedDocumentForReview || !currentUserId || isReviewing) return

    setIsReviewing(true)
    try {
      const { error } = await q.updateApplicationDocumentReview(supabase, selectedDocumentForReview.id, {
        status: action === 'approve' ? 'approved' : 'draft',
        expert_review_notes: reviewNotes.trim() || null,
      })

      if (error) throw error

      // Refresh documents
      await refreshDocuments()
      
      // Close modal and reset
      setSelectedDocumentForReview(null)
      setReviewNotes('')
    } catch (error: any) {
      console.error('Error reviewing document:', error)
      alert('Failed to review document: ' + (error.message || 'Unknown error'))
    } finally {
      setIsReviewing(false)
    }
  }


  // Derive display names for the compact header
  const headerClientName =
    ownerProfile?.full_name ||
    (currentUserRole === 'expert' ? clientProfile?.full_name : null) ||
    null
  const headerExpertName =
    assignedExpertProfile?.full_name ||
    (currentUserRole !== 'expert' ? expertProfile?.full_name : null) ||
    null

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'in_progress':    return { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'In Progress' }
      case 'under_review':   return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Under Review' }
      case 'needs_revision': return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision' }
      case 'approved':       return { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Approved' }
      case 'rejected':       return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected' }
      case 'closed':         return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Closed' }
      default:               return { bg: 'bg-gray-100',   text: 'text-gray-600',   label: status }
    }
  }
  const statusStyles = getStatusStyles(application.status)
  const pct = computedProgress

  // Compact header - always shown
  const summaryBlocks = (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: name + state + status badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 truncate">{application.application_name}</h1>
              {application.state && (
                <span className="text-gray-400 text-sm hidden sm:inline">·</span>
              )}
              {application.state && (
                <span className="text-sm text-gray-500">{application.state}</span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles.bg} ${statusStyles.text}`}>
                {statusStyles.label}
              </span>
            </div>
            {/* Client / Expert meta row */}
            {(headerClientName || headerExpertName) && (
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {headerClientName && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-400 text-xs">Client:</span>
                    <span className="font-medium text-gray-700">{headerClientName}</span>
                  </span>
                )}
                {headerClientName && headerExpertName && (
                  <span className="text-gray-300 text-xs">|</span>
                )}
                {headerExpertName && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-400 text-xs">Expert:</span>
                    <span className="font-medium text-gray-700">{headerExpertName}</span>
                  </span>
                )}
              </div>
            )}
            {/* State info — processing time, fee, renewal */}
            {licenseType && (
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {licenseType.processing_time_display && (
                  <span className="text-xs text-gray-500">⏱ {licenseType.processing_time_display}</span>
                )}
                {licenseType.cost_display && (
                  <span className="text-xs text-gray-500">💲 {licenseType.cost_display}</span>
                )}
                {licenseType.renewal_period_display && (
                  <span className="text-xs text-gray-500">🔄 Renewal: {licenseType.renewal_period_display}</span>
                )}
              </div>
            )}
          </div>

          {/* Right: progress + action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 w-9 text-right">{pct}%</span>
            </div>
            {canApproveApplication && (
              <button
                type="button"
                onClick={handleApproveApplication}
                disabled={isApproving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
            )}
            {canCloseApplication && (
              <button
                type="button"
                onClick={handleCloseApplication}
                disabled={isClosing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Revision reason alert */}
      {application.status === 'needs_revision' && (application as any).revision_reason && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-orange-800">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-orange-500" />
          <span><span className="font-semibold">Revision needed: </span>{(application as any).revision_reason}</span>
        </div>
      )}
    </>
  )

  // Tab badge counts
  const incompleteStepsCount = steps.filter(s => !s.is_completed).length
  const incompleteExpertStepsCount = expertSteps.filter(s => !s.is_completed).length
  const incompleteDocsCount = documents.filter(d => d.status !== 'approved' && d.status !== 'completed').length

  // Tab navigation UI
  const tabNavigation = showInlineTabs ? (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 -mt-2">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4 px-6 overflow-x-auto" aria-label="Tabs">
          {[
            { id: 'next-steps',     label: 'Next Steps',    badge: incompleteStepsCount },
            { id: 'documents',      label: 'Documents',     badge: incompleteDocsCount },
            { id: 'templates',      label: 'Templates',     badge: 0 },
            { id: 'message',        label: 'Messages',      badge: unreadMessageCount },
            ...(currentUserRole === 'expert' || currentUserRole === 'admin'
              ? [{ id: 'expert-process', label: 'Expert Process', badge: incompleteExpertStepsCount }]
              : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as TabType)}
              className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-semibold leading-none">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {/* Summary Blocks - Always visible */}
      {summaryBlocks}

      {/* Tab Navigation - Only when showInlineTabs is true */}
      {tabNavigation}

      {/* Tab Content */}
      {activeTab === 'overview' && (
      <div className="space-y-6">
              {/* Next Steps and Documents */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Next Steps */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Next Steps</h2>
                    <button className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      View All
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  {isLoadingSteps ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : steps.filter(s => !s.is_completed).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">All steps completed!</p>
                </div>
                  ) : (
                    <div className="space-y-3">
                      {steps
                        .filter(s => !s.is_completed)
                        .slice(0, 3)
                        .map((step) => (
                          <div key={step.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                            <div className="w-5 h-5 border-2 border-gray-300 rounded-full mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 mb-1">{step.step_name}</div>
                              {step.description && (
                                <div className="text-sm text-gray-600 mb-2">{step.description}</div>
                              )}
                              <div className="flex gap-2">
                                <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                                  Licensing
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  <button className="w-full mt-4 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium">
                    Continue Checklist
                  </button>
              </div>

                {/* Documents */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                    <button className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      View All
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {documents.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <p className="text-sm">No documents yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents.slice(0, 2).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="w-5 h-5 text-gray-400" />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 text-sm">{doc.document_name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {doc.document_type || 'Document'}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            completed
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4">
                    <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
                      Generate Docs
                    </button>
                    <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Packet
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Actions and State-Specific Requirements */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Actions */}
                

                {/* State-Specific Requirements */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">State-Specific Requirements</h2>
                  {isLoadingLicenseType ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : licenseType ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Average Processing Time</span>
                        <span className="font-semibold text-gray-900">{licenseType.processing_time_display || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-sm text-gray-600">Application Fee</span>
                        <span className="font-semibold text-gray-900">{licenseType.cost_display || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-gray-600">Renewal Period</span>
                        <span className="font-semibold text-gray-900">{licenseType.renewal_period_display || 'N/A'}</span>
                      </div>
                      <a 
                        href="#" 
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium mt-4"
                      >
                        Learn more about {application.state} requirements
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No license type information available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Application Messages */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Application Messages</h2>
                  <p className="text-sm text-gray-600">Communicate with your team about this application</p>
                </div>
                <div className="p-6">
                  {/* Messages List */}
                  <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                    {isLoadingConversation ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs mt-1">Start a conversation with your assigned expert</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((message) => {
                          const senderName = getSenderName(message)
                          const senderRole = getSenderRole(message)
                          const initials = getInitials(senderName)
                          const roleTagColor = getRoleTagColor(senderRole)
                          const avatarColor = getAvatarColor(senderName, senderRole)
                          const isOwnMessage = message.is_own
                          
                          return (
                            <div
                              key={message.id}
                              className={`flex items-start gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                            >
                              {/* Avatar */}
                              <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                                {initials}
                              </div>
                              
                              {/* Message Content */}
                              <div className={`flex-1 min-w-0 ${isOwnMessage ? 'flex flex-col items-end' : ''}`}>
                                <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                                  <span className="text-sm font-semibold text-gray-900">
                                    {senderName}
                                  </span>
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleTagColor}`}>
                                    {senderRole}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {formatMessageTime(message.created_at)}
                                  </span>
                                </div>
                                <div className={`rounded-lg p-3 ${
                                  isOwnMessage 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-white border border-gray-200'
                                }`}>
                                  <p className={`text-sm whitespace-pre-wrap ${
                                    isOwnMessage ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {message.content}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Message Input */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex gap-3">
                      <textarea
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        placeholder="Type your message..."
                        rows={2}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!messageContent.trim() || isSendingMessage || !conversationId}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        {isSendingMessage ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Press Enter to send, Shift+Enter for new line
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

      {activeTab === 'checklist' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                <CheckSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Checklist</h2>
                <p className="text-gray-600">Checklist content will be displayed here</p>
              </div>
            </div>
          )}

      {activeTab === 'documents' && (
            <div className="space-y-6">

              {/* Documents section with filter select */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                  <div className="flex items-center gap-3">
                    {(currentUserRole === 'expert' || currentUserRole === 'admin') && (
                      <button
                        onClick={() => { setUploadForRequirementDoc(null); setIsUploadModalOpen(true) }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Document
                      </button>
                    )}
                    <div className="relative flex items-center">
                      <select
                        value={documentFilter}
                        onChange={(e) => setDocumentFilter(e.target.value as typeof documentFilter)}
                        className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer min-w-[140px]"
                      >
                        <option value="all">All</option>
                        <option value="drafts">Drafts</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Documents List: template (license requirement documents) for current application when it has a license */}
                <div className="p-6">
                  {isLoadingRequirementDocuments ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                    </div>
                  ) : useTemplateForDocuments ? (
                    filteredRequirementDocuments.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>
                          {requirementDocuments.length === 0
                            ? 'No required documents have been defined for this license type yet.'
                            : 'No documents match the current filter'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredRequirementDocuments.map((reqDoc) => {
                          const linked = getLinkedDocument(reqDoc.id)
                          const status = linked ? getDocumentStatus(linked.status) : 'draft'
                          const isExpert = currentUserRole === 'expert'
                          const isPendingReview = linked?.status === 'pending' // submitted, expert can review
                          const canOwnerSubmit = linked && (linked.status === 'draft' || linked.status === 'rejected')
                          const displayName = linked?.document_name ?? reqDoc.document_name
                          const categoryLabel = reqDoc.document_type || reqDoc.document_name.split(/[\s_]+/)[0] || 'Document'
                          return (
                            <div
                              key={reqDoc.id}
                              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1">
                                  <FileText className="w-6 h-6 text-gray-400 mt-1 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900 mb-1">{displayName}</div>
                                    <div className="text-sm text-gray-500 mb-2">{categoryLabel}</div>
                                    {linked && (
                                      <>
                                        {linked.description && (
                                          <div className="text-sm text-gray-600 mb-1">{linked.description}</div>
                                        )}
                                        <div className="text-sm text-gray-500">
                                          {linked.document_type || 'Document'} • Uploaded {formatDate(linked.created_at)}
                                        </div>
                                        {linked.expert_review_notes && (
                                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
                                            <span className="font-medium">Expert Review: </span>
                                            {linked.expert_review_notes}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                    status === 'completed'
                                      ? 'bg-green-100 text-green-700'
                                      : status === 'pending'
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {status}
                                  </span>
                                  {(currentUserRole === 'company_owner' || currentUserRole === 'expert' || currentUserRole === 'admin') && (
                                    <button
                                      onClick={() => {
                                        setUploadForRequirementDoc(reqDoc)
                                        setIsUploadModalOpen(true)
                                      }}
                                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                                    >
                                      <Upload className="w-4 h-4" />
                                      Upload
                                    </button>
                                  )}
                                  {currentUserRole === 'company_owner' && canOwnerSubmit && (
                                    <button
                                      onClick={() => handleSubmitDocument(linked.id)}
                                      disabled={!!submittingDocumentId}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                    >
                                      {submittingDocumentId === linked.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : null}
                                      Submit
                                    </button>
                                  )}
                                  {linked && (
                                    <button
                                      onClick={() => handleDownload(linked.document_url, linked.document_name)}
                                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                                    >
                                      <Download className="w-4 h-4" />
                                      Download
                                    </button>
                                  )}
                                  {isExpert && linked && isPendingReview && (
                                    <button
                                      onClick={() => {
                                        setSelectedDocumentForReview(linked)
                                        setReviewNotes('')
                                      }}
                                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                                    >
                                      <Check className="w-4 h-4" />
                                      Review
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {/* Additional Documents: ad-hoc uploads not linked to a requirement slot */}
                        {(currentUserRole === 'expert' || currentUserRole === 'admin') && filteredAdHocDocuments.length > 0 && (
                          <div className="mt-6 pt-6 border-t border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Documents</h3>
                            <div className="space-y-3">
                              {filteredAdHocDocuments.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1">
                                      <FileText className="w-6 h-6 text-gray-400 mt-1 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 mb-1">{doc.document_name}</div>
                                        <div className="text-sm text-gray-500">
                                          {doc.document_type || 'Document'} • Uploaded {formatDate(doc.created_at)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                        completed
                                      </span>
                                      <input
                                        type="file"
                                        id={`replace-adhoc-${doc.id}`}
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                        onChange={(e) => handleReplaceAdHocDocument(e, doc)}
                                      />
                                      <label
                                        htmlFor={`replace-adhoc-${doc.id}`}
                                        className={`px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2 cursor-pointer ${replacingAdHocDocId === doc.id ? 'opacity-50 pointer-events-none' : ''}`}
                                      >
                                        {replacingAdHocDocId === doc.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Upload className="w-4 h-4" />
                                        )}
                                        Upload
                                      </label>
                                      <button
                                        onClick={() => handleDownload(doc.document_url, doc.document_name)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                                      >
                                        <Download className="w-4 h-4" />
                                        Download
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    filteredDocuments.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>No documents found</p>
                      </div>
                    ) : (
                    <div className="space-y-4">
                      {filteredDocuments.map((doc) => {
                        const status = getDocumentStatus(doc.status)
                        const isExpert = currentUserRole === 'expert'
                        const isPendingReview = doc.status === 'pending'
                        const canOwnerSubmit = doc.status === 'draft' || doc.status === 'rejected'
                        return (
                          <div
                            key={doc.id}
                            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4 flex-1">
                                <FileText className="w-6 h-6 text-gray-400 mt-1" />
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900 mb-1">{doc.document_name}</div>
                                  {/* {doc.description && (
                                    <div className="text-sm text-gray-600 mb-2">{doc.description}</div>
                                  )} */}
                                  <div className="text-sm text-gray-500">
                                    {doc.document_type || 'Document'} • Uploaded {formatDate(doc.created_at)}
                                  </div>
                                  {doc.expert_review_notes && (
                                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
                                      <span className="font-medium">Expert Review: </span>
                                      {doc.expert_review_notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                  status === 'completed'
                                    ? 'bg-green-100 text-green-700'
                                    : status === 'pending'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {status}
                                </span>
                                {currentUserRole === 'company_owner' && canOwnerSubmit && (
                                  <button
                                    onClick={() => handleSubmitDocument(doc.id)}
                                    disabled={!!submittingDocumentId}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                  >
                                    {submittingDocumentId === doc.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : null}
                                    Submit
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDownload(doc.document_url, doc.document_name)}
                                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                  <Download className="w-4 h-4" />
                                  Download
                                </button>
                                {isExpert && isPendingReview && (
                                  <button
                                    onClick={() => {
                                      setSelectedDocumentForReview(doc)
                                      setReviewNotes('')
                                    }}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                                  >
                                    <Check className="w-4 h-4" />
                                    Review
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    )
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleDownloadAll}
                  className="flex-1 px-6 py-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download All Documents
                </button>
                {/* <button className="flex-1 px-6 py-4 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5" />
                  Generate Submission Packet
                </button> */}
              </div>
            </div>
          )}

      {/* New tabs for inline display */}
      {activeTab === 'next-steps' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Next Steps</h2>
            </div>
            {isLoadingSteps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No steps found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step) => {
                  const isCompleted = step.is_completed
                  const isSelected = selectedStepId === step.id
                  return (
                    <div 
                      key={step.id} 
                      onClick={() => {
                        if (!isCompleted) {
                          handleCompleteStep(true, step.id)
                        } else {
                          handleCompleteStep(false, step.id)
                        }
                      }}
                      className={`flex items-start gap-3 p-3 border rounded-lg transition-all ${
                        isCompleted
                          ? 'bg-green-50 border-green-200 cursor-pointer'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <div className={`w-5 h-5 border-2 rounded-full ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className='flex items-center'>
                          <div className="font-medium text-gray-900 mb-1">{step.step_name}</div>
                          <div className="relative group ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoModalStep(step)
                              }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setInfoModalStep(step)
                                }
                              }}
                              className="inline-flex items-center justify-center p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                              aria-label={`View instructions for ${step.step_name}`}
                            >
                              <Info className="w-5 h-5 text-blue-400 cursor-pointer" />
                            </button>

                            <div
                              role="tooltip"
                              className="absolute z-50 -top-10 left-1/2 transform -translate-x-1/2 w-64 bg-gray-900 text-white text-sm rounded py-2 px-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all"
                            >
                              {step.description || 'View step instruction'}
                            </div>
                          </div>
                        </div>
                        {/* {step.description && (
                            <div className="text-sm text-gray-600 mb-2">{step.description}</div>
                        )} */}
                        <div className="flex gap-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                            Licensing
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        
        </div>
      )}


      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Document Templates</h2>
            <p className="text-sm text-gray-600 mb-4">
              Download templates uploaded by the admin for this license type. Use these to complete your application documents.
            </p>
            {!application?.license_type_id ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No license type assigned yet. Templates will appear here once your application has a license type.</p>
              </div>
            ) : isLoadingTemplates ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No templates have been uploaded for this license type yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900">{tpl.template_name}</h4>
                      {tpl.description && (
                        <p className="text-sm text-gray-600 mt-0.5">{tpl.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">{tpl.file_name}</p>
                    </div>
                    <a
                      href={tpl.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={tpl.file_name}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'expert-process' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Expert Process Steps</h2>
              {(currentUserRole === 'expert' || currentUserRole === 'admin') && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openAddExpertStepModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Step
                  </button>
                  {selectedListExpertStepIds.size > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        setIsLoadingApplications(true)
                        setShowCopyExpertStepsModal(true)
                        const { data: allApplications } = await q.getApplicationsListForDropdown(supabase, application.id)
                        if (allApplications) setAvailableApplications(allApplications)
                        setIsLoadingApplications(false)
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Selected ({selectedListExpertStepIds.size})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Add Expert Step modal with 3 tabs: New, Copy from Another License, Browse All Steps */}
            {(currentUserRole === 'expert' || currentUserRole === 'admin') && (
              <Modal
                isOpen={showAddExpertStepModal}
                onClose={closeAddExpertStepModal}
                title="Add Expert Step"
                size="xl"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setAddExpertStepModalTab('new')}
                      className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                        addExpertStepModalTab === 'new'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      New
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddExpertStepModalTab('copy')
                        if (availableLicenseRequirements.length === 0) loadCopyExpertStepsData()
                      }}
                      className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                        addExpertStepModalTab === 'copy'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Copy className="w-4 h-4" />
                      Copy from Another License
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddExpertStepModalTab('browse')
                        if (allBrowseExpertSteps.length === 0 && !isLoadingBrowseExpertSteps) loadBrowseExpertStepsData()
                      }}
                      className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                        addExpertStepModalTab === 'browse'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Search className="w-4 h-4" />
                      Browse All Steps
                    </button>
                  </div>

                  {addExpertStepModalTab === 'new' && (
                    <div className="py-2">
                      <h4 className="text-base font-semibold text-gray-900 mb-4">Create New Expert Step</h4>
                      <form onSubmit={handleAddExpertStep} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                          <select
                            value={expertStepFormData.phase}
                            onChange={(e) => setExpertStepFormData({ ...expertStepFormData, phase: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {EXPERT_STEP_PHASES.map((p) => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Step Title</label>
                          <input
                            type="text"
                            value={expertStepFormData.stepName}
                            onChange={(e) => setExpertStepFormData({ ...expertStepFormData, stepName: e.target.value })}
                            placeholder="e.g., Initial Client Consultation"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={expertStepFormData.description}
                            onChange={(e) => setExpertStepFormData({ ...expertStepFormData, description: e.target.value })}
                            placeholder="Detailed description of this step"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={isSubmittingExpertStep}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isSubmittingExpertStep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Save Step
                          </button>
                          <button
                            type="button"
                            onClick={closeAddExpertStepModal}
                            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {addExpertStepModalTab === 'copy' && (
                    <div className="py-2 space-y-4">
                      <h4 className="text-base font-semibold text-gray-900">Select License Type to Copy From</h4>
                      <select
                        value={selectedSourceRequirementId}
                        onChange={(e) => handleSourceRequirementChangeForExpertSteps(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isLoadingCopyData}
                      >
                        <option value="">Select a license type...</option>
                        {availableLicenseRequirements.map((req) => (
                          <option key={req.id} value={req.id}>
                            {req.state} - {req.license_type}
                          </option>
                        ))}
                      </select>
                      {expertStepsCopyError && (
                        <p className="text-sm text-red-600">{expertStepsCopyError}</p>
                      )}
                      {selectedSourceRequirementId && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Expert Steps to Copy ({selectedExpertStepIds.size} selected)
                          </label>
                          <div className="border border-gray-300 rounded-lg max-h-[300px] overflow-y-auto bg-white">
                            {isLoadingCopyData ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                              </div>
                            ) : availableExpertSteps.length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                <p>No expert steps available for this license type</p>
                              </div>
                            ) : (
                              <div className="divide-y divide-gray-200">
                                {availableExpertSteps.map((step) => (
                                  <label
                                    key={step.id}
                                    className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedExpertStepIds.has(step.id)}
                                      onChange={() => toggleExpertStepSelection(step.id)}
                                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-gray-900">
                                        {step.step_order}. {step.step_name}
                                      </span>
                                      {step.phase && (
                                        <span className="ml-2 text-xs text-gray-500">({step.phase})</span>
                                      )}
                                      {step.description && (
                                        <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                                      )}
                                    </div>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-3 pt-2 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={handleCopyExpertStepsFromRequirement}
                          disabled={isSubmittingExpertStep || selectedExpertStepIds.size === 0 || isLoadingCopyData}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Copy className="w-4 h-4" />
                          Copy {selectedExpertStepIds.size} {selectedExpertStepIds.size === 1 ? 'Step' : 'Steps'}
                        </button>
                        <button
                          type="button"
                          onClick={closeAddExpertStepModal}
                          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {addExpertStepModalTab === 'browse' && (
                    <div className="py-2 flex flex-col gap-4 max-h-[60vh]">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Search Expert Steps</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={browseExpertStepsSearch}
                            onChange={(e) => setBrowseExpertStepsSearch(e.target.value)}
                            placeholder="Search by title, description, phase, state, or license type..."
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        Select Expert Steps to Add ({selectedBrowseExpertStepIds.size} selected)
                      </p>
                      {browseExpertStepsError && (
                        <p className="text-sm text-red-600">{browseExpertStepsError}</p>
                      )}
                      <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50">
                        {isLoadingBrowseExpertSteps ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                          </div>
                        ) : filteredBrowseExpertSteps.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                            <p className="text-sm">No expert steps found</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200 p-2">
                            {filteredBrowseExpertSteps.map((step) => (
                              <label
                                key={step.id}
                                className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer rounded-lg"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedBrowseExpertStepIds.has(step.id)}
                                  onChange={() => toggleBrowseExpertStepSelection(step.id)}
                                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-gray-900">{step.step_name}</div>
                                  {step.description && (
                                    <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                                  )}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {step.phase && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-xs text-blue-700">
                                        {step.phase}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                      {step.state}
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                      {step.license_type}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3 pt-2 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={handleAddBrowseExpertSteps}
                          disabled={isSubmittingExpertStep || selectedBrowseExpertStepIds.size === 0 || isLoadingBrowseExpertSteps}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Copy className="w-4 h-4" />
                          Copy {selectedBrowseExpertStepIds.size} {selectedBrowseExpertStepIds.size === 1 ? 'Step' : 'Steps'}
                        </button>
                        <button
                          type="button"
                          onClick={closeAddExpertStepModal}
                          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Modal>
            )}

            {isLoadingExpertSteps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : (
              <ExpertStepsPanel
                applicationId={application.id}
                expertSteps={expertSteps}
                canToggle={currentUserRole === 'expert' || currentUserRole === 'admin'}
                onStepsChanged={refreshExpertStepsSilently}
              />
            )}

            {/* Copy Expert Steps to Another Application modal */}
            {(currentUserRole === 'expert' || currentUserRole === 'admin') && (
              <Modal
                isOpen={showCopyExpertStepsModal}
                onClose={() => {
                  setShowCopyExpertStepsModal(false)
                  setSelectedTargetApplicationId('')
                }}
                title="Copy Expert Steps to Another Application"
                size="md"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Target Application
                    </label>
                    {isLoadingApplications ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      </div>
                    ) : availableApplications.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No other applications found</p>
                      </div>
                    ) : (
                      <select
                        value={selectedTargetApplicationId}
                        onChange={(e) => setSelectedTargetApplicationId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select an application...</option>
                        {availableApplications.map((app) => (
                          <option key={app.id} value={app.id}>
                            {app.application_name} ({app.state})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                    <p className="font-medium mb-1">Selected Steps:</p>
                    <p>{selectedListExpertStepIds.size} expert step(s) will be copied</p>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCopyExpertStepsModal(false)
                        setSelectedTargetApplicationId('')
                      }}
                      className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedTargetApplicationId) {
                          alert('Please select a target application')
                          return
                        }
                        await handleCopyExpertStepsToApplication(selectedTargetApplicationId)
                        setShowCopyExpertStepsModal(false)
                        setSelectedTargetApplicationId('')
                        setSelectedListExpertStepIds(new Set())
                      }}
                      disabled={isCopyingExpertSteps || !selectedTargetApplicationId}
                      className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCopyingExpertSteps ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      Copy Steps
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        </div>
      )}

      {activeTab === 'message' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Application Messages</h2>
              <p className="text-sm text-gray-600">Communicate with your team about this application</p>
            </div>
            <div className="p-6">
              {/* Messages List */}
              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                {isLoadingConversation ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs mt-1">Start a conversation with your assigned expert</p>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => {
                      const senderName = getSenderName(message)
                      const senderRole = getSenderRole(message)
                      const initials = getInitials(senderName)
                      const roleTagColor = getRoleTagColor(senderRole)
                      const avatarColor = getAvatarColor(senderName, senderRole)
                      const isOwnMessage = message.is_own
                      
                      return (
                        <div
                          key={message.id}
                          className={`flex items-start gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                        >
                          {/* Avatar */}
                          <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                            {initials}
                          </div>
                          
                          {/* Message Content */}
                          <div className={`flex-1 min-w-0 ${isOwnMessage ? 'flex flex-col items-end' : ''}`}>
                            <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                              <span className="text-sm font-semibold text-gray-900">
                                {senderName}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleTagColor}`}>
                                {senderRole}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatMessageTime(message.created_at)}
                              </span>
                            </div>
                            <div className={`rounded-lg p-3 ${
                              isOwnMessage 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white'
                            }`}>
                              <p className={`text-sm whitespace-pre-wrap ${
                                isOwnMessage ? 'text-white' : 'text-gray-900'
                              }`}>
                                {message.content}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex gap-3">
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Type your message..."
                    rows={2}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageContent.trim() || isSendingMessage || !conversationId}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isSendingMessage ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false)
          setUploadForRequirementDoc(null)
        }}
        applicationId={application.id}
        onSuccess={refreshDocuments}
        licenseRequirementDocumentId={uploadForRequirementDoc?.id ?? undefined}
        defaultDocumentName={uploadForRequirementDoc?.document_name ?? undefined}
        defaultDocumentType={uploadForRequirementDoc?.document_type ?? undefined}
        autoApprove={currentUserRole === 'expert' || currentUserRole === 'admin'}
      />

      {/* Document Review Modal for Experts */}
      {selectedDocumentForReview && (
        <Modal
          isOpen={!!selectedDocumentForReview}
          onClose={() => {
            setSelectedDocumentForReview(null)
            setReviewNotes('')
          }}
          title={`Review Document: ${selectedDocumentForReview.document_name}`}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Document: <span className="font-medium text-gray-900">{selectedDocumentForReview.document_name}</span>
              </p>
              {selectedDocumentForReview.description && (
                <p className="text-sm text-gray-600 mb-4">
                  Description: {selectedDocumentForReview.description}
                </p>
              )}
              <button
                type="button"
                onClick={() => handleDownload(selectedDocumentForReview.document_url, selectedDocumentForReview.document_name)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                View Document
              </button>
            </div>

            <div>
              <label htmlFor="reviewNotes" className="block text-sm font-semibold text-gray-700 mb-2">
                Review Notes (Optional)
              </label>
              <textarea
                id="reviewNotes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about your review decision..."
                rows={4}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setSelectedDocumentForReview(null)
                  setReviewNotes('')
                }}
                disabled={isReviewing}
                className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDocumentReview('reject')}
                disabled={isReviewing}
                className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isReviewing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    Reject
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDocumentReview('approve')}
                disabled={isReviewing}
                className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isReviewing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Approve
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Step Instructions Modal */}
      {infoModalStep && (
        <Modal
          isOpen={!!infoModalStep}
          onClose={() => setInfoModalStep(null)}
          title={`Step Instructions`}
          size="md"
        >
          <div className="space-y-4">

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-900 whitespace-pre-wrap">
              {
                infoModalStep.instructions !== null ? 
                (
                  <div>
                    <div className="font-medium text-gray-900 mb-2">{infoModalStep.step_name}</div>
                    <div>{infoModalStep.instructions}</div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic">No instructions provided for this step.</div>
                )
              }
            </div>

            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700 flex items-start gap-3">
              <div className="w-6 h-6 flex items-center justify-center rounded-full bg-yellow-100 text-yellow-700 font-semibold">i</div>
              <div>Tip: Instructions can include website URLs, login credentials, and step-by-step guidance for external portals.</div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setInfoModalStep(null)} className="px-4 py-2 bg-white border rounded-lg">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
