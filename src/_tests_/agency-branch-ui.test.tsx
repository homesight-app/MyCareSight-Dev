import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecordBranchAssignment from '@/components/RecordBranchAssignment'
import AgencyBranchSettings from '@/components/AgencyBranchSettings'
import AgencyConfigurationContent from '@/components/AgencyConfigurationContent'
import AgencyInfoSection from '@/components/AgencyInfoSection'
import ProgramBranchRequestForm from '@/components/ProgramBranchRequestForm'
import { assignRecordBranchesAction, branchOptionsAction, getRecordBranchesAction, listBranchesAction, requestProgramBranchesAction, saveAgencyInfoAction, saveBranchAction } from '@/app/actions/agency-branches'
import { saveAgencyConfiguration } from '@/app/actions/agency-configuration'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn() }) }))
jest.mock('@/components/AgencyLeadStageSettings', () => function PipelineMock() { return <div>Pipeline settings</div> })
jest.mock('@/app/actions/agency-configuration', () => ({ saveAgencyConfiguration: jest.fn(), loadAgencyConfigurationAction: jest.fn().mockResolvedValue({ success: true, data: null }), loadAgencyPipelineAction: jest.fn().mockResolvedValue({ success: true, data: [] }) }))
jest.mock('@/app/actions/agency-branches', () => ({
  assignRecordBranchesAction: jest.fn(), getRecordBranchesAction: jest.fn(), listBranchesAction: jest.fn(),
  saveBranchAction: jest.fn(), changeBranchStateAction: jest.fn(), getAgencyInfoAction: jest.fn(),
  saveAgencyInfoAction: jest.fn(),
  branchOptionsAction: jest.fn(), requestProgramBranchesAction: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const main = '20000000-0000-4000-8000-000000000001', west = '20000000-0000-4000-8000-000000000002', recordId = '20000000-0000-4000-8000-000000000003'
const branches = [{ id: main, name: 'Main', status: 'active' as const }, { id: west, name: 'West', status: 'active' as const }]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getRecordBranchesAction).mockResolvedValue({ success: true, data: { branchIds: [main], branches, canEdit: true } })
  jest.mocked(assignRecordBranchesAction).mockResolvedValue({ success: true })
  jest.mocked(listBranchesAction).mockResolvedValue({ success: true, data: { rows: [], hasMore: false, totalCount: 0 } })
})

test('record shell makes no branch request until its branch control is opened', async () => {
  render(<RecordBranchAssignment kind="client" recordId={recordId} />)
  expect(getRecordBranchesAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Branches' }))
  expect(await screen.findByRole('combobox', { name: 'Current branch' })).toHaveValue(main)
  expect(getRecordBranchesAction).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: west } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }))
  await waitFor(() => expect(assignRecordBranchesAction).toHaveBeenCalledWith({ kind: 'client', recordId, branchIds: [west] }))
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('shared program selection submits multiple branch IDs with one application ID', async () => {
  render(<RecordBranchAssignment kind="application" recordId={recordId} />)
  fireEvent.click(screen.getByRole('button', { name: 'Branches' }))
  fireEvent.click(await screen.findByLabelText('West'))
  fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }))
  await waitFor(() => expect(assignRecordBranchesAction).toHaveBeenCalledWith({ kind: 'application', recordId, branchIds: [main, west] }))
})

test('coordinator branch display is read-only and cannot submit', async () => {
  jest.mocked(getRecordBranchesAction).mockResolvedValue({ success: true, data: { branchIds: [main], branches, canEdit: false } })
  render(<RecordBranchAssignment kind="lead" recordId={recordId} />)
  fireEvent.click(screen.getByRole('button', { name: 'Branches' }))
  expect(await screen.findByRole('combobox')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Save Assignment' })).not.toBeInTheDocument()
})

test('a failed load can retry and a failed save keeps the selection', async () => {
  jest.mocked(getRecordBranchesAction).mockResolvedValueOnce({ success: false, error: 'Unavailable' })
  jest.mocked(assignRecordBranchesAction).mockResolvedValue({ success: false, error: 'Refresh before retrying.' })
  render(<RecordBranchAssignment kind="lead" recordId={recordId} />)
  fireEvent.click(screen.getByRole('button', { name: 'Branches' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: west } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }))
  await waitFor(() => expect(assignRecordBranchesAction).toHaveBeenCalled())
  expect(screen.getByRole('combobox')).toHaveValue(west)
  expect(refresh).not.toHaveBeenCalled()
})

test('branch form validates shared fields before sending a write', async () => {
  render(<AgencyBranchSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Branch' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Branch' }))
  expect(await screen.findByText('Name is required')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Branch code/)).not.toBeInTheDocument()
  expect(saveBranchAction).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/Branch name/)).toHaveAttribute('aria-describedby', 'branch-name-error')
})

test('configuration hides branding and does not fetch unopened branch panels', () => {
  render(<AgencyConfigurationContent agencyId={recordId} userRole="care_coordinator" initialConfig={null} initialStages={[]} branchesEnabled />)
  expect(screen.queryByRole('button', { name: 'Branding' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Branches' })).not.toBeInTheDocument()
  expect(listBranchesAction).not.toHaveBeenCalled()
})

test('editing a legacy branch keeps its code read-only and selects the existing state abbreviation', async () => {
  jest.mocked(listBranchesAction).mockResolvedValue({ success: true, data: { rows: [{
    id: west, agency_id: recordId, code: 'legacy-office', name: 'Synthetic West', status: 'active', is_default: false,
    timezone: 'America/Los_Angeles', state: 'CA', street_address: null, city: null, zip_code: null, phone: null, email: null,
  }], hasMore: false, totalCount: 1 } })
  jest.mocked(saveBranchAction).mockResolvedValue({ success: true, id: west })
  render(<AgencyBranchSettings />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Synthetic West' }))
  expect(screen.getByText('Branch code: legacy-office')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Branch code/)).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('California')
  fireEvent.change(screen.getByRole('combobox', { name: 'State' }), { target: { value: 'Florida' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Branch' }))
  await waitFor(() => expect(saveBranchAction).toHaveBeenCalledWith(expect.objectContaining({ id: west, state: 'Florida' })))
  expect(jest.mocked(saveBranchAction).mock.calls[0][0]).not.toHaveProperty('code')
})

test('relocated agency form preserves separate mailing-address entry and accessible field errors', async () => {
  jest.mocked(saveAgencyInfoAction).mockResolvedValue({ success: true })
  render(<AgencyInfoSection initialAgency={{ name: 'Synthetic Agency', business_type: 'Synthetic Business', tax_id: 'SYNTHETIC-EIN',
    primary_license_number: 'SYNTHETIC-LICENSE', physical_street_address: 'Synthetic Office', physical_city: 'Synthetic City', physical_state: 'CA', physical_zip_code: '00000', same_as_physical: true }} />)
  fireEvent.click(screen.getByLabelText('Same as physical address'))
  expect(screen.getAllByLabelText(/^Street Address/)).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByText('Mailing address fields are required when not same as physical address')).toBeInTheDocument()
  expect(saveAgencyInfoAction).not.toHaveBeenCalled()
  expect(screen.getAllByRole('combobox', { name: /^State/ })[0]).toHaveValue('California')
  for (const [field, value] of Object.entries({ mailingStreetAddress: 'Synthetic Mailing Office', mailingCity: 'Synthetic City', mailingState: 'California', mailingZipCode: '00000' })) {
    fireEvent.change(document.getElementById(`agency-${field}`)!, { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(saveAgencyInfoAction).toHaveBeenCalledWith(expect.objectContaining({ sameAsPhysical: false, mailingStreetAddress: 'Synthetic Mailing Office' })))
})

test('whitespace cannot satisfy a required agency name in the shared schema', async () => {
  render(<AgencyInfoSection initialAgency={{ name: '   ' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByText('Company name is required')).toBeInTheDocument()
  expect(saveAgencyInfoAction).not.toHaveBeenCalled()
})

test('program request reports its busy state to the shared modal and prevents duplicate submission', async () => {
  jest.mocked(branchOptionsAction).mockResolvedValue({ success: true, data: branches.map(branch => ({ ...branch, is_default: branch.id === main })) })
  let complete!: (value: { success: true; id: string }) => void
  jest.mocked(requestProgramBranchesAction).mockReturnValue(new Promise(resolve => { complete = resolve }))
  const busy = jest.fn(), saved = jest.fn()
  render(<ProgramBranchRequestForm playbookId={recordId} state="CA" onSaved={saved} onBusyChange={busy} />)
  await screen.findByLabelText('Main (default)')
  const button = screen.getByRole('button', { name: 'Submit Program Request' })
  fireEvent.click(button)
  await waitFor(() => expect(busy).toHaveBeenCalledWith(true))
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(requestProgramBranchesAction).toHaveBeenCalledTimes(1)
  complete({ success: true, id: recordId })
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(busy).toHaveBeenLastCalledWith(false)
})

test('a settings transport failure restores Save and preserves entered values for retry', async () => {
  jest.mocked(saveAgencyConfiguration).mockRejectedValueOnce(new Error('synthetic transport failure'))
    .mockResolvedValueOnce({ error: null })
  render(<AgencyConfigurationContent agencyId={recordId} userRole="care_coordinator" initialStages={[]} initialConfig={{
    work_week_start: 0, allow_weekends: true, weekend_rate_multiplier: null, full_time_hours_per_week: 40,
    overtime_threshold_weekly: 40, overtime_threshold_daily: null, overtime_rate_multiplier: 1.5,
    holidays: [], mileage_reimbursement_enabled: false, mileage_reimbursement_start_date: null, mileage_rate_per_mile: null,
  }} />)
  const week = screen.getByRole('combobox')
  fireEvent.change(week, { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  expect(await screen.findByText('Unable to save configuration. Refresh before retrying.')).toBeInTheDocument()
  expect(week).toHaveValue('1')
  const retry = screen.getByRole('button', { name: /^Save$/ })
  expect(retry).toBeEnabled()
  fireEvent.click(retry)
  await waitFor(() => expect(saveAgencyConfiguration).toHaveBeenCalledTimes(2))
  expect(jest.mocked(saveAgencyConfiguration).mock.calls[1][0].workWeekStart).toBe(1)
})

test('branch contact errors are associated with the corresponding input and prevent a write', async () => {
  render(<AgencyBranchSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Branch' }))
  fireEvent.change(screen.getByLabelText(/Branch name/), { target: { value: 'Synthetic West' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '123' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Branch' }))
  await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'))
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'branch-email-error')
  expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-describedby', 'branch-phone-error')
  expect(saveBranchAction).not.toHaveBeenCalled()
})
