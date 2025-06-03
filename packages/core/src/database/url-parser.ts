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
 * Parse a database connection string into a typed representation
 */
export function parseDbUrl(raw: string): DbUrl {
  try {
    const u = new URL(raw);

    // PostgreSQL URLs
    if (u.protocol === 'postgresql:' || u.protocol === 'postgres:' || u.protocol === 'pg:') {
      return { kind: 'postgres', url: u };
    }

    // SQLite URLs
    if (u.protocol === 'sqlite:') {
      // Extract file path from sqlite://path/to/file.sqlite
      const filePath = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      return { kind: 'sqlite-file', file: filePath || raw.replace('sqlite://', '') };
    }

    // PGLite special URLs
    if (u.protocol === 'memory:') {
      return { kind: 'pglite-mem', label: u.pathname || 'default' };
    }

    if (u.protocol === 'idb:') {
      return { kind: 'pglite-idb', label: u.pathname || 'default' };
    }
  } catch {
    // Not a valid URL, treat as file path
  }

  // Check for SQLite file extensions
  if (raw.endsWith('.sqlite') || raw.endsWith('.sqlite3') || raw.endsWith('.db')) {
    return { kind: 'sqlite-file', file: raw };
  }

  // Default to PGLite file
  return { kind: 'pglite-file', file: raw };
}

/**
 * Check if a database URL represents a file-based database that typically needs locking
 * Renamed to match import in index.ts
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
