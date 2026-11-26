import { StrictMode, type ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AgencyProgramsContent from '@/components/AgencyProgramsContent'
import { branchOptionsAction } from '@/app/actions/agency-branches'
import { cancelProgramRequest } from '@/app/actions/applications'
import { toast } from 'sonner'

const router = { push: jest.fn(), refresh: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))
jest.mock('@/app/actions/agency-branches', () => ({ branchOptionsAction: jest.fn() }))
jest.mock('@/app/actions/applications', () => ({ cancelProgramRequest: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/components/ApplyForNewLicenseButton', () => ({ __esModule: true, default: ({ label, programsOnly, branchSelectionEnabled }: any) =>
  <button data-programs-only={programsOnly} data-branch-selection={branchSelectionEnabled}>{label}</button> }))
type Props = ComponentProps<typeof AgencyProgramsContent>
const main = '77000000-0000-4000-8000-000000000001', west = '77000000-0000-4000-8000-000000000002'
const service = { id: 'synthetic-service', application_name: 'Synthetic Service', state: 'California', status: 'in_progress',
  progress_summary: { approved: 1, inProgress: 2, reviewNeeded: 3, notStarted: 4, notApplicable: 2, itemCount: 12 }, application_playbook_items: [] }
const base: Props = { programs: [service], totalCount: 101, page: 0, pageSize: 50, pendingRequests: [], branchesEnabled: true, branchSelectionEnabled: true }
const filter = () => screen.getByRole('combobox', { name: 'Filter services by branch' })
async function mount(overrides: Partial<Props> = {}, strict = false) {
  const content = <AgencyProgramsContent {...base} {...overrides} />
  const view = render(strict ? <StrictMode>{content}</StrictMode> : content)
  await act(async () => {})
  return view
}
beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState({}, '', '/pages/agency/programs')
  jest.mocked(branchOptionsAction).mockResolvedValue({ success: true, data: [
    { id: main, name: 'Main', status: 'active', is_default: true }, { id: west, name: 'West', status: 'inactive', is_default: false },
  ] } as any)
  jest.mocked(cancelProgramRequest).mockResolvedValue({ error: null })
})
afterEach(() => jest.useRealTimers())

test('uses shared search/filter/pagination and retains the existing request flow and summary values', async () => {
  await mount({}, true)
  const toolbar = screen.getByRole('group', { name: 'Services controls' })
  expect(within(toolbar).getByRole('textbox', { name: 'Search services' })).toBeVisible()
  expect(within(toolbar).getByRole('combobox', { name: 'Filter services by branch' })).toBeVisible()
  expect(within(toolbar).getByRole('button', { name: 'Request Service' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'My Services' }).closest('.max-w-6xl')).toBeNull()
  expect(screen.queryByRole('button', { name: /All branches/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request Service' })).toHaveAttribute('data-programs-only', 'true')
  expect(screen.getByRole('button', { name: 'Request Service' })).toHaveAttribute('data-branch-selection', 'true')
  expect(screen.getByText('10%')).toBeVisible()
  expect(screen.getByText('12 items')).toBeVisible()
  expect(screen.getByText('3 needs attention')).toBeVisible()
  expect(screen.getByText('2 in review')).toBeVisible()
  expect(screen.getByText('4 not started')).toBeVisible()
  expect(screen.getByText('Page 1 of 3')).toBeVisible()
  expect(branchOptionsAction).toHaveBeenCalledTimes(1)
  expect(router.push).not.toHaveBeenCalled()
})

test('branch changes reset page once, preserve search/extra params and keep inactive branches filterable', async () => {
  window.history.replaceState({}, '', '?page=2&q=Synthetic&extra=keep')
  await mount({ page: 2, initialSearch: 'Synthetic' })
  fireEvent.change(filter(), { target: { value: west } })
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
  const params = new URLSearchParams(router.push.mock.calls[0][0])
  expect(Object.fromEntries(params)).toEqual({ q: 'Synthetic', branch: west, extra: 'keep' })
  expect(screen.getByRole('option', { name: 'West (inactive)' })).toBeEnabled()
})

test('search waits 400ms then resets page once while retaining branch', async () => {
  jest.useFakeTimers()
  await mount({ page: 2, branchFilter: main })
  fireEvent.change(screen.getByRole('textbox', { name: 'Search services' }), { target: { value: 'Synthetic' } })
  act(() => jest.advanceTimersByTime(399))
  expect(router.push).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith(`?q=Synthetic&branch=${main}`, { scroll: false })
})

test('paging preserves branch/search and renders the server page without sorting or slicing it again', async () => {
  await mount({ page: 1, initialSearch: 'Synthetic', branchFilter: main })
  expect(screen.getByRole('button', { name: 'Open service Synthetic Service' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(`?page=2&q=Synthetic&branch=${main}`, { scroll: false }))
})

test('browser history restores the filters without another navigation and All branches clears the UUID', async () => {
  const view = await mount({ page: 1, branchFilter: main })
  view.rerender(<AgencyProgramsContent {...base} initialSearch="previous" branchFilter={west} />)
  expect(filter()).toHaveValue(west)
  expect(screen.getByRole('textbox', { name: 'Search services' })).toHaveValue('previous')
  expect(router.push).not.toHaveBeenCalled()
  fireEvent.change(filter(), { target: { value: '' } })
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('?q=previous', { scroll: false }))
})

test('row menus preserve View Service and do not open the row; primary cell opens the existing route', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Synthetic Service' }))
  expect(screen.getByRole('menuitem', { name: 'View Service' })).toHaveAttribute('href', '/pages/agency/programs/synthetic-service')
  expect(router.push).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Open service Synthetic Service' }))
  expect(router.push).toHaveBeenCalledWith('/pages/agency/programs/synthetic-service')
})

test('fallback progress preserves exclusion of not-applicable items and zero count behavior', async () => {
  await mount({ programs: [
    { ...service, progress_summary: undefined, application_playbook_items: [{ status: 'approved', requirement_type: 'required' }, { status: 'not_applicable', requirement_type: 'optional' }] },
    { ...service, id: 'empty-service', application_name: 'Synthetic Empty', progress_summary: undefined, application_playbook_items: [] },
  ] })
  expect(screen.getByText('100%')).toBeVisible()
  expect(screen.getByText('0%')).toBeVisible()
  expect(screen.getByText('2 items')).toBeVisible()
  expect(screen.getByText('0 items')).toBeVisible()
})

test.each(['success', 'returned-error', 'thrown-error'])('pending cancellation retains its action, collapsible panel and safe recovery: %s', async result => {
  if (result === 'returned-error') jest.mocked(cancelProgramRequest).mockResolvedValue({ error: 'This request can no longer be cancelled' })
  if (result === 'thrown-error') jest.mocked(cancelProgramRequest).mockRejectedValue(new Error('private provider details'))
  await mount({ pendingRequests: [{ id: 'synthetic-pending', application_name: 'Synthetic Pending', state: 'CA', status: 'requested', created_at: '2026-01-01' }], pendingHasMore: true })
  expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: 'Pending Requests (1+)' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/Showing the latest 50 requests/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
  await waitFor(() => expect(cancelProgramRequest).toHaveBeenCalledWith('synthetic-pending'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel request' })).toBeEnabled())
  expect(router.push).not.toHaveBeenCalled()
  if (result === 'success') expect(router.refresh).toHaveBeenCalledTimes(1)
  else {
    expect(router.refresh).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(result === 'returned-error' ? 'This request can no longer be cancelled' : 'Unable to cancel the service request. Please try again.')
  }
})

test('feature off makes no branch call; load errors retain Request Service and refresh', async () => {
  await mount({ branchesEnabled: false, programs: [], totalCount: 0, error: 'Unable to load services. Please try again.' })
  expect(branchOptionsAction).not.toHaveBeenCalled()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request Service' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(router.refresh).toHaveBeenCalledTimes(1)
})

test('branch-choice failure stays local and retry preserves the current selected branch', async () => {
  jest.mocked(branchOptionsAction).mockRejectedValueOnce(new Error('private provider details'))
  await mount({ branchFilter: west })
  expect(filter()).toHaveValue(west)
  expect(screen.getByRole('button', { name: 'Open service Synthetic Service' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry branch choices' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(branchOptionsAction).toHaveBeenCalledTimes(2)
  expect(router.push).not.toHaveBeenCalled()
})
