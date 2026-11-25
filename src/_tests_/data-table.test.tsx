import { fireEvent, render, screen, within } from '@testing-library/react'
import DataTable, { type DataTableColumn, type DataTableProps } from '@/components/ui/DataTable'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import TablePagination from '@/components/ui/TablePagination'

type Row = { id: string; name: string; inactive: boolean }
const rows: Row[] = [{ id: 'synthetic-1', name: 'Synthetic One', inactive: false }, { id: 'synthetic-2', name: 'Synthetic Two', inactive: true }]
const columns: DataTableColumn<Row>[] = [
  { key: 'name', label: 'Name', sortable: true, render: row => <span>{row.name}</span> },
  { key: 'status', label: 'Status', retainEmphasis: true, render: row => row.inactive ? 'Inactive' : 'Active' },
]
function props(): DataTableProps<Row> {
  return { label: 'Synthetic records', entityLabel: 'records', rows, columns, getRowKey: row => row.id, getRowLabel: row => row.name,
    pagination: { page: 0, pageSize: 2, totalCount: 5, onPageChange: jest.fn() },
    search: { value: '', onChange: jest.fn() }, sort: { value: { key: 'name', dir: 'asc' }, onChange: jest.fn() },
    filters: [{ key: 'status', label: 'Filter status', value: 'all', options: [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }], onChange: jest.fn() }],
    addAction: { label: 'Add Record', onClick: jest.fn() }, onRefresh: jest.fn(), onRetry: jest.fn(),
    rowNavigation: { columnKey: 'name', onOpen: jest.fn() }, isRowInactive: row => row.inactive }
}

test('shared toolbar emits search/filter changes, resets pagination and leaves server rows untouched', () => {
  const value = props()
  value.pagination.page = 2
  render(<DataTable {...value} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search records' }), { target: { value: 'new search' } })
  expect(value.search!.onChange).toHaveBeenCalledWith('new search')
  expect(value.pagination.onPageChange).toHaveBeenLastCalledWith(0)
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter status' }), { target: { value: 'active' } })
  expect(value.filters![0].onChange).toHaveBeenCalledWith('active')
  expect(value.pagination.onPageChange).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Open Synthetic Two' })).toBeVisible()
})

test('sort controls have button semantics, correct aria-sort and reset the server page', () => {
  const value = props()
  const { rerender } = render(<DataTable {...value} />)
  expect(screen.getByRole('button', { name: 'Sort by Name' }).closest('th')).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
  expect(value.sort!.onChange).toHaveBeenCalledTimes(1)
  expect(value.sort!.onChange).toHaveBeenCalledWith('name')
  expect(value.pagination.onPageChange).toHaveBeenCalledWith(0)
  rerender(<DataTable {...value} sort={{ value: { key: 'name', dir: 'desc' }, onChange: value.sort!.onChange }} />)
  expect(screen.getByRole('button', { name: 'Sort by Name' }).closest('th')).toHaveAttribute('aria-sort', 'descending')
})

test('pagination uses server totals without slicing the current page twice', () => {
  const value = props()
  value.rows = [rows[1]]
  value.pagination = { ...value.pagination, page: 2, pageSize: 1, totalCount: 4 }
  const { rerender } = render(<DataTable {...value} />)
  expect(screen.getByRole('button', { name: 'Open Synthetic Two' })).toBeVisible()
  expect(screen.getByText('Showing 3–3 of 4 records')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(value.pagination.onPageChange).toHaveBeenCalledWith(3)
  rerender(<DataTable {...value} pagination={{ ...value.pagination, page: 3 }} />)
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
  expect(value.pagination.onPageChange).toHaveBeenLastCalledWith(2)
})

test('zero results keep search and Add available and pagination stays at a valid first page', () => {
  const value = props()
  render(<DataTable {...value} rows={[]} pagination={{ ...value.pagination, totalCount: 0 }} emptyMessage="No matching synthetic records." />)
  expect(screen.getByText('No matching synthetic records.')).toBeVisible()
  expect(screen.getByText('Page 1 of 1')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Add Record' }))
  expect(value.addAction!.onClick).toHaveBeenCalledTimes(1)
})

test('row cells and the primary button open exactly once', () => {
  const value = props()
  render(<DataTable {...value} />)
  const button = screen.getByRole('button', { name: 'Open Synthetic One' })
  button.focus()
  expect(button).toHaveFocus()
  fireEvent.click(button)
  expect(value.rowNavigation!.onOpen).toHaveBeenCalledTimes(1)
  fireEvent.click(within(button.closest('tr')!).getByText('Active'))
  expect(value.rowNavigation!.onOpen).toHaveBeenCalledTimes(2)
  expect(value.rowNavigation!.onOpen).toHaveBeenLastCalledWith(rows[0])
})

test('nested inputs, links, buttons and portalled actions never open the row', () => {
  const value = props(), action = jest.fn()
  render(<DataTable {...value} rowActions={() => [{ label: 'Inspect', onClick: action }]} columns={[...columns,
    { key: 'controls', label: 'Controls', render: row => <>
      <input type="checkbox" aria-label={`Select ${row.name}`} />
      <a href="/synthetic" onClick={event => event.preventDefault()}>Synthetic link {row.id}</a>
      <button type="button">Secondary {row.id}</button>
    </> },
  ]} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Synthetic One' }))
  fireEvent.click(screen.getByRole('link', { name: 'Synthetic link synthetic-1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Secondary synthetic-1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Synthetic One' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Inspect' }))
  expect(action).toHaveBeenCalledTimes(1)
  expect(value.rowNavigation!.onOpen).not.toHaveBeenCalled()
})

test('inactive styling dims data cells while preserving status and action contrast', () => {
  const value = props()
  render(<DataTable {...value} rowActions={() => [{ label: 'Inspect', onClick: jest.fn() }]} />)
  const name = screen.getByRole('button', { name: 'Open Synthetic Two' })
  expect(name.closest('td')).toHaveClass('opacity-60')
  const row = name.closest('tr')!
  expect(row).not.toHaveClass('opacity-60')
  expect(within(row).getByText('Inactive').closest('td')).not.toHaveClass('opacity-60')
  expect(within(row).getByRole('button', { name: 'Actions for Synthetic Two' }).closest('td')).not.toHaveClass('opacity-60')
})

test('loading keeps the shell and sort controls mounted, hides stale rows and blocks page changes', () => {
  const value = props()
  render(<DataTable {...value} loading />)
  expect(screen.getByRole('table', { name: 'Synthetic records' })).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Loading records')
  expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Open Synthetic One' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(value.pagination.onPageChange).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
})

test('error state replaces stale data and offers the caller retry action', () => {
  const value = props()
  render(<DataTable {...value} error="Synthetic request failed." />)
  expect(screen.getByRole('alert')).toHaveTextContent('Synthetic request failed.')
  expect(screen.queryByRole('button', { name: 'Open Synthetic One' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(value.onRetry).toHaveBeenCalledTimes(1)
})

test('disabled table blocks all standard interactions during a feature mutation', () => {
  const value = props()
  render(<DataTable {...value} disabled rowActions={() => [{ label: 'Inspect' }]} />)
  expect(screen.getByRole('textbox', { name: 'Search records' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Filter status' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Actions for Synthetic One' })).not.toBeInTheDocument()
  for (const name of ['Add Record', 'Refresh', 'Sort by Name', 'Open Synthetic One', 'Next']) expect(screen.getByRole('button', { name })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Open Synthetic One' }).closest('tr')!)
  expect(value.rowNavigation!.onOpen).not.toHaveBeenCalled()
})

test('read-only tables can omit editing and toolbar controls', () => {
  const value = props()
  render(<DataTable {...value} addAction={undefined} rowNavigation={undefined} search={undefined} filters={[]} onRefresh={undefined} />)
  expect(screen.getByText('Synthetic One')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Open Synthetic One' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add Record' })).not.toBeInTheDocument()
})

test('existing sortable headers keep their legacy click behavior unless explicitly opted in', () => {
  const sort = jest.fn()
  render(<table><thead><tr><SortableColumnHeader label="Legacy name" sortKey="name" currentSort={null} onSort={sort} /></tr></thead></table>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Legacy name'))
  expect(sort).toHaveBeenCalledTimes(1)
  expect(sort).toHaveBeenCalledWith('name')
})

test('existing pagination remains enabled by default and the new disabled option is opt-in', () => {
  const page = jest.fn()
  const value = { page: 0, pageSize: 1, totalCount: 2, onPageChange: page, entityLabel: 'records' }
  const { rerender } = render(<TablePagination {...value} />)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(page).toHaveBeenCalledWith(1)
  rerender(<TablePagination {...value} disabled />)
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})
