/**
 * Database adapter registry for clean factory pattern
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createModuleLogger } from '../../utils/logger.js';
import { DatabaseAdapterError } from '../errors.js';
import type { DbUrl } from '../url-parser.js';
import { PgLiteAdapter } from './pglite.js';
import { PostgresAdapter } from './postgres.js';
import { SqliteAdapter } from './sqlite.js';
import type { DatabaseBackend } from './types.js';

const logger = createModuleLogger('AdapterRegistry');

/**
 * Options for adapter creation
 */
export interface AdapterOptions {
  debug: boolean;
}

/**
 * Adapter factory function type - creates backend instances
 */
export type AdapterFactory = (url: DbUrl, options: AdapterOptions) => DatabaseBackend;

/**
 * Helper functions for common adapter setup tasks
 */
export const AdapterHelpers = {
  /**
   * Ensure data directory exists for file-based databases
   */
  ensureDataDir(file: string): void {
    try {
      const dir = dirname(file);
      mkdirSync(dir, { recursive: true });
      logger.debug(`Ensured directory exists: ${dir}`);
    } catch (error) {
      logger.warn({ error, file }, 'Failed to create data directory');
    }
  },

  /**
   * Get the appropriate lock path for a database URL
   */
  getLockPath(parsed: DbUrl): string {
    switch (parsed.kind) {
      case 'pglite-file':
      case 'sqlite-file':
        return parsed.file;
      case 'pglite-mem':
      case 'pglite-idb':
        return `memory://${parsed.label}`;
      case 'postgres':
        return 'memory://postgres-no-lock';
    }
  },
};

/**
 * Registry of database adapters
 */
const ADAPTER_REGISTRY: Record<DbUrl['kind'], AdapterFactory> = {
  postgres: (url, options) => {
    if (url.kind !== 'postgres') throw new DatabaseAdapterError('Invalid URL for PostgreSQL adapter', 'postgres', url.kind);
    return new PostgresAdapter(url.url, options.debug);
  },

  'pglite-file': (url, options) => {
    if (url.kind !== 'pglite-file') throw new DatabaseAdapterError('Invalid URL for PGLite file adapter', 'pglite', url.kind);
    AdapterHelpers.ensureDataDir(url.file);
    return new PgLiteAdapter({
      dataDir: url.file,
      debug: options.debug,
    });
  },

  'pglite-mem': (url, options) => {
    if (url.kind !== 'pglite-mem') throw new DatabaseAdapterError('Invalid URL for PGLite memory adapter', 'pglite', url.kind);
    return new PgLiteAdapter({
      dataDir: `memory://${url.label}`,
      debug: options.debug,
    });
  },

  'pglite-idb': (url, options) => {
    if (url.kind !== 'pglite-idb') throw new DatabaseAdapterError('Invalid URL for PGLite IndexedDB adapter', 'pglite', url.kind);
    return new PgLiteAdapter({
      dataDir: `idb://${url.label}`,
      debug: options.debug,
    });
  },

  'sqlite-file': (url, options) => {
    if (url.kind !== 'sqlite-file') throw new DatabaseAdapterError('Invalid URL for SQLite adapter', 'sqlite', url.kind);
    AdapterHelpers.ensureDataDir(url.file);
    return new SqliteAdapter({
      dataDir: url.file,
      debug: options.debug,
    });
  },
};

/**
 * Create a database adapter from a parsed URL
 * Replaces the switch-case factory pattern with a registry lookup
 */
export function createAdapter(parsed: DbUrl, options: AdapterOptions): DatabaseBackend {
  const factory = ADAPTER_REGISTRY[parsed.kind];
  if (!factory) {
    throw new DatabaseAdapterError(
      `No adapter registered for database type: ${parsed.kind}`,
      'registry',
      parsed.kind,
      { availableTypes: getAvailableAdapterTypes() }
    );
  }

  logger.debug({ kind: parsed.kind, options }, 'Creating database adapter');
  return factory(parsed, options);
}

/**
 * Get available adapter types
 */
export function getAvailableAdapterTypes(): DbUrl['kind'][] {
  return Object.keys(ADAPTER_REGISTRY) as DbUrl['kind'][];
}

/**
 * Check if an adapter is available for a given URL type
 */
export function hasAdapter(kind: DbUrl['kind']): boolean {
  return kind in ADAPTER_REGISTRY;
}
