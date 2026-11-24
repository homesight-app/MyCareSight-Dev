/** @jest-environment jsdom */
import { getStoredFileSize, saveStoredFile, saveTemplateFile } from '@/lib/storage/browser'
import { STORAGE_BUCKET } from '@/lib/storage/contracts'

const originalFetch = global.fetch
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
const fetchMock = jest.fn()
let click: jest.SpyInstance
let open: jest.SpyInstance
let saved: { name: string; href: string }[]
beforeEach(() => {
  global.fetch = fetchMock
  fetchMock.mockReset().mockResolvedValue({ ok: true, blob: async () => new Blob(['synthetic']) })
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-file')
  URL.revokeObjectURL = jest.fn()
  saved = []
  click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, href: this.href })
  })
  open = jest.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  global.fetch = originalFetch
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  click.mockRestore()
  open.mockRestore()
})

test('saves only same-origin authorized bytes, preserves Unicode/extension, and cleans up the temporary URL', async () => {
  await saveStoredFile(STORAGE_BUCKET.APPLICATION, 'synthetic.pdf', 'Résumé final.pdf')
  expect(fetchMock).toHaveBeenCalledWith('/api/storage/download?bucket=application-documents&path=synthetic.pdf', { cache: 'no-store' })
  expect(saved).toEqual([{ name: 'Résumé final.pdf', href: 'blob:synthetic-file' }])
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-file')
  expect(document.querySelector('a')).toBeNull()
})

test('sanitizes filenames and releases resources even if the browser rejects the save', async () => {
  click.mockImplementationOnce(() => { throw new Error('synthetic save failure') })
  await expect(saveStoredFile(STORAGE_BUCKET.PATIENT, 'synthetic.pdf', '../synthetic.pdf')).rejects.toThrow('synthetic save failure')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-file')
  expect(document.querySelector('a')).toBeNull()
  await saveStoredFile(STORAGE_BUCKET.PATIENT, 'synthetic.pdf', '../synthetic.pdf')
  expect(saved[0].name).toBe('.._synthetic.pdf')
})

test.each([401, 404, 500, 503])('does not download an HTTP %s error as a document', async status => {
  fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'Unable to download document' }) })
  await expect(saveStoredFile(STORAGE_BUCKET.APPLICATION, 'synthetic.pdf', 'synthetic.pdf')).rejects.toThrow('Unable to download document')
  expect(click).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

test('reads a zero size through same-origin HEAD without requesting file bytes', async () => {
  fetchMock.mockResolvedValue({ ok: true, headers: { get: () => '0' } })
  expect(await getStoredFileSize(STORAGE_BUCKET.APPLICATION, 'empty.pdf')).toBe(0)
  expect(fetchMock).toHaveBeenCalledWith('/api/storage/download?bucket=application-documents&path=empty.pdf', { method: 'HEAD', cache: 'no-store' })
  expect(click).not.toHaveBeenCalled()
})

test.each([null, '', ' ', '-1', 'bad', '1.5'])('rejects invalid metadata %s', async header => {
  fetchMock.mockResolvedValue({ ok: true, headers: { get: () => header } })
  await expect(getStoredFileSize(STORAGE_BUCKET.APPLICATION, 'synthetic.pdf')).rejects.toThrow('Invalid document size')
})

test('downloads legacy templates through the app and preserves intentional external links', async () => {
  const legacy = 'https://legacy.example.test/storage/v1/object/public/license-templates/synthetic.pdf'
  await saveTemplateFile(legacy, 'Synthetic Template.pdf')
  expect(new URL(fetchMock.mock.calls[0][0], 'https://app.example.test').searchParams.get('path')).toBe(legacy)
  expect(saved[0].name).toBe('Synthetic Template.pdf')
  expect(open).not.toHaveBeenCalled()
  fetchMock.mockClear()
  await saveTemplateFile('https://authority.example.test/form.pdf', 'External Form.pdf')
  expect(open).toHaveBeenCalledWith('https://authority.example.test/form.pdf', '_blank', 'noopener,noreferrer')
  expect(fetchMock).not.toHaveBeenCalled()
})
