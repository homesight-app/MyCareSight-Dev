'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'

interface UploadDocumentButtonProps {
  applicationId: string
  className?: string
}

export default function UploadDocumentButton({
  applicationId,
  className = ''
}: UploadDocumentButtonProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadStatus('idle')
    setErrorMessage(null)

    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be logged in to upload documents')
      }

      const { data: application, error: appError } = await q.getApplicationLicenseTypeState(supabase, applicationId)

      if (appError || !application) {
        throw new Error('Application not found')
      }

      // Validate if application has license_type_id (should have for approved applications)
      if (application.license_type_id) {
        // Get license type name
        const { data: licenseType, error: licenseTypeError } = await q.getLicenseTypeById(supabase, application.license_type_id)

        if (licenseTypeError || !licenseType) {
          throw new Error('License type not found')
        }

        // Find license_requirement_id for this state and license type
        const { data: licenseRequirement } = await q.getLicenseRequirementByStateAndType(supabase, application.state, licenseType.name)

        if (licenseRequirement) {
          const { steps: stepsCount, documents: documentsCount } = await q.getRequirementCounts(supabase, licenseRequirement.id)
          const totalItems = stepsCount + documentsCount

          // If no documents and no steps, show error
          if (totalItems === 0) {
            throw new Error('Current license type doesn\'t have any document and steps.')
          }
        }
        // If license_requirement doesn't exist, allow upload (might be a new license type setup)
      }

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${applicationId}/${Date.now()}.${fileExt}`
      const filePath = fileName

      // Upload with options: upsert allows overwriting, and we set content-type
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('application-documents')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || `image/${fileExt}`,
          cacheControl: '3600',
        })

      if (uploadError) {
        console.error('Upload error details:', uploadError)
        // Provide more detailed error message
        const errorMsg = uploadError.message || 'Failed to upload file'
        throw new Error(`Upload failed: ${errorMsg}. Please check storage bucket exists and policies are configured.`)
      }

      const { error: insertError } = await q.insertApplicationDocument(supabase, {
        application_id: applicationId,
        document_name: file.name,
        document_url: filePath,
        document_type: null,
        status: 'draft'
      })

      if (insertError) {
        // If insert fails, try to delete the uploaded file
        await supabase.storage
          .from('application-documents')
          .remove([filePath])
        throw insertError
      }

      // Send email notification to expert if assigned
      try {
        const { data: applicationDetails } = await q.getApplicationExpertAndOwner(supabase, applicationId)

        if (applicationDetails?.assigned_expert_id) {
          const { data: expertProfile } = await q.getUserProfileById(supabase, applicationDetails.assigned_expert_id)
          const { data: ownerProfile } = applicationDetails.company_owner_id
            ? await q.getUserProfileById(supabase, applicationDetails.company_owner_id)
            : { data: null }
          // if (expertProfile?.email) {
          //   // Trim email to remove any whitespace/newline characters
          //   const trimmedEmail = expertProfile.email.trim()
          //   fetch('/api/send-email-notification', {
          //     method: 'POST',
          //     headers: {
          //       'Content-Type': 'application/json',
          //     },
          //     body: JSON.stringify({
          //       expertEmail: trimmedEmail,
          //       expertName: expertProfile.full_name || undefined,
          //       ownerName: ownerProfile?.full_name || undefined,
          //       applicationName: applicationDetails.application_name,
          //       documentName: file.name,
          //       applicationId: applicationId
          //     })
          //   }).then(async response => {
          //     const result = await response.json()
          //     if (!response.ok && result.warning) {
          //       // Testing mode warning - log but don't show error to user
          //       console.warn('Email notification:', result.warning)
          //     } else if (!response.ok) {
          //       console.error('Failed to send email notification:', result)
          //     }
          //   }).catch(err => {
          //     console.error('Failed to send email notification:', err)
          //     // Don't throw - email failure shouldn't break upload
          //   })
          // }
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError)
        // Don't throw - email failure shouldn't break upload
      }

      setUploadStatus('success')
      router.refresh()

      // Reset status after 2 seconds
      setTimeout(() => {
        setUploadStatus('idle')
      }, 2000)
    } catch (err: any) {
      setUploadStatus('error')
      console.error('Upload error:', err)
      // Show more detailed error message
      const errorMsg = err.message || err.error?.message || 'Failed to upload document. Please try again.'
      setErrorMessage(errorMsg)
      
      // Reset status after 5 seconds to give user time to read the error
      setTimeout(() => {
        setUploadStatus('idle')
        setErrorMessage(null)
      }, 5000)
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        disabled={isUploading}
      />
      <button
        onClick={handleClick}
        disabled={isUploading}
        className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : uploadStatus === 'success' ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Uploaded!
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload
          </>
        )}
      </button>
      {uploadStatus === 'error' && errorMessage && (
        <div className="absolute top-full left-0 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs max-w-xs z-10 shadow-lg">
          {errorMessage}
        </div>
      )}
    </div>
  )
}

