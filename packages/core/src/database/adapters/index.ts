/**
 * Database adapters exports
 * 
 * Provides a clean interface for importing all database adapters and types.
 */

// Export all types
export type { DatabaseBackend, DbCapabilities, DatabaseClient, SqlParam, SqlRow } from './types.js';

// Export helper functions
export { isFileBased, isServerBased, needsExternalLocking } from './types.js';

// Export all adapters
export { PostgresAdapter } from './postgres.js';
export { PgLiteAdapter } from './pglite.js';
export { SqliteAdapter } from './sqlite.js'; 