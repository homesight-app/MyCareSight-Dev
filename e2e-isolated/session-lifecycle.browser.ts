import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import webpack from 'webpack'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

let directory: string
let bundle: string
let css: string
test.beforeAll(async () => {
  const cache = path.resolve('node_modules/.cache')
  fs.mkdirSync(cache, { recursive: true })
  directory = fs.mkdtempSync(path.join(cache, 'session-lifecycle-'))
  const loader = path.join(directory, 'typescript-loader.cjs')
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;}`)
  const navigation = path.join(directory, 'navigation.js')
  fs.writeFileSync(navigation, `export function usePathname(){return window.location.pathname}`)
  const entry = path.join(directory, 'entry.js')
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {SessionLifecycle} from '@/components/SessionLifecycle';
    createRoot(document.getElementById('root')).render(React.createElement(SessionLifecycle,null,React.createElement('main',null,
      React.createElement('h1',null,'Synthetic portal'),React.createElement('label',null,'Synthetic draft',React.createElement('input',{id:'draft'})),
      React.createElement('button',{onClick(){window.saved=true}},'Save fixture'))));`)
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: 'development', target: 'web', devtool: false, entry,
      plugins: [new webpack.DefinePlugin({ process: JSON.stringify({ env: { NODE_ENV: 'development' }, browser: true }) })],
      output: { path: directory, filename: 'review.js' },
      resolve: { extensions: ['.ts', '.tsx', '.js'], alias: { 'next/navigation$': navigation, '@': path.resolve('src') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
    })
    compiler.run((error, stats) => compiler.close(() => {
      if (error) reject(error)
      else if (stats?.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })))
      else resolve()
    }))
  })
  bundle = fs.readFileSync(path.join(directory, 'review.js'), 'utf8')
  css = (await postcss([tailwindcss(path.resolve('tailwind.config.ts'))]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css
})
test.afterAll(() => {
  if (directory && path.dirname(directory) === path.resolve('node_modules/.cache') && path.basename(directory).startsWith('session-lifecycle-')) fs.rmSync(directory, { recursive: true, force: true })
})

type Store = { lastActivity: number; absolute: number; signedOut: boolean }
async function mount(page: Page, options: { absoluteMinutes?: number; unavailable?: boolean; path?: string; store?: Store } = {}) {
  const start = new Date('2026-01-01T00:00:00Z').getTime()
  const store = options.store ?? { lastActivity: start, absolute: start + (options.absoluteMinutes ?? 480) * 60_000, signedOut: false }
  const requests: string[] = []
  let unavailable = options.unavailable ?? false
  await page.clock.install({ time: new Date(start) })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://app.example.test') return route.abort()
    if (url.pathname === '/assets/review.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
    if (url.pathname === '/assets/style.css') return route.fulfill({ contentType: 'text/css', body: css })
    if (url.pathname === '/api/session/status') {
      const method = route.request().method()
      requests.push(method)
      if (unavailable) return route.fulfill({ status: 503, json: { status: 'unavailable' } })
      const now = await page.evaluate(() => Date.now())
      if (method === 'DELETE') { store.signedOut = true; return route.fulfill({ json: { status: 'signed-out' } }) }
      if (store.signedOut || now >= Math.min(store.absolute, store.lastActivity + 20 * 60_000)) return route.fulfill({ status: 401, json: { status: 'expired' } })
      if (method === 'POST') store.lastActivity = now
      return route.fulfill({ json: { serverNow: now, expiresAt: Math.min(store.absolute, store.lastActivity + 20 * 60_000), absoluteExpiresAt: store.absolute } })
    }
    if (url.pathname === '/pages/auth/login') return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic login</h1>' })
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/assets/style.css"></head><body><div id="root"></div><script src="/assets/review.js"></script></body></html>' })
    return route.abort()
  })
  const initial = options.path ? null : page.waitForResponse(response => response.url().endsWith('/api/session/status'))
  await page.goto('https://app.example.test' + (options.path ?? '/pages/agency/clients'))
  await expect(page.getByRole('heading', { name: 'Synthetic portal' })).toBeVisible()
  if (initial) { await (await initial).finished(); await page.clock.runFor(100) }
  return { requests, store, setUnavailable(value: boolean) { unavailable = value } }
}

test('warns after fifteen idle minutes, contains keyboard focus, stays signed in then redirects at expiry', async ({ page }) => {
  const state = await mount(page)
  await page.clock.fastForward(15 * 60_000 + 100)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stay signed in' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Stay signed in' })).toBeFocused()
  await page.screenshot({ path: path.resolve('node_modules/.cache/session-warning-review.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Stay signed in' })).toBeFocused()
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(0)
  await page.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(1)
  await page.clock.fastForward(20 * 60_000 + 1000)
  await expect(page).toHaveURL(/\/pages\/auth\/login/)
  expect(state.requests).toContain('DELETE')
})

test('coalesces real input to at most one activity request per minute; focus does not renew', async ({ page }) => {
  const state = await mount(page)
  await page.getByLabel('Synthetic draft').fill('Synthetic unsaved fixture')
  await page.clock.runFor(10)
  await expect.poll(() => state.requests.filter(method => method === 'POST').length).toBe(1)
  await page.getByLabel('Synthetic draft').pressSequentially('abc')
  await page.clock.runFor(10)
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(1)
  await page.clock.fastForward(60_000)
  await expect.poll(() => state.requests.filter(method => method === 'POST').length).toBe(2)
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(500)
  await expect.poll(() => state.requests.filter(method => method === 'GET').length).toBe(2)
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(2)
  await page.clock.fastForward(5 * 60_000)
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(2)
})

test('outage blocks editing, preserves only the in-memory form and retries without falsely signing out', async ({ page }) => {
  const state = await mount(page)
  await page.getByLabel('Synthetic draft').fill('Synthetic unsaved fixture')
  await page.clock.runFor(10)
  await expect.poll(() => state.requests.filter(method => method === 'POST').length).toBe(1)
  state.setUnavailable(true)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.clock.runFor(500)
  await expect(page.getByRole('heading', { name: 'Session verification unavailable' })).toBeVisible()
  expect(state.requests).not.toContain('DELETE')
  await page.clock.fastForward(21 * 60_000)
  const count = state.requests.length
  await page.clock.fastForward(60_000)
  expect(state.requests.length).toBe(count)
  state.setUnavailable(false)
  await page.getByRole('button', { name: 'Retry verification' }).click()
  await expect(page).toHaveURL(/\/pages\/auth\/login/)
})

test('absolute deadline permits returning to save work but cannot be extended', async ({ page }) => {
  await mount(page, { absoluteMinutes: 4 })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Return to save work' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByLabel('Synthetic draft').fill('Synthetic last save')
  await page.clock.runFor(1000)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Save fixture' }).click()
  expect(await page.evaluate(() => (window as unknown as { saved: boolean }).saved)).toBe(true)
  await page.clock.fastForward(4 * 60_000)
  await expect(page).toHaveURL(/\/pages\/auth\/login/)
})

test('public pages issue no lifecycle requests', async ({ page }) => {
  const state = await mount(page, { path: '/contact' })
  await page.clock.fastForward(60 * 60_000)
  expect(state.requests).toEqual([])
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('cross-tab activity messages reverify the warning and sign-out messages redirect', async ({ page }) => {
  const state = await mount(page)
  await page.clock.fastForward(15 * 60_000 + 100)
  await expect(page.getByRole('dialog')).toBeVisible()
  state.store.lastActivity = await page.evaluate(() => Date.now())
  await page.evaluate(() => {
    const channel = new BroadcastChannel('portal-session-lifecycle')
    channel.postMessage('activity')
    channel.close()
  })
  await page.clock.runFor(500)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(state.requests.filter(method => method === 'POST')).toHaveLength(0)
  state.store.signedOut = true
  await page.evaluate(() => {
    const channel = new BroadcastChannel('portal-session-lifecycle')
    channel.postMessage('signed-out')
    channel.close()
  })
  await expect(page).toHaveURL(/\/pages\/auth\/login/)
})

test('failed voluntary logout stays blocked rather than claiming the server session ended', async ({ page }) => {
  const state = await mount(page)
  await page.clock.fastForward(15 * 60_000 + 100)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled()
  state.setUnavailable(true)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Session verification unavailable' })).toBeVisible()
  expect(state.store.signedOut).toBe(false)
  await expect(page).toHaveURL(/\/pages\/agency\/clients/)
})
