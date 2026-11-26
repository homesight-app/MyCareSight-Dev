import { StrictMode, type ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ClientsContent from '@/components/ClientsContent'
import { branchOptionsAction } from '@/app/actions/agency-branches'
import { updatePatientStatus } from '@/app/actions/query-bridge'
import { mapInsertedPatientToListPatient } from '@/lib/map-inserted-patient-to-list-row'
import { toast } from 'sonner'

const router = { push: jest.fn(), refresh: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))
jest.mock('@/app/actions/agency-branches', () => ({ branchOptionsAction: jest.fn() }))
jest.mock('@/app/actions/query-bridge', () => ({ updatePatientStatus: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/components/AddNewClientModal', () => ({ __esModule: true, default: ({ isOpen, onClose, onSuccess }: any) => isOpen
  ? <div role="dialog" aria-label="Existing add client"><button onClick={() => onSuccess({ id: 'new-client' })}>Save synthetic client</button><button onClick={onClose}>Cancel</button></div> : null }))

const main = '76000000-0000-4000-8000-000000000001'
const west = '76000000-0000-4000-8000-000000000002'
const client = { ...mapInsertedPatientToListPatient({ id: 'synthetic-client', first_name: 'Synthetic', last_name: 'Client', date_of_birth: '1980-01-02',
  gender: 'Male', class: 'Private Pay', emergency_contact_name: 'Synthetic Contact', emergency_phone: '555-0100',
  patients_representatives: [{ id: 'rep-1', name: 'Synthetic First', relationship: 'Family', phone_number: '555-0101' },
    { id: 'rep-2', name: 'Synthetic Second', relationship: 'Family', phone_number: '555-0102' }] }), branch_id: main, branch_name: 'Main' }
type Props = ComponentProps<typeof ClientsContent>
const base: Props = { clients: [client], totalCount: 101, activeCount: 101, totalAllCount: 110, page: 0, pageSize: 50,
  search: '', statusFilter: 'active', branchesEnabled: true }
const filter = () => screen.getByRole('combobox', { name: 'Filter clients by branch' })
async function mount(overrides: Partial<Props> = {}, strict = false) {
  const element = <ClientsContent {...base} {...overrides} />
  const result = render(strict ? <StrictMode>{element}</StrictMode> : element)
  await act(async () => {})
  return result
}
beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState({}, '', '/pages/agency/clients')
  jest.mocked(branchOptionsAction).mockResolvedValue({ success: true, data: [
    { id: main, name: 'Main', status: 'active', is_default: true }, { id: west, name: 'West', status: 'inactive', is_default: false },
  ] } as any)
  jest.mocked(updatePatientStatus).mockResolvedValue({ error: null } as any)
})
afterEach(() => jest.useRealTimers())

test('uses the shared table toolbar, branch column and existing record fields without per-row reads', async () => {
  await mount({}, true)
  const toolbar = screen.getByRole('group', { name: 'Clients controls' })
  expect(within(toolbar).getByRole('combobox', { name: 'Filter clients by branch' })).toBeVisible()
  expect(within(toolbar).getByRole('button', { name: 'Add New Client' })).toBeVisible()
  expect(within(toolbar).getByRole('textbox', { name: 'Search clients' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /All branches/ })).not.toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Branch' })).toBeVisible()
  expect(screen.queryByRole('columnheader', { name: 'Representative #2' })).not.toBeInTheDocument()
  expect(screen.getByText('Main', { selector: 'td' })).toBeVisible()
  expect(screen.getByText('Synthetic First')).toBeVisible()
  expect(screen.getByText('Synthetic Contact')).toBeVisible()
  expect(screen.getByText('Private Pay')).toBeVisible()
  expect(branchOptionsAction).toHaveBeenCalledTimes(1)
  expect(router.push).not.toHaveBeenCalled()
})

test('feature off keeps the second representative and performs no branch-options read', async () => {
  await mount({ branchesEnabled: false })
  expect(screen.getByRole('button', { name: 'Sort by Representative #2' })).toBeVisible()
  expect(screen.getByText('Synthetic Second')).toBeVisible()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(branchOptionsAction).not.toHaveBeenCalled()
})

test('branch changes reset the server page in one navigation and preserve other query state', async () => {
  window.history.replaceState({}, '', `?page=2&q=Synthetic&status=all&sortKey=name&sortDir=asc&extra=keep`)
  await mount({ page: 2, search: 'Synthetic', statusFilter: 'all', sortKey: 'name', sortDir: 'asc' })
  fireEvent.change(filter(), { target: { value: west } })
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
  const params = new URLSearchParams(router.push.mock.calls[0][0])
  expect(Object.fromEntries(params)).toEqual({ q: 'Synthetic', status: 'all', branch: west, sortKey: 'name', sortDir: 'asc', extra: 'keep' })
  expect(screen.getByRole('option', { name: 'West (inactive)' })).toBeEnabled()
})

test('sort uses an accessible header and server ordering, resetting the page once', async () => {
  await mount({ page: 1, branchFilter: main, sortKey: 'branch_name', sortDir: 'asc' })
  const header = screen.getByRole('button', { name: 'Sort by Branch' })
  expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(header)
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
  expect(router.push).toHaveBeenCalledWith(`?status=active&branch=${main}&sortKey=branch_name&sortDir=desc`, { scroll: false })
  expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending')
})

test('search waits 400ms before requesting page zero, with branch/sort/status preserved', async () => {
  jest.useFakeTimers()
  await mount({ page: 2, branchFilter: main, sortKey: 'name', sortDir: 'asc', statusFilter: 'all' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Search clients' }), { target: { value: 'Synthetic' } })
  act(() => jest.advanceTimersByTime(399))
  expect(router.push).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith(`?q=Synthetic&status=all&branch=${main}&sortKey=name&sortDir=asc`, { scroll: false })
})

test('paging retains all filters and renders only the supplied server page without a second slice', async () => {
  await mount({ page: 1, branchFilter: main, search: 'Synthetic', statusFilter: 'all', sortKey: 'name', sortDir: 'asc' })
  expect(screen.getByRole('button', { name: 'Open Synthetic Client' })).toBeVisible()
  expect(screen.getByText('Page 2 of 3')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(`?page=2&q=Synthetic&status=all&branch=${main}&sortKey=name&sortDir=asc`, { scroll: false }))
})

test('All explicitly survives the route default, and browser history restores state without extra requests', async () => {
  const view = await mount()
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('?status=all', { scroll: false }))
  view.rerender(<ClientsContent {...base} statusFilter="all" />)
  view.rerender(<ClientsContent {...base} statusFilter="inactive" search="previous" branchFilter={west} sortKey="name" sortDir="asc" page={1} />)
  expect(filter()).toHaveValue(west)
  expect(screen.getByRole('textbox', { name: 'Search clients' })).toHaveValue('previous')
  expect(screen.getByRole('button', { name: 'Inactive' })).toHaveAttribute('aria-pressed', 'true')
  expect(router.push).toHaveBeenCalledTimes(1)
})

test('opens the existing creation modal and refreshes after success instead of prepending an unsorted record', async () => {
  await mount({ branchFilter: west, search: 'match', statusFilter: 'inactive' })
  fireEvent.click(screen.getByRole('button', { name: 'Add New Client' }))
  expect(screen.getByRole('dialog', { name: 'Existing add client' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic client' }))
  expect(router.refresh).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open Synthetic Client' })).toBeVisible()
})

test.each([false, true])('status action stays isolated from row navigation; failure=%s preserves server rows', async failure => {
  jest.mocked(updatePatientStatus).mockResolvedValue({ error: failure ? { message: 'private provider details' } : null } as any)
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Synthetic Client' }))
  expect(screen.getByRole('menuitem', { name: 'View Details' })).toHaveAttribute('href', '/pages/agency/clients/synthetic-client')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }))
  await waitFor(() => expect(updatePatientStatus).toHaveBeenCalledWith('synthetic-client', 'inactive'))
  await act(async () => {})
  expect(router.push).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open Synthetic Client' })).toBeVisible())
  if (failure) {
    expect(router.refresh).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Unable to update client status. Please try again.')
  } else expect(router.refresh).toHaveBeenCalledTimes(1)
})

test('primary record button opens the existing details route and cleans up its navigation timer', async () => {
  jest.useFakeTimers()
  const view = await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Open Synthetic Client' }))
  expect(router.push).toHaveBeenCalledWith('/pages/agency/clients/synthetic-client')
  view.unmount()
  expect(jest.getTimerCount()).toBe(0)
})

test('branch failure stays local, retains the selected filter and can retry without polling', async () => {
  jest.mocked(branchOptionsAction).mockRejectedValueOnce(new Error('private provider details'))
  await mount({ branchFilter: west })
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load branch choices.')
  expect(filter()).toHaveValue(west)
  expect(screen.getByRole('button', { name: 'Open Synthetic Client' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry branch choices' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(branchOptionsAction).toHaveBeenCalledTimes(2)
  expect(router.push).not.toHaveBeenCalled()
})

test('record-load errors retain toolbar creation and a bounded server refresh', async () => {
  await mount({ clients: [], totalCount: 0, error: 'Unable to load clients. Please try again.' })
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(router.refresh).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Add New Client' }))
  expect(screen.getByRole('dialog')).toBeVisible()
})
