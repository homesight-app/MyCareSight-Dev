import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Load the actual browser boundary in Chromium; all requests are intercepted below.
const modules = Object.fromEntries(Object.entries({
  browser: 'src/lib/storage/browser.ts', contracts: 'src/lib/storage/contracts.ts',
  index: 'src/lib/storage/index.ts', filename: 'src/lib/download-filename.ts',
}).map(([id, file]) => [id, ts.transpileModule(readFileSync(path.join(process.cwd(), file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText]))

test.beforeEach(async ({ page }) => {
  // Catch-all prevents accidental requests to an app, database, storage account or vendor.
  await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic document check</title>' }))
  await page.goto('https://app.example.test/')
  await page.evaluate(source => {
    const cache: Record<string, { exports: Record<string, unknown> }> = {}
    const ids: Record<string, string> = { './contracts': 'contracts', './index': 'index', '@/lib/download-filename': 'filename' }
    const load = (id: string): Record<string, unknown> => {
      if (cache[id]) return cache[id].exports
      const entry = { exports: {} }
      cache[id] = entry
      const require = (specifier: string) => {
        if (!ids[specifier]) throw new Error('Unexpected browser boundary dependency')
        return load(ids[specifier])
      }
      new Function('require', 'exports', 'module', source[id])(require, entry.exports, entry)
      return entry.exports
    }
    Object.assign(window, { storageReview: load('browser') })
  }, modules)
})

test('saves authorized bytes without a cross-origin storage request or CORS headers', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.route('**/api/storage/download?**', route => route.fulfill({ status: 200, contentType: 'application/pdf', body: 'synthetic document' }))
  const downloaded = page.waitForEvent('download')
  await page.evaluate(async () => {
    const storage = (window as unknown as { storageReview: { saveStoredFile: (bucket: string, path: string, filename: string) => Promise<void> } }).storageReview
    await storage.saveStoredFile('application-documents', 'synthetic.pdf', 'Résumé original.pdf')
  })
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('Résumé original.pdf')
  expect(await download.failure()).toBeNull()
  expect(requests).toHaveLength(1)
  expect(new URL(requests[0]).origin).toBe('https://app.example.test')
  expect(new URL(requests[0]).pathname).toBe('/api/storage/download')
})

test('a rejected session never saves an error response as a document', async ({ page }) => {
  let downloads = 0
  page.on('download', () => downloads++)
  await page.route('**/api/storage/download?**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' }))
  const message = await page.evaluate(async () => {
    const storage = (window as unknown as { storageReview: { saveStoredFile: (bucket: string, path: string, filename: string) => Promise<void> } }).storageReview
    try { await storage.saveStoredFile('application-documents', 'synthetic.pdf', 'synthetic.pdf'); return 'unexpected success' }
    catch (error) { return error instanceof Error ? error.message : 'unexpected error' }
  })
  expect(message).toBe('Unauthorized')
  expect(downloads).toBe(0)
})

test('reads a size using HEAD without downloading document bytes', async ({ page }) => {
  const methods: string[] = []
  await page.route('**/api/storage/download?**', route => {
    methods.push(route.request().method())
    return route.fulfill({ status: 200, headers: { 'Content-Length': '123' }, body: '' })
  })
  const bytes = await page.evaluate(async () => {
    const storage = (window as unknown as { storageReview: { getStoredFileSize: (bucket: string, path: string) => Promise<number> } }).storageReview
    return storage.getStoredFileSize('application-documents', 'synthetic.pdf')
  })
  expect(bytes).toBe(123)
  expect(methods).toEqual(['HEAD'])
})
