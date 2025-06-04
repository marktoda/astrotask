/**
 * Database adapters exports
 *
 * Provides a clean interface for importing all database adapters and types.
 */

// Export all types
export type {
  DatabaseBackend,
  IDatabaseAdapter,
  DbCapabilities,
  DatabaseClient,
  SqlParam,
  SqlRow,
} from './types.js';

// Export helper functions
export { isFileBased, isServerBased, needsExternalLocking } from './types.js';

// Export all adapters
export { PostgresAdapter } from './postgres.js';
export { PgLiteAdapter } from './pglite.js';
export { SqliteAdapter } from './sqlite.js';

// Export registry pattern
export { createAdapter, getAvailableAdapterTypes, hasAdapter, AdapterHelpers } from './registry.js';
export type { AdapterOptions, AdapterFactory } from './registry.js';
