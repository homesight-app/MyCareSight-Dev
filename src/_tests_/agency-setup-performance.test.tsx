import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AgencyInfoPanel from '@/components/AgencyInfoPanel'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'
import AgencyDetailContent from '@/components/AgencyDetailContent'
import AgencyBranchSettings from '@/components/AgencyBranchSettings'
import AgencySummaryCard from '@/components/AgencySummaryCard'
import AgencyInfoServer from '@/components/AgencyInfoServer'
import { readAgencyInfo } from '@/lib/repositories/agency-branches'
import { getAgencyInfoAction, listBranchesAction, saveBranchAction } from '@/app/actions/agency-branches'
import type { AgencyInfoRecord, AgencyBranch } from '@/lib/agency-branches'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }), useSearchParams: () => new URLSearchParams() }))
jest.mock('@/lib/repositories/agency-branches', () => ({ readAgencyInfo: jest.fn() }))
jest.mock('@/app/actions/agency-branches', () => ({ getAgencyInfoAction: jest.fn(), listBranchesAction: jest.fn(), saveBranchAction: jest.fn(), changeBranchStateAction: jest.fn(), saveAgencyInfoAction: jest.fn() }))
jest.mock('@/app/actions/agency-configuration', () => ({ saveAgencyConfiguration: jest.fn(), loadAgencyConfigurationAction: jest.fn().mockResolvedValue({ success: true, data: null }), loadAgencyPipelineAction: jest.fn() }))
jest.mock('@/app/actions/agencies', () => ({ updateAgency: jest.fn() }))
jest.mock('@/app/actions/feature-plans', () => ({ assignPlanToAgency: jest.fn() }))
jest.mock('@/app/actions/leads', () => ({ fetchLeadDocumentsAction: jest.fn(), fetchLeadNotesAction: jest.fn() }))
jest.mock('@/lib/storage', () => ({ createSignedStorageUrl: jest.fn(), STORAGE_BUCKET: {} }))
jest.mock('@/lib/storage/browser', () => ({ downloadStoredFile: jest.fn() }))
jest.mock('@/components/CreateLicenseModal', () => () => null)
jest.mock('@/components/CertificationDetailModal', () => () => null)
jest.mock('@/components/AgencyAdminsSection', () => () => null)
jest.mock('@/components/AgencyOnboardingLinkPanel', () => () => null)
jest.mock('@/components/AgencyPeopleTab', () => function PeopleMock() { return <p>People placeholder</p> })
jest.mock('@/components/AgencyCaregiversTab', () => () => null)
jest.mock('@/components/AgencyNotesTab', () => () => null)
jest.mock('@/components/AgencyDocumentsTab', () => () => null)
jest.mock('@/components/AgencyLeadIntegrationPanel', () => () => null)
jest.mock('@/components/AgencyLeadStageSettings', () => () => null)
jest.mock('@/components/ApplyForNewLicenseButton', () => () => null)
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const agency: AgencyInfoRecord = { id: '40000000-0000-4000-8000-000000000001', name: 'Synthetic Setup Agency',
  business_type: 'Synthetic Type', tax_id: 'SYNTHETIC-EIN', primary_license_number: 'SYNTHETIC-LICENSE', website: 'https://example.invalid',
  physical_street_address: 'Synthetic Street', physical_city: 'Synthetic City', physical_state: 'CA', physical_zip_code: '00000',
  same_as_physical: true, mailing_street_address: null, mailing_city: null, mailing_state: null, mailing_zip_code: null }
const branch: AgencyBranch = { id: '40000000-0000-4000-8000-000000000002', agency_id: agency.id, code: 'main', name: 'Synthetic Main', is_default: true,
  status: 'active', timezone: 'UTC', street_address: null, city: 'Synthetic City', state: 'California', zip_code: null, phone: null, email: null }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listBranchesAction).mockResolvedValue({ success: true, data: { rows: [branch], totalCount: 1, hasMore: false } })
})

test('server summary projects one authorized agency without client or unopened-tab reads', async () => {
  jest.mocked(readAgencyInfo).mockResolvedValue({ ...agency, same_as_physical: null })
  const view = await AgencyInfoServer({ branchesEnabled: true, initialTab: 'overview' })
  render(view)
  expect(screen.getByRole('heading', { name: agency.name })).toBeVisible()
  expect(screen.getByText('Same as physical address')).toBeVisible()
  expect(readAgencyInfo).toHaveBeenCalledTimes(1)
  expect(getAgencyInfoAction).not.toHaveBeenCalled()
  expect(listBranchesAction).not.toHaveBeenCalled()
})

test('a server summary failure shows a safe local retry and does not automatically repeat the failed read', async () => {
  jest.mocked(readAgencyInfo).mockRejectedValue(new Error('synthetic-private-detail'))
  jest.mocked(getAgencyInfoAction).mockResolvedValue({ success: true, data: agency })
  render(await AgencyInfoServer({ branchesEnabled: true, initialTab: 'overview' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load agency information')
  expect(screen.queryByText(/synthetic-private-detail/)).not.toBeInTheDocument()
  expect(getAgencyInfoAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: agency.name })).toBeVisible()
  expect(getAgencyInfoAction).toHaveBeenCalledTimes(1)
  expect(listBranchesAction).not.toHaveBeenCalled()
})

test('server-supplied summary has no client read waterfall; branches and editor load only on opening', async () => {
  render(<AgencyInfoPanel initialAgency={agency} branchesEnabled />)
  expect(screen.getByRole('heading', { name: agency.name })).toBeVisible()
  expect(getAgencyInfoAction).not.toHaveBeenCalled()
  expect(listBranchesAction).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }))
  expect(await screen.findByRole('table', { name: 'Agency branches' })).toBeVisible()
  expect(listBranchesAction).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('tab', { name: 'Agency Info' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }))
  expect(screen.getByRole('table', { name: 'Agency branches' })).toBeVisible()
  expect(listBranchesAction).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('tab', { name: 'Agency Info' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Agency Info' }))
  expect(await screen.findByLabelText(/Agency Name/)).toHaveValue(agency.name)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
  expect(getAgencyInfoAction).not.toHaveBeenCalled()
})

test('Configuration retains the agency panel and loaded branches when another settings section opens', async () => {
  render(<AgencyConfigurationContent initialConfig={null} initialStages={[]} agencyId={agency.id} userRole="company_owner" branchesEnabled
    agencyPanel={<AgencyInfoPanel initialAgency={agency} branchesEnabled />} />)
  expect(screen.queryByRole('button', { name: 'Branches' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }))
  await screen.findByRole('table', { name: 'Agency branches' })
  fireEvent.click(screen.getByRole('button', { name: 'Work Schedule' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agency Info' }))
  expect(screen.getByRole('table', { name: 'Agency branches' })).toBeVisible()
  expect(listBranchesAction).toHaveBeenCalledTimes(1)
  expect(getAgencyInfoAction).not.toHaveBeenCalled()
})

test('admin agency view reuses the summary and mounts scoped branches only after its tab opens', async () => {
  render(<AgencyDetailContent agency={agency} licenses={[]} certificationCategoryOptions={[]} agencyAdmins={[]} availableAdmins={[]}
    backPath="/pages/admin/agencies" canEdit branchesEnabled />)
  expect(screen.getByRole('heading', { name: agency.name })).toBeVisible()
  expect(listBranchesAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }))
  await screen.findByRole('table', { name: 'Agency branches' })
  expect(listBranchesAction).toHaveBeenCalledWith(expect.objectContaining({ agencyId: agency.id, page: 0 }))
  fireEvent.click(screen.getByRole('tab', { name: 'People' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }))
  expect(listBranchesAction).toHaveBeenCalledTimes(1)
})

test('branch pages, sort and search request bounded server results; cached pages avoid another request', async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...branch, id: `40000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`, name: `Synthetic ${index}` }))
  jest.mocked(listBranchesAction).mockResolvedValueOnce({ success: true, data: { rows, totalCount: 26, hasMore: true } })
    .mockResolvedValue({ success: true, data: { rows: [branch], totalCount: 26, hasMore: false } })
  render(<AgencyBranchSettings />)
  await screen.findByRole('button', { name: 'Edit Synthetic 0' })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(listBranchesAction).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
  await screen.findByRole('button', { name: 'Edit Synthetic Main' })
  fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
  await screen.findByRole('button', { name: 'Edit Synthetic 0' })
  expect(listBranchesAction).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search branches' }), { target: { value: 'Synthetic Main' } })
  await waitFor(() => expect(listBranchesAction).toHaveBeenCalledTimes(3))
  expect(listBranchesAction).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, search: 'Synthetic Main', sort: { key: 'name', dir: 'asc' } }))
  fireEvent.click(screen.getByText('Name', { selector: 'th span' }))
  await waitFor(() => expect(listBranchesAction).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, sort: { key: 'name', dir: 'desc' } })))
})

test('clicking a branch row opens the existing editor without refetching its fields and saves an admin scope', async () => {
  jest.mocked(saveBranchAction).mockResolvedValue({ success: true, id: branch.id })
  render(<AgencyBranchSettings agencyId={agency.id} />)
  const name = await screen.findByRole('button', { name: 'Edit Synthetic Main' })
  fireEvent.click(name.closest('tr')!)
  expect(screen.getByLabelText(/Branch name/)).toHaveValue(branch.name)
  expect(listBranchesAction).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Save Branch' }))
  await waitFor(() => expect(saveBranchAction).toHaveBeenCalledWith(expect.objectContaining({ id: branch.id }), agency.id))
})

test('summary card retains admin labels and links without fetching data', () => {
  render(<AgencySummaryCard agency={agency} agencyAdmins={[{ contact_name: 'Synthetic Administrator' }]} />)
  expect(screen.getByText('Agency Admins')).toBeVisible()
  expect(screen.getByText('Synthetic Administrator')).toBeVisible()
  expect(screen.getByRole('link', { name: 'https://example.invalid' })).toHaveAttribute('rel', 'noopener noreferrer')
})
