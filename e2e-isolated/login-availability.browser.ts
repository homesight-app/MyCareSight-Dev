import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import webpack from 'webpack'

let directory: string
let bundle: string
test.beforeAll(async () => {
  const cache = path.resolve('node_modules/.cache')
  fs.mkdirSync(cache, { recursive: true })
  directory = fs.mkdtempSync(path.join(cache, 'login-availability-'))
  const loader = path.join(directory, 'loader.cjs')
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText}`)
  const navigation = path.join(directory, 'navigation.js')
  fs.writeFileSync(navigation, 'const params=new URLSearchParams();export function useSearchParams(){return params}')
  const image = path.join(directory, 'image.js')
  fs.writeFileSync(image, `import React from 'react';export default function Image({fill,priority,...props}){return React.createElement('img',props)}`)
  const entry = path.join(directory, 'entry.js')
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import Login from '@/app/pages/auth/login/page';createRoot(document.getElementById('root')).render(React.createElement(Login))`)
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: 'development', target: 'web', devtool: false, entry,
      output: { path: directory, filename: 'review.js' },
      plugins: [new webpack.DefinePlugin({ process: JSON.stringify({ env: { NODE_ENV: 'development' }, browser: true }) })],
      resolve: { extensions: ['.ts', '.tsx', '.js'], alias: { 'next/navigation$': navigation, 'next/image$': image, '@': path.resolve('src') } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
    })
    compiler.run((error, stats) => compiler.close(() => {
      if (error) reject(error)
      else if (stats?.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })))
      else resolve()
    }))
  })
  bundle = fs.readFileSync(path.join(directory, 'review.js'), 'utf8')
})
test.afterAll(() => {
  if (directory && path.dirname(directory) === path.resolve('node_modules/.cache') && path.basename(directory).startsWith('login-availability-')) fs.rmSync(directory, { recursive: true, force: true })
})

for (const failure of ['unavailable', 'credentials', 'configuration'] as const) test(`actual login distinguishes ${failure}, then accepts the same password on a deliberate retry`, async ({ page }) => {
  let attempts = 0
  let confirmed = false
  let protectedNavigations = 0
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://app.example.test') return route.abort()
    if (url.pathname === '/api/auth/providers') return route.fulfill({ json: { credentials: { id: 'credentials', name: 'Credentials', type: 'credentials', signinUrl: url.origin + '/api/auth/signin/credentials', callbackUrl: url.origin + '/api/auth/callback/credentials' } } })
    if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'synthetic-csrf' } })
    if (url.pathname === '/api/auth/callback/credentials') {
      attempts++
      if (attempts === 1) return route.fulfill({ json: { url: url.origin + '/pages/auth/login?' + (failure === 'configuration' ? 'error=Configuration' : `error=CredentialsSignin&code=${failure === 'unavailable' ? 'temporarily_unavailable' : 'credentials'}`) } })
      confirmed = true
      return route.fulfill({ json: { url: url.origin + '/pages/agency' } })
    }
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: confirmed ? { user: { id: 'synthetic-user', role: 'company_owner' }, expires: '2099-01-01' } : null })
    if (url.pathname === '/pages/agency') { protectedNavigations++; return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic protected destination</h1>' }) }
    if (url.pathname !== '/pages/auth/login') return route.abort()
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' })
  })
  await page.goto('https://app.example.test/pages/auth/login')
  await page.addScriptTag({ content: bundle })
  await page.getByLabel('Email Address').fill('synthetic@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-test-only-123!')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  const message = failure === 'credentials' ? 'Invalid email or password. Please try again.' : 'Sign-in is temporarily unavailable. Please try again shortly.'
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  if (failure !== 'credentials') await expect(page.getByText(/Invalid email or password/)).toHaveCount(0)
  expect(attempts).toBe(1)
  expect(protectedNavigations).toBe(0)
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  // Deliberately submit the retained values; the client never retries a credential POST by itself.
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page).toHaveURL('https://app.example.test/pages/agency')
  expect(attempts).toBe(2)
  expect(protectedNavigations).toBe(1)
})
