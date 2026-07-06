'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Clock, DollarSign, Calendar, Loader2, Plus, Save, X, FileText, UserCog, Edit2, Trash2, GripVertical, Users2, Copy, Search, ChevronDown, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { 
  createStep, 
  createDocument, 
  createExpertStep, 
  getLicenseRequirementId,
  updateStep,
  updateDocument,
  updateExpertStepTemplate,
  deleteExpertStepTemplate,
  deleteStep,
  deleteDocument,
  deleteExpertStep,
  reorderSteps,
  createTemplate,
  updateTemplate,
  deleteTemplate
} from '@/app/actions/license-requirements'
import { updateLicenseType } from '@/app/actions/configuration'
import ExpertProcessComingSoonModal from '@/components/ExpertProcessComingSoonModal'
import PlaybookTab from '@/components/PlaybookTab'
import { getOrCreatePlaybook, getPlaybookItems } from '@/app/actions/playbooks'
import type { PlaybookItem } from '@/lib/supabase/query/playbooks'
import Modal from '@/components/Modal'
import { getAllLicenseRequirements, getStepsFromRequirement, getDocumentsFromRequirement, getExpertStepsFromRequirement, copySteps, copyDocuments, copyExpertSteps, getAllStepsWithRequirementInfo, getAllDocumentsWithRequirementInfo, getAllExpertStepsWithRequirementInfo, type StepWithRequirementInfo, type DocumentWithRequirementInfo, type ExpertStepWithRequirementInfo } from '@/app/actions/license-requirements'
import { EXPERT_STEP_PHASES, DEFAULT_EXPERT_STEP_PHASE } from '@/lib/constants'

interface LicenseType {
  id: string
  state: string
  name: string
  description: string
  processing_time_display: string
  cost_display: string
  service_fee_display?: string
  renewal_period_display: string
}

interface LicenseTypeDetailsProps {
  licenseType: LicenseType | null
  selectedState: string
}

type TabType = 'general' | 'steps' | 'documents' | 'templates' | 'expert' | 'playbook'


interface Step {
  id: string
  step_name: string
  step_order: number
  description: string | null
  is_expert_step?: boolean
  phase?: string | null
  estimated_days?: number | null
  is_required?: boolean
}

interface Document {
  id: string
  document_name: string
  document_type: string | null
  description: string | null
  is_required: boolean
}

interface Template {
  id: string
  template_name: string
  description: string | null
  file_url: string
  file_name: string
  created_at: string
}


export default function LicenseTypeDetails({ licenseType, selectedState }: LicenseTypeDetailsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const prevLicenseTypeRef = useRef<LicenseType | null>(null)
  const [stepsCount, setStepsCount] = useState(0)
  const [documentsCount, setDocumentsCount] = useState(0)
  const [templatesCount, setTemplatesCount] = useState(0)
  const [playbookId, setPlaybookId] = useState<string | null>(null)
  const [playbookItems, setPlaybookItems] = useState<PlaybookItem[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [expertSteps, setExpertSteps] = useState<Step[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [requirementId, setRequirementId] = useState<string | null>(null)
  
  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Copy form states (used inside Add Step/Document modals)
  const [showExpertComingSoonModal, setShowExpertComingSoonModal] = useState(false)
  
  // Add Step modal (for Steps tab) – single button opens modal with 3 tabs
  const [showAddStepModal, setShowAddStepModal] = useState(false)
  const [addStepModalTab, setAddStepModalTab] = useState<'new' | 'copy' | 'browse'>('new')
  
  // Add Document modal (for Documents tab)
  const [showAddDocumentModal, setShowAddDocumentModal] = useState(false)
  const [addDocumentModalTab, setAddDocumentModalTab] = useState<'new' | 'copy' | 'browse'>('new')
  
  // Add Expert Step modal (for Expert Process tab)
  const [showAddExpertStepModal, setShowAddExpertStepModal] = useState(false)
  const [addExpertStepModalTab, setAddExpertStepModalTab] = useState<'new' | 'copy' | 'browse'>('new')
  
  // Copy form data
  const [availableLicenseRequirements, setAvailableLicenseRequirements] = useState<Array<{id: string, state: string, license_type: string}>>([])
  const [selectedSourceRequirementId, setSelectedSourceRequirementId] = useState<string>('')
  const [availableSteps, setAvailableSteps] = useState<Step[]>([])
  const [availableDocuments, setAvailableDocuments] = useState<Document[]>([])
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set())
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [isLoadingCopyData, setIsLoadingCopyData] = useState(false)
  
  // Browse All Steps (inside Add Step modal)
  const [browseStepsSearch, setBrowseStepsSearch] = useState('')
  const [allBrowseSteps, setAllBrowseSteps] = useState<StepWithRequirementInfo[]>([])
  const [selectedBrowseStepIds, setSelectedBrowseStepIds] = useState<Set<string>>(new Set())
  const [isLoadingBrowseSteps, setIsLoadingBrowseSteps] = useState(false)
  const [browseStepsError, setBrowseStepsError] = useState<string | null>(null)
  
  // Browse All Documents (inside Add Document modal)
  const [browseDocumentsSearch, setBrowseDocumentsSearch] = useState('')
  const [allBrowseDocuments, setAllBrowseDocuments] = useState<DocumentWithRequirementInfo[]>([])
  const [selectedBrowseDocumentIds, setSelectedBrowseDocumentIds] = useState<Set<string>>(new Set())
  const [isLoadingBrowseDocuments, setIsLoadingBrowseDocuments] = useState(false)
  const [browseDocumentsError, setBrowseDocumentsError] = useState<string | null>(null)
  
  // Copy/Browse Expert Steps (inside Add Expert Step modal)
  const [availableExpertSteps, setAvailableExpertSteps] = useState<Step[]>([])
  const [selectedExpertStepIds, setSelectedExpertStepIds] = useState<Set<string>>(new Set())
  const [browseExpertStepsSearch, setBrowseExpertStepsSearch] = useState('')
  const [allBrowseExpertSteps, setAllBrowseExpertSteps] = useState<ExpertStepWithRequirementInfo[]>([])
  const [selectedBrowseExpertStepIds, setSelectedBrowseExpertStepIds] = useState<Set<string>>(new Set())
  const [isLoadingBrowseExpertSteps, setIsLoadingBrowseExpertSteps] = useState(false)
  const [browseExpertStepsError, setBrowseExpertStepsError] = useState<string | null>(null)
  
  // Edit states
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [editingDocument, setEditingDocument] = useState<string | null>(null)
  const [editingExpertStep, setEditingExpertStep] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null)
  const [dragOverStepId, setDragOverStepId] = useState<string | null>(null)
  
  // Template form / upload modal
  const [showUploadTemplateModal, setShowUploadTemplateModal] = useState(false)
  const [templateFormData, setTemplateFormData] = useState({ templateName: '', description: '', category: '' })
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  
  // Form data
  const [stepFormData, setStepFormData] = useState({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
  const [documentFormData, setDocumentFormData] = useState({ documentName: '', description: '', isRequired: true })
  const [expertFormData, setExpertFormData] = useState({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
  const [templateEditData, setTemplateEditData] = useState({ templateName: '', description: '' })
  
  // Overview tab editable fields
  const [overviewFields, setOverviewFields] = useState({
    processingTime: '',
    applicationFee: '',
    serviceFee: '',
    renewalPeriod: ''
  })
  const [overviewSaveStatus, setOverviewSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const supabase = createClient()

  // Get default service fee if not set
  const getDefaultServiceFee = (lt: LicenseType | null) => {
    if (!lt) return '$0'
    if (lt.service_fee_display) return lt.service_fee_display
    // Calculate as 10% of application fee if not set
    const appFeeMatch = lt.cost_display?.replace(/[^0-9.]/g, '') || '0'
    const appFee = parseFloat(appFeeMatch)
    const serviceFee = appFee * 0.1
    return `$${serviceFee.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  // Helper functions to extract and format values
  const extractNumber = (value: string): string => {
    const match = value.replace(/[^0-9.]/g, '')
    return match || '0'
  }

  // Extract processing time value preserving ranges (dashes)
  const extractProcessingTime = (value: string): string => {
    const cleaned = value.replace(/days?/gi, '').trim()
    const match = cleaned.replace(/[^0-9.\-\s]/g, '').trim()
    return match || ''
  }

  // Extract currency value preserving ranges (dashes)
  const extractCurrency = (value: string): string => {
    const cleaned = value.replace(/[$,]/g, '').trim()
    const match = cleaned.replace(/[^0-9.\-\s]/g, '').trim()
    return match || ''
  }

  const formatProcessingTime = (value: string): string => {
    if (value.includes('-')) {
      const parts = value.split('-').map(part => part.trim().replace(/[^0-9.]/g, ''))
      if (parts.length === 2 && parts[0] && parts[1]) {
        return `${parts[0]}-${parts[1]} days`
      }
    }
    const num = extractNumber(value)
    if (!num || num === '0') return ''
    return `${num} days`
  }

  const formatCurrency = (value: string): string => {
    if (value.includes('-')) {
      const parts = value.split('-').map(part => {
        const num = part.trim().replace(/[^0-9.]/g, '')
        if (!num) return ''
        const numValue = parseFloat(num)
        if (isNaN(numValue)) return ''
        return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      })
      if (parts.length === 2 && parts[0] && parts[1]) {
        return `$${parts[0]}-$${parts[1]}`
      }
    }
    const num = extractNumber(value)
    if (!num || num === '0') return '$0'
    const numValue = parseFloat(num)
    if (isNaN(numValue)) return '$0'
    return `$${numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const formatRenewalPeriod = (value: string): string => {
    const num = extractNumber(value)
    if (!num || num === '0') return ''
    const numValue = parseFloat(num)
    if (isNaN(numValue)) return ''
    return numValue === 1 ? '1 year' : `${numValue} years`
  }

  // Initialize overview fields when license type changes
  useEffect(() => {
    if (licenseType) {
      setOverviewFields({
        processingTime: licenseType.processing_time_display || '',
        applicationFee: licenseType.cost_display || '',
        serviceFee: licenseType.service_fee_display || getDefaultServiceFee(licenseType),
        renewalPeriod: licenseType.renewal_period_display || ''
      })
      setOverviewSaveStatus('idle')
    }
  }, [licenseType])

  // Ref to track latest field values for saving
  const overviewFieldsRef = useRef(overviewFields)
  useEffect(() => {
    overviewFieldsRef.current = overviewFields
  }, [overviewFields])

  // Auto-save overview fields with debounce
  const handleOverviewFieldChange = (field: string, value: string) => {
    if (!licenseType) return

    const updatedFields = {
      ...overviewFields,
      [field]: value
    }
    setOverviewFields(updatedFields)
    overviewFieldsRef.current = updatedFields

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setOverviewSaveStatus('saving')

    // Debounce: save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const currentFields = overviewFieldsRef.current
        const updateData = {
          id: licenseType.id,
          renewalPeriod: currentFields.renewalPeriod || licenseType.renewal_period_display || '1 year',
          applicationFee: currentFields.applicationFee || licenseType.cost_display || '$0',
          serviceFee: currentFields.serviceFee || getDefaultServiceFee(licenseType),
          processingTime: currentFields.processingTime || licenseType.processing_time_display || '0 days'
        }

        const result = await updateLicenseType(updateData)
        if (result.error) {
          console.error('Error saving:', result.error)
          setOverviewSaveStatus('idle')
        } else {
          setOverviewSaveStatus('saved')
          // Hide success message after 3 seconds
          setTimeout(() => {
            setOverviewSaveStatus('idle')
          }, 3000)
        }
      } catch (error: any) {
        console.error('Error saving overview fields:', error)
        setOverviewSaveStatus('idle')
      }
    }, 1000)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!licenseType) return

    setIsLoading(true)
    try {
      // Get or create license requirement
      const reqResult = await getLicenseRequirementId(selectedState, licenseType.name)
      if (reqResult.error || !reqResult.data) {
        setStepsCount(0)
        setDocumentsCount(0)
        setSteps([])
        setDocuments([])
        setRequirementId(null)
        setIsLoading(false)
        return
      }

      const reqId = reqResult.data
      setRequirementId(reqId)

      // Load steps, documents, and templates data
      // const [stepsResult, docsResult, templatesResult] = await Promise.all([
      // Load steps, documents, and expert steps (expert steps live in application_steps)
      const [stepsResult, docsResult, templatesResult, expertResult] = await Promise.all([
        q.getRegularStepsFromRequirement(supabase, reqId),
        q.getDocumentsFromRequirement(supabase, reqId),
        q.getTemplatesFromRequirement(supabase, reqId),
        getExpertStepsFromRequirement(reqId),
      ])


      if (stepsResult.data) {
        setSteps(stepsResult.data)
        setStepsCount(stepsResult.data.length)
      } else {
        setSteps([])
        setStepsCount(0)
      }

      if (expertResult.error) {
        setExpertSteps([])
      } else {
        const expertStepsData = expertResult.data ?? []
        setExpertSteps(expertStepsData)
      }

      if (docsResult.data) {
        setDocuments(docsResult.data)
        setDocumentsCount(docsResult.data.length)
      } else {
        setDocuments([])
        setDocumentsCount(0)
      }

      if (templatesResult.data) {
        setTemplates(templatesResult.data)
        setTemplatesCount(templatesResult.data.length)
      } else {
        setTemplates([])
        setTemplatesCount(0)
      }
    } catch (error) {
      setStepsCount(0)
      setDocumentsCount(0)
      setTemplatesCount(0)
      setSteps([])
      setDocuments([])
      setTemplates([])
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseType, selectedState])

  useEffect(() => {
    // Only reset to 'general' tab when licenseType actually changes (not on every render)
    const licenseTypeChanged = prevLicenseTypeRef.current?.id !== licenseType?.id
    
    if (licenseType) {
      if (licenseTypeChanged) {
        setActiveTab('general')
      }
      loadData()
    } else {
      setSteps([])
      setExpertSteps([])
      setDocuments([])
      setTemplates([])
      setStepsCount(0)
      setDocumentsCount(0)
      setTemplatesCount(0)
      setPlaybookId(null)
      setPlaybookItems([])
      setIsLoading(false)
      setRequirementId(null)
    }
    
    // Update the ref to track the current licenseType
    prevLicenseTypeRef.current = licenseType
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseType, selectedState]) // Removed activeTab and loadData from dependencies

  useEffect(() => {
    if (licenseType && (activeTab === 'steps' || activeTab === 'documents' || activeTab === 'templates' || activeTab === 'expert')) {
      loadData()
    }
  }, [activeTab, licenseType, loadData])

  // Load playbook when the Playbook tab is first opened for this license type.
  // setPlaybookId is called LAST so PlaybookTab mounts only after playbookItems is ready.
  useEffect(() => {
    if (activeTab !== 'playbook' || !requirementId) return
    if (playbookId) return // already loaded

    ;(async () => {
      const pb = await getOrCreatePlaybook(requirementId)
      if (pb.error || !pb.playbook) return
      const itemsResult = await getPlaybookItems(pb.playbook.id)
      setPlaybookItems(itemsResult.error ? [] : itemsResult.items)
      setPlaybookId(pb.playbook.id) // set last — triggers PlaybookTab mount with items already populated
    })()
  }, [activeTab, requirementId, playbookId])

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requirementId) return

    setIsSubmitting(true)
    setError(null)

    if (editingStep) {
      await handleUpdateStep(e)
      return
    }

    const result = await createStep({
      licenseRequirementId: requirementId,
      stepName: stepFormData.stepName,
      description: stepFormData.description,
      instructions: stepFormData.instructions,
      estimatedDays: stepFormData.estimatedDays ? parseInt(stepFormData.estimatedDays) : undefined,
      isRequired: stepFormData.isRequired,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setStepFormData({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
      closeAddStepModal()
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requirementId) return

    setIsSubmitting(true)
    setError(null)

    if (editingDocument) {
      await handleUpdateDocument(e)
      return
    }

    const result = await createDocument({
      licenseRequirementId: requirementId,
      documentName: documentFormData.documentName,
      description: documentFormData.description,
      isRequired: documentFormData.isRequired,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setDocumentFormData({ documentName: '', description: '', isRequired: true })
      closeAddDocumentModal()
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleAddExpertStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requirementId) return

    setIsSubmitting(true)
    setError(null)

    if (editingExpertStep) {
      await handleUpdateExpertStep(e)
      return
    }

    const result = await createExpertStep({
      licenseRequirementId: requirementId,
      phase: expertFormData.phase,
      stepTitle: expertFormData.stepTitle,
      description: expertFormData.description,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setExpertFormData({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
      closeAddExpertStepModal()
      await loadData()
      setIsSubmitting(false)
    }
  }

  // Edit handlers
  const handleEditStep = (step: Step) => {
    setEditingStep(step.id)
    setStepFormData({
      stepName: step.step_name,
      description: step.description || '',
      instructions: '', // Instructions are not currently stored in the database, so we can't pre-fill this field
      estimatedDays: step.estimated_days != null ? String(step.estimated_days) : '',
      isRequired: step.is_required ?? true,
    })
  }

  const handleEditDocument = (doc: Document) => {
    setEditingDocument(doc.id)
    setDocumentFormData({
      documentName: doc.document_name,
      description: doc.description || '',
      isRequired: doc.is_required,
    })
  }

  const handleEditExpertStep = (step: Step) => {
    setEditingExpertStep(step.id)
    setExpertFormData({
      phase: step.phase || DEFAULT_EXPERT_STEP_PHASE,
      stepTitle: step.step_name,
      description: step.description || '',
    })
  }

  // Update handlers
  const handleUpdateStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStep) return

    setIsSubmitting(true)
    setError(null)

    const result = await updateStep(editingStep, {
      stepName: stepFormData.stepName,
      description: stepFormData.description,
      estimatedDays: stepFormData.estimatedDays ? parseInt(stepFormData.estimatedDays) : undefined,
      isRequired: stepFormData.isRequired,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setStepFormData({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
      setEditingStep(null)
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDocument) return

    setIsSubmitting(true)
    setError(null)

    const result = await updateDocument(editingDocument, {
      documentName: documentFormData.documentName,
      description: documentFormData.description,
      isRequired: documentFormData.isRequired,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setDocumentFormData({ documentName: '', description: '', isRequired: true })
      setEditingDocument(null)
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleUpdateExpertStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingExpertStep) return

    setIsSubmitting(true)
    setError(null)

    const result = await updateExpertStepTemplate(editingExpertStep, {
      phase: expertFormData.phase,
      stepTitle: expertFormData.stepTitle,
      description: expertFormData.description,
    })

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setExpertFormData({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
      setEditingExpertStep(null)
      await loadData()
      setIsSubmitting(false)
    }
  }

  // Delete handlers
  const handleDeleteStep = async (id: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return

    setIsSubmitting(true)
    const result = await deleteStep(id)

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleStepDragStart = (e: React.DragEvent, stepId: string) => {
    setDraggedStepId(stepId)
    e.dataTransfer.setData('text/plain', stepId)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleStepDragEnd = () => {
    setDraggedStepId(null)
    setDragOverStepId(null)
  }
  const handleStepDragOver = (e: React.DragEvent, _targetStepId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStepId(_targetStepId)
  }
  const handleStepDragLeave = () => {
    setDragOverStepId(null)
  }
  const handleStepDrop = async (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault()
    setDragOverStepId(null)
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId || draggedId === targetStepId || !requirementId) return
    const fromIndex = steps.findIndex((s) => s.id === draggedId)
    const toIndex = steps.findIndex((s) => s.id === targetStepId)
    if (fromIndex === -1 || toIndex === -1) return
    const newSteps = [...steps]
    const [removed] = newSteps.splice(fromIndex, 1)
    newSteps.splice(toIndex, 0, removed)
    const reorderedWithOrder = newSteps.map((s, i) => ({ ...s, step_order: i + 1 }))
    setSteps(reorderedWithOrder)
    const result = await reorderSteps(requirementId, reorderedWithOrder.map((s) => s.id))
    if (result.error) {
      setError(result.error)
      await loadData()
    }
    setDraggedStepId(null)
  }

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    setIsSubmitting(true)
    const result = await deleteDocument(id)

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleDeleteExpertStep = async (step: Step) => {
    if (!confirm('Are you sure you want to delete this expert step from the template? Existing applications will keep their current expert steps.')) return

    setIsSubmitting(true)
    const result = await deleteExpertStepTemplate(step.id)

    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      await loadData()
      setIsSubmitting(false)
    }
  }

  // Generate a time-limited signed URL for a template download.
  // Handles both legacy records (stored as full https:// URLs) and new records (stored as storage paths).
  const handleDownloadTemplate = async (fileUrlOrPath: string) => {
    if (fileUrlOrPath.startsWith('http')) {
      window.open(fileUrlOrPath, '_blank')
      return
    }
    const { data } = await supabase.storage.from('license-templates').createSignedUrl(fileUrlOrPath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Template handlers
  const handleUploadTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!requirementId || !templateFile) return

    setIsSubmitting(true)
    setError(null)
    try {
      const fileExt = templateFile.name.split('.').pop()
      const filePath = `${requirementId}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('license-templates')
        .upload(filePath, templateFile, {
          upsert: false,
          contentType: templateFile.type || 'application/octet-stream',
          cacheControl: '3600',
        })
      if (uploadError) {
        setError(uploadError.message || 'Failed to upload file')
        setIsSubmitting(false)
        return
      }
      // Store the storage path (not a public URL) — signed URLs are generated at download time.
      const result = await createTemplate({
        licenseRequirementId: requirementId,
        templateName: templateFormData.templateName,
        description: templateFormData.description,
        fileUrl: filePath,
        fileName: templateFile.name,
      })
      if (result.error) {
        setError(result.error)
        setIsSubmitting(false)
        return
      }
      setShowUploadTemplateModal(false)
      setTemplateFormData({ templateName: '', description: '', category: '' })
      setTemplateFile(null)
      await loadData()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditTemplate = (tpl: Template) => {
    setEditingTemplate(tpl.id)
    setTemplateEditData({ templateName: tpl.template_name, description: tpl.description || '' })
  }

  const handleUpdateTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTemplate) return
    setIsSubmitting(true)
    setError(null)
    const result = await updateTemplate(editingTemplate, {
      templateName: templateEditData.templateName,
      description: templateEditData.description,
    })
    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      setEditingTemplate(null)
      setTemplateEditData({ templateName: '', description: '' })
      await loadData()
      setIsSubmitting(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    setIsSubmitting(true)
    const result = await deleteTemplate(id)
    if (result.error) {
      setError(result.error)
      setIsSubmitting(false)
    } else {
      await loadData()
      setIsSubmitting(false)
    }
  }

  // Copy Steps handlers
  const loadCopyStepsData = async () => {
    setSelectedSourceRequirementId('')
    setAvailableSteps([])
    setSelectedStepIds(new Set())
    setError(null)
    setIsLoadingCopyData(true)
    try {
      const result = await getAllLicenseRequirements()
      if (result.error) {
        setError(result.error)
      } else {
        const filtered = result.data?.filter(req => req.id !== requirementId) || []
        setAvailableLicenseRequirements(filtered)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load license requirements')
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const handleSourceRequirementChangeForSteps = async (requirementId: string) => {
    setSelectedSourceRequirementId(requirementId)
    setSelectedStepIds(new Set())
    
    if (!requirementId) {
      setAvailableSteps([])
      return
    }
    
    setIsLoadingCopyData(true)
    try {
      const result = await getStepsFromRequirement(requirementId)
      if (result.error) {
        setError(result.error)
        setAvailableSteps([])
      } else {
        setAvailableSteps(result.data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load steps')
      setAvailableSteps([])
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const toggleStepSelection = (stepId: string) => {
    const newSelected = new Set(selectedStepIds)
    if (newSelected.has(stepId)) {
      newSelected.delete(stepId)
    } else {
      newSelected.add(stepId)
    }
    setSelectedStepIds(newSelected)
  }

  const handleCopySteps = async () => {
    if (!requirementId || selectedStepIds.size === 0) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const result = await copySteps(requirementId, Array.from(selectedStepIds))
      if (result.error) {
        setError(result.error)
      } else {
        closeAddStepModal()
        await loadData()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to copy steps')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Browse All Steps handlers
  const loadBrowseStepsData = async () => {
    setBrowseStepsSearch('')
    setSelectedBrowseStepIds(new Set())
    setBrowseStepsError(null)
    setIsLoadingBrowseSteps(true)
    try {
      const result = await getAllStepsWithRequirementInfo(requirementId ?? undefined)
      if (result.error) {
        setBrowseStepsError(result.error)
        setAllBrowseSteps([])
      } else {
        setAllBrowseSteps(result.data ?? [])
      }
    } catch (err: any) {
      setBrowseStepsError(err.message ?? 'Failed to load steps')
      setAllBrowseSteps([])
    } finally {
      setIsLoadingBrowseSteps(false)
    }
  }

  const openAddStepModal = () => {
    setShowAddStepModal(true)
    setAddStepModalTab('new')
    setError(null)
  }

  const closeAddStepModal = () => {
    setShowAddStepModal(false)
    setAddStepModalTab('new')
    setStepFormData({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
    setSelectedSourceRequirementId('')
    setAvailableSteps([])
    setSelectedStepIds(new Set())
    setBrowseStepsSearch('')
    setAllBrowseSteps([])
    setSelectedBrowseStepIds(new Set())
    setBrowseStepsError(null)
  }

  const filteredBrowseSteps = browseStepsSearch.trim()
    ? allBrowseSteps.filter(
        (s) =>
          s.step_name.toLowerCase().includes(browseStepsSearch.toLowerCase()) ||
          (s.description?.toLowerCase().includes(browseStepsSearch.toLowerCase()) ?? false) ||
          s.state.toLowerCase().includes(browseStepsSearch.toLowerCase()) ||
          s.license_type.toLowerCase().includes(browseStepsSearch.toLowerCase())
      )
    : allBrowseSteps

  const toggleBrowseStepSelection = (stepId: string) => {
    const next = new Set(selectedBrowseStepIds)
    if (next.has(stepId)) next.delete(stepId)
    else next.add(stepId)
    setSelectedBrowseStepIds(next)
  }

  const handleAddBrowseSteps = async () => {
    if (!requirementId || selectedBrowseStepIds.size === 0) return
    setIsSubmitting(true)
    setBrowseStepsError(null)
    try {
      const result = await copySteps(requirementId, Array.from(selectedBrowseStepIds))
      if (result.error) {
        setBrowseStepsError(result.error)
      } else {
        closeAddStepModal()
        await loadData()
      }
    } catch (err: any) {
      setBrowseStepsError(err.message ?? 'Failed to add steps')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Copy Documents handlers
  const loadCopyDocumentsData = async () => {
    setSelectedSourceRequirementId('')
    setAvailableDocuments([])
    setSelectedDocumentIds(new Set())
    setError(null)
    setIsLoadingCopyData(true)
    try {
      const result = await getAllLicenseRequirements()
      if (result.error) {
        setError(result.error)
      } else {
        const filtered = result.data?.filter(req => req.id !== requirementId) || []
        setAvailableLicenseRequirements(filtered)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load license requirements')
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const loadBrowseDocumentsData = async () => {
    setBrowseDocumentsSearch('')
    setSelectedBrowseDocumentIds(new Set())
    setBrowseDocumentsError(null)
    setIsLoadingBrowseDocuments(true)
    try {
      const result = await getAllDocumentsWithRequirementInfo(requirementId ?? undefined)
      if (result.error) {
        setBrowseDocumentsError(result.error)
        setAllBrowseDocuments([])
      } else {
        setAllBrowseDocuments(result.data ?? [])
      }
    } catch (err: any) {
      setBrowseDocumentsError(err.message ?? 'Failed to load documents')
      setAllBrowseDocuments([])
    } finally {
      setIsLoadingBrowseDocuments(false)
    }
  }

  const openAddDocumentModal = () => {
    setShowAddDocumentModal(true)
    setAddDocumentModalTab('new')
    setError(null)
  }

  const closeAddDocumentModal = () => {
    setShowAddDocumentModal(false)
    setAddDocumentModalTab('new')
    setDocumentFormData({ documentName: '', description: '', isRequired: true })
    setSelectedSourceRequirementId('')
    setAvailableDocuments([])
    setSelectedDocumentIds(new Set())
    setBrowseDocumentsSearch('')
    setAllBrowseDocuments([])
    setSelectedBrowseDocumentIds(new Set())
    setBrowseDocumentsError(null)
  }

  const toggleBrowseDocumentSelection = (documentId: string) => {
    const next = new Set(selectedBrowseDocumentIds)
    if (next.has(documentId)) next.delete(documentId)
    else next.add(documentId)
    setSelectedBrowseDocumentIds(next)
  }

  const openAddExpertStepModal = () => {
    setShowAddExpertStepModal(true)
    setAddExpertStepModalTab('new')
    setError(null)
  }

  const closeAddExpertStepModal = () => {
    setShowAddExpertStepModal(false)
    setAddExpertStepModalTab('new')
    setExpertFormData({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
    setAvailableExpertSteps([])
    setSelectedExpertStepIds(new Set())
    setBrowseExpertStepsSearch('')
    setAllBrowseExpertSteps([])
    setSelectedBrowseExpertStepIds(new Set())
    setBrowseExpertStepsError(null)
  }

  const loadCopyExpertStepsData = async () => {
    setSelectedSourceRequirementId('')
    setAvailableExpertSteps([])
    setSelectedExpertStepIds(new Set())
    setError(null)
    setIsLoadingCopyData(true)
    try {
      const result = await getAllLicenseRequirements()
      if (result.error) {
        setError(result.error)
      } else {
        const filtered = result.data?.filter(req => req.id !== requirementId) || []
        setAvailableLicenseRequirements(filtered)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load license requirements')
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
        setError(result.error)
        setAvailableExpertSteps([])
      } else {
        setAvailableExpertSteps(result.data || [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expert steps')
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

  const handleCopyExpertSteps = async () => {
    if (!requirementId || selectedExpertStepIds.size === 0) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await copyExpertSteps(requirementId, Array.from(selectedExpertStepIds))
      if (result.error) {
        setError(result.error)
      } else {
        closeAddExpertStepModal()
        await loadData()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to copy expert steps')
    } finally {
      setIsSubmitting(false)
    }
  }

  const loadBrowseExpertStepsData = async () => {
    setBrowseExpertStepsSearch('')
    setSelectedBrowseExpertStepIds(new Set())
    setBrowseExpertStepsError(null)
    setIsLoadingBrowseExpertSteps(true)
    try {
      const result = await getAllExpertStepsWithRequirementInfo(requirementId ?? undefined)
      if (result.error) {
        setBrowseExpertStepsError(result.error)
        setAllBrowseExpertSteps([])
      } else {
        setAllBrowseExpertSteps(result.data ?? [])
      }
    } catch (err: unknown) {
      setBrowseExpertStepsError(err instanceof Error ? err.message : 'Failed to load expert steps')
      setAllBrowseExpertSteps([])
    } finally {
      setIsLoadingBrowseExpertSteps(false)
    }
  }

  const filteredBrowseExpertSteps = browseExpertStepsSearch.trim()
    ? allBrowseExpertSteps.filter(
        (s) =>
          s.step_name.toLowerCase().includes(browseExpertStepsSearch.toLowerCase()) ||
          (s.description?.toLowerCase().includes(browseExpertStepsSearch.toLowerCase()) ?? false) ||
          (s.phase?.toLowerCase().includes(browseExpertStepsSearch.toLowerCase()) ?? false) ||
          s.state.toLowerCase().includes(browseExpertStepsSearch.toLowerCase()) ||
          s.license_type.toLowerCase().includes(browseExpertStepsSearch.toLowerCase())
      )
    : allBrowseExpertSteps

  const toggleBrowseExpertStepSelection = (stepId: string) => {
    const next = new Set(selectedBrowseExpertStepIds)
    if (next.has(stepId)) next.delete(stepId)
    else next.add(stepId)
    setSelectedBrowseExpertStepIds(next)
  }

  const handleAddBrowseExpertSteps = async () => {
    if (!requirementId || selectedBrowseExpertStepIds.size === 0) return
    setIsSubmitting(true)
    setBrowseExpertStepsError(null)
    try {
      const result = await copyExpertSteps(requirementId, Array.from(selectedBrowseExpertStepIds))
      if (result.error) {
        setBrowseExpertStepsError(result.error)
      } else {
        closeAddExpertStepModal()
        await loadData()
      }
    } catch (err: unknown) {
      setBrowseExpertStepsError(err instanceof Error ? err.message : 'Failed to add expert steps')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddBrowseDocuments = async () => {
    if (!requirementId || selectedBrowseDocumentIds.size === 0) return
    setIsSubmitting(true)
    setBrowseDocumentsError(null)
    try {
      const result = await copyDocuments(requirementId, Array.from(selectedBrowseDocumentIds))
      if (result.error) {
        setBrowseDocumentsError(result.error)
      } else {
        closeAddDocumentModal()
        await loadData()
      }
    } catch (err: any) {
      setBrowseDocumentsError(err.message ?? 'Failed to add documents')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredBrowseDocuments = browseDocumentsSearch.trim()
    ? allBrowseDocuments.filter(
        (d) =>
          d.document_name.toLowerCase().includes(browseDocumentsSearch.toLowerCase()) ||
          (d.description?.toLowerCase().includes(browseDocumentsSearch.toLowerCase()) ?? false) ||
          d.state.toLowerCase().includes(browseDocumentsSearch.toLowerCase()) ||
          d.license_type.toLowerCase().includes(browseDocumentsSearch.toLowerCase())
      )
    : allBrowseDocuments

  const handleSourceRequirementChangeForDocuments = async (requirementId: string) => {
    setSelectedSourceRequirementId(requirementId)
    setSelectedDocumentIds(new Set())
    
    if (!requirementId) {
      setAvailableDocuments([])
      return
    }
    
    setIsLoadingCopyData(true)
    try {
      const result = await getDocumentsFromRequirement(requirementId)
      if (result.error) {
        setError(result.error)
        setAvailableDocuments([])
      } else {
        setAvailableDocuments(result.data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents')
      setAvailableDocuments([])
    } finally {
      setIsLoadingCopyData(false)
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocumentIds)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocumentIds(newSelected)
  }

  const handleCopyDocuments = async () => {
    if (!requirementId || selectedDocumentIds.size === 0) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const result = await copyDocuments(requirementId, Array.from(selectedDocumentIds))
      if (result.error) {
        setError(result.error)
      } else {
        closeAddDocumentModal()
        await loadData()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to copy documents')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!licenseType) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 md:p-6 flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <p className="text-lg md:text-xl font-semibold text-gray-700 mb-2">Select a license type to manage requirements</p>
          <p className="text-sm md:text-base text-gray-500">Choose a license type from the left sidebar to view and edit steps and documents</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 md:p-6">
      
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-4" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            General Info
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'steps'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Steps {stepsCount > 0 && `(${stepsCount})`}
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Documents {documentsCount > 0 && `(${documentsCount})`}
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'templates'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Templates {templatesCount > 0 && `(${templatesCount})`}
          </button>
          <button
            onClick={() => setActiveTab('expert')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'expert'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users2 className="w-4 h-4" />
            Expert Process
          </button>
          <button
            onClick={() => setActiveTab('playbook')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'playbook'
                ? 'border-blue-600 text-blue-600 bg-gray-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Playbook {playbookItems.length > 0 && `(${playbookItems.length})`}
          </button>
        </nav>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === 'general' && (
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">Loading license details...</p>
                </div>
              </div>
            ) : licenseType ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">License Requirements Details</h3>
                
                <div className="space-y-4">
                  {/* Average Processing Time */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Average Processing Time</label>
                    <input
                      type="text"
                      value={overviewFields.processingTime || licenseType.processing_time_display || ''}
                      onFocus={(e) => {
                        const rawValue = extractProcessingTime(e.target.value)
                        setOverviewFields({ ...overviewFields, processingTime: rawValue })
                        e.target.select()
                      }}
                      onBlur={(e) => {
                        const formatted = formatProcessingTime(e.target.value)
                        setOverviewFields({ ...overviewFields, processingTime: formatted })
                        if (formatted) {
                          handleOverviewFieldChange('processingTime', formatted)
                        }
                      }}
                      onChange={(e) => {
                        setOverviewFields({ ...overviewFields, processingTime: e.target.value })
                      }}
                      className="bg-white w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                      placeholder="60 days"
                    />
                    <p className="text-sm text-gray-600">How long it typically takes to process this license type</p>
                  </div>

                  {/* Application Fee */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Application Fee</label>
                    <input
                      type="text"
                      value={overviewFields.applicationFee || licenseType.cost_display || ''}
                      onFocus={(e) => {
                        const rawValue = extractCurrency(e.target.value)
                        setOverviewFields({ ...overviewFields, applicationFee: rawValue })
                        e.target.select()
                      }}
                      onBlur={(e) => {
                        const formatted = formatCurrency(e.target.value)
                        setOverviewFields({ ...overviewFields, applicationFee: formatted })
                        if (formatted) {
                          handleOverviewFieldChange('applicationFee', formatted)
                        }
                      }}
                      onChange={(e) => {
                        setOverviewFields({ ...overviewFields, applicationFee: e.target.value })
                      }}
                      className="bg-white w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                      placeholder="$500"
                    />
                    <p className="text-sm text-gray-600">Cost to apply for this license</p>
                  </div>

                  {/* Service Fee */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Service Fee</label>
                    <input
                      type="text"
                      value={overviewFields.serviceFee || licenseType.service_fee_display || getDefaultServiceFee(licenseType)}
                      onFocus={(e) => {
                        const numericValue = extractNumber(e.target.value)
                        setOverviewFields({ ...overviewFields, serviceFee: numericValue })
                        e.target.select()
                      }}
                      onBlur={(e) => {
                        const formatted = formatCurrency(e.target.value)
                        setOverviewFields({ ...overviewFields, serviceFee: formatted })
                        if (formatted) {
                          handleOverviewFieldChange('serviceFee', formatted)
                        }
                      }}
                      onChange={(e) => {
                        setOverviewFields({ ...overviewFields, serviceFee: e.target.value })
                      }}
                      className="bg-white w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                      placeholder="$3,500"
                    />
                    <p className="text-sm text-gray-600">Cost of helping the owner submit their license</p>
                  </div>

                  {/* Renewal Period */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Renewal Period</label>
                    <input
                      type="text"
                      value={overviewFields.renewalPeriod || licenseType.renewal_period_display || ''}
                      onFocus={(e) => {
                        const numericValue = extractNumber(e.target.value)
                        setOverviewFields({ ...overviewFields, renewalPeriod: numericValue })
                        e.target.select()
                      }}
                      onBlur={(e) => {
                        const formatted = formatRenewalPeriod(e.target.value)
                        setOverviewFields({ ...overviewFields, renewalPeriod: formatted })
                        if (formatted) {
                          handleOverviewFieldChange('renewalPeriod', formatted)
                        }
                      }}
                      onChange={(e) => {
                        setOverviewFields({ ...overviewFields, renewalPeriod: e.target.value })
                      }}
                      className="bg-white w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1 mb-2 hover:bg-white/50 transition-colors"
                      placeholder="1 year"
                    />
                    <p className="text-sm text-gray-600">How often the license must be renewed</p>
                  </div>
                </div>

                {/* Auto-save status message */}
                {overviewSaveStatus === 'saved' && (
                  <div className="flex items-center gap-2 text-sm text-green-600 mt-4">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Changes are saved automatically</span>
                  </div>
                )}
                {overviewSaveStatus === 'saving' && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving changes...</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>Please select a license type to view details</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'steps' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Licensing Steps</h3>
              <button
                onClick={openAddStepModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </div>

            {/* Add Step modal with 3 tabs: New, Copy from Another License, Browse All Steps */}
            <Modal
              isOpen={showAddStepModal}
              onClose={closeAddStepModal}
              title="Add Step"
              size="xl"
            >
              <div className="flex flex-col gap-4">
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setAddStepModalTab('new')}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addStepModalTab === 'new'
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
                      setAddStepModalTab('copy')
                      if (availableLicenseRequirements.length === 0) loadCopyStepsData()
                    }}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addStepModalTab === 'copy'
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
                      setAddStepModalTab('browse')
                      if (allBrowseSteps.length === 0 && !isLoadingBrowseSteps) loadBrowseStepsData()
                    }}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addStepModalTab === 'browse'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    Browse All Steps
                  </button>
                </div>

                {addStepModalTab === 'new' && (
                  <div className="py-2">
                    <h4 className="text-base font-semibold text-gray-900 mb-4">Create New Step</h4>
                    <form onSubmit={handleAddStep} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Step Title</label>
                        <input
                          type="text"
                          value={stepFormData.stepName}
                          onChange={(e) => setStepFormData({ ...stepFormData, stepName: e.target.value })}
                          placeholder="e.g., Complete Client Intake Training"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={stepFormData.description}
                          onChange={(e) => setStepFormData({ ...stepFormData, description: e.target.value })}
                          placeholder="Detailed description of this step"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
                        <textarea
                          value={stepFormData.instructions}
                          onChange={(e) => setStepFormData({ ...stepFormData, instructions: e.target.value })}
                          placeholder="e.g. Website URLs, login steps, or guidance for external portals like background ckeck sites
                          
                          Example:
                          1. Go to https://backgroundcheck.example.com
                          2. Create an account using agency email
                          3. Complete the application form"
                          rows={5}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          style={{whiteSpace: 'pre-line'}}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Days</label>
                        <input
                          type="number"
                          value={stepFormData.estimatedDays}
                          onChange={(e) => setStepFormData({ ...stepFormData, estimatedDays: e.target.value })}
                          placeholder="7"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="stepIsRequiredModal"
                          checked={stepFormData.isRequired}
                          onChange={(e) => setStepFormData({ ...stepFormData, isRequired: e.target.checked })}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="stepIsRequiredModal" className="ml-2 text-sm font-medium text-gray-700">
                          Required Step
                        </label>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          Save Step
                        </button>
                        <button
                          type="button"
                          onClick={closeAddStepModal}
                          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {addStepModalTab === 'copy' && (
                  <div className="py-2 space-y-4">
                    <h4 className="text-base font-semibold text-gray-900">Select License Type to Copy From</h4>
                    <select
                      value={selectedSourceRequirementId}
                      onChange={(e) => handleSourceRequirementChangeForSteps(e.target.value)}
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
                    {selectedSourceRequirementId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select Steps to Copy ({selectedStepIds.size} selected)
                        </label>
                        <div className="border border-gray-300 rounded-lg max-h-[300px] overflow-y-auto bg-white">
                          {isLoadingCopyData ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            </div>
                          ) : availableSteps.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <p>No steps available for this license type</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-200">
                              {availableSteps.map((step) => (
                                <label
                                  key={step.id}
                                  className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedStepIds.has(step.id)}
                                    onChange={() => toggleStepSelection(step.id)}
                                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-900">
                                      {step.step_order}. {step.step_name}
                                    </span>
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
                        onClick={handleCopySteps}
                        disabled={isSubmitting || selectedStepIds.size === 0 || isLoadingCopyData}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy className="w-4 h-4" />
                        Copy {selectedStepIds.size} {selectedStepIds.size === 1 ? 'Step' : 'Steps'}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddStepModal}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {addStepModalTab === 'browse' && (
                  <div className="py-2 flex flex-col gap-4 max-h-[60vh]">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Search Steps</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={browseStepsSearch}
                          onChange={(e) => setBrowseStepsSearch(e.target.value)}
                          placeholder="Search by title, description, state, or license type..."
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Select Steps to Add ({selectedBrowseStepIds.size} selected)
                    </p>
                    {browseStepsError && (
                      <p className="text-sm text-red-600">{browseStepsError}</p>
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50">
                      {isLoadingBrowseSteps ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        </div>
                      ) : filteredBrowseSteps.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <p className="text-sm">No steps found</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200 p-2">
                          {filteredBrowseSteps.map((step) => (
                            <label
                              key={step.id}
                              className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer rounded-lg"
                            >
                              <input
                                type="checkbox"
                                checked={selectedBrowseStepIds.has(step.id)}
                                onChange={() => toggleBrowseStepSelection(step.id)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900">{step.step_name}</div>
                                {step.description && (
                                  <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                    {step.state}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                    {step.license_type}
                                  </span>
                                  {step.estimated_days != null && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                      {step.estimated_days} {step.estimated_days === 1 ? 'day' : 'days'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2 border-t border-gray-200">
                      <button
                        onClick={handleAddBrowseSteps}
                        disabled={isSubmitting || selectedBrowseStepIds.size === 0 || isLoadingBrowseSteps}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy className="w-4 h-4" />
                        Copy {selectedBrowseStepIds.size} {selectedBrowseStepIds.size === 1 ? 'Step' : 'Steps'}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddStepModal}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Modal>

            {editingStep && (
              <Modal
                isOpen={!!editingStep}
                onClose={() => {
                  setEditingStep(null)
                  setStepFormData({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
                  setError(null)
                }}
                title="Edit Step"
                size="lg"
              >
                <form onSubmit={handleAddStep} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Step Title</label>
                    <input
                      type="text"
                      value={stepFormData.stepName}
                      onChange={(e) => setStepFormData({ ...stepFormData, stepName: e.target.value })}
                      placeholder="e.g., Complete Client Intake Training"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={stepFormData.description}
                      onChange={(e) => setStepFormData({ ...stepFormData, description: e.target.value })}
                      placeholder="Detailed description of this step"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Days</label>
                    <input
                      type="number"
                      value={stepFormData.estimatedDays}
                      onChange={(e) => setStepFormData({ ...stepFormData, estimatedDays: e.target.value })}
                      placeholder="7"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="stepIsRequiredEdit"
                      checked={stepFormData.isRequired}
                      onChange={(e) => setStepFormData({ ...stepFormData, isRequired: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="stepIsRequiredEdit" className="ml-2 text-sm font-medium text-gray-700">
                      Required Step
                    </label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      Save Step
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStep(null)
                        setStepFormData({ stepName: '', description: '', instructions: '', estimatedDays: '', isRequired: true })
                        setError(null)
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Modal>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">Loading steps...</p>
                </div>
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No steps defined yet.</p>
                <p className="text-sm text-gray-400 mt-2">Add steps to define the process for this license type.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    draggable={false}
                    onDragOver={(e) => handleStepDragOver(e, step.id)}
                    onDragLeave={handleStepDragLeave}
                    onDrop={(e) => handleStepDrop(e, step.id)}
                    className={`flex items-start gap-4 p-4 bg-white border rounded-lg transition-colors ${
                      draggedStepId === step.id ? 'opacity-50 border-blue-300' : dragOverStepId === step.id ? 'border-blue-400 border-2 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      draggable
                      onDragStart={(e) => handleStepDragStart(e, step.id)}
                      onDragEnd={handleStepDragEnd}
                      className="mt-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-white">{step.step_order}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{step.step_name}</h4>
                        {step.is_required !== false && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                            Required
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-sm text-gray-600 mb-2">{step.description}</p>
                      )}
                      {step.estimated_days && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          <span>Estimated: {step.estimated_days} days</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditStep(step)}
                        className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Edit step"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        disabled={isSubmitting}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Delete step"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Required Documents</h3>
              <button
                onClick={openAddDocumentModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Document
              </button>
            </div>

            {/* Add Document modal with 3 tabs */}
            <Modal
              isOpen={showAddDocumentModal}
              onClose={closeAddDocumentModal}
              title="Add Document"
              size="xl"
            >
              <div className="flex flex-col gap-4">
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setAddDocumentModalTab('new')}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addDocumentModalTab === 'new'
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
                      setAddDocumentModalTab('copy')
                      if (availableLicenseRequirements.length === 0) loadCopyDocumentsData()
                    }}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addDocumentModalTab === 'copy'
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
                      setAddDocumentModalTab('browse')
                      if (allBrowseDocuments.length === 0 && !isLoadingBrowseDocuments) loadBrowseDocumentsData()
                    }}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors -mb-px ${
                      addDocumentModalTab === 'browse'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    Browse All Documents
                  </button>
                </div>

                {addDocumentModalTab === 'new' && (
                  <div className="py-2">
                    <h4 className="text-base font-semibold text-gray-900 mb-4">Create New Document</h4>
                    <form onSubmit={handleAddDocument} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
                        <input
                          type="text"
                          value={documentFormData.documentName}
                          onChange={(e) => setDocumentFormData({ ...documentFormData, documentName: e.target.value })}
                          placeholder="e.g., Application for License"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={documentFormData.description}
                          onChange={(e) => setDocumentFormData({ ...documentFormData, description: e.target.value })}
                          placeholder="Brief description of this document"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="docIsRequiredModal"
                          checked={documentFormData.isRequired}
                          onChange={(e) => setDocumentFormData({ ...documentFormData, isRequired: e.target.checked })}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="docIsRequiredModal" className="ml-2 text-sm font-medium text-gray-700">
                          Required Document
                        </label>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          <FileText className="w-4 h-4" />
                          Save Document
                        </button>
                        <button
                          type="button"
                          onClick={closeAddDocumentModal}
                          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {addDocumentModalTab === 'copy' && (
                  <div className="py-2 space-y-4">
                    <h4 className="text-base font-semibold text-gray-900">Select License Type to Copy From</h4>
                    <select
                      value={selectedSourceRequirementId}
                      onChange={(e) => handleSourceRequirementChangeForDocuments(e.target.value)}
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
                    {selectedSourceRequirementId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select Documents to Copy ({selectedDocumentIds.size} selected)
                        </label>
                        <div className="border border-gray-300 rounded-lg max-h-[300px] overflow-y-auto bg-white">
                          {isLoadingCopyData ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            </div>
                          ) : availableDocuments.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <p>No documents available for this license type</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-200">
                              {availableDocuments.map((doc) => (
                                <label
                                  key={doc.id}
                                  className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedDocumentIds.has(doc.id)}
                                    onChange={() => toggleDocumentSelection(doc.id)}
                                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-900">{doc.document_name}</span>
                                    {doc.is_required && (
                                      <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                                        Required
                                      </span>
                                    )}
                                    {doc.description && (
                                      <p className="text-sm text-gray-600 mt-0.5">{doc.description}</p>
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
                        onClick={handleCopyDocuments}
                        disabled={isSubmitting || selectedDocumentIds.size === 0 || isLoadingCopyData}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy className="w-4 h-4" />
                        Copy {selectedDocumentIds.size} {selectedDocumentIds.size === 1 ? 'Document' : 'Documents'}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddDocumentModal}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {addDocumentModalTab === 'browse' && (
                  <div className="py-2 flex flex-col gap-4 max-h-[60vh]">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Search Documents</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={browseDocumentsSearch}
                          onChange={(e) => setBrowseDocumentsSearch(e.target.value)}
                          placeholder="Search by name, description, state, or license type..."
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Select Documents to Add ({selectedBrowseDocumentIds.size} selected)
                    </p>
                    {browseDocumentsError && (
                      <p className="text-sm text-red-600">{browseDocumentsError}</p>
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50">
                      {isLoadingBrowseDocuments ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        </div>
                      ) : filteredBrowseDocuments.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <p className="text-sm">No documents found</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200 p-2">
                          {filteredBrowseDocuments.map((doc) => (
                            <label
                              key={doc.id}
                              className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer rounded-lg"
                            >
                              <input
                                type="checkbox"
                                checked={selectedBrowseDocumentIds.has(doc.id)}
                                onChange={() => toggleBrowseDocumentSelection(doc.id)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900">{doc.document_name}</div>
                                {doc.description && (
                                  <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                    {doc.state}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                                    {doc.license_type}
                                  </span>
                                  {doc.is_required && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 text-xs text-red-700">
                                      Required
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2 border-t border-gray-200">
                      <button
                        onClick={handleAddBrowseDocuments}
                        disabled={isSubmitting || selectedBrowseDocumentIds.size === 0 || isLoadingBrowseDocuments}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy className="w-4 h-4" />
                        Copy {selectedBrowseDocumentIds.size} {selectedBrowseDocumentIds.size === 1 ? 'Document' : 'Documents'}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddDocumentModal}
                        className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Modal>

            {editingDocument && (
              <Modal
                isOpen={!!editingDocument}
                onClose={() => {
                  setEditingDocument(null)
                  setDocumentFormData({ documentName: '', description: '', isRequired: true })
                  setError(null)
                }}
                title="Edit Document"
                size="lg"
              >
                <form onSubmit={handleAddDocument} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
                    <input
                      type="text"
                      value={documentFormData.documentName}
                      onChange={(e) => setDocumentFormData({ ...documentFormData, documentName: e.target.value })}
                      placeholder="e.g., Application for License"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={documentFormData.description}
                      onChange={(e) => setDocumentFormData({ ...documentFormData, description: e.target.value })}
                      placeholder="Brief description of this document"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isRequiredEdit"
                      checked={documentFormData.isRequired}
                      onChange={(e) => setDocumentFormData({ ...documentFormData, isRequired: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isRequiredEdit" className="ml-2 text-sm font-medium text-gray-700">
                      Required Document
                    </label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4" />
                      Save Document
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDocument(null)
                        setDocumentFormData({ documentName: '', description: '', isRequired: true })
                        setError(null)
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Modal>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">Loading documents...</p>
                </div>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No documents defined yet.</p>
                <p className="text-sm text-gray-400 mt-2">Add documents required for this license type.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{doc.document_name}</h4>
                        {doc.is_required && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                            Required
                          </span>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-sm text-gray-600">{doc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditDocument(doc)}
                        className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Edit document"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        disabled={isSubmitting}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Document Templates</h3>
                <p className="text-sm text-gray-600 mt-1">Upload sample documents and templates that Agency Admins can download when their application is approved.</p>
              </div>
              <button
                onClick={() => {
                  setShowUploadTemplateModal(true)
                  setTemplateFormData({ templateName: '', description: '', category: '' })
                  setTemplateFile(null)
                  setError(null)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Template
              </button>
            </div>

            {showUploadTemplateModal && (
              <Modal
                isOpen={showUploadTemplateModal}
                onClose={() => {
                  setShowUploadTemplateModal(false)
                  setTemplateFormData({ templateName: '', description: '', category: '' })
                  setTemplateFile(null)
                  setError(null)
                }}
                title="Upload Template"
                size="lg"
              >
                <form onSubmit={handleUploadTemplate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={templateFormData.templateName}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, templateName: e.target.value })}
                      placeholder="e.g., Sample Application Form"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={templateFormData.description}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                      placeholder="Brief description of this template"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
                    <label className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent min-h-[42px] flex items-center">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
                        className="sr-only"
                      />
                      <span className="text-sm text-gray-700 pointer-events-none">
                        {templateFile ? templateFile.name : ''}
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">Accepted formats: PDF, DOC, DOCX, XLS, XLSX.</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || !templateFile}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-4 h-4" />
                      Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadTemplateModal(false)
                        setTemplateFormData({ templateName: '', description: '', category: '' })
                        setTemplateFile(null)
                        setError(null)
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Modal>
            )}

            {editingTemplate && (
              <Modal
                isOpen={!!editingTemplate}
                onClose={() => {
                  setEditingTemplate(null)
                  setTemplateEditData({ templateName: '', description: '' })
                  setError(null)
                }}
                title="Edit Template"
                size="md"
              >
                <form onSubmit={handleUpdateTemplateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={templateEditData.templateName}
                      onChange={(e) => setTemplateEditData({ ...templateEditData, templateName: e.target.value })}
                      placeholder="e.g., Sample Application Form"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={templateEditData.description}
                      onChange={(e) => setTemplateEditData({ ...templateEditData, description: e.target.value })}
                      placeholder="Brief description of this template"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplate(null)
                        setTemplateEditData({ templateName: '', description: '' })
                        setError(null)
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Modal>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">Loading templates...</p>
                </div>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No templates uploaded yet.</p>
                <p className="text-sm text-gray-400 mt-2">Upload sample documents for Agency Admins to download.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900">{tpl.template_name}</h4>
                      {tpl.description && (
                        <p className="text-sm text-gray-600 mt-0.5">{tpl.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {tpl.file_name}
                        <span className="ml-2 text-gray-400">
                          {new Date(tpl.created_at).toLocaleDateString()}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDownloadTemplate(tpl.file_url)}
                        className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Download"
                        type="button"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditTemplate(tpl)}
                        className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Edit template"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        disabled={isSubmitting}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Delete template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'expert' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Expert Process Steps</h3>
              <button
                onClick={openAddExpertStepModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </div>

            {/* Add Expert Step modal with 3 tabs */}
            <Modal
              isOpen={showAddExpertStepModal}
              onClose={closeAddExpertStepModal}
              title="Add Step"
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
                          value={expertFormData.phase}
                          onChange={(e) => setExpertFormData({ ...expertFormData, phase: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
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
                          value={expertFormData.stepTitle}
                          onChange={(e) => setExpertFormData({ ...expertFormData, stepTitle: e.target.value })}
                          placeholder="e.g., Initial Client Consultation"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={expertFormData.description}
                          onChange={(e) => setExpertFormData({ ...expertFormData, description: e.target.value })}
                          placeholder="Detailed description of this step"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
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
                                      <span className="ml-2 text-xs text-gray-500">
                                        ({step.phase})
                                      </span>
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
                        onClick={handleCopyExpertSteps}
                        disabled={isSubmitting || selectedExpertStepIds.size === 0 || isLoadingCopyData}
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
                        onClick={handleAddBrowseExpertSteps}
                        disabled={isSubmitting || selectedBrowseExpertStepIds.size === 0 || isLoadingBrowseExpertSteps}
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

            {editingExpertStep && (
              <Modal
                isOpen={!!editingExpertStep}
                onClose={() => {
                  setEditingExpertStep(null)
                  setExpertFormData({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
                  setError(null)
                }}
                title="Edit Expert Step"
                size="lg"
              >
                <form onSubmit={handleAddExpertStep} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                    <select
                      value={expertFormData.phase}
                      onChange={(e) => setExpertFormData({ ...expertFormData, phase: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
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
                      value={expertFormData.stepTitle}
                      onChange={(e) => setExpertFormData({ ...expertFormData, stepTitle: e.target.value })}
                      placeholder="e.g., Initial Client Consultation"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={expertFormData.description}
                      onChange={(e) => setExpertFormData({ ...expertFormData, description: e.target.value })}
                      placeholder="Detailed description of this step"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      Save Step
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExpertStep(null)
                        setExpertFormData({ phase: DEFAULT_EXPERT_STEP_PHASE, stepTitle: '', description: '' })
                        setError(null)
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Modal>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gray-600">Loading expert process steps...</p>
                </div>
              </div>
            ) : expertSteps.length === 0 ? (
              <div className="text-center py-8">
                <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No expert process steps defined yet.</p>
                <p className="text-sm text-gray-400 mt-2">Add expert steps to define the expert process for this license type.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  // Group steps by phase (display all phases; order from EXPERT_STEP_PHASES)
                  const phaseOrder = EXPERT_STEP_PHASES.map((p) => p.value)
                  const byPhase = new Map<string, Step[]>()
                  for (const step of expertSteps) {
                    const phase = step.phase?.trim() || 'Other'
                    if (!byPhase.has(phase)) byPhase.set(phase, [])
                    byPhase.get(phase)!.push(step)
                  }
                  // Sort steps within each phase by step_order
                  Array.from(byPhase.values()).forEach((steps) => {
                    steps.sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
                  })
                  const orderedPhases = Array.from(byPhase.keys()).sort((a: string, b: string) => {
                    const i = phaseOrder.indexOf(a)
                    const j = phaseOrder.indexOf(b)
                    if (i !== -1 && j !== -1) return i - j
                    if (i !== -1) return -1
                    if (j !== -1) return 1
                    return a.localeCompare(b)
                  })
                  return orderedPhases.map((phase) => (
                    <div key={phase}>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">{phase}:</h4>
                      <div className="space-y-3">
                        {(byPhase.get(phase) ?? []).map((step, index) => (
                          <div
                            key={step.id}
                            className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-semibold text-white">{index + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 mb-1">{step.step_name}</h4>
                              {step.description && (
                                <p className="text-sm text-gray-600">{step.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => handleEditExpertStep(step)}
                                className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                title="Edit expert step"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteExpertStep(step)}
                                disabled={isSubmitting}
                                className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Delete expert step"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === 'playbook' && (
          <div>
            {requirementId && playbookId ? (
              <PlaybookTab
                key={playbookId}
                playbookId={playbookId}
                licenseRequirementId={requirementId}
                initialItems={playbookItems}
              />
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-save indicator */}
      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-2 text-sm text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        <span>Changes are saved automatically</span>
      </div>

      {/* Expert Process Coming Soon Modal */}
      <ExpertProcessComingSoonModal
        isOpen={showExpertComingSoonModal}
        onClose={() => setShowExpertComingSoonModal(false)}
      />
    </div>
  )
}
