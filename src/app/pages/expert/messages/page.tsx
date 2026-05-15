'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'

import { 
  MessageSquare, 
  Search, 
  Send,
  Users,
  Clock
} from 'lucide-react'

interface Client {
  id: string
  company_name: string
  contact_email: string
  contact_name: string
}

interface Conversation {
  id: string
  application_id: string
  last_message_at: string
  application?: {
    id: string
    application_name: string
    state: string
    company_owner_id: string
  }
  unread_count?: number
}

interface Message {
  id: string
  conversation_id: string
  content: string
  sender_id: string
  created_at: string
  is_read: string[] | boolean // Array of user IDs who have read the message, or boolean for backward compatibility
  sender?: {
    id: string
    user_profiles?: {
      id: string
      full_name: string | null
      role: string | null
    } | null
  }
  is_own?: boolean
}

function ExpertMessagesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromNotification = searchParams?.get('fromNotification') === 'true'
  const applicationIdFromNotification = searchParams?.get('applicationId')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  /** Totals across the expert's application conversations (stable; not tied to the active thread in `messages`). */
  const [messageDashboardTotals, setMessageDashboardTotals] = useState({ total: 0, unread: 0 })
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<'new' | 'send'>('new')

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      
      // Get user session
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        router.push('/pages/auth/login')
        return
      }
      setUser(currentUser)

      const { data: profileData } = await q.getUserProfileFull(supabase, currentUser.id)
      if (profileData?.role !== 'expert') {
        router.push('/pages/agency')
        return
      }
      setProfile(profileData)

      const { data: expertRecord } = await q.getLicensingExpertByUserId(supabase, currentUser.id)
      if (!expertRecord) {
        setMessageDashboardTotals({ total: 0, unread: 0 })
        setLoading(false)
        setUser(currentUser)
        setProfile(profileData)
        return
      }

      const { data: clientsData } = await q.getClientsByExpertId(supabase, currentUser.id)
      setClients(clientsData || [])

      const { data: applicationsData } = await q.getApplicationsByAssignedExpertIdSelect(
        supabase,
        currentUser.id,
        'id, application_name, state, company_owner_id'
      )
      const applicationIds = ((applicationsData || []) as unknown as { id: string }[]).map(app => app.id)
      const { data: conversationsData } = applicationIds.length > 0
        ? await q.getConversationsWithApplicationByApplicationIds(supabase, applicationIds)
        : { data: [] }

      const conversationIds = (conversationsData || []).map(c => c.id)
      const { data: unreadCounts } = conversationIds.length > 0
        ? await q.rpcCountUnreadMessagesForUser(supabase, conversationIds, currentUser.id)
        : { data: [] }

      const unreadCountsByConv: Record<string, number> = {}
      ;(unreadCounts || []).forEach((row: { conversation_id: string; unread_count: number }) => {
        unreadCountsByConv[row.conversation_id] = Number(row.unread_count)
      })

      const conversationsWithUnread = (conversationsData || []).map(conv => ({
        ...conv,
        unread_count: unreadCountsByConv[conv.id] || 0
      }))

      setConversations(conversationsWithUnread)

      const totalUnreadSum = conversationIds.reduce((sum, id) => sum + (unreadCountsByConv[id] || 0), 0)

      const [unreadRes, countRes] = await Promise.all([
        conversationIds.length > 0
          ? q.rpcGetUnreadMessagesForUserInConversations(
              supabase,
              conversationIds,
              currentUser.id,
              2000
            )
          : Promise.resolve({ data: [], error: null }),
        conversationIds.length > 0
          ? supabase.from('messages').select('id', { count: 'exact', head: true }).in('conversation_id', conversationIds)
          : Promise.resolve({ count: 0, error: null }),
      ])

      setMessageDashboardTotals({
        total: typeof countRes.count === 'number' ? countRes.count : 0,
        unread: totalUnreadSum,
      })

      if (unreadRes.error) {
        console.error('Error loading unread messages:', unreadRes.error)
      }
      setMessages((unreadRes.data || []) as Message[])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return

      const { data: messagesData } = await q.getMessagesByConversationId(supabase, conversationId)

      if (messagesData && messagesData.length > 0) {
        const senderIds = Array.from(new Set(messagesData.map(m => m.sender_id)))
        const { data: userProfilesData } = senderIds.length > 0
          ? await q.getUserProfilesByIds(supabase, senderIds, 'id, full_name, role')
          : { data: [] }
        type ProfileShape = { id: string; full_name: string | null; role: string | null }
        const profilesList = (userProfilesData ?? []) as unknown as ProfileShape[]
        const profilesById: Record<string, ProfileShape> = {}
        profilesList.forEach(p => {
          profilesById[p.id] = p
        })

        const messagesWithSenders: Message[] = messagesData.map(msg => ({
          ...msg,
          sender: {
            id: msg.sender_id,
            user_profiles: profilesById[msg.sender_id] || null
          },
          is_own: msg.sender_id === currentUser.id
        }))

        setMessages(messagesWithSenders)

        // Mark messages as read by adding current user ID to is_read array
        const unreadMessages = messagesWithSenders.filter(msg => 
          msg.sender_id !== currentUser.id && 
          (!msg.is_read || !Array.isArray(msg.is_read) || !msg.is_read.includes(currentUser.id))
        )
        
        if (unreadMessages.length > 0) {
          const ids = unreadMessages.map((m) => m.id).filter((id) => typeof id === 'string' && id.length > 0)
          if (ids.length > 0) {
            const { error: markReadErr } = await q.rpcMarkMessagesAsReadByUser(supabase, ids, currentUser.id)
            if (markReadErr) console.error('Error marking messages read:', markReadErr)
          }
        }

        // Scroll to bottom if coming from notification
        if (fromNotification) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
          }, 300)
        }
      } else {
        setMessages([])
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }, [fromNotification])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation)
    }
  }, [selectedConversation, loadMessages])

  // Auto-select conversation when coming from notification
  useEffect(() => {
    if (fromNotification && applicationIdFromNotification && conversations.length > 0 && !selectedConversation) {
      // Find conversation for this application
      const targetConv = conversations.find(conv => conv.application_id === applicationIdFromNotification)
      if (targetConv) {
        setSelectedConversation(targetConv.id)
        // Find and set the client
        if (targetConv.application?.company_owner_id) {
          const client = clients.find(c => c.id === targetConv.application?.company_owner_id)
          if (client) {
            setSelectedClient(client.id)
          }
        }
      }
    }
  }, [fromNotification, applicationIdFromNotification, conversations, selectedConversation, clients])

  // Scroll to bottom when messages are loaded and coming from notification
  useEffect(() => {
    if (fromNotification && messages.length > 0 && messagesEndRef.current) {
      // Delay to ensure DOM is ready
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 500)
    }
  }, [fromNotification, messages])

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!selectedConversation || !user) return

    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${selectedConversation}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation}`
        },
        async (payload) => {
          // Get the new message
          const newMessage = payload.new as Message
          
          const { data: userProfiles } = await q.getUserProfilesByIds(supabase, [newMessage.sender_id], 'id, full_name, role')
          type ProfileShape = { id: string; full_name: string | null; role: string | null }
          const userProfile = (userProfiles?.[0] ?? null) as ProfileShape | null

          const messageWithSender: Message = {
            ...newMessage,
            sender: {
              id: newMessage.sender_id,
              user_profiles: userProfile || null
            },
            is_own: newMessage.sender_id === user.id
          }

          setMessages(prevMessages => {
            // Check if message already exists (avoid duplicates)
            const exists = prevMessages.some(m => m.id === newMessage.id)
            if (exists) return prevMessages
            
            // Add new message and sort by created_at
            const updated = [...prevMessages, messageWithSender]
            return updated.sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          })

          if (newMessage.sender_id !== user.id) {
            const isRead = newMessage.is_read
            const isReadByUser = Array.isArray(isRead) && isRead.includes(user.id)
            if (!isReadByUser) {
              await q.rpcMarkMessageAsReadByUser(supabase, newMessage.id, user.id)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation, user])

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedClient || sending) return

    try {
      setSending(true)
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return

      const { data: client } = await q.getClientById(supabase, selectedClient)
      if (!client) throw new Error('Client not found')

      const { data: application } = client.agency_id
        ? await q.getApplicationByAgencyAndExpert(supabase, client.agency_id, currentUser.id)
        : { data: null }
      if (!application) {
        throw new Error('No application found for this client. Please ensure you are assigned to an application.')
      }

      let conversationId: string | null = null
      const { data: existingConv } = await q.getConversationByApplicationId(supabase, application.id)

      if (existingConv?.id) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convError } = await q.insertConversation(supabase, {
          client_id: selectedClient,
          application_id: application.id
        })
        if (convError) {
          if (convError.code === '23505') {
            const { data: existing } = await q.getConversationByApplicationId(supabase, application.id)
            if (existing?.id) conversationId = existing.id
            else throw convError
          } else throw convError
        } else {
          conversationId = newConv!.id
        }
      }

      if (!conversationId) throw new Error('Conversation not found')
      const { error: messageError } = await q.insertMessage(supabase, {
        conversation_id: conversationId,
        sender_id: currentUser.id,
        content: messageContent.trim()
      })
      if (messageError) throw messageError

      const { data: currentUserProfiles } = await q.getUserProfilesByIds(supabase, [currentUser.id], 'id, full_name, role')
      type SenderProfile = { id: string; full_name: string | null; role: string | null }
      const currentUserProfile = (currentUserProfiles?.[0] ?? null) as SenderProfile | null

      // Clear message
      const messageText = messageContent.trim()
      setMessageContent('')
      
      // Add the new message to the list immediately (optimistic update)
      const optimisticMessage: Message = {
        id: '', // Will be set by real-time subscription
        conversation_id: conversationId!,
        sender_id: currentUser.id,
        content: messageText,
        is_read: [currentUser.id], // Sender has read their own message
        created_at: new Date().toISOString(),
        sender: {
          id: currentUser.id,
          user_profiles: currentUserProfile || null
        },
        is_own: true
      }
      
      // Update messages optimistically
      setMessages(prev => [...prev, optimisticMessage])
      
      // Update conversation list if needed
      if (conversationId && !selectedConversation) {
        setSelectedConversation(conversationId)
        await loadMessages(conversationId)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const day = d.getDate()
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${month} ${day}, ${time}`
  }

  const getSenderName = (message: Message) => {
    if (message.is_own) {
      return 'Expert'
    }
    if (message.sender?.user_profiles?.full_name) {
      return message.sender.user_profiles.full_name
    }
    if (message.sender?.user_profiles?.role === 'admin') {
      return 'Administrator'
    }
    if (message.sender?.user_profiles?.role === 'company_owner') {
      return 'Business Owner'
    }
    if (message.sender?.user_profiles?.role === 'expert') {
      return 'Expert'
    }
    return 'User'
  }

  const getSenderRole = (message: Message) => {
    if (message.is_own) {
      return 'Expert'
    }
    if (message.sender?.user_profiles?.role === 'admin') {
      return 'Admin'
    }
    if (message.sender?.user_profiles?.role === 'company_owner') {
      return 'Owner'
    }
    if (message.sender?.user_profiles?.role === 'expert') {
      return 'Expert'
    }
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

  if (loading) {
    return (
      <ExpertDashboardLayout user={user} profile={profile}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading...</div>
        </div>
      </ExpertDashboardLayout>
    )
  }

  const totalMessages = messageDashboardTotals.total
  const unreadMessages = messageDashboardTotals.unread
  const activeConversations = conversations.length

  return (
    <ExpertDashboardLayout user={user} profile={profile}>
      <div className="space-y-4 sm:space-y-6 mt-20">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Messages</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Communicate with your assigned clients
          </p>
        </div>

        {/* Message Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{totalMessages}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Messages</div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{unreadMessages}</div>
            <div className="text-xs sm:text-sm text-gray-600">Unread</div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{activeConversations}</div>
            <div className="text-xs sm:text-sm text-gray-600">Active Conversations</div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Recent Messages */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Recent Messages</h2>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Messages List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {conversations.length > 0 ? (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversation(conv.id)
                      // Find client from application
                      if (conv.application?.company_owner_id) {
                        const client = clients.find(c => c.id === selectedClient)
                        if (!client) {
                          // Try to find client by company_owner_id
                          // For now, just set the conversation
                        }
                      }
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConversation === conv.id
                        ? 'bg-blue-50 border-2 border-blue-200'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-gray-900">
                        {conv.application?.application_name || 'Unknown Application'}
                      </div>
                      {conv.application?.state && (
                        <div className="text-xs text-gray-500">
                          {conv.application.state}
                        </div>
                      )}
                      {conv.unread_count && conv.unread_count > 0 && (
                        <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {formatDate(conv.last_message_at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No messages yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Send Message */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => setActiveTab('new')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  activeTab === 'new'
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  New Message
                </div>
              </button>
              <button
                onClick={() => setActiveTab('send')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  activeTab === 'send'
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Send Message
              </button>
            </div>

            {/* Message Area */}
            <div className="space-y-4">
              {!selectedClient ? (
                <>
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Select a client to send a message</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Your Clients:</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {clients.length > 0 ? (
                        clients.map((client) => (
                          <div
                            key={client.id}
                            onClick={() => setSelectedClient(client.id)}
                            className={`p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedClient === client.id
                                ? 'bg-gray-100 border-2 border-gray-300'
                                : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-gray-600" />
                              <span className="font-medium text-gray-900">{client.company_name}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No clients assigned
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Selected Client Info */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-600" />
                        <span className="font-medium text-gray-900">
                          {clients.find(c => c.id === selectedClient)?.company_name}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedClient(null)
                          setSelectedConversation(null)
                          setMessages([])
                        }}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  {/* Messages Display */}
                  {selectedConversation && messages.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-4">
                      {messages.map((msg) => {
                        const senderName = getSenderName(msg)
                        const senderRole = getSenderRole(msg)
                        const initials = getInitials(senderName)
                        const roleTagColor = getRoleTagColor(senderRole)
                        const avatarColor = getAvatarColor(senderName, senderRole)
                        
                        return (
                          <div
                            key={msg.id}
                            className="flex items-start gap-3"
                          >
                            {/* Avatar */}
                            <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                              {initials}
                            </div>
                            
                            {/* Message Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">
                                  {senderName}
                                </span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleTagColor}`}>
                                  {senderRole}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                              <div className="bg-white border border-gray-200 rounded-lg p-3">
                                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}

                  {/* Message Input */}
                  <div className="space-y-2">
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
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageContent.trim() || sending}
                      className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {sending ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ExpertDashboardLayout>
  )
}

export default function ExpertMessagesPage() {
  return (
    <Suspense fallback={
      <ExpertDashboardLayout user={null} profile={null}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </ExpertDashboardLayout>
    }>
      <ExpertMessagesContent />
    </Suspense>
  )
}