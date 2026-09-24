'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Eye, MessageSquare, UserCog, FileText, Edit } from 'lucide-react'
import * as q from '@/app/actions/query-bridge'
import EditClientModal from './EditClientModal'

interface Client {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  status: string
  start_date?: string | null
  expert_id?: string | null
}

interface ClientCardMenuProps {
  clientId: string
  client?: Client | null
}

export default function ClientCardMenu({
  clientId,
  client: clientProp,
}: ClientCardMenuProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [client, setClient] = useState<Client | null>(null)
  const [isLoadingClient, setIsLoadingClient] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Sync client state with prop when it changes (after refresh)
  useEffect(() => {
    if (clientProp && !isEditModalOpen) {
      // Only update if modal is closed to avoid interfering with form data
      setClient(clientProp)
    }
  }, [clientProp, isEditModalOpen])

  const handleViewDetails = () => {
    setIsOpen(false)
    try {
      router.push(`/pages/admin/clients/${clientId}`)
    } catch (error) {
      console.error('Navigation error:', error)
      window.location.href = `/pages/admin/clients/${clientId}`
    }
  }

  const handleEditClient = async () => {
    setIsOpen(false)
    setIsLoadingClient(true)
    
    // Always fetch fresh data from the database to ensure we have the latest information
    try {
      const { data, error } = await q.getClientById(clientId)

      if (error) {
        console.error('Error fetching client:', error)
        alert('Failed to load client information: ' + (error.message || 'Unknown error'))
        return
      }

      if (data) {
        setClient(data)
        setIsEditModalOpen(true)
      } else {
        alert('Client not found')
      }
    } catch (error: any) {
      console.error('Error:', error)
      alert('Failed to load client information: ' + (error.message || 'Unknown error'))
    } finally {
      setIsLoadingClient(false)
    }
  }

  const handleEditSuccess = () => {
    setIsEditModalOpen(false)
    setClient(null)
    // Refresh the page to get updated client data from server
    router.refresh()
  }

  const menuItems = [
    {
      label: 'View Details',
      icon: Eye,
      onClick: handleViewDetails,
    },
    // {
    //   label: 'Open Messages',
    //   icon: MessageSquare,
    //   onClick: handleOpenMessages,
    // },
    // {
    //   label: 'Change Expert',
    //   icon: UserCog,
    //   onClick: handleChangeExpert,
    // },
    // {
    //   label: 'View Applications',
    //   icon: FileText,
    //   onClick: handleViewApplications,
    // },
    {
      label: 'Edit Client Info',
      icon: Edit,
      onClick: handleEditClient,
    },
  ]

  return (
    <div className="relative" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="More options"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {menuItems.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  item.onClick()
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
              >
                <Icon className="w-4 h-4 text-gray-600" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}

      <EditClientModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setClient(null)
        }}
        client={client}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}
