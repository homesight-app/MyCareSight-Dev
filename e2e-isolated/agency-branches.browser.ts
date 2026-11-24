import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import webpack from 'webpack'

let directory: string
let bundle: string
const main = '20000000-0000-4000-8000-000000000001'
const west = '20000000-0000-4000-8000-000000000002'
const recordId = '20000000-0000-4000-8000-000000000003'

test.beforeAll(async () => {
  const cache = path.resolve('node_modules/.cache')
  fs.mkdirSync(cache, { recursive: true })
  directory = fs.mkdtempSync(path.join(cache, 'agency-branches-'))
  const loader = path.join(directory, 'typescript-loader.cjs')
  fs.writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve('typescript'))}); module.exports = function(source) {
    return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  };`)
  const actions = path.join(directory, 'actions.js')
  fs.writeFileSync(actions, `
    const ids = ${JSON.stringify({ main, west, recordId })};
    const branches = [{id:ids.main,name:'Main',status:'active',is_default:true},{id:ids.west,name:'West',status:'active',is_default:false}];
    window.branchHarness = {reads:0, writes:[], refreshes:0, fail:false};
    export async function getRecordBranchesAction(){window.branchHarness.reads++;return {success:true,data:{branchIds:[ids.main],branches,canEdit:true}}}
    export async function assignRecordBranchesAction(input){window.branchHarness.writes.push(input);return window.branchHarness.fail?{success:false,error:'Refresh before retrying.'}:{success:true}}
    export async function listBranchesAction(){return {success:true,data:{rows:[],hasMore:false}}}
    export async function saveBranchAction(input){window.branchHarness.writes.push(input);return {success:true,id:ids.west}}
    export async function changeBranchStateAction(){return {success:true}}
    export async function branchOptionsAction(){return {success:true,data:branches}}
    export async function requestProgramBranchesAction(input){window.branchHarness.writes.push(input);return {success:true,id:input.requestId}}
  `)
  const navigation = path.join(directory, 'navigation.js')
  fs.writeFileSync(navigation, 'export function useRouter(){return {refresh(){window.branchHarness.refreshes++},push(){}}}')
  const toast = path.join(directory, 'toast.js')
  fs.writeFileSync(toast, 'export const toast = {success(){},error(){}}')
  const entry = path.join(directory, 'entry.js')
  fs.writeFileSync(entry, `import React from 'react'; import {createRoot} from 'react-dom/client';
    import Assignment from '@/components/RecordBranchAssignment';
    import Settings from '@/components/AgencyBranchSettings';
    import Request from '@/components/ProgramBranchRequestForm';
    const root = createRoot(document.getElementById('root'));
    window.mountBranchReview = kind => root.render(kind==='settings'?React.createElement(Settings):kind==='request'?
      React.createElement(Request,{playbookId:'${recordId}',state:'CA',onSaved(){window.branchHarness.refreshes++}}):
      React.createElement(Assignment,{kind,recordId:'${recordId}'}));`)
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: 'development', target: 'web', devtool: false, entry,
      output: { path: directory, filename: 'review.js' },
      resolve: { extensions: ['.ts', '.tsx', '.js'], alias: {
        '@/app/actions/agency-branches$': actions, 'next/navigation$': navigation, 'sonner$': toast, '@': path.resolve('src'),
      } },
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
  if (directory && path.dirname(directory) === path.resolve('node_modules/.cache') && path.basename(directory).startsWith('agency-branches-')) fs.rmSync(directory, { recursive: true, force: true })
})

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }))
  await page.goto('https://app.example.test/')
  await page.addScriptTag({ content: bundle })
})

test('keyboard assignment loads on demand and submits a single selected branch', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('client'))
  const button = page.getByRole('button', { name: 'Branches', exact: true })
  await expect(button).toBeVisible()
  expect(await page.evaluate(() => (window as any).branchHarness.reads)).toBe(0)
  await button.focus()
  await page.keyboard.press('Enter')
  const select = page.getByRole('combobox', { name: 'Current branch' })
  await expect(select).toHaveValue(main)
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Save Assignment' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes)).toEqual([{ kind: 'client', recordId, branchIds: [west] }])
})

test('branch setup validates accessibly and saves synthetic office information', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mountBranchReview('settings'))
  await page.getByRole('button', { name: 'Add Branch' }).click()
  await page.getByRole('button', { name: 'Save Branch' }).click()
  await expect(page.getByText('Name is required')).toBeVisible()
  await expect(page.getByLabel('Branch name', { exact: false })).toBeFocused()
  await page.getByLabel('Branch name', { exact: false }).fill('Synthetic West Office')
  await page.getByLabel('Branch code', { exact: false }).fill('west')
  await page.getByLabel('Time zone', { exact: false }).fill('America/Los_Angeles')
  await page.screenshot({ path: info.outputPath('synthetic-branch-form.png') })
  await page.getByRole('button', { name: 'Save Branch' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes.length)).toBe(1)
})

test('enrollment selects two branches but submits one program request', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('request'))
  await expect(page.getByLabel('Main (default)')).toBeChecked()
  await page.getByLabel('West', { exact: true }).check()
  await page.getByRole('button', { name: 'Submit Program Request' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes.length)).toBe(1)
  const request = await page.evaluate(() => (window as any).branchHarness.writes[0])
  expect(request.branchIds).toEqual([main, west])
  expect(request.playbook_id).toBe(recordId)
})
