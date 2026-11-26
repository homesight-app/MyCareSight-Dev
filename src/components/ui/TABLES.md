# Standard Table Pattern

Use the shared `DataTable` for new standard record tables. Existing tables do not need a bulk rewrite; the legacy building-block recipe below remains for their maintenance and specialized exceptions.

## Shared DataTable: first approved adoption

The initial November 25 user-approved batch adds `src/components/ui/DataTable.tsx` for Branches, shared by the agency and admin portals. The separately approved Clients adoption is documented below. Inventory first confirmed that no generic shell existed: `LicenseTypesTable` owns license-specific workflows, `TemplateEditor`'s table toolbar edits rich-text tables, and `useTableState`/the existing UI controls are building blocks. No new library is required.

`DataTable` composes the existing `PrimaryButton`, `SearchInput`, `FilterSelect`, `SortableColumnHeader`, `RecordActionsMenu` and `TablePagination`. Do not rebuild the toolbar, table body, loading/empty/error states, row interaction handling or pagination for another standard table.

| Configuration | Responsibility |
|---|---|
| `rows`, `columns`, `getRowKey`, `getRowLabel` | Caller supplies the authorized current page, stable keys and feature-owned cell rendering. Never use array position as record identity. |
| `pagination` (required) | Zero-based page, positive page size, complete filtered total and page-change callback. The existing pager is built in, outside the table container. |
| `search`, `filters`, `sort` | Optional controlled values and callbacks. The component renders the controls and resets page to zero on a change. Filter definitions include their own options and any All choice. |
| `addAction`, `onRefresh` | Optional permitted actions in the shared toolbar. The feature owns creation, modals, requests and refresh invalidation. |
| `rowNavigation` | Optional record-opening callback and primary column key. The primary cell has a native keyboard-accessible button; clicking ordinary cells opens the same record. |
| `rowActions`, `isRowInactive` | Feature-supplied permitted actions and visual inactive state. Status columns can set `retainEmphasis`; action cells are never dimmed. Inactive styling does not authorize or deny access. |
| `loading`, `error`, `onRetry`, `disabled` | Standard feedback and interaction locks. Loading/error replaces stale rows; headers stay mounted. Retry uses the caller callback, defaulting to Refresh. |

The complete typed API is exported from [DataTable.tsx](./DataTable.tsx). See [AgencyBranchSettings.tsx](../AgencyBranchSettings.tsx) for the real bounded-query integration, including request deduplication, stale-response handling and cache invalidation.

### Data, performance and authorization contract

- `DataTable` never fetches, authorizes, filters, sorts or slices record collections itself. It renders the page the feature supplied. Search/filter/sort controls emit state changes; feature repositories retain the actual matching, sorting and pagination semantics.
- For server pages, pass the filtered server total, not `rows.length`. Never apply `applyPageSlice` or client sorting/filtering to an already fetched server page. `useTableState` remains useful for controlled interaction state; query on the resulting state changes rather than issuing separate requests from each callback. Its redundant page-zero state updates are batched, not extra fetches.
- Every actual deferred request must independently authorize tenant/record scope, validate query inputs, enforce limits and write required audits. Only expose permitted actions. The shared table is not an access boundary, generic CRUD endpoint or store for PHI/session data.
- Keep record/tab caches and request cancellation/deduplication in the owning feature. The shell adds no database request, browser storage, global row cache, logging or third-party integration.
- Branches retains a 25-row page plus one-row lookahead, server count, a 100-branch creation limit and its current-record cache. Only the visible page reaches the DOM. No 10x cloud benchmark is implied by generic synthetic fixtures.
- The primary navigation cell must render noninteractive text/badges. Put independent controls in other columns; native inputs, buttons and links do not open the row. Custom widgets can mark their container `data-table-no-row-click`. Portalled menus do not trigger row opening.
- Keep calendar, scheduling, EVV, clinical, document-editor and other specialized interactions in their feature components. Do not force them into this shell.

### Compatibility and current rollout

- `SortableColumnHeader` adds opt-in `buttonHeader` and `disabled` props. `DataTable` opts into keyboard buttons and `aria-sort`; existing callers keep their legacy markup/click behavior by default.
- `TablePagination` adds optional `disabled=false`. Existing callers retain their page sizes, labels, totals and behavior. The shared shell blocks paging during a request or feature mutation.
- Existing direct consumers were inventoried: `AdminProgramsContent`, `AgencyCaregiversTab`, `AgencyCertificationsContent`, `AgencyDocumentsTab`, `AgencyPeopleTab`, `LicenseTypesTable`, `PlaybookLibraryContent`, `StaffManagementClient`, `TemplatesContent`, and `UserManagementTabs`. They are not migrated in this batch.
- Adopt additional tables only in separately approved, independently checked batches. This batch changes no query, schema, authorization rule, density token, root font size or existing feature workflow.

## Legacy building-block recipe

### Approved Clients adoption (November 25)

`ClientsContent.tsx` now uses the existing shell without changing its public API. Active/Intake/Inactive/All remain feature-owned status controls above the table; the shared toolbar contains search, the branch filter, Refresh and the existing Add New Client workflow. With branches enabled, Branch replaces Representative #2 in the list only; both representative records and profile editing remain intact. Feature-off retains Representative #2 and makes no branch-options request.

The server route and patient query own the whitelisted column ordering, status/search/branch predicates and stable ID ties. They return at most 50 clients with the complete filtered total; the shell does not sort or paginate that page again. Filter/sort changes reset to page zero in one navigation; search waits 400 ms. Current query state survives paging and browser history, and All is explicitly encoded rather than falling back to Active. Successful creation/status changes refresh the authoritative page instead of prepending or removing rows independently of its sort/filter/counts. Mutation errors preserve the displayed record and show a non-content error.

`useAgencyBranchOptions` extracts the existing editor's authorized options loader for reuse by the table. It deduplicates a mounted surface's request (including Strict Mode), has explicit retry, and adds no polling, global identity cache or browser storage. It uses the existing 100-branch cap and does not block the initial client page. Existing tenant context, RLS, feature capability and mutation boundaries remain authoritative. Representative ordering uses the same display-order/ID tie-break for its sort expression and rendered array. Sorting a large filtered agency still requires database work across matching rows; offset paging, count queries and substring search retain their existing scale limits. Cloud latency and a 10x workload were not benchmarked; confirm index/query plans during UAT if needed.

The following documents existing direct usage; prefer the shared shell for new standard tables.

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
