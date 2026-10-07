/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  applicationDocumentFormSchema,
  createApplicationDocumentsSchema,
  replaceApplicationDocumentSchema,
} from '@/lib/schemas/application-documents'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const upload = {
  path: `${id(1)}/00000000-0000-4000-8000-000000000002.docx`,
  cleanupToken: 'signed.cleanup.token',
}

describe('application document upload boundary', () => {
  test('accepts signed storage metadata and enforces bounded form fields', () => {
    expect(APPLICATION_DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(applicationDocumentFormSchema.parse({
      documentName: '  Synthetic document  ',
      documentType: 'contract',
      description: '',
    })).toEqual({
      documentName: 'Synthetic document',
      documentType: 'contract',
      description: '',
    })

    expect(createApplicationDocumentsSchema.safeParse({
      applicationId: id(1),
      uploads: [{ ...upload, documentName: 'Synthetic document.docx' }],
      documentType: 'Client-specific intake form',
      description: null,
      status: 'draft',
      licenseRequirementDocumentId: null,
      applicationPlaybookItemId: id(3),
    }).success).toBe(true)

    expect(replaceApplicationDocumentSchema.safeParse({
      applicationId: id(1),
      documentId: id(4),
      upload,
      documentName: 'Synthetic document.docx',
      documentType: null,
      description: null,
    }).success).toBe(true)
  })

  test('rejects missing uploads, unbounded batches, and invalid identifiers', () => {
    const base = {
      applicationId: id(1),
      documentType: null,
      description: null,
      status: 'draft',
    }
    expect(createApplicationDocumentsSchema.safeParse({ ...base, uploads: [] }).success).toBe(false)
    expect(createApplicationDocumentsSchema.safeParse({
      ...base,
      uploads: Array.from({ length: 21 }, (_, index) => ({
        ...upload,
        path: `${id(1)}/${index}.pdf`,
        documentName: `Synthetic ${index}.pdf`,
      })),
    }).success).toBe(false)
    expect(createApplicationDocumentsSchema.safeParse({
      ...base,
      applicationId: 'not-an-id',
      uploads: [{ ...upload, documentName: 'Synthetic.pdf' }],
    }).success).toBe(false)
  })

  test('keeps binary files out of Server Action calls', () => {
    const root = process.cwd()
    const action = readFileSync(join(root, 'src/app/actions/application-documents.ts'), 'utf8')
    const modal = readFileSync(join(root, 'src/components/UploadDocumentModal.tsx'), 'utf8')
    const button = readFileSync(join(root, 'src/components/UploadDocumentButton.tsx'), 'utf8')
    const detail = readFileSync(join(root, 'src/components/ApplicationDetailContent.tsx'), 'utf8')
    const middleware = readFileSync(join(root, 'src/middleware.ts'), 'utf8')
    const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8')
    const storageBrowser = readFileSync(join(root, 'src/lib/storage/browser.ts'), 'utf8')
    const uploadRoute = readFileSync(join(root, 'src/app/api/storage/upload/route.ts'), 'utf8')

    expect(action).not.toMatch(/formData\s*:\s*FormData/)
    expect(action).not.toMatch(/form\.get(All)?\(['"]file['"]\)/)
    expect(modal).toContain("uploadStoredFile(files[index].file, 'application-document', applicationId)")
    expect(modal).toContain('MAX_CONCURRENT_UPLOADS = 3')
    expect(button).toContain("uploadStoredFile(file, 'application-document', applicationId)")
    expect(detail).toContain("uploadStoredFile(file, 'application-document', application.id)")
    expect(middleware).toContain('(?!api/storage/upload|')
    expect(nextConfig).toContain("middlewareClientMaxBodySize: '12mb'")
    expect(storageBrowser).toContain('response.status === 413')
    expect(uploadRoute).toContain('const session = await getSession()')
    expect(uploadRoute).toContain("if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })")
  })
})
