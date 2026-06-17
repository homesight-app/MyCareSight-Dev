'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Globe } from 'lucide-react'
import { TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from '@/lib/constants/template-variables'
import { createTemplate, updateTemplate } from '@/app/actions/templates'

const TemplateEditor = dynamic(() => import('./TemplateEditor'), { ssr: false })

interface Template {
  id: string
  name: string
  type: 'document' | 'email'
  category: string
  description: string | null
  subject: string | null
  content: string
  variables_used: string[] | null
  is_global: boolean
  agency_id: string | null
  is_active: boolean
}

interface TemplateDetailContentProps {
  template?: Template
  isAdmin: boolean
  agencyId?: string
  listPath: string
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export default function TemplateDetailContent({
  template,
  isAdmin,
  agencyId,
  listPath,
}: TemplateDetailContentProps) {
  const router = useRouter()
  const isEdit = !!template

  const [form, setForm] = useState({
    name:        template?.name ?? '',
    type:        (template?.type ?? 'document') as 'document' | 'email',
    category:    template?.category ?? 'other',
    description: template?.description ?? '',
    subject:     template?.subject ?? '',
    isGlobal:    template?.is_global ?? false,
  })
  const [content, setContent] = useState(template?.content ?? '')
  const [variables, setVariables] = useState<string[]>(template?.variables_used ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleEditorChange = useCallback((html: string, vars: string[]) => {
    setContent(html)
    setVariables(vars)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!content.trim() || content === '<p></p>') { setError('Template content cannot be empty.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      name:        form.name,
      type:        form.type,
      category:    form.category,
      description: form.description || undefined,
      subject:     form.type === 'email' ? form.subject : undefined,
      content,
      isGlobal:    isAdmin ? form.isGlobal : false,
      agencyId:    form.isGlobal ? undefined : agencyId,
    }

    let result: { error: string | null }
    if (isEdit && template) {
      result = await updateTemplate(template.id, {
        name:        payload.name,
        type:        payload.type,
        category:    payload.category,
        description: payload.description ?? null,
        subject:     payload.subject ?? null,
        content:     payload.content,
        isGlobal:    isAdmin ? payload.isGlobal : undefined,
      })
    } else {
      result = await createTemplate(payload)
    }

    setSaving(false)
    if (result.error) { setError(result.error); return }
    router.push(listPath)
    router.refresh()
  }

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push(listPath)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Templates
      </button>

      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Template' : 'New Template'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input
              className={inputCls}
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Standard Invoice, Welcome Email…"
              required
            />
          </div>

          {/* Type + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.type} onChange={set('type')}>
                {TEMPLATE_TYPES.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.category} onChange={set('category')}>
                {TEMPLATE_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              className={inputCls}
              value={form.description}
              onChange={set('description')}
              placeholder="Brief description of when to use this template"
            />
          </div>

          {/* Subject — email only */}
          {form.type === 'email' && (
            <div>
              <label className={labelCls}>Email Subject</label>
              <input
                className={inputCls}
                value={form.subject}
                onChange={set('subject')}
                placeholder="e.g. Invoice for {{lead.company_name}}"
              />
              <p className="mt-1 text-xs text-gray-400">Variables like {'{{lead.first_name}}'} are supported in the subject line.</p>
            </div>
          )}

          {/* Global toggle — admin only */}
          {isAdmin && (
            <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, isGlobal: !prev.isGlobal }))}
                className={`relative mt-0.5 inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${form.isGlobal ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.isGlobal ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-900">
                  <Globe className="w-3.5 h-3.5" /> Global Template
                </div>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Global templates are visible to all agencies as starting points. Agency users can copy and customize them.
                </p>
              </div>
            </div>
          )}

          {/* Editor */}
          <div>
            <label className={labelCls}>Content <span className="text-red-500">*</span></label>
            <TemplateEditor
              initialContent={template?.content}
              onChange={handleEditorChange}
              placeholder={form.type === 'email' ? 'Write your email body here…' : 'Write your document content here…'}
            />
          </div>

          {/* Variables summary */}
          {variables.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Variables used in this template:</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map(v => (
                  <span key={v} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => router.push(listPath)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
