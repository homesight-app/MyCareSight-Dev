'use client'

import { useState, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { licenseSchema, type CreateLicenseFormData } from '@/lib/schemas/license'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { revalidateLicensesPage, createLicenseForAgency, linkProgramToCertification, createCertificationAndLink } from '@/app/actions/licenses'
import { uploadLicenseDocumentAction, uploadLicenseDocumentsForCreationAction, removeUploadedLicenseFilesAction } from '@/app/actions/license-documents'
import { Loader2, Upload, X, FileText, Plus } from 'lucide-react'
import Modal from './Modal'
import { US_STATES } from '@/lib/constants'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'


interface PendingDoc {
  id: string
  file: File | null
  name: string
  type: string
  typeError: string | null
}

interface AvailableProgram {
  id: string
  application_name: string
  status: string
}

interface CreateLicenseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  agencyId?: string
  agencyName?: string
  availablePrograms?: AvailableProgram[]
  lockedProgramId?: string
  defaultLicenseName?: string
  licenseToEdit?: {
    id: string
    license_name: string
    license_number?: string | null
    state?: string | null
    activated_date?: string | null
    expiry_date?: string | null
    renewal_due_date?: string | null
  }
}


const DOC_TYPES = ['license', 'certificate', 'insurance', 'contract', 'policy', 'other']

function newPendingDoc(): PendingDoc {
  return { id: Math.random().toString(36).slice(2), file: null, name: '', type: '', typeError: null }
}

export default function CreateLicenseModal({
  isOpen,
  onClose,
  onSuccess,
  agencyId,
  agencyName,
  availablePrograms = [],
  lockedProgramId,
  defaultLicenseName,
  licenseToEdit,
}: CreateLicenseModalProps) {
  const isEditMode = !!licenseToEdit
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [linkedProgramId, setLinkedProgramId] = useState('')
  const [linkType, setLinkType] = useState<'created_from' | 'renewal_of'>('created_from')
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateLicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      license_name: licenseToEdit?.license_name ?? defaultLicenseName ?? '',
      license_number: licenseToEdit?.license_number ?? '',
      state: licenseToEdit?.state ?? '',
      expiry_date: licenseToEdit?.expiry_date?.split('T')[0] ?? '',
      activated_date: licenseToEdit?.activated_date?.split('T')[0] ?? '',
      renewal_due_date: licenseToEdit?.renewal_due_date?.split('T')[0] ?? '',
      issuing_body: '',
    },
  })

  const updateDoc = useCallback((id: string, patch: Partial<PendingDoc>) => {
    setPendingDocs(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
  }, [])

  const handleFileSelect = useCallback((docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file) {
      setPendingDocs(prev => prev.map(d =>
        d.id === docId ? { ...d, file, name: d.name || file.name } : d
      ))
    }
  }, [])

  const removeDoc = useCallback((docId: string) => {
    setPendingDocs(prev => prev.filter(d => d.id !== docId))
    if (fileInputRefs.current[docId]) {
      fileInputRefs.current[docId]!.value = ''
      delete fileInputRefs.current[docId]
    }
  }, [])

  const handleClose = () => {
    reset()
    setPendingDocs([])
    setLinkedProgramId('')
    setLinkType('created_from')
    onClose()
  }

  const onSubmit = async (data: CreateLicenseFormData) => {
    // Validate all pending docs
    let hasDocError = false
    const validated = pendingDocs.map(d => {
      if (d.file && !d.type.trim()) {
        hasDocError = true
        return { ...d, typeError: 'Document type is required' }
      }
      return { ...d, typeError: null }
    })
    if (hasDocError) { setPendingDocs(validated); return }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const docsWithFiles = pendingDocs.filter(d => d.file !== null)

      // ── Edit mode ──────────────────────────────────────────────────────────
      if (isEditMode && licenseToEdit) {
        const { error: updateError } = await q.updateLicenseById(supabase, licenseToEdit.id, {
          license_name: data.license_name,
          license_number: data.license_number || null,
          state: data.state || null,
          activated_date: data.activated_date || null,
          expiry_date: data.expiry_date,
          renewal_due_date: data.renewal_due_date || null,
        })
        if (updateError) throw updateError

        for (const doc of docsWithFiles) {
          const fd = new FormData()
          fd.append('file', doc.file!)
          if (doc.name.trim()) fd.set('document_name', doc.name.trim())
          if (doc.type) fd.set('document_type', doc.type)
          const { error: docErr } = await uploadLicenseDocumentAction(licenseToEdit.id, null, fd)
          if (docErr) throw new Error(docErr)
        }

        showSuccessToast('License updated successfully')
        reset()
        setPendingDocs([])
        router.refresh()
        handleClose()
        onSuccess()
        return
      }

      // ── Agency mode ────────────────────────────────────────────────────────
      if (agencyId) {
        let uploadedDocs: { url: string; name: string; type: string | null }[] = []

        if (docsWithFiles.length > 0) {
          const fd = new FormData()
          for (const doc of docsWithFiles) {
            fd.append('file', doc.file!)
            fd.append('name', doc.name.trim() || doc.file!.name)
            fd.append('type', doc.type || '')
          }
          const { error: uploadErr, data: uploaded } = await uploadLicenseDocumentsForCreationAction(agencyId, fd)
          if (uploadErr) throw new Error(uploadErr)
          uploadedDocs = uploaded ?? []
        }

        const certPayload = {
          license_name: data.license_name,
          license_number: data.license_number || undefined,
          state: data.state || undefined,
          activated_date: data.activated_date,
          expiry_date: data.expiry_date,
          renewal_due_date: data.renewal_due_date || undefined,
          issuing_body: data.issuing_body || undefined,
          documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
        }

        if (lockedProgramId) {
          const { error: certErr } = await createCertificationAndLink(agencyId, lockedProgramId, certPayload)
          if (certErr) {
            await removeUploadedLicenseFilesAction(uploadedDocs.map(d => d.url))
            throw new Error(certErr)
          }
        } else {
          const result = await createLicenseForAgency({ agencyId, ...certPayload })
          if (result.error) {
            await removeUploadedLicenseFilesAction(uploadedDocs.map(d => d.url))
            throw new Error(result.error)
          }
          if (result.data?.id && linkedProgramId) {
            const { error: linkErr } = await linkProgramToCertification(result.data.id, linkedProgramId, agencyId, linkType)
            if (linkErr) console.error('[CreateLicenseModal] Failed to link program:', linkErr)
          }
        }

        showSuccessToast(isEditMode ? 'License updated successfully' : 'License added successfully')
        reset()
        setPendingDocs([])
        setLinkedProgramId('')
        router.refresh()
        handleClose()
        onSuccess()
        return
      }

      // ── Owner mode ─────────────────────────────────────────────────────────
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { showValidationToast({ error: 'You must be logged in to create a license' }); setIsSubmitting(false); return }

      const { data: newLicense, error } = await q.insertLicenseReturning(supabase, {
        company_owner_id: authUser.id,
        license_name: data.license_name,
        license_number: data.license_number || null,
        state: data.state || null,
        status: 'active',
        expiry_date: data.expiry_date,
        activated_date: data.activated_date || null,
        renewal_due_date: data.renewal_due_date || null,
      })
      if (error) throw error
      if (!newLicense?.id) throw new Error('License was created but no ID returned')

      for (const doc of docsWithFiles) {
        const fd = new FormData()
        fd.append('file', doc.file!)
        if (doc.name.trim()) fd.set('document_name', doc.name.trim())
        if (doc.type) fd.set('document_type', doc.type)
        const { error: docErr } = await uploadLicenseDocumentAction(newLicense.id, null, fd)
        if (docErr) throw new Error(docErr)
      }

      showSuccessToast('License created successfully')
      await revalidateLicensesPage()
      reset()
      setPendingDocs([])
      handleClose()
      onSuccess()
    } catch (err: unknown) {
      showValidationToast({ error: err instanceof Error ? err.message : 'Failed to create license. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = isEditMode
    ? `Edit License — ${licenseToEdit!.license_name}`
    : lockedProgramId
    ? 'Create New Certification'
    : agencyId && agencyName
    ? `Add License — ${agencyName}`
    : 'Create License'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        {/* License Name */}
        <div>
          <label htmlFor="license_name" className="block text-sm font-semibold text-gray-700 mb-1">
            License Name <span className="text-red-500">*</span>
          </label>
          <input
            id="license_name"
            type="text"
            {...register('license_name')}
            placeholder="e.g., Home Care Agency License"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {errors.license_name && <p className="mt-1 text-sm text-red-600">{errors.license_name.message}</p>}
        </div>

        {/* State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-1">
              State
            </label>
            <select
              id="state"
              {...register('state')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
            >
              <option value="">Select a state</option>
              {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            {errors.state && <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>}
          </div>
        </div>

        {/* License Number + Issuing Body */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="license_number" className="block text-sm font-semibold text-gray-700 mb-1">
              License Number
            </label>
            <input
              id="license_number"
              type="text"
              {...register('license_number')}
              placeholder="e.g., HC-12345"
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label htmlFor="issuing_body" className="block text-sm font-semibold text-gray-700 mb-1">
              Issuing Body
            </label>
            <input
              id="issuing_body"
              type="text"
              {...register('issuing_body')}
              placeholder="e.g., State Health Dept."
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="activated_date" className="block text-sm font-semibold text-gray-700 mb-1">
              Activated Date <span className="text-red-500">*</span>
            </label>
            <input
              id="activated_date"
              type="date"
              {...register('activated_date')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {errors.activated_date && <p className="mt-1 text-sm text-red-600">{errors.activated_date.message}</p>}
          </div>
          <div>
            <label htmlFor="expiry_date" className="block text-sm font-semibold text-gray-700 mb-1">
              Expiry Date <span className="text-red-500">*</span>
            </label>
            <input
              id="expiry_date"
              type="date"
              {...register('expiry_date')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {errors.expiry_date && <p className="mt-1 text-sm text-red-600">{errors.expiry_date.message}</p>}
          </div>
          <div>
            <label htmlFor="renewal_due_date" className="block text-sm font-semibold text-gray-700 mb-1">
              Renewal Due Date
            </label>
            <input
              id="renewal_due_date"
              type="date"
              {...register('renewal_due_date')}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Documents */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-gray-700">
              Documents <span className="text-xs font-normal text-gray-500">(optional)</span>
            </label>
            <button
              type="button"
              onClick={() => setPendingDocs(prev => [...prev, newPendingDoc()])}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add document
            </button>
          </div>

          {pendingDocs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
              No documents added — click &ldquo;Add document&rdquo; to attach files
            </p>
          )}

          <div className="space-y-3">
            {pendingDocs.map(doc => (
              <div key={doc.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                {!doc.file ? (
                  <div
                    onClick={() => fileInputRefs.current[doc.id]?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
                  >
                    <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                    <p className="text-xs text-gray-500">Click to choose file</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, DOC, DOCX, JPG, PNG (max 10MB)</p>
                    <input
                      ref={el => { fileInputRefs.current[doc.id] = el }}
                      type="file"
                      onChange={e => handleFileSelect(doc.id, e)}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      disabled={isSubmitting}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{doc.file.name}</p>
                      <p className="text-xs text-gray-400">{(doc.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDoc(doc.id)}
                      disabled={isSubmitting}
                      className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                )}

                {doc.file && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <input
                        type="text"
                        value={doc.name}
                        onChange={e => updateDoc(doc.id, { name: e.target.value })}
                        placeholder="Document name"
                        disabled={isSubmitting}
                        className="block w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <select
                        value={doc.type}
                        onChange={e => updateDoc(doc.id, { type: e.target.value, typeError: null })}
                        disabled={isSubmitting}
                        className={`block w-full px-2.5 py-1.5 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white ${doc.typeError ? 'border-red-500 border' : 'border border-gray-300'}`}
                      >
                        <option value="">Type *</option>
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                      </select>
                      {doc.typeError && <p className="mt-0.5 text-xs text-red-600">{doc.typeError}</p>}
                    </div>
                  </div>
                )}

                {!doc.file && (
                  <button
                    type="button"
                    onClick={() => removeDoc(doc.id)}
                    disabled={isSubmitting}
                    className="mt-2 text-xs text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Link to Program — locked context (from program detail) */}
        {agencyId && lockedProgramId && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-500">
              This certification will be automatically linked as <strong>&ldquo;created from this program.&rdquo;</strong>
            </p>
          </div>
        )}

        {/* Link to Program — agency mode only (not when locked to a program) */}
        {agencyId && !lockedProgramId && availablePrograms.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Link to Program <span className="text-xs font-normal text-gray-500">(optional)</span>
            </label>
            <select
              value={linkedProgramId}
              onChange={e => setLinkedProgramId(e.target.value)}
              disabled={isSubmitting}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
            >
              <option value="">— No program linked —</option>
              {availablePrograms.map(p => (
                <option key={p.id} value={p.id}>
                  {p.application_name} ({p.status})
                </option>
              ))}
            </select>
            {linkedProgramId && (
              <div className="mt-2 flex items-center gap-4">
                <span className="text-xs text-gray-500 font-medium">Relationship:</span>
                {(['created_from', 'renewal_of'] as const).map(type => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="link_type"
                      value={type}
                      checked={linkType === type}
                      onChange={() => setLinkType(type)}
                      className="accent-blue-600"
                    />
                    <span className="text-xs text-gray-700 capitalize">{type.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {agencyId ? 'Adding…' : 'Creating…'}
              </>
            ) : (
              isEditMode ? 'Save Changes' : agencyId ? 'Add License' : 'Create License'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
