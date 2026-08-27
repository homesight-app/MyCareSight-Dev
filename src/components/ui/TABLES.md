# Standard Table Pattern

Reference for building new data tables. Follow this pattern exactly so all tables behave and look the same.

---

## Required building blocks

| What | Import from |
|------|-------------|
| `useTableState` | `@/hooks/useTableState` |
| `RecordActionsMenu` | `@/components/ui/RecordActionsMenu` |
| `SortableColumnHeader` | `@/components/ui/SortableColumnHeader` |
| `TablePagination` | `@/components/ui/TablePagination` |

---

## Hook setup

```ts
const {
  search, setSearch,
  sort, setSort,
  page, setPage,
  pageSize, resetPage,
  applySortedData, applyPageSlice,
} = useTableState({ defaultSort: { key: 'name', dir: 'asc' } })
```

Apply filters, then sort, then paginate:

```ts
const filtered = useMemo(() => {
  let result = rows
  // ...filter logic...
  return applySortedData(result, sortFn)
}, [rows, ..., applySortedData, sortFn])

const { slice: pageRows, totalCount } = applyPageSlice(filtered)
```

Render `pageRows` in the table body. Call `resetPage()` whenever any filter changes.

---

## Toolbar

Left side — Active/Inactive toggle (if the table has status):

```tsx
<div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
  <button
    type="button"
    onClick={() => { setStatusTab('active'); resetPage() }}
    aria-pressed={statusTab === 'active'}
    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
      statusTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`}
  >Active</button>
  <button
    type="button"
    onClick={() => { setStatusTab('inactive'); resetPage() }}
    aria-pressed={statusTab === 'inactive'}
    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
      statusTab === 'inactive' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`}
  >Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}</button>
</div>
```

Right side — Refresh + primary action:

```tsx
<button
  type="button"
  onClick={fetchData}
  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
>
  <RefreshCw className="w-3.5 h-3.5" />
  Refresh
</button>

<button
  type="button"
  onClick={() => setAddOpen(true)}
  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
>
  <UserPlus className="w-4 h-4" />
  Add [Entity]
</button>
```

---

## Table structure

```tsx
<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
  {pageRows.length === 0 ? (
    <p className="px-5 py-8 text-center text-sm text-gray-400 italic">
      {rows.length === 0 ? 'No records yet.' : 'No records match the current filters.'}
    </p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <th className="w-10 px-2 py-2.5" />   {/* ⋮ column — always first, always empty header */}
            <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
            {/* ...other headers... */}
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {pageRows.map(row => {
            const isInactive = row.status !== 'active'
            return (
              <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                {/* RULE: opacity NEVER goes on <tr> — it bleeds into the fixed dropdown */}
                <td className="w-10 px-2 py-3">           {/* NO opacity — actions must stay crisp */}
                  <RecordActionsMenu ... />
                </td>
                <td className={`px-4 py-3 ${isInactive ? 'opacity-60' : ''}`}>
                  {/* primary data */}
                </td>
                {/* ...other data cells with same opacity pattern... */}
                <td className="px-4 py-3">                {/* NO opacity — status badge communicates state */}
                  <StatusBadge ... />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )}
</div>
```

### Opacity rules

| Cell | Apply `opacity-60` when inactive? |
|------|----------------------------------|
| ⋮ actions cell (first) | **No** — dropdown must stay fully visible |
| Data cells (name, role, phone, etc.) | **Yes** |
| Status badge cell (last) | **No** — badge color already communicates state |

---

## RecordActionsMenu — action coloring

```tsx
<RecordActionsMenu
  label={`Actions for ${row.name}`}
  actions={[
    { label: 'Edit', onClick: () => setEditRow(row) },
    {
      label: row.status === 'active' ? 'Deactivate' : 'Activate',
      onClick: () => handleToggle(row),
      destructive: row.status === 'active',   // red — destructive/irreversible action
      positive: row.status !== 'active',      // green — constructive/enabling action
    },
  ]}
/>
```

| Prop | Style | When to use |
|------|-------|-------------|
| _(neither)_ | Gray text | Default — neutral action (Edit, View, Export) |
| `destructive: true` | Red text, red hover | Delete, Deactivate, Archive, Remove |
| `positive: true` | Green text, green hover | Activate, Enable, Approve, Restore |
| `hidden: true` | Not rendered | Condition-based visibility |

Destructive actions are automatically separated from normal actions by a divider at the bottom of the menu.

---

## Pagination footer

```tsx
{totalCount > pageSize && (
  <TablePagination
    page={page}
    pageSize={pageSize}
    totalCount={totalCount}
    onPageChange={setPage}
    entityLabel="records"   // e.g. "caregivers", "clients", "people"
  />
)}
```

Place this **outside and below** the table container div, not inside it.

---

## Status filter logic

```ts
// Active = no credential/status field OR explicitly active
// Inactive = has a status field AND it is not active
if (statusTab === 'active') {
  result = result.filter(r => !r.status || r.status === 'active')
} else {
  result = result.filter(r => !!r.status && r.status !== 'active')
}
```

Inactive count badge (computed from unfiltered `rows`, not `filtered`):

```ts
const inactiveCount = useMemo(
  () => rows.filter(r => !!r.status && r.status !== 'active').length,
  [rows]
)
```
