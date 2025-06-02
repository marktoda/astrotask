/**
 * Database URL parsing with proper type discrimination
 */

export type DbUrl =
  | { kind: 'postgres'; url: URL }
  | { kind: 'pglite-file'; file: string } // ./data/app.db
  | { kind: 'pglite-mem'; label: string } // memory://foo
  | { kind: 'pglite-idb'; label: string }; // idb://bar

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

  // Default to PGLite file
  return { kind: 'pglite-file', file: raw };
}
