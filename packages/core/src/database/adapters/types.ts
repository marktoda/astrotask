/**
 * Shared types and interfaces for database adapters
 */

/**
 * Database capabilities that vary between backends
 */
export interface DbCapabilities {
  concurrentWrites: boolean;
  listenNotify: boolean;
  extensions: Set<string>;
}

/**
 * Common Drizzle database operations interface
 * Captures the methods we actually use without complex type unions
 */
export interface DrizzleOperations {
  select(fields?: any): any;
  insert(table: any): any;
  update(table: any): any;
  delete(table: any): any;
  $with(name: string): any;
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

/**
 * Common interface for database backends
 */
export interface DatabaseBackend {
  /** Drizzle ORM instance with common operations */
  readonly drizzle: DrizzleOperations;

  /** Raw client for escape hatch operations */
  readonly rawClient: unknown;

  /** Backend capabilities */
  readonly capabilities: DbCapabilities;

  /** Backend type for logging/debugging */
  readonly type: 'pglite' | 'postgres' | 'sqlite';

  /** PGLite-compatible client interface for backward compatibility */
  readonly client: DatabaseClient;

  /** Initialize the backend connection */
  init(): Promise<void>;

  /** Run database migrations */
  migrate(migrationsDir: string): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;
}

/**
 * SQL query parameters - can be various primitive types
 */
export type SqlParam = string | number | boolean | null | Date | Buffer;

/**
 * Result row from SQL query - record with unknown values
 */
export type SqlRow = Record<string, unknown>;

/**
 * Database client interface for SQL operations
 */
export interface DatabaseClient {
  query: (sql: string, params?: SqlParam[]) => Promise<{ rows: SqlRow[] }>;
  close: () => Promise<void>;
  dataDir?: string;
}

/**
 * Helper functions for database backend characteristics
 */

/**
 * Check if a backend is file-based (needs locking for migrations)
 */
export function isFileBased(backend: DatabaseBackend): boolean {
  return !backend.capabilities.concurrentWrites;
}

/**
 * Check if a backend supports server-style concurrent operations
 */
export function isServerBased(backend: DatabaseBackend): boolean {
  return backend.capabilities.concurrentWrites;
}

/**
 * Check if a backend needs external locking for safe concurrent access
 */
export function needsExternalLocking(backend: DatabaseBackend): boolean {
  return isFileBased(backend);
} 