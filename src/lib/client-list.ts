/** Shared keys only; the repository owns their SQL ordering. */
export const CLIENT_LIST_SORT_KEYS = ['created_at', 'name', 'gender', 'class', 'phone', 'emergency_contact', 'representative_1', 'representative_2', 'branch_name', 'status'] as const
export type ClientListSortKey = typeof CLIENT_LIST_SORT_KEYS[number]
export type ClientListQuery = { page: number; q: string; status: string; branch: string; sortKey: ClientListSortKey; sortDir: 'asc' | 'desc' }
