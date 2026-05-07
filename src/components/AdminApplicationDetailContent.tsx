'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { copyExpertStepsFromRequirementToApplication } from '@/app/actions/license-requirements'
import {
  FileText,
  Download,
  Upload,
  Calendar,
  MapPin,
  User,
  Clock,
  Percent,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Users,
  Send,
  Copy,
  Plus,
  Building2,
} from 'lucide-react'
import Modal from './Modal'
import UploadDocumentModal from './UploadDocumentModal'

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
  submitted_date: string | Date | null
  created_at: string | Date | null
  company_owner_id: string
  assigned_expert_id?: string | null
  license_type_id?: string | null
  revision_reason?: string | null
  user_profiles: {
    id: string
    full_name: string | null
    email: string | null
  } | null
  expert_profile: {
    id: string
    full_name: string | null
    email: string | null
  } | null
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
  license_requirement_document_id?: string | null
}

interface RequirementDocument {
  id: string
  document_name: string
  document_type: string | null
  description: string | null
  is_required: boolean
}

interface ApplicationStep {
  id: string
  step_name: string
  step_order: number
  description: string | null
  is_completed?: boolean
  is_expert_step?: boolean
  created_by_expert_id?: string | null
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

interface AdminApplicationDetailContentProps {
  application: Application
  documents: Document[]
  adminUserId: string
  agencyName?: string | null
}

type TabType = 'steps' | 'documents' | 'messages' | 'expert-process'

export default function AdminApplicationDetailContent({
  application,
  documents: initialDocuments,
  adminUserId,
  agencyName,
}: AdminApplicationDetailContentProps) {
  const searchParams = useSearchParams()
  const fromNotification = searchParams?.get('fromNotification') === 'true'
  const [activeTab, setActiveTab] = useState<TabType>('steps')
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [requirementDocuments, setRequirementDocuments] = useState<RequirementDocument[]>([])
  const [isLoadingRequirementDocuments, setIsLoadingRequirementDocuments] = useState(false)
  const [steps, setSteps] = useState<ApplicationStep[]>([])
  const [isLoadingSteps, setIsLoadingSteps] = useState(false)
  const [isCompletingStep, setIsCompletingStep] = useState(false)
  const [expertSteps, setExpertSteps] = useState<ApplicationStep[]>([])
  const [isLoadingExpertSteps, setIsLoadingExpertSteps] = useState(false)
  const [selectedExpertStepIds, setSelectedExpertStepIds] = useState<Set<string>>(new Set())
  const [isCopyingExpertSteps, setIsCopyingExpertSteps] = useState(false)
  const [showCopyExpertStepsModal, setShowCopyExpertStepsModal] = useState(false)
  const [availableApplications, setAvailableApplications] = useState<Array<{id: string, application_name: string, state: string}>>([])
  const [selectedTargetApplicationId, setSelectedTargetApplicationId] = useState<string>('')
  const [isLoadingApplications, setIsLoadingApplications] = useState(false)
  const [showAddExpertStepModal, setShowAddExpertStepModal] = useState(false)
  const [expertStepFormData, setExpertStepFormData] = useState({ stepName: '', description: '', phase: 'Pre-Application' })
  const [isSubmittingExpertStep, setIsSubmittingExpertStep] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [messageContent, setMessageContent] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadForRequirementDoc, setUploadForRequirementDoc] = useState<RequirementDocument | null>(null)
  const supabase = createClient()

  const refreshDocuments = useCallback(async () => {
    const { data } = await q.getApplicationDocumentsByApplicationId(supabase, application.id)
    if (data) setDocuments(data)
  }, [supabase, application.id])

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return 'bg-blue-100 text-blue-700'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'under_review':
        return 'bg-yellow-100 text-yellow-700'
      case 'needs_revision':
        return 'bg-orange-100 text-orange-700'
      case 'approved':
        return 'bg-green-100 text-green-700'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      case 'closed':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusDisplay = (status: string) => {
    if (status === 'closed') return 'Closed'
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const getStateAbbr = (state: string) => {
    return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
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
            is_completed: step.is_completed,
            is_expert_step: false
          }))
        
        setSteps(regularSteps)
        setIsLoadingSteps(false)
        return
      }

      // If no application_steps exist, fetch required steps from license_requirement_steps
      if (application.license_type_id) {
        // Get license type name and state (match same license_requirement as admin config)
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

        // Find license_requirement_id by license type's (state, name)
        const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndType(supabase, requirementState, licenseType.name)

        if (reqError || !licenseRequirement) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        // Fetch required steps from license_requirement_steps
        const { data: requiredSteps, error: stepsError } = await q.getRegularStepsFromRequirement(supabase, licenseRequirement.id)

        if (stepsError) {
          console.error('Error fetching required steps:', stepsError)
          setSteps([])
        } else {
          setSteps((requiredSteps || []).map((step: any) => ({
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
      const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndType(supabase, requirementState, licenseTypeRow.name)
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

  useEffect(() => {
    if (activeTab === 'documents' && application?.license_type_id) {
      fetchRequirementDocuments()
    }
  }, [activeTab, application?.license_type_id, fetchRequirementDocuments])

  // Fetch expert steps. If application has a license type but no expert steps yet, copy from requirement (backfill).
  const fetchExpertSteps = useCallback(async () => {
    if (!application.id) return
    
    setIsLoadingExpertSteps(true)
    try {
      const { data: expertStepsData, error } = await q.getExpertApplicationStepsByApplicationId(supabase, application.id)

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
          const { data: refetched, error: refetchErr } = await q.getExpertApplicationStepsByApplicationId(supabase, application.id)
          if (!refetchErr && refetched?.length) {
            setExpertSteps(refetched.map((step: any) => ({
              id: step.id,
              step_name: step.step_name,
              step_order: step.step_order,
              description: step.description,
              is_completed: step.is_completed,
              is_expert_step: true,
              created_by_expert_id: step.created_by_expert_id
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
        created_by_expert_id: step.created_by_expert_id
      })))
    } catch (error) {
      console.error('Error fetching expert steps:', error)
      setExpertSteps([])
    } finally {
      setIsLoadingExpertSteps(false)
    }
  }, [application.id, application.license_type_id, application.state, supabase])

  useEffect(() => {
    if (activeTab === 'expert-process') {
      fetchExpertSteps()
    }
  }, [activeTab, fetchExpertSteps])

  const openAddExpertStepModal = () => {
    setShowAddExpertStepModal(true)
    setExpertStepFormData({ stepName: '', description: '', phase: 'Pre-Application' })
  }
  const closeAddExpertStepModal = () => {
    setShowAddExpertStepModal(false)
    setExpertStepFormData({ stepName: '', description: '', phase: 'Pre-Application' })
  }

  const handleAddExpertStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!application.id || !expertStepFormData.stepName.trim() || isSubmittingExpertStep) return
    setIsSubmittingExpertStep(true)
    try {
      const { data: existingStepsData } = await q.getMaxExpertStepOrderForApplication(supabase, application.id)
      const nextOrder = existingStepsData?.length ? existingStepsData[0].step_order + 1 : 1
      const { error } = await q.insertApplicationStepRow(supabase, {
          application_id: application.id,
          step_name: expertStepFormData.stepName.trim(),
          step_order: nextOrder,
          description: expertStepFormData.description.trim() || null,
          phase: expertStepFormData.phase || null,
          is_expert_step: true,
          is_completed: false,
        })
      if (error) throw error
      closeAddExpertStepModal()
      await fetchExpertSteps()
    } catch (err) {
      console.error('Error adding expert step:', err)
      alert('Failed to add expert step')
    } finally {
      setIsSubmittingExpertStep(false)
    }
  }

  // Handle copying expert steps to another application
  const handleCopyExpertSteps = async (targetApplicationId: string) => {
    if (selectedExpertStepIds.size === 0 || !targetApplicationId || isCopyingExpertSteps) return

    setIsCopyingExpertSteps(true)
    try {
      // Get the selected expert steps
      const stepsToCopy = expertSteps.filter(step => selectedExpertStepIds.has(step.id))
      
      if (stepsToCopy.length === 0) {
        alert('Please select at least one expert step to copy')
        setIsCopyingExpertSteps(false)
        return
      }

      const { data: existingStepsData } = await q.getMaxExpertStepOrderForApplication(supabase, targetApplicationId)
      let nextOrder = existingStepsData?.length ? existingStepsData[0].step_order + 1 : 1

      const stepsToInsert = stepsToCopy.map(step => ({
        application_id: targetApplicationId,
        step_name: step.step_name,
        step_order: nextOrder++,
        description: step.description,
        is_expert_step: true,
        is_completed: false,
        created_by_expert_id: step.created_by_expert_id
      }))

      const { error: insertError } = await q.insertApplicationStepsRows(supabase, stepsToInsert)

      if (insertError) throw insertError

      alert(`Successfully copied ${stepsToCopy.length} expert step(s)`)
      setSelectedExpertStepIds(new Set())
    } catch (error: any) {
      console.error('Error copying expert steps:', error)
      alert('Failed to copy expert steps: ' + (error.message || 'Unknown error'))
    } finally {
      setIsCopyingExpertSteps(false)
    }
  }

  const toggleExpertStepSelection = (stepId: string) => {
    setSelectedExpertStepIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stepId)) {
        newSet.delete(stepId)
      } else {
        newSet.add(stepId)
      }
      return newSet
    })
  }

  // Set up conversation for application-based group chat
  useEffect(() => {
    if (!application.id || !adminUserId) return

    const setupConversation = async () => {
      setIsLoadingConversation(true)
      try {
        // Find or create conversation for this application
        let convId = conversationId

        if (!convId) {
          // Try to find existing conversation for this application
          const existingConvId = await getConversationIdByApplicationDeduped(supabase, application.id)

          if (existingConvId) {
            convId = existingConvId
            setConversationId(convId)
          } else {
            // client_id is optional — null for admin/expert-created applications
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
                  setIsLoadingConversation(false)
                  return
                }
              } else {
                console.error('Error creating conversation:', convError)
                setIsLoadingConversation(false)
                return
              }
            } else {
              convId = newConv!.id
              setConversationId(convId)
            }
          }
        }

        if (!convId) {
          setMessages([])
          setIsLoadingConversation(false)
          return
        }
        const { data: messagesData, error: messagesError } = await q.getMessagesByConversationId(supabase, convId)

        if (messagesError) {
          console.error('Error loading messages:', messagesError)
          setMessages([])
        } else {
          const senderIds = Array.from(new Set((messagesData || []).map(m => m.sender_id)))
          const { data: userProfiles } = senderIds.length > 0 ? await q.getUserProfilesByIds(supabase, senderIds) : { data: [] }

          type ProfileRow = { id: string; full_name?: string | null; role?: string | null }
          const profilesList = (userProfiles ?? []) as unknown as ProfileRow[]
          const profilesById: Record<string, ProfileRow> = {}
          profilesList.forEach(p => {
            profilesById[p.id] = p
          })

          const messagesWithSenders = (messagesData || []).map(msg => ({
            ...msg,
            sender: {
              id: msg.sender_id,
              user_profiles: profilesById[msg.sender_id] || null
            },
            is_own: msg.sender_id === adminUserId
          }))

          setMessages(messagesWithSenders)

        // Mark messages as read by adding admin user ID to is_read array
        const unreadMessages = messagesWithSenders.filter(msg => 
          msg.sender_id !== adminUserId && 
          (!msg.is_read || !Array.isArray(msg.is_read) || !msg.is_read.includes(adminUserId))
        )
        
        if (unreadMessages.length > 0) {
          const ids = unreadMessages.map((m) => m.id).filter((id) => typeof id === 'string' && id.length > 0)
          if (ids.length > 0) {
            const { error: markReadErr } = await q.rpcMarkMessagesAsReadByUser(supabase, ids, adminUserId)
            if (markReadErr) console.error('Error marking messages read:', markReadErr)
          }
        }
        }
      } catch (error) {
        console.error('Error setting up conversation:', error)
        setMessages([])
      } finally {
        setIsLoadingConversation(false)
      }
    }

    setupConversation()
  }, [application.id, adminUserId, supabase])

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!conversationId || !adminUserId) return

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

          // Get sender information
          const { data: profiles } = await q.getUserProfilesByIds(supabase, [newMessage.sender_id])
          const userProfile = profiles?.[0]

          const messageWithSender = {
            ...newMessage,
            sender: {
              id: newMessage.sender_id,
              user_profiles: userProfile || null
            },
            is_own: newMessage.sender_id === adminUserId
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

          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, adminUserId, supabase])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const delay = fromNotification ? 500 : 0
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: fromNotification ? 'auto' : 'smooth' })
      }, delay)
    }
  }, [messages, fromNotification])

  const handleSendMessage = async () => {
    if (!messageContent.trim() || isSendingMessage || !conversationId || !adminUserId) return

    setIsSendingMessage(true)
    try {
      const { data: profiles } = await q.getUserProfilesByIds(supabase, [adminUserId])
      const currentUserProfile = profiles?.[0]

      const { data: newMessage, error: messageError } = await q.insertMessage(supabase, {
          conversation_id: conversationId,
          sender_id: adminUserId,
          content: messageContent.trim()
        })

      if (messageError) throw messageError

      await q.updateConversationLastMessageAt(supabase, conversationId)

      if (newMessage) {
        const optimisticMessage = {
          ...newMessage,
          is_read: Array.isArray(newMessage.is_read) ? newMessage.is_read : [adminUserId], // Ensure array format
          sender: {
            id: adminUserId,
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
    if (message.is_own) {
      return 'Admin'
    }
    if (message.sender?.user_profiles?.full_name) {
      return message.sender.user_profiles.full_name
    }
    return 'Client'
  }

  const getSenderRole = (message: any) => {
    if (message.is_own) {
      return 'Admin'
    }
    if (message.sender?.user_profiles?.role === 'expert') {
      return 'Expert'
    }
    if (message.sender?.user_profiles?.role === 'admin') {
      return 'Admin'
    }
    return 'Owner'
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

  const handleDownload = async (documentUrl: string, documentName: string) => {
    try {
      const response = await fetch(documentUrl)
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
      window.open(documentUrl, '_blank')
    }
  }

  const completedSteps = steps.filter(s => s.is_completed).length
  const totalSteps = steps.length

  const useTemplateForDocuments = !!application?.license_type_id
  const totalDocuments = useTemplateForDocuments ? requirementDocuments.length : documents.length
  const completedDocuments = useTemplateForDocuments
    ? requirementDocuments.filter(rd => documents.some(d => d.license_requirement_document_id === rd.id && (d.status === 'approved' || d.status === 'completed'))).length
    : documents.filter(d => d.status === 'approved' || d.status === 'completed').length
  const getLinkedDocument = (requirementDocId: string) =>
    documents.find(d => d.license_requirement_document_id === requirementDocId)

  // Handle step completion (toggle by clicking the step itself, like owner dashboard)
  const handleCompleteStep = async (isCompleted: boolean, stepId: string) => {
    if (!stepId || !application.id || isCompletingStep) return

    setIsCompletingStep(true)
    try {
      const selectedStep = steps.find(s => s.id === stepId)
      if (!selectedStep) {
        throw new Error('Step not found')
      }

      const { data: existingAppStep } = await q.getApplicationStepByAppAndId(supabase, application.id, stepId)

      if (existingAppStep) {
        const { error: updateError } = await q.updateApplicationStepCompleteById(supabase, stepId, application.id, {
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null
        })
        if (updateError) throw updateError
      } else {
        const { data: existingByName } = await q.getApplicationStepByAppNameOrder(
          supabase,
          application.id,
          selectedStep.step_name,
          selectedStep.step_order
        )

        if (existingByName) {
          const { error: updateError } = await q.updateApplicationStepCompleteById(
            supabase,
            existingByName.id,
            application.id,
            { is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null }
          )
          if (updateError) throw updateError
        } else {
          if (!isCompleted) return
          const { error: insertError } = await q.insertApplicationStepRow(supabase, {
            application_id: application.id,
            step_name: selectedStep.step_name,
            step_order: selectedStep.step_order,
            description: selectedStep.description,
            is_completed: true,
            completed_at: new Date().toISOString()
          })
          if (insertError) throw insertError
        }
      }

      await fetchSteps()
    } catch (error: any) {
      console.error('Error completing step:', error)
      alert('Failed to complete step: ' + (error.message || 'Unknown error'))
    } finally {
      setIsCompletingStep(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Application Header */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              {getStateAbbr(application.state)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{application.application_name}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {application.state}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created {formatDate(application.created_at)}
                </span>
                {application.started_date && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Started {formatDate(application.started_date)}
                  </span>
                )}
                {application.progress_percentage !== null && (
                  <span className="flex items-center gap-1">
                    <Percent className="w-4 h-4" />
                    {application.progress_percentage}% Complete
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${getStatusBadge(application.status)}`}>
              {getStatusDisplay(application.status)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {application.progress_percentage !== null && (
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${application.progress_percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Owner/Client Information */}
        {application.user_profiles && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Client Information
            </h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{application.user_profiles.full_name || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="font-medium">Email:</span>
                <span>{application.user_profiles.email || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Expert Information */}
        {application.expert_profile && (
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Assigned Expert
            </h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{application.expert_profile.full_name || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="font-medium">Email:</span>
                <span>{application.expert_profile.email || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Agency Information */}
        {agencyName && (
          <div className="bg-purple-50 rounded-lg p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Agency
            </h3>
            <div className="text-sm text-gray-900 font-medium">{agencyName}</div>
          </div>
        )}

        {/* Revision Reason (if needs_revision) */}
        {application.status === 'needs_revision' && application.revision_reason && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
            <h3 className="text-sm font-semibold text-orange-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Revision Required
            </h3>
            <p className="text-sm text-orange-800">{application.revision_reason}</p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-600">Overall Progress</div>
            <Percent className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{application.progress_percentage || 0}%</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-600">Completed Steps</div>
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{completedSteps} of {totalSteps}</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-600">Documents</div>
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{completedDocuments} of {totalDocuments}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 -mt-2">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 px-6" aria-label="Tabs">
            {[
              { id: 'steps', label: 'Steps' },
              { id: 'documents', label: 'Documents' },
              { id: 'messages', label: 'Messages' },
              { id: 'expert-process', label: 'Expert Process' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'steps' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Application Steps</h2>
          {isLoadingSteps ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No steps found for this application</p>
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step) => {
                const isCompleted = step.is_completed
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
                    className={`flex items-start gap-3 p-4 border rounded-lg transition-all ${
                      isCompleted
                        ? 'bg-green-50 border-green-200 cursor-pointer'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    <div className="mt-1">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <div className="w-5 h-5 border-2 rounded-full border-gray-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-1">{step.step_name}</div>
                      {step.description && (
                        <div className="text-sm text-gray-600 mb-2">{step.description}</div>
                      )}
                      <div className="text-xs text-gray-500">
                        Step {step.step_order} of {totalSteps}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Application Documents</h2>
            <button
              onClick={() => { setUploadForRequirementDoc(null); setIsUploadModalOpen(true) }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              Add Document
            </button>
          </div>
          {isLoadingRequirementDocuments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : useTemplateForDocuments && requirementDocuments.length > 0 ? (
            <div className="space-y-3">
              {requirementDocuments.map((reqDoc) => {
                const linked = getLinkedDocument(reqDoc.id)
                const displayName = linked?.document_name ?? reqDoc.document_name
                const categoryLabel = reqDoc.document_type || reqDoc.document_name.split(/[\s_]+/)[0] || 'Document'
                const status = linked ? (linked.status === 'approved' || linked.status === 'completed' ? 'approved' : linked.status) : 'pending'
                return (
                  <div
                    key={reqDoc.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{displayName}</div>
                        <div className="text-sm text-gray-500 mb-1">{categoryLabel}</div>
                        {linked && (
                          <div className="text-sm text-gray-500">
                            Uploaded {formatDate(linked.created_at)}
                            {linked.document_type && ` • ${linked.document_type}`}
                          </div>
                        )}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                        status === 'approved' || status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                    {linked ? (
                      <div className="ml-4 flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleDownload(linked.document_url, linked.document_name)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          onClick={() => { setUploadForRequirementDoc(reqDoc); setIsUploadModalOpen(true) }}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          Replace
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setUploadForRequirementDoc(reqDoc); setIsUploadModalOpen(true) }}
                        className="ml-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 flex-shrink-0"
                      >
                        <Upload className="w-4 h-4" />
                        Upload
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">
                {useTemplateForDocuments && requirementDocuments.length === 0
                  ? 'No required documents have been defined for this license type yet.'
                  : 'No documents uploaded yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{doc.document_name}</div>
                      <div className="text-sm text-gray-500">
                        Uploaded {formatDate(doc.created_at)}
                        {doc.document_type && ` • ${doc.document_type}`}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      doc.status === 'approved' || doc.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : doc.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDownload(doc.document_url, doc.document_name)}
                    className="ml-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'messages' && (
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
                  <p className="text-xs mt-1">Start a conversation with the client</p>
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
      )}

      {activeTab === 'expert-process' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Expert Process Steps</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openAddExpertStepModal}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Step
                </button>
                {selectedExpertStepIds.size > 0 && (
                  <button
                    onClick={async () => {
                      setIsLoadingApplications(true)
                      setShowCopyExpertStepsModal(true)
                      // Get all applications for the admin to select target
                      const { data: allApplications } = await q.getApplicationsListForDropdown(supabase, application.id)

                      if (allApplications) {
                        setAvailableApplications(allApplications)
                      }
                      setIsLoadingApplications(false)
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Selected ({selectedExpertStepIds.size})
                  </button>
                )}
              </div>
            </div>

            {/* Add Expert Step modal */}
            <Modal
              isOpen={showAddExpertStepModal}
              onClose={closeAddExpertStepModal}
              title="Add Expert Step"
              size="lg"
            >
              <form onSubmit={handleAddExpertStep} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                  <select
                    value={expertStepFormData.phase}
                    onChange={(e) => setExpertStepFormData({ ...expertStepFormData, phase: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Pre-Application">Pre-Application</option>
                    <option value="Post-Application">Post-Application</option>
                    <option value="Application">Application</option>
                    <option value="Review">Review</option>
                    <option value="Post-Approval">Post-Approval</option>
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
            </Modal>

            {isLoadingExpertSteps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : expertSteps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No expert process steps found</p>
                <p className="text-xs mt-1">Expert steps added by the assigned expert will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expertSteps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 p-4 border rounded-lg ${
                      step.is_completed
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="mt-1">
                      <input
                        type="checkbox"
                        checked={selectedExpertStepIds.has(step.id)}
                        onChange={() => toggleExpertStepSelection(step.id)}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 mb-1">{step.step_name}</div>
                      {step.description && (
                        <div className="text-sm text-gray-600 mb-2">{step.description}</div>
                      )}
                      <div className="text-xs text-gray-500">
                        Step {step.step_order} of {expertSteps.length}
                      </div>
                    </div>
                    <div className="mt-1">
                      {step.is_completed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Copy Expert Steps Modal */}
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
            <p>{selectedExpertStepIds.size} expert step(s) will be copied</p>
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
              onClick={async () => {
                if (!selectedTargetApplicationId) {
                  alert('Please select a target application')
                  return
                }
                await handleCopyExpertSteps(selectedTargetApplicationId)
                setShowCopyExpertStepsModal(false)
                setSelectedTargetApplicationId('')
                setSelectedExpertStepIds(new Set())
              }}
              disabled={isCopyingExpertSteps || !selectedTargetApplicationId}
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCopyingExpertSteps ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Copying...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Steps
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => { setIsUploadModalOpen(false); setUploadForRequirementDoc(null) }}
        applicationId={application.id}
        onSuccess={refreshDocuments}
        licenseRequirementDocumentId={uploadForRequirementDoc?.id ?? undefined}
        defaultDocumentName={uploadForRequirementDoc?.document_name ?? undefined}
        defaultDocumentType={uploadForRequirementDoc?.document_type ?? undefined}
        autoApprove={true}
      />
    </div>
  )
}
