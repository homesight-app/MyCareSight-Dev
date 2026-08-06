import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClientMessagesContent from '@/components/ClientMessagesContent'
import { MessageSquare } from 'lucide-react'
import { getCachedAgencyMessagesInbox } from '@/lib/server-cache/agency-messages-inbox'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  try {
    const session = await getSession()
    if (!session) redirect('/pages/auth/login')

    const inbox = await getCachedAgencyMessagesInbox(session.user.id)
    if (!inbox.ok) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center p-8">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Client Record Found</h3>
            <p className="text-sm text-gray-500">
              Please contact the administrator to set up your client account.
            </p>
          </div>
        </div>
      )
    }

    return (
      <ClientMessagesContent
        initialConversations={inbox.conversationsWithData}
        userId={session.user.id}
        clientId={inbox.clientId}
        adminUserId={inbox.adminUserId || undefined}
      />
    )
  } catch (error) {
    console.error('Error in MessagesPage:', error)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center p-8">
          <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Error Loading Messages</h3>
          <p className="text-sm text-gray-500">
            An error occurred while loading the messages page. Please try again later.
          </p>
        </div>
      </div>
    )
  }
}
