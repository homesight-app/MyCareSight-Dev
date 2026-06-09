'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Copy, ExternalLink, Check, Loader2, ChevronDown, ChevronUp, AlertCircle, Clock, X } from 'lucide-react'
import { generateOnboardingToken, revokeOnboardingToken } from '@/app/actions/agency-onboarding'
import type { OnboardingToken } from '@/lib/supabase/query'

interface AgencyOnboardingLinkPanelProps {
  agencyId: string
  agencyName: string
  activeToken: OnboardingToken | null
}

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h remaining`
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${mins}m remaining`
}

const EXPIRY_OPTIONS = [
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
]

export default function AgencyOnboardingLinkPanel({
  agencyId,
  agencyName,
  activeToken,
}: AgencyOnboardingLinkPanelProps) {
  const router = useRouter()
  const [sendPanelOpen, setSendPanelOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [note, setNote] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? ''

  const linkUrl = activeToken ? `${appUrl}/pages/onboarding/${activeToken.token}` : ''

  const handleCopy = async () => {
    if (!linkUrl) return
    try {
      await navigator.clipboard.writeText(linkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select+copy
    }
  }

  const handleSend = async () => {
    setIsSending(true)
    setSendError(null)
    const result = await generateOnboardingToken(agencyId, {
      expiresInDays,
      note: note.trim() || undefined,
      recipientEmail: recipientEmail.trim() || undefined,
    })
    setIsSending(false)
    if (result.error) {
      setSendError(result.error)
      return
    }
    setSendPanelOpen(false)
    setRecipientEmail('')
    setNote('')
    setExpiresInDays(7)
    router.refresh()
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke this link? The agency will no longer be able to use it.')) return
    setIsRevoking(true)
    await revokeOnboardingToken(agencyId)
    setIsRevoking(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-purple-600" />
          <h2 className="text-base font-semibold text-gray-900">Onboarding Link</h2>
        </div>
        <button
          type="button"
          onClick={() => { setSendPanelOpen(prev => !prev); setSendError(null) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
        >
          {sendPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {activeToken ? 'Send New Link' : 'Send Link'}
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Status */}
        {!activeToken ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            No active onboarding link. Use &quot;Send Link&quot; to generate one.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                {formatTimeRemaining(activeToken.expires_at)}
              </span>
              <span className="text-sm text-gray-500">
                {activeToken.use_count} {activeToken.use_count === 1 ? 'visit' : 'visits'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-700 font-mono">
                {linkUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                title="Copy link"
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
              </button>
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open link"
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <ExternalLink className="w-4 h-4 text-gray-600" />
              </a>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                title="Revoke link"
                className="p-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
              >
                {isRevoking ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <X className="w-4 h-4 text-red-500" />}
              </button>
            </div>

            {activeToken.note && (
              <p className="text-xs text-gray-500 italic">&quot;{activeToken.note}&quot;</p>
            )}
          </div>
        )}

        {/* Send link panel */}
        {sendPanelOpen && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            {sendError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {sendError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Recipient email <span className="text-gray-400">(leave blank to just generate the link)</span>
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="admin@agencyname.com"
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expires in</label>
              <select
                value={expiresInDays}
                onChange={e => setExpiresInDays(Number(e.target.value))}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white"
              >
                {EXPIRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Personal note <span className="text-gray-400">(shown in email)</span>
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={`Hi ${agencyName} team, please complete your agency profile…`}
                rows={2}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setSendPanelOpen(false); setSendError(null) }}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {recipientEmail.trim() ? 'Send' : 'Generate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
