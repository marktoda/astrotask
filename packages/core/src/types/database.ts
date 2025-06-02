/**
 * Shared database types
 */

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
