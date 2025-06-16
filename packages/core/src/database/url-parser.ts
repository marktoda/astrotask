/**
 * Database URL parsing with standard URL API and essential cases
 */

import { DatabaseUrlError } from './errors.js';

export type DbUrl =
  | { kind: 'postgres'; url: URL }
  | { kind: 'pglite-file'; file: string } // ./data/app.db
  | { kind: 'pglite-mem'; label: string } // memory://foo
  | { kind: 'pglite-idb'; label: string } // idb://bar
  | { kind: 'sqlite-file'; file: string }; // sqlite://./data/app.sqlite or ./data/app.sqlite

/**
 * Protocol patterns for database types
 */
const PROTOCOL_MAP = {
  'postgresql:': 'postgres',
  'postgres:': 'postgres',
  'pg:': 'postgres',
  'sqlite:': 'sqlite',
  'memory:': 'memory',
  'idb:': 'idb',
} as const;

/**
 * File extension pattern for SQLite databases
 */
const SQLITE_FILE_PATTERN = /\.(sqlite|sqlite3|db)$/;

/**
 * Parse a database connection string into a typed representation
 */
export function parseDbUrl(raw: string): DbUrl {
  if (!raw) {
    throw new DatabaseUrlError('Database URL cannot be empty', raw);
  }

  // Try parsing as a proper URL first
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(raw);
  } catch {
    // Not a valid URL, handle as file path below
  }

  if (parsedUrl) {
    return parseUrlByProtocol(parsedUrl);
  }

  // Handle file paths without protocol
  if (SQLITE_FILE_PATTERN.test(raw)) {
    return { kind: 'sqlite-file', file: raw };
  }

  // Default to PGLite file for any other string
  return { kind: 'pglite-file', file: raw };
}

/**
 * Parse URL based on protocol
 */
function parseUrlByProtocol(url: URL): DbUrl {
  const protocol = url.protocol;
  const protocolType = PROTOCOL_MAP[protocol as keyof typeof PROTOCOL_MAP];

  switch (protocolType) {
    case 'postgres':
      return { kind: 'postgres', url };

    case 'sqlite':
      return parseSqliteUrl(url);

    case 'memory':
      return parseMemoryUrl(url);

    case 'idb':
      return parseIdbUrl(url);

    default:
      throw new DatabaseUrlError(`Unsupported database URL protocol: ${protocol}`, url.toString());
  }
}

/**
 * Parse SQLite URL
 */
function parseSqliteUrl(url: URL): DbUrl {
  const filePath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

  if (!filePath) {
    throw new DatabaseUrlError(
      'SQLite URL must specify a file path: sqlite://path/to/file.db',
      url.toString()
    );
  }

  return { kind: 'sqlite-file', file: filePath };
}

/**
 * Parse PGLite memory URL
 */
function parseMemoryUrl(url: URL): DbUrl {
  // Extract label from hostname or pathname
  const label = url.hostname || (url.pathname ? url.pathname.replace(/^\/+/, '') : '') || 'default';
  return { kind: 'pglite-mem', label };
}

/**
 * Parse PGLite IndexedDB URL
 */
function parseIdbUrl(url: URL): DbUrl {
  // Extract label from hostname or pathname
  const label = url.hostname || (url.pathname ? url.pathname.replace(/^\/+/, '') : '') || 'default';
  return { kind: 'pglite-idb', label };
}

/**
 * Check if a database URL represents a file-based database
 */
export function isFileBasedUrl(parsed: DbUrl): boolean {
  return parsed.kind !== 'postgres';
}

/**
 * Check if a database URL represents a server-based database
 */
export function isServerBased(parsed: DbUrl): boolean {
  return parsed.kind === 'postgres';
}

/**
 * Type guard to ensure exhaustive handling of DbUrl variants
 */
export function assertExhaustiveDbUrl(value: never): never {
  throw new DatabaseUrlError(`Unhandled DbUrl variant: ${JSON.stringify(value)}`);
}
