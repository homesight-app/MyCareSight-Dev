import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import webpack from 'webpack'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

let directory: string
let bundle: string
let css: string
const main = '20000000-0000-4000-8000-000000000001'
const west = '20000000-0000-4000-8000-000000000002'
const recordId = '20000000-0000-4000-8000-000000000003'

test.beforeAll(async () => {
  const cache = path.resolve('node_modules/.cache')
  fs.mkdirSync(cache, { recursive: true })
  directory = fs.mkdtempSync(path.join(cache, 'agency-branches-'))
  const loader = path.join(directory, 'typescript-loader.cjs')
  fs.writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve('typescript'))}); module.exports = function(source) {
    return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  };`)
  const actions = path.join(directory, 'actions.js')
  fs.writeFileSync(actions, `
    const ids = ${JSON.stringify({ main, west, recordId })};
    const branches = [{id:ids.main,name:'Main',status:'active',is_default:true},{id:ids.west,name:'West',status:'active',is_default:false}];
    window.branchHarness = {reads:0, writes:[], refreshes:0, fail:false, pushes:[]};
    export async function getRecordBranchesAction(){window.branchHarness.reads++;return {success:true,data:{branchIds:[ids.main],branches,canEdit:true}}}
    export async function assignRecordBranchesAction(input){window.branchHarness.writes.push(input);return window.branchHarness.fail?{success:false,error:'Refresh before retrying.'}:{success:true}}
    export async function listBranchesAction(input){window.branchHarness.branchReads++;window.branchHarness.listRequests.push(input);return {success:true,data:{rows:[{id:ids.main,agency_id:ids.recordId,name:'Synthetic Main',code:'main',is_default:true,status:'active',timezone:'UTC',street_address:null,city:'Synthetic City',state:'California',zip_code:null,phone:null,email:null}],hasMore:false,totalCount:1}}}
    export async function saveBranchAction(input){window.branchHarness.writes.push(input);return {success:true,id:ids.west}}
    export async function saveAgencyInfoAction(input){window.branchHarness.writes.push(input);return {success:true}}
    export async function changeBranchStateAction(){return {success:true}}
    export async function branchOptionsAction(){window.branchHarness.reads++;return {success:true,data:branches}}
    export async function saveClientPersonalInfoAction(id,input){window.branchHarness.writes.push({id,...input});return {success:true}}
    export async function updateLead(id,input){window.branchHarness.writes.push({id,...input});return {error:null}}
    export async function createLead(){return {error:null}}
    export async function updatePatientLeadDetailsAction(){return {error:null}}
    export async function getLeadCollaboratorOptionsAction(){return {data:[],currentUserId:null}}
    export async function getAgencyLeadStagesAction(){return {data:[]}}
    export async function getActiveAgencyOptionsAction(){return {data:[]}}
    export async function getPeopleForAgency(){return {keyStaff:[]}}
    export async function requestProgramBranchesAction(input){window.branchHarness.writes.push(input);return {success:true,id:input.requestId}}
    export async function updatePatientStatus(id,status){window.branchHarness.writes.push({id,status});window.clientRows=window.clientRows.map(row=>row.id===id?{...row,status}:row);return {error:null}}
  `)
  const navigation = path.join(directory, 'navigation.js')
  fs.writeFileSync(navigation, `const router={refresh(){window.branchHarness.refreshes++;window.refreshClient?.()},push(value){window.branchHarness.pushes.push(value);if(value.startsWith('?'))window.renderClientQuery?.(value)}};export function useRouter(){return router}`)
  const addClient = path.join(directory, 'add-client.js')
  fs.writeFileSync(addClient, `import React from 'react';export default function AddClient({isOpen,onClose,onSuccess}){return isOpen?React.createElement('div',{role:'dialog','aria-label':'Existing add client'},React.createElement('button',{onClick:onSuccess},'Save synthetic client'),React.createElement('button',{onClick:onClose},'Cancel')):null}`)
  const toast = path.join(directory, 'toast.js')
  fs.writeFileSync(toast, 'export const toast = {success(){},error(){}}')
  const entry = path.join(directory, 'entry.js')
  fs.writeFileSync(entry, `import React from 'react'; import {createRoot} from 'react-dom/client';
    import Assignment from '@/components/RecordBranchAssignment';
    import Settings from '@/components/AgencyBranchSettings';
    import Request from '@/components/ProgramBranchRequestForm';
    import Info from '@/components/AgencyInfoPanel';
    import DataTable from '@/components/ui/DataTable';
    import Clients from '@/components/ClientsContent';
    import Personal from '@/components/ClientPersonalInfo';
    import Lead from '@/components/AddLeadModal';
    import {AGENCY_LEAD_CONTEXT} from '@/lib/constants/lead-configs';
    function PersonalReview(){const [client,setClient]=React.useState({id:'${recordId}',first_name:'Synthetic',last_name:'Client',gender:'',date_of_birth:'1980-01-02',branch_id:'${main}',branch_name:'Main'});
      return React.createElement(Personal,{client,branchesEnabled:true,canEditBranch:true,dobFromAge:()=> '1980-01-02',formatDate:value=>value,onSaved:data=>setClient(previous=>({...previous,...data}))});}
    const lead={id:'${recordId}',contact_first_name:'Synthetic',contact_last_name:'Lead',contact_email:'',contact_phone:'',company_name:'',service_type:'other',service_states:[],stage:'new',source:'Other',price:null,retainer_amount:null,retainer_paid_date:null,installments:null,installment_amount:null,signed_date:null,notes:'',branch_id:'${main}',branch_name:'Main'};
    function SharedTableReview(){
      const [page,setPage]=React.useState(0),[search,setSearch]=React.useState(''),[group,setGroup]=React.useState('all');
      const [sort,setSort]=React.useState({key:'name',dir:'asc'});
      const all=[{id:'one',name:'Synthetic Alpha',group:'A'},{id:'two',name:'Synthetic Beta',group:'B'},{id:'three',name:'Synthetic Gamma',group:'A'}];
      const selected=all.filter(row=>(group==='all'||row.group===group)&&row.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a,b)=>sort.dir==='asc'?a.name.localeCompare(b.name):b.name.localeCompare(a.name));
      window.tableQuery={page,search,group,sort};
      return React.createElement(DataTable,{label:'Synthetic shared table',entityLabel:'fixtures',rows:selected.slice(page*2,page*2+2),
        columns:[{key:'name',label:'Name',sortable:true,render:row=>row.name},{key:'group',label:'Group',render:row=>row.group}],
        getRowKey:row=>row.id,getRowLabel:row=>row.name,pagination:{page,pageSize:2,totalCount:selected.length,onPageChange:setPage},
        search:{value:search,onChange:setSearch},filters:[{key:'group',label:'Filter group',value:group,options:[{value:'all',label:'All groups'},{value:'A',label:'Group A'},{value:'B',label:'Group B'}],onChange:setGroup}],
        sort:{value:sort,onChange:key=>setSort(current=>({key,dir:current.dir==='asc'?'desc':'asc'}))},
        addAction:{label:'Add Fixture',onClick(){window.tableAdded=true}},rowNavigation:{columnKey:'name',onOpen(row){window.tableOpened=row.id}}});
    }
    function ClientReview(){
      const [query,setQuery]=React.useState(''),[,setVersion]=React.useState(0);
      window.renderClientQuery=setQuery;window.refreshClient=()=>setVersion(value=>value+1);
      window.clientRows??=Array.from({length:53},(_,index)=>({id:'synthetic-'+index,first_name:'Synthetic',last_name:'Client '+String(index).padStart(2,'0'),age:40,gender:'Female',class:'Private Pay',phone_number:'555-0100',emergency_contact_name:'Synthetic Contact',emergency_phone:'555-0101',patients_representatives:[{id:'rep-'+index,name:'Synthetic Representative',relationship:'Family',phone_number:'555-0102'}],status:'active',branch_id:index%2?'${west}':'${main}',branch_name:index%2?'West':'Main'}));
      const params=new URLSearchParams(query),page=Number(params.get('page')||0),search=params.get('q')||'',status=params.get('status')||'active',branch=params.get('branch')||'',sortKey=params.get('sortKey')||'created_at',sortDir=params.get('sortDir')||'desc';
      const rows=window.clientRows.filter(row=>(status==='all'||row.status===status)&&(!branch||row.branch_id===branch)&&(row.first_name+' '+row.last_name).toLowerCase().includes(search.toLowerCase()));
      if(sortKey==='branch_name')rows.sort((a,b)=>(sortDir==='asc'?1:-1)*a.branch_name.localeCompare(b.branch_name)||a.id.localeCompare(b.id));
      return React.createElement(Clients,{clients:rows.slice(page*50,page*50+50),totalCount:rows.length,activeCount:53,totalAllCount:53,page,pageSize:50,search,statusFilter:status,branchesEnabled:true,branchFilter:branch,sortKey,sortDir});
    }
    const root = createRoot(document.getElementById('root'));
    window.mountBranchReview = kind => root.render(kind==='clients'?React.createElement(ClientReview):kind==='profile'?React.createElement(PersonalReview):kind==='lead-edit'?React.createElement(Lead,{isOpen:true,onClose(){},onSuccess(){},context:AGENCY_LEAD_CONTEXT,editLead:lead,branchesEnabled:true,canEditBranch:true}):kind==='table'?React.createElement(SharedTableReview):kind==='agency'?React.createElement(Info,{initialAgency:{id:'${recordId}',name:'Synthetic Browser Agency',business_type:'Synthetic Type',tax_id:'SYNTHETIC',primary_license_number:'SYNTHETIC',physical_state:'California',same_as_physical:true},branchesEnabled:true}):kind==='settings'?React.createElement(Settings):kind==='request'?
      React.createElement(Request,{playbookId:'${recordId}',state:'CA',onSaved(){window.branchHarness.refreshes++}}):
      React.createElement(Assignment,{kind,recordId:'${recordId}'}));`)
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: 'development', target: 'web', devtool: false, entry,
      plugins: [new webpack.DefinePlugin({ process: JSON.stringify({ env: { NODE_ENV: 'development' }, browser: true }) })],
      output: { path: directory, filename: 'review.js', publicPath: 'https://app.example.test/assets/' },
      resolve: { extensions: ['.ts', '.tsx', '.js'], alias: {
        '@/app/actions/agency-branches$': actions, 'next/navigation$': navigation, 'sonner$': toast,
        '@/app/actions/client-personal-info$': actions, '@/app/actions/leads$': actions, '@/app/actions/agencies$': actions,
        '@/app/actions/agency-lead-stages$': actions, '@/app/actions/agency-people$': actions,
        '@/app/actions/query-bridge$': actions, '@/components/AddNewClientModal$': addClient,
        '@': path.resolve('src'),
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
  css = (await postcss([tailwindcss(path.resolve('tailwind.config.ts'))]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') })).css
})

test.afterAll(() => {
  if (directory && path.dirname(directory) === path.resolve('node_modules/.cache') && path.basename(directory).startsWith('agency-branches-')) fs.rmSync(directory, { recursive: true, force: true })
})

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'https://app.example.test' && url.pathname.startsWith('/assets/')) {
      const name = path.basename(url.pathname)
      const file = path.join(directory, name)
      if (name.endsWith('.js') && fs.existsSync(file)) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8') })
      return route.fulfill({ status: 404, body: '' })
    }
    if (url.origin !== 'https://app.example.test' || url.pathname !== '/') return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' })
  })
  await page.goto('https://app.example.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: bundle })
  if (!await page.evaluate(() => typeof (window as any).mountBranchReview === 'function')) throw new Error(`Synthetic harness failed: ${errors.slice(0, 3).join('; ')}`)
  await page.evaluate(() => { (window as any).branchHarness.branchReads = 0; (window as any).branchHarness.listRequests = [] })
})

test('client table preserves paging, branch filtering, sorting and keyboard record navigation', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('clients'))
  const table = page.getByRole('table', { name: 'Clients', exact: true })
  const toolbar = page.getByRole('group', { name: 'Clients controls' })
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(page.getByText('Page 1 of 2')).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Add New Client' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Representative #2' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(table.getByRole('row')).toHaveCount(4)
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  const branch = toolbar.getByRole('combobox', { name: 'Filter clients by branch' })
  await branch.selectOption(west)
  await expect(table.getByRole('row')).toHaveCount(27)
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  const sort = table.getByRole('button', { name: 'Sort by Branch' })
  await sort.focus()
  await page.keyboard.press('Enter')
  await expect(sort.locator('..')).toHaveAttribute('aria-sort', 'ascending')
  expect(await page.evaluate(() => (window as any).branchHarness.pushes.length)).toBe(3)
  await toolbar.getByRole('textbox', { name: 'Search clients' }).fill('Client 01')
  await expect(table.getByRole('row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Actions for Synthetic Client 01' }).click()
  await expect(page.getByRole('menuitem', { name: 'View Details' })).toHaveAttribute('href', '/pages/agency/clients/synthetic-1')
  await page.keyboard.press('Escape')
  await table.getByRole('button', { name: 'Open Synthetic Client 01' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.pushes.at(-1))).toBe('/pages/agency/clients/synthetic-1')
  expect(await page.evaluate(() => (window as any).branchHarness.reads)).toBe(1)
})

test('client table creation and status actions refresh existing workflows without row navigation', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('clients'))
  await page.getByRole('button', { name: 'Add New Client' }).click()
  await expect(page.getByRole('dialog', { name: 'Existing add client' })).toBeVisible()
  await page.getByRole('button', { name: 'Save synthetic client' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Actions for Synthetic Client 00' }).click()
  await page.getByRole('menuitem', { name: 'Deactivate' }).click()
  await expect(page.getByRole('button', { name: 'Open Synthetic Client 00' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).branchHarness.pushes)).toEqual([])
  expect(await page.evaluate(() => (window as any).branchHarness.refreshes)).toBe(2)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Synthetic Client 00' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Inactive', exact: true })).toBeVisible()
})

test('client table synthetic visual review at desktop and narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => (window as any).mountBranchReview('clients'))
  await expect(page.getByRole('table', { name: 'Clients', exact: true })).toBeVisible()
  const captures = path.resolve('node_modules/.cache/client-table-review')
  fs.mkdirSync(captures, { recursive: true })
  await page.screenshot({ path: path.join(captures, 'clients-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('combobox', { name: 'Filter clients by branch' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add New Client' })).toBeVisible()
  await page.screenshot({ path: path.join(captures, 'clients-narrow.png') })
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

test('client Overview edits Branch with the existing profile Save and Cancel controls', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('profile'))
  await expect(page.getByText('Branch:', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Branches', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).branchHarness.reads)).toBe(0)
  await page.getByRole('button', { name: 'Edit personal information' }).focus()
  await page.keyboard.press('Enter')
  const select = page.getByRole('combobox', { name: /Branch/ })
  await expect(select).toBeEnabled()
  await expect(select).toHaveValue(main)
  await select.focus()
  await page.keyboard.press('End')
  await page.getByLabel('First Name', { exact: false }).fill('Synthetic revised')
  await page.screenshot({ path: path.resolve('node_modules/.cache/client-profile-branch-review.png') })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes)).toEqual([expect.objectContaining({ id: recordId, branchId: west, first_name: 'Synthetic revised' })])
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible()
  await expect(page.getByText('West', { exact: true })).toBeVisible()
})

test('lead modal edits Branch with all the other attributes in one save', async ({ page }) => {
  await page.evaluate(() => (window as any).mountBranchReview('lead-edit'))
  const select = page.getByRole('combobox', { name: /Branch/ })
  await expect(select).toBeEnabled()
  await select.selectOption(west)
  await page.locator('input[name="contactFirstName"]').fill('Synthetic revised')
  await page.screenshot({ path: path.resolve('node_modules/.cache/lead-edit-branch-review.png') })
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes)).toEqual([expect.objectContaining({ id: recordId, branchId: west, contactFirstName: 'Synthetic revised' })])
})

test('branch setup validates accessibly and saves synthetic office information', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mountBranchReview('settings'))
  await page.getByRole('button', { name: 'Add Branch' }).click()
  await page.getByRole('button', { name: 'Save Branch' }).click()
  await expect(page.getByText('Name is required')).toBeVisible()
  await expect(page.getByLabel('Branch name', { exact: false })).toBeFocused()
  await page.getByLabel('Branch name', { exact: false }).fill('Synthetic West Office')
  await expect(page.getByLabel('Branch code', { exact: false })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('California')
  await page.getByLabel('Time zone', { exact: false }).fill('America/Los_Angeles')
  await page.screenshot({ path: info.outputPath('synthetic-branch-form.png') })
  await page.getByRole('button', { name: 'Save Branch' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.writes.length)).toBe(1)
  const submitted = await page.evaluate(() => (window as any).branchHarness.writes[0])
  expect(submitted.state).toBe('California')
  expect(submitted).not.toHaveProperty('code')
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

test('agency summary uses supplied data; keyboard tabs lazy-load one branch table and preserve it', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mountBranchReview('agency'))
  await expect(page.getByRole('heading', { name: 'Synthetic Browser Agency' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).branchHarness.branchReads)).toBe(0)
  const tab = page.getByRole('tab', { name: 'Branches', exact: true })
  await tab.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('table', { name: 'Agency branches' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Synthetic Main' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).branchHarness.branchReads)).toBe(1)
  await page.getByRole('tab', { name: 'Agency Info', exact: true }).click()
  await tab.click()
  expect(await page.evaluate(() => (window as any).branchHarness.branchReads)).toBe(1)
  await page.screenshot({ path: info.outputPath('synthetic-branch-table.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('synthetic-branch-table-mobile.png') })
  await page.getByRole('button', { name: 'Edit Synthetic Main' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Branch name', { exact: false })).toHaveValue('Synthetic Main')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Agency branches' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).branchHarness.branchReads)).toBe(1)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).branchHarness.branchReads)).toBe(2)
})

test('shared table supports keyboard sorting, pagination, filters, search and row opening', async ({ page }, info) => {
  await page.evaluate(() => (window as any).mountBranchReview('table'))
  await expect(page.getByText('Showing 1–2 of 3 fixtures')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Showing 3–3 of 3 fixtures')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Synthetic Gamma' })).toBeVisible()
  await page.getByRole('button', { name: 'Sort by Name' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: 'Sort by Name' })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.getByText('Showing 1–2 of 3 fixtures')).toBeVisible()
  await page.getByRole('combobox', { name: 'Filter group' }).selectOption('A')
  await expect(page.getByText('Showing 1–2 of 2 fixtures')).toBeVisible()
  await page.getByRole('textbox', { name: 'Search fixtures' }).fill('Alpha')
  await expect(page.getByText('Showing 1–1 of 1 fixtures')).toBeVisible()
  await page.getByRole('button', { name: 'Open Synthetic Alpha' }).focus()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => (window as any).tableOpened)).toBe('one')
  await page.screenshot({ path: info.outputPath('synthetic-shared-table.png') })
  await page.getByRole('combobox', { name: 'Filter group' }).selectOption('B')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Add Fixture' }).click()
  expect(await page.evaluate(() => (window as any).tableAdded)).toBe(true)
})
