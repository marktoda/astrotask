/**
 * Shared types and interfaces for database adapters
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Database capabilities that vary between backends
 * These are primarily informational and used for debugging/monitoring
 */
export interface DbCapabilities {
  /** Whether the backend supports concurrent writes (server-based vs file-based) */
  concurrentWrites: boolean;
  /** Whether the backend supports PostgreSQL-style LISTEN/NOTIFY */
  listenNotify: boolean;
  /** Available database extensions */
  extensions: Set<string>;
}

/**
 * Drizzle operations we rely on across dialects.
 * We keep the signatures loose here because each dialect has its own overloads.
 * Concrete dialect types (PostgresJsDatabase, PgliteDatabase, BetterSQLite3Database)
 * will be compatible with this structure while still providing their richer types
 * when a generic parameter is concrete.
 *
 * Note: We use 'any' here because Drizzle's query builders have complex type signatures
 * that vary between dialects. This is a necessary compromise for cross-dialect compatibility.
 */
export interface DrizzleOps {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle types require any for cross-dialect compatibility
  select: (...args: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle types require any for cross-dialect compatibility
  insert: (...args: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle types require any for cross-dialect compatibility
  update: (...args: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle types require any for cross-dialect compatibility
  delete: (...args: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: Transaction support across all dialects
  transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
}

/**
 * Type-safe schema type for Drizzle databases
 */
export type DrizzleSchema = Record<string, unknown>;

/**
 * Type aliases for the actual Drizzle database types used by each adapter
 * These use proper schema generics for better type safety
 */
export type PostgresDrizzle<TSchema extends DrizzleSchema = DrizzleSchema> =
  PostgresJsDatabase<TSchema>;

export type PgliteDrizzle<TSchema extends DrizzleSchema = DrizzleSchema> = PgliteDatabase<TSchema>;

export type SqliteDrizzle<TSchema extends DrizzleSchema = DrizzleSchema> =
  BetterSQLite3Database<TSchema>;

/**
 * SQL query parameters - can be various primitive types
 */
export type SqlParam = string | number | boolean | null | Date | Buffer;

/**
 * Result row from SQL query - record with unknown values
 */
export type SqlRow<T = Record<string, unknown>> = T;

/**
 * Query result with properly typed rows
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: SqlRow<T>[];
}

/**
 * Common interface for database backends.
 * Generic parameter preserves the exact Drizzle type for callers while ensuring
 * we expose at least the shared DrizzleOps surface.
 */
export interface DatabaseBackend<TDrizzle extends DrizzleOps = DrizzleOps> {
  /** Native Drizzle ORM instance. When TDrizzle is concrete (e.g. PostgresJsDatabase) callers
   * get full dialect-specific typing.
   */
  readonly drizzle: TDrizzle;

  /** Raw client for escape hatch operations */
  readonly rawClient: unknown;

  /** Backend capabilities for informational purposes */
  readonly capabilities: DbCapabilities;

  /** Backend type for logging/debugging */
  readonly type: 'pglite' | 'postgres' | 'sqlite';

  /** Initialize the backend connection */
  init(): Promise<void>;

  /** Run database migrations */
  migrate(migrationsDir: string): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;
}

/**
 * SDK-friendly alias for DatabaseBackend interface
 * Provides a clean interface name for the Astrotask SDK
 */
export type IDatabaseAdapter<TDrizzle extends DrizzleOps = DrizzleOps> = DatabaseBackend<TDrizzle>;
