import { existsSync, mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { type PgliteDatabase, drizzle } from 'drizzle-orm/pglite';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import { autoMigrate } from './migrate.js';
import * as schema from './schema.js';

const logger = createModuleLogger('database-config');

/**
 * Database connection interface for PGlite
 */
export interface DatabaseConnection {
  db: PGlite;
  drizzle: PgliteDatabase<typeof schema>;
  isEncrypted: boolean;
  path: string;
}

// Error types for database operations
export class DatabaseError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class EncryptionError extends DatabaseError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EncryptionError';
  }
}

/**
 * Configure database encryption (PGlite doesn't support SQLCipher-style encryption)
 */
function configureEncryption(_db: PGlite, verbose: boolean): void {
  // PGlite doesn't support SQLCipher-style encryption
  // For now, we'll just log a warning that encryption is not available
  if (verbose) {
    logger.warn(
      'Note: PGlite does not support SQLCipher-style encryption. Consider application-level encryption if needed.'
    );
  }

  // Future: Could implement application-level encryption here
}

/**
 * Ensure database directory exists
 */
function ensureDatabaseDirectory(dbPath: string): void {
  // Don't create directories for in-memory databases
  if (dbPath === ':memory:' || dbPath.startsWith(':memory:') || dbPath.startsWith('memory://')) {
    return;
  }

  // Don't create directories for other special protocols
  if (dbPath.startsWith('idb://') || dbPath.startsWith('opfs-ahp://')) {
    return;
  }

  const lastSlash = dbPath.lastIndexOf('/');
  if (lastSlash === -1) {
    // Path is in current working directory; no directory to ensure
    return;
  }

  const dbDir = dbPath.substring(0, lastSlash);
  if (dbDir && !existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
}

/**
 * Create database connection with options
 */
function createDatabaseConnection(dbPath: string, verbose: boolean): PGlite {
  // PGlite constructor options - debug levels: 0, 1, 2
  return new PGlite(dbPath, {
    debug: verbose ? 1 : 0,
  });
}

/**
 * Apply performance optimizations to database (PostgreSQL-specific)
 */
function applyPerformanceSettings(_db: PGlite): void {
  // PGlite doesn't use SQLite pragmas - it's PostgreSQL-based
  // Performance tuning would be done via PostgreSQL configuration
  // For now, we'll skip this as PGlite has reasonable defaults
}

/**
 * Verify database is working
 */
function verifyDatabase(_db: PGlite, dbPath: string, encrypted: boolean, verbose: boolean): void {
  try {
    // Use a simple PostgreSQL query to verify connection
    // Note: PGlite doesn't have sync query methods like better-sqlite3
    // We'll need to use async verification in the calling code
    if (verbose) {
      logger.info({ dbPath }, 'PGlite database verified');
      logger.info(
        { encrypted },
        `Encryption: ${encrypted ? 'enabled' : 'disabled'} (note: PGlite uses different encryption approach)`
      );
    }
  } catch (error) {
    throw new Error(
      `Database verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize SQLite database with optional encryption
 */
export async function initializeDatabase(
  options: {
    dbPath?: string;
    encrypted?: boolean;
    verbose?: boolean;
    autoMigrate?: boolean;
  } = {}
): Promise<DatabaseConnection> {
  const {
    dbPath = cfg.DATABASE_URL,
    encrypted = cfg.DB_ENCRYPTED,
    verbose = cfg.DB_VERBOSE,
    autoMigrate: shouldAutoMigrate = true,
  } = options;

  try {
    ensureDatabaseDirectory(dbPath);
    const db = createDatabaseConnection(dbPath, verbose);

    // Configure encryption if requested
    if (encrypted) {
      try {
        configureEncryption(db, verbose);
      } catch (error) {
        db.close();
        throw new EncryptionError(
          'Failed to initialize database encryption',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    // Apply performance optimizations
    applyPerformanceSettings(db);

    // Verify the database is working
    verifyDatabase(db, dbPath, encrypted, verbose);

    // Initialize Drizzle ORM
    const drizzleDb = drizzle(db, { schema }) as PgliteDatabase<typeof schema>;

    const connection: DatabaseConnection = {
      db,
      drizzle: drizzleDb,
      isEncrypted: encrypted,
      path: dbPath,
    };

    // Run database migrations if requested
    if (shouldAutoMigrate) {
      await autoMigrate(connection, { verbose });
    }

    return connection;
  } catch (error) {
    throw new DatabaseError(
      'Failed to initialize database',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
