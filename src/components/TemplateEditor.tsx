'use client'

import { useEditor, EditorContent, type Editor, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Node as TipTapNode, mergeAttributes } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered,
  ChevronDown, Upload, X, Table2, Info,
} from 'lucide-react'
import { TEMPLATE_VARIABLE_NAMESPACES } from '@/lib/constants/template-variables'

// ── Custom TipTap node for variable chips ──────────────────────────────────

function VariableChipView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        contentEditable={false}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mx-0.5 cursor-default select-none border border-blue-200"
      >
        {`{{${node.attrs.varKey}}}`}
      </span>
    </NodeViewWrapper>
  )
}

const TemplateVariableExtension = TipTapNode.create({
  name: 'templateVariable',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      varKey: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-key]',
        getAttrs: (dom) => ({
          varKey: (dom as HTMLElement).getAttribute('data-key'),
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ class: 'template-var', 'data-key': HTMLAttributes.varKey }),
      `{{${HTMLAttributes.varKey}}}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableChipView)
  },
})

// ── Toolbar button ─────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick, active, title, children, danger,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-50 hover:text-red-600'
          : active
            ? 'bg-gray-200 text-gray-900'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ── Variable dropdown ──────────────────────────────────────────────────────

function VariableDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const insert = (varKey: string) => {
    editor.chain().focus().insertContent({
      type: 'templateVariable',
      attrs: { varKey },
    }).run()
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen(v => !v) }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
      >
        {'{{ }}'} Insert Variable
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-72 overflow-y-auto">
          {TEMPLATE_VARIABLE_NAMESPACES.map(ns => (
            <div key={ns.key}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                {ns.label}
              </div>
              {ns.variables.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insert(v.key) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {v.label}
                  <span className="ml-1 text-xs text-gray-400">{`{{${v.key}}}`}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Table toolbar ──────────────────────────────────────────────────────────

function TableToolbar({ editor }: { editor: Editor }) {
  const inTable = editor.isActive('table')

  if (!inTable) {
    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }}
        title="Insert table"
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Table2 className="w-3.5 h-3.5" />
        Table
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100">
      <span className="text-xs text-indigo-500 font-medium mr-1">Table:</span>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowBefore().run() }}
        title="Add row above"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >Row ↑</button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }}
        title="Add row below"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >Row ↓</button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteRow().run() }}
        title="Delete row"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >−Row</button>
      <div className="w-px h-3.5 bg-indigo-200 mx-0.5" />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnBefore().run() }}
        title="Add column before"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >Col ←</button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }}
        title="Add column after"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >Col →</button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }}
        title="Delete column"
        className="px-1.5 py-0.5 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
      >−Col</button>
      <div className="w-px h-3.5 bg-indigo-200 mx-0.5" />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteTable().run() }}
        title="Delete table"
        className="px-1.5 py-0.5 rounded text-xs text-red-500 hover:bg-red-50 transition-colors"
      >Delete</button>
    </div>
  )
}

// ── Main editor component ──────────────────────────────────────────────────

interface TemplateEditorProps {
  initialContent?: string
  onChange: (html: string, variables: string[]) => void
  placeholder?: string
}

function extractVariables(html: string): string[] {
  const matches = [...html.matchAll(/data-key="([^"]+)"/g)]
  return [...new Set(matches.map(m => m[1]))]
}

export default function TemplateEditor({ initialContent, onChange, placeholder }: TemplateEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? 'Start writing your template… use "Insert Variable" to add dynamic fields.',
      }),
      TemplateVariableExtension,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialContent ?? '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html, extractVariables(html))
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[280px] px-4 py-3 focus:outline-none',
      },
    },
  })

  // Sync external initialContent changes (edit mode load)
  const prevContent = useRef(initialContent)
  useEffect(() => {
    if (editor && initialContent !== prevContent.current && initialContent !== undefined) {
      prevContent.current = initialContent
      editor.commands.setContent(initialContent)
    }
  }, [editor, initialContent])

  const handleDocxUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    setUploading(true)
    setUploadError(null)
    setImportNotice(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch('/api/templates/convert-docx', { method: 'POST', body: fd })
      const data = await resp.json()
      if (!resp.ok) { setUploadError(data.error ?? 'Conversion failed'); return }
      editor.commands.setContent(data.html)
      const html = editor.getHTML()
      onChange(html, extractVariables(html))
      setImportNotice(true)
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [editor, onChange])

  if (!editor) return null

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="w-4 h-4" />
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered className="w-4 h-4" />
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <VariableDropdown editor={editor} />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <TableToolbar editor={editor} />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Importing…' : 'Import DOCX'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={handleDocxUpload}
        />
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* DOCX import notice */}
      {importNotice && (
        <div className="flex items-start justify-between gap-3 px-3 py-2 bg-blue-50 border-t border-blue-200 text-sm text-blue-800">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <span>
              <strong>DOCX imported</strong> — text and table structure transferred.
              Visual styling (colors, backgrounds, fonts) cannot be converted and must be recreated in the editor.
            </span>
          </div>
          <button type="button" onClick={() => setImportNotice(false)} className="flex-shrink-0 text-blue-400 hover:text-blue-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-50 border-t border-red-200 text-sm text-red-700">
          {uploadError}
          <button type="button" onClick={() => setUploadError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
