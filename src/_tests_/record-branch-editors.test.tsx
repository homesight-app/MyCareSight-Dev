import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientPersonalInfo from '@/components/ClientPersonalInfo'
import AddLeadModal from '@/components/AddLeadModal'
import LeadsContent from '@/components/LeadsContent'
import { branchOptionsAction } from '@/app/actions/agency-branches'
import { saveClientPersonalInfoAction } from '@/app/actions/client-personal-info'
import { updateLead } from '@/app/actions/leads'
import { AGENCY_LEAD_CONTEXT, ADMIN_LEAD_CONTEXT } from '@/lib/constants/lead-configs'

jest.mock('@/app/actions/agency-branches', () => ({ branchOptionsAction: jest.fn() }))
jest.mock('@/app/actions/client-personal-info', () => ({ saveClientPersonalInfoAction: jest.fn() }))
jest.mock('@/app/actions/leads', () => ({ updateLead: jest.fn(), createLead: jest.fn(), updatePatientLeadDetailsAction: jest.fn(), getLeadCollaboratorOptionsAction: jest.fn().mockResolvedValue({ data: [], currentUserId: null }) }))
jest.mock('@/app/actions/agencies', () => ({ getActiveAgencyOptionsAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/app/actions/agency-lead-stages', () => ({ getAgencyLeadStagesAction: jest.fn().mockResolvedValue({ data: [] }) }))
jest.mock('@/app/actions/agency-people', () => ({ getPeopleForAgency: jest.fn().mockResolvedValue({ keyStaff: [] }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/lib/form-validation-toast', () => ({ showValidationToast: jest.fn(), showSuccessToast: jest.fn() }))
jest.mock('@/components/LeadsKanbanBoard', () => () => null)
jest.mock('@/components/LeadSignedModal', () => () => null)
jest.mock('@/components/LeadCollectRetainerModal', () => () => null)
jest.mock('@/components/ConvertToAgencyPromptModal', () => () => null)
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

const main = '10000000-0000-4000-8000-000000000001', west = '10000000-0000-4000-8000-000000000002'
const client = { id: '10000000-0000-4000-8000-000000000003', first_name: 'Synthetic', last_name: 'Client', gender: '', date_of_birth: '1980-01-02', branch_id: main, branch_name: 'Main' }
const lead = { id: client.id, contact_first_name: 'Synthetic', contact_last_name: 'Lead', contact_email: '', contact_phone: '', company_name: '', service_type: 'other', service_states: [], stage: 'new', source: 'Other', price: null, retainer_amount: null, retainer_paid_date: null, installments: null, installment_amount: null, signed_date: null, notes: '', branch_id: main, branch_name: 'Main' }
function Profile({ canEditBranch = true, branchesEnabled = true }: { canEditBranch?: boolean; branchesEnabled?: boolean }) {
  const [value, setValue] = useState(client)
  return <ClientPersonalInfo client={value} branchesEnabled={branchesEnabled} canEditBranch={canEditBranch}
    dobFromAge={() => '1980-01-02'} formatDate={value => value} onSaved={data => setValue(previous => ({ ...previous, ...data }) as typeof client)} />
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(branchOptionsAction).mockResolvedValue({ success: true, data: [{ id: main, name: 'Main', status: 'active', is_default: true }, { id: west, name: 'West', status: 'active', is_default: false }] })
  jest.mocked(saveClientPersonalInfoAction).mockResolvedValue({ success: true })
  jest.mocked(updateLead).mockResolvedValue({ error: null })
})

test('profile displays Branch with attributes, lazily loads only on Edit, and saves it with the profile', async () => {
  render(<StrictMode><Profile /></StrictMode>)
  expect(screen.getByText('Branch:')).toBeInTheDocument()
  expect(branchOptionsAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal information' }))
  const selector = await screen.findByLabelText(/Branch/)
  await waitFor(() => expect(selector).toBeEnabled())
  expect(branchOptionsAction).toHaveBeenCalledTimes(1)
  fireEvent.change(selector, { target: { value: west } })
  fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'Synthetic revised' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saveClientPersonalInfoAction).toHaveBeenCalledWith(client.id, expect.objectContaining({ branchId: west, first_name: 'Synthetic revised' })))
  await screen.findByRole('button', { name: 'Edit personal information' })
  expect(screen.getByText('West')).toBeInTheDocument()
})

test('Cancel discards branch changes; server field errors preserve the form and map inline', async () => {
  render(<Profile />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal information' }))
  await waitFor(() => expect(screen.getByLabelText(/Branch/)).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/Branch/), { target: { value: west } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(saveClientPersonalInfoAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal information' }))
  await waitFor(() => expect(screen.getByLabelText(/Branch/)).toBeEnabled())
  expect(screen.getByLabelText(/Branch/)).toHaveValue(main)
  jest.mocked(saveClientPersonalInfoAction).mockResolvedValue({ success: false, error: 'Check fields', fieldErrors: { branchId: ['Choose an active branch.'] } })
  fireEvent.change(screen.getByLabelText(/Branch/), { target: { value: west } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Choose an active branch.')
  expect(screen.getByLabelText(/Branch/)).toHaveValue(west)
})

test('coordinators retain profile editing without submitting a branch mutation', async () => {
  render(<Profile canEditBranch={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal information' }))
  await waitFor(() => expect(branchOptionsAction).toHaveBeenCalled())
  expect(screen.getByLabelText(/Branch/)).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saveClientPersonalInfoAction).toHaveBeenCalledWith(client.id, expect.objectContaining({ branchId: undefined })))
})

test('feature-off profile has no Branch field and makes no options read', async () => {
  render(<Profile branchesEnabled={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal information' }))
  expect(screen.queryByLabelText(/Branch/)).not.toBeInTheDocument()
  expect(branchOptionsAction).not.toHaveBeenCalled()
})

test('the existing lead Edit form submits branch and attributes in a single action', async () => {
  const success = jest.fn()
  const view = render(<AddLeadModal isOpen={false} onClose={jest.fn()} onSuccess={success} context={AGENCY_LEAD_CONTEXT} editLead={lead} branchesEnabled canEditBranch />)
  expect(branchOptionsAction).not.toHaveBeenCalled()
  view.rerender(<AddLeadModal isOpen onClose={jest.fn()} onSuccess={success} context={AGENCY_LEAD_CONTEXT} editLead={lead} branchesEnabled canEditBranch />)
  await waitFor(() => expect(screen.getByLabelText(/Branch/)).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/Branch/), { target: { value: west } })
  fireEvent.submit(document.querySelector('form')!)
  await waitFor(() => expect(updateLead).toHaveBeenCalledWith(client.id, expect.objectContaining({ branchId: west, contactFirstName: lead.contact_first_name })))
  expect(success).toHaveBeenCalledWith(client.id)
})

test('platform sales lead edit does not load or show agency branch choices', async () => {
  render(<AddLeadModal isOpen onClose={jest.fn()} onSuccess={jest.fn()} context={ADMIN_LEAD_CONTEXT} editLead={lead} branchesEnabled canEditBranch />)
  await act(async () => {})
  expect(screen.queryByLabelText(/Branch/)).not.toBeInTheDocument()
  expect(branchOptionsAction).not.toHaveBeenCalled()
})

test('the existing lead table shows Branch and reuses accessible server sorting without fetching options', () => {
  const row = { ...lead, lead_type: 'patient', status: 'active', created_at: '2026-01-01T00:00:00Z', lead_owner_id: null, proposal_sent_date: null }
  render(<LeadsContent leads={[row]} context={AGENCY_LEAD_CONTEXT} branchesEnabled />)
  expect(screen.getByRole('button', { name: 'Sort by Branch' }).closest('th')).toHaveAttribute('aria-sort', 'none')
  expect(screen.getByText('Main')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Branch' }))
  expect(push.mock.calls[0][0]).toContain('sortKey=branch_name')
  expect(branchOptionsAction).not.toHaveBeenCalled()
})
