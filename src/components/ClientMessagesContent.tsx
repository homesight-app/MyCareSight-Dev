'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { MessageSquare, Search, Paperclip, Send, Check } from 'lucide-react'

interface Conversation {
  id: string
  client_id: string
  expert_id: string | null
  last_message_at: string
  expert?: {
    user_id: string
    first_name: string
    last_name: string
  }
  unread_count?: number
  conversation_type: 'admin' | 'expert'
}

interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  is_read: boolean
  created_at: string
  sender?: {
    id: string
    email: string
    user_profiles?: {
      full_name?: string | null
      role?: string | null
    }
  }
}

interface ClientMessagesContentProps {
  initialConversations: Conversation[]
  userId: string
  clientId: string
  adminUserId?: string
}

export default function ClientMessagesContent({
  initialConversations,
  userId,
  clientId,
  adminUserId
}: ClientMessagesContentProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageContent, setMessageContent] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const selectedConversation = conversations.find(c => c.id === selectedConversationId)

  const loadMessages = async (conversationId: string) => {
    try {
      setLoading(true)
      const { data: messagesData, error } = await q.getMessagesByConversationId(supabase, conversationId)

      if (error) throw error

      const senderIds = Array.from(new Set(messagesData?.map(m => m.sender_id) || [])) as string[]
      const { data: userProfiles } = senderIds.length > 0 ? await q.getUserProfilesByIds(supabase, senderIds) : { data: [] }

      type ProfileRow = { id: string; full_name?: string | null; role?: string | null }
      const profilesList = (userProfiles ?? []) as unknown as ProfileRow[]
      const profilesById: Record<string, ProfileRow> = {}
      profilesList.forEach(p => {
        profilesById[p.id] = p
      })

      // Combine messages with sender info
      const messagesWithSenders = (messagesData || []).map(msg => ({
        ...msg,
        sender: {
          id: msg.sender_id,
          email: '',
          user_profiles: profilesById[msg.sender_id] || null
        }
      }))

      await q.markConversationMessagesAsReadExceptSender(supabase, conversationId, userId)

      setMessages(messagesWithSenders)
    } catch (error) {
      console.error('Error loading messages:', error)
      const { data: messagesData } = await q.getMessagesByConversationId(supabase, conversationId)
      setMessages(messagesData || [])
    } finally {
      setLoading(false)
    }
  }

  // Handle conversation selection
  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId)
    await loadMessages(conversationId)
  }

  // Send message
  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedConversationId || sending) return

    try {
      setSending(true)
      
      const { error: messageError } = await q.insertMessage(supabase, {
        conversation_id: selectedConversationId,
        sender_id: userId,
        content: messageContent.trim()
      })

      if (messageError) throw messageError

      await q.updateConversationLastMessageAt(supabase, selectedConversationId)

      // Clear message - real-time subscription will add the new message
      setMessageContent('')
      
      // Scroll to bottom (message will appear via real-time subscription)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // Format time for message display
  const formatTime = (date: string) => {
    const d = new Date(date)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Get sender name
  const getSenderName = (message: Message) => {
    if (message.sender_id === userId) {
      return 'You'
    }
    if (message.sender?.user_profiles?.full_name) {
      return message.sender.user_profiles.full_name
    }
    if (message.sender?.user_profiles?.role === 'admin') {
      return 'Admin'
    }
    if (message.sender?.email) {
      return message.sender.email.split('@')[0]
    }
    return 'Unknown'
  }

  // Get conversation display name
  const getConversationName = (conv: Conversation) => {
    if (conv.conversation_type === 'admin') {
      return 'Admin'
    }
    if (conv.expert) {
      return `${conv.expert.first_name} ${conv.expert.last_name}`
    }
    return 'Expert'
  }

  // Filter conversations by search
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const name = getConversationName(conv).toLowerCase()
    return name.includes(query)
  })

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!selectedConversationId) return

    const channel = supabase
      .channel(`messages:${selectedConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        async (payload) => {
          // Get the new message
          const newMessage = payload.new as Message
          
          const { data: profiles } = await q.getUserProfilesByIds(supabase, [newMessage.sender_id])
          type ProfileRow = { id: string; full_name?: string | null; role?: string | null }
          const userProfile = ((profiles ?? []) as unknown as ProfileRow[])[0]

          const messageWithSender: Message = {
            ...newMessage,
            sender: {
              id: newMessage.sender_id,
              email: '',
              user_profiles: userProfile
                ? { full_name: userProfile.full_name ?? undefined, role: userProfile.role ?? undefined }
                : undefined
            }
          }

          // Add new message to existing messages (avoid duplicates)
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

          if (newMessage.sender_id !== userId && !newMessage.is_read) {
            await q.rpcMarkMessageAsReadByUser(supabase, newMessage.id, userId)
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
  }, [selectedConversationId, userId, supabase])

  const totalUnread = conversations.reduce((acc, conv) => acc + (conv.unread_count || 0), 0)

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-200px)] gap-4">
      {/* Conversations List */}
      <div className="w-full lg:w-96 bg-white rounded-xl shadow-md border border-gray-100 flex flex-col">
        <div className="p-3 md:p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
              Messages
            </h2>
          </div>
          <p className="text-xs md:text-sm text-gray-600">{totalUnread} unread</p>
        </div>
        
        <div className="p-3 md:p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 md:w-4 md:h-4" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 md:pl-10 pr-4 py-2 text-xs md:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {filteredConversations.map((conv) => {
                const isSelected = selectedConversationId === conv.id
                const conversationName = getConversationName(conv)

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`p-3 md:p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2 md:gap-3">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-xs md:text-sm flex-shrink-0">
                        {getInitials(conversationName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <h3 className="text-sm md:text-base font-semibold text-gray-900 truncate">
                            {conversationName}
                          </h3>
                        </div>
                        <p className="text-xs md:text-sm text-gray-600 truncate">
                          {conv.conversation_type === 'admin' ? 'Administrator' : 'Licensing Expert'}
                        </p>
                        {conv.unread_count && conv.unread_count > 0 && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                            {conv.unread_count} new
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-6 md:p-8 text-center text-gray-500">
              <MessageSquare className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No conversations</p>
            </div>
          )}
        </div>
      </div>

      {/* Message View */}
      <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-100 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {getInitials(getConversationName(selectedConversation))}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {getConversationName(selectedConversation)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {selectedConversation.conversation_type === 'admin' ? 'Administrator' : 'Licensing Expert'}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">Loading messages...</div>
                </div>
              ) : messages.length > 0 ? (
                messages.map((message) => {
                  const isOwn = message.sender_id === userId
                  const senderName = getSenderName(message)

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-start gap-2`}
                    >
                      {!isOwn && (
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {getInitials(senderName)}
                        </div>
                      )}
                      <div className={`max-w-[70%] ${isOwn ? 'order-2' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700">{senderName}</span>
                          <span className="text-xs text-gray-500">{formatTime(message.created_at)}</span>
                        </div>
                        <div
                          className={`p-3 rounded-lg ${
                            isOwn
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        {isOwn && (
                          <div className="flex justify-end mt-1">
                            <Check className="w-3 h-3 text-gray-400" />
                          </div>
                        )}
                      </div>
                      {isOwn && (
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {getInitials('You')}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No messages yet</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-end gap-2">
                <button
                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </button>
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageContent.trim() || sending}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-4">
              <MessageSquare className="w-16 h-16 md:w-24 md:h-24 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg md:text-xl font-semibold text-gray-700 mb-2">Select a conversation</h3>
              <p className="text-sm md:text-base text-gray-500">Choose a conversation to view messages.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
