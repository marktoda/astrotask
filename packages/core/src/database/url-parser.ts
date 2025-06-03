/**
 * Database URL parsing with proper type discrimination
 */

export type DbUrl =
  | { kind: 'postgres'; url: URL }
  | { kind: 'pglite-file'; file: string } // ./data/app.db
  | { kind: 'pglite-mem'; label: string } // memory://foo
  | { kind: 'pglite-idb'; label: string } // idb://bar
  | { kind: 'sqlite-file'; file: string }; // sqlite://./data/app.sqlite or ./data/app.sqlite

/**
 * URL parsing patterns for each database type
 */
const URL_PATTERNS = {
  postgres: /^(postgresql|postgres|pg):/,
  sqlite: /^sqlite:/,
  memory: /^memory:/,
  idb: /^idb:/,
  sqliteFile: /\.(sqlite|sqlite3|db)$/,
} as const;

/**
 * Parse PostgreSQL URL
 */
function parsePostgresUrl(parsedUrl: URL): DbUrl {
  return { kind: 'postgres', url: parsedUrl };
}

/**
 * Parse SQLite URL
 */
function parseSqliteUrl(parsedUrl: URL): DbUrl {
  const filePath = parsedUrl.pathname.startsWith('/')
    ? parsedUrl.pathname.slice(1)
    : parsedUrl.pathname;
  if (!filePath) {
    throw new Error('SQLite URL must specify a file path: sqlite://path/to/file.db');
  }
  return { kind: 'sqlite-file', file: filePath };
}

/**
 * Parse PGLite memory URL
 */
function parseMemoryUrl(parsedUrl: URL): DbUrl {
  // Label can be in hostname (memory://label) or pathname (memory:///label or memory://host/label)
  const label =
    parsedUrl.hostname ||
    (parsedUrl.pathname ? parsedUrl.pathname.replace(/^\/+/, '') : '') ||
    'default';
  return { kind: 'pglite-mem', label };
}

/**
 * Parse PGLite IndexedDB URL
 */
function parseIdbUrl(parsedUrl: URL): DbUrl {
  // Label can be in hostname (idb://label) or pathname (idb:///label or idb://host/label)
  const label =
    parsedUrl.hostname ||
    (parsedUrl.pathname ? parsedUrl.pathname.replace(/^\/+/, '') : '') ||
    'default';
  return { kind: 'pglite-idb', label };
}

/**
 * Handle URL protocol parsing
 */
function parseUrlByProtocol(parsedUrl: URL): DbUrl {
  const protocol = parsedUrl.protocol;

  if (URL_PATTERNS.postgres.test(protocol)) {
    return parsePostgresUrl(parsedUrl);
  }

  if (URL_PATTERNS.sqlite.test(protocol)) {
    return parseSqliteUrl(parsedUrl);
  }

  if (URL_PATTERNS.memory.test(protocol)) {
    return parseMemoryUrl(parsedUrl);
  }

  if (URL_PATTERNS.idb.test(protocol)) {
    return parseIdbUrl(parsedUrl);
  }

  throw new Error(`Unsupported database URL protocol: ${protocol}`);
}

/**
 * Parse a database connection string into a typed representation
 * Uses exhaustive pattern matching instead of heuristics
 */
export function parseDbUrl(raw: string): DbUrl {
  if (!raw) {
    throw new Error('Database URL cannot be empty');
  }

  // Try to parse as URL first
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(raw);
  } catch {
    // Not a valid URL, will handle as file path below
  }

  // Handle URL protocols
  if (parsedUrl) {
    return parseUrlByProtocol(parsedUrl);
  }

  // Handle file paths
  if (URL_PATTERNS.sqliteFile.test(raw)) {
    return { kind: 'sqlite-file', file: raw };
  }

  // Default to PGLite file for any other string
  return { kind: 'pglite-file', file: raw };
}

/**
 * Check if a database URL represents a file-based database that typically needs locking
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
  throw new Error(`Unhandled DbUrl variant: ${JSON.stringify(value)}`);
}
