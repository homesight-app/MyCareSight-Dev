'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Upload
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { useState } from 'react'

interface License {
  id: string
  license_name: string
  license_type: string
  license_number: string | null
  state: string
  status: string
  activated_date: string | Date | null
  expiry_date: string | Date | null
  renewal_due_date: string | Date | null
  issue_date: string | Date | null
  days_until_expiry: number | null
  issuing_authority: string | null
  created_at: string | Date | null
  updated_at: string | Date | null
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  created_at: string | Date | null
}

interface StaffLicenseDetailContentProps {
  license: License
  documents: Document[]
}

export default function StaffLicenseDetailContent({
  license,
  documents
}: StaffLicenseDetailContentProps) {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'expiring':
        return 'bg-yellow-100 text-yellow-700'
      case 'expired':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-4 h-4" />
      case 'expiring':
        return <AlertCircle className="w-4 h-4" />
      case 'expired':
        return <XCircle className="w-4 h-4" />
      default:
        return null
    }
  }

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active'
      case 'expiring':
        return 'Expiring Soon'
      case 'expired':
        return 'Expired'
      default:
        return status.charAt(0).toUpperCase() + status.slice(1)
    }
  }

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
      console.error('Error downloading document:', error)
      alert('Failed to download document. Please try again.')
    }
  }

  const handleUploadDocument = async () => {
    const input = document.createElement('input')
    input.type = 'file'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setIsUploading(true)
      try {
        const supabase = createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('You must be logged in to upload documents')
        }

        const fileExt = file.name.split('.').pop()
        const fileName = `${license.id}/${Date.now()}.${fileExt}`
        
        // Upload file to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('application-documents')
          .upload(fileName, file, {
            upsert: false,
            contentType: file.type || `application/${fileExt}`,
            cacheControl: '3600',
          })

        if (uploadError) {
          console.error('Upload error details:', uploadError)
          const errorMsg = uploadError.message || 'Failed to upload file'
          throw new Error(`Upload failed: ${errorMsg}. Please check storage bucket exists and policies are configured.`)
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('application-documents')
          .getPublicUrl(fileName)

        // Create document record
        const { error: docError } = await q.insertApplicationDocument(supabase, {
          application_id: license.id,
          document_name: file.name,
          document_url: publicUrl,
          document_type: fileExt?.toLowerCase() || null
        })

        if (docError) {
          // If insert fails, try to delete the uploaded file
          await supabase.storage
            .from('application-documents')
            .remove([fileName])
          throw docError
        }

        router.refresh()
      } catch (error: any) {
        console.error('Error uploading document:', error)
        const errorMsg = error.message || error.error?.message || 'Failed to upload document. Please try again.'
        alert(errorMsg)
      } finally {
        setIsUploading(false)
      }
    }
    input.click()
  }

  // Calculate days until expiry
  const getDaysUntilExpiry = () => {
    if (license.days_until_expiry !== null && license.days_until_expiry !== undefined) {
      return license.days_until_expiry
    }
    if (!license.expiry_date) return null
    const expiryDate = new Date(license.expiry_date)
    const today = new Date()
    const diffTime = expiryDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const daysUntilExpiry = getDaysUntilExpiry()

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/pages/caregiver/my-licenses"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{license.license_name}</h1>
            <div className="flex items-center gap-4 text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{license.state}</span>
              </div>
              {license.license_number && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>License #: {license.license_number}</span>
                </div>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${getStatusBadge(license.status)}`}>
                {getStatusIcon(license.status)}
                {getStatusDisplay(license.status)}
              </span>
            </div>
          </div>
          <button
            onClick={handleUploadDocument}
            disabled={isUploading}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>

        {/* License Information */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">License Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-500">License Type</label>
              <p className="text-base text-gray-900 mt-1">{license.license_type}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">License Number</label>
              <p className="text-base text-gray-900 mt-1">{license.license_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">State</label>
              <p className="text-base text-gray-900 mt-1">{license.state}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Status</label>
              <p className="text-base text-gray-900 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(license.status)}`}>
                  {getStatusIcon(license.status)}
                  {getStatusDisplay(license.status)}
                </span>
              </p>
            </div>
            {license.issue_date && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Issue Date
                </label>
                <p className="text-base text-gray-900 mt-1">{formatDate(license.issue_date)}</p>
              </div>
            )}
            {license.activated_date && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Activated Date
                </label>
                <p className="text-base text-gray-900 mt-1">{formatDate(license.activated_date)}</p>
              </div>
            )}
            {license.expiry_date && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Expiry Date
                </label>
                <p className="text-base text-gray-900 mt-1">
                  {formatDate(license.expiry_date)}
                  {daysUntilExpiry !== null && (
                    <span className={`ml-2 text-sm font-semibold ${
                      daysUntilExpiry <= 30 ? 'text-red-600' :
                      daysUntilExpiry <= 90 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      ({daysUntilExpiry > 0 ? `${daysUntilExpiry} days remaining` : 'Expired'})
                    </span>
                  )}
                </p>
              </div>
            )}
            {license.renewal_due_date && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Renewal Due Date
                </label>
                <p className="text-base text-gray-900 mt-1">{formatDate(license.renewal_due_date)}</p>
              </div>
            )}
            {license.issuing_authority && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-500">Issuing Authority</label>
                <p className="text-base text-gray-900 mt-1">{license.issuing_authority}</p>
              </div>
            )}
          </div>
        </div>

        {/* Documents Section */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
            <span className="text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
          </div>
          {documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.document_name}</p>
                      {doc.document_type && (
                        <p className="text-xs text-gray-500 mt-1">Type: {doc.document_type.toUpperCase()}</p>
                      )}
                      {doc.created_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Uploaded: {formatDate(doc.created_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(doc.document_url, doc.document_name)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 flex-shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">No documents uploaded yet</p>
              <button
                onClick={handleUploadDocument}
                disabled={isUploading}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {isUploading ? 'Uploading...' : 'Upload First Document'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
