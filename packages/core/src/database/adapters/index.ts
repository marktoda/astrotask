/**
 * Database adapters and types
 */

export type {
  DatabaseBackend,
  DbCapabilities,
  DrizzleOps,
  IDatabaseAdapter,
  PostgresDrizzle,
  PgliteDrizzle,
  QueryResult,
  SqliteDrizzle,
  SqlParam,
  SqlRow,
} from './types.js';

// Removed unused capability helper functions

export { PostgresAdapter } from './postgres.js';
export { PgLiteAdapter } from './pglite.js';
export { SqliteAdapter } from './sqlite.js';
export { createAdapter, getAvailableAdapterTypes, hasAdapter, AdapterHelpers } from './registry.js';
export type { AdapterOptions, AdapterFactory } from './registry.js';
