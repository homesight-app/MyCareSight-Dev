/**
 * Historical entry point for the centralized PostgreSQL query layer.
 * The directory name is retained temporarily to avoid a broad import-only
 * change; these modules use the server-only Neon connection from `src/db`.
 */
export * from './query/index'
