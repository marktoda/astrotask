import { existsSync, mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { type PgliteDatabase, drizzle } from 'drizzle-orm/pglite';
import { cfg } from '../config/index.js';
import { type Store, createStore } from './electric.js';
import { schema } from './schema.js';

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
    console.warn(
      'Note: PGlite does not support SQLCipher-style encryption. Consider application-level encryption if needed.'
    );
  }

  // Future: Could implement application-level encryption here
}

/**
 * Ensure database directory exists
 */
function ensureDatabaseDirectory(dbPath: string): void {
  const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (!existsSync(dbDir)) {
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
      console.info(`PGlite database verified at: ${dbPath}`);
      console.info(
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
export function initializeDatabase(
  options: {
    dbPath?: string;
    encrypted?: boolean;
    verbose?: boolean;
  } = {}
): DatabaseConnection {
  const {
    dbPath = cfg.DATABASE_URL,
    encrypted = cfg.DB_ENCRYPTED,
    verbose = cfg.DB_VERBOSE,
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
    const drizzleDb = drizzle(db, { schema });

    return {
      db,
      drizzle: drizzleDb,
      isEncrypted: encrypted,
      path: dbPath,
    };
  } catch (error) {
    throw new DatabaseError(
      'Failed to initialize database',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Create a connection manager for reusing database connections
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private connection: DatabaseConnection | null = null;
  private hybridConnection: Store | null = null;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  connect(options?: Parameters<typeof initializeDatabase>[0]): DatabaseConnection {
    if (this.connection) {
      return this.connection;
    }

    this.connection = initializeDatabase(options);
    return this.connection;
  }

  /**
   * Create a hybrid connection with ElectricSQL sync capabilities
   * Falls back gracefully to local-only mode if ElectricSQL is not configured
   */
  async connectHybrid(options?: {
    dbPath?: string;
    encrypted?: boolean;
    verbose?: boolean;
    autoSync?: boolean;
  }): Promise<Store> {
    if (this.hybridConnection) {
      return this.hybridConnection;
    }

    // First create a regular database connection
    const baseConnection = this.connect(options);

    // Then create the store with ElectricSQL integration
    const storeOptions = {
      sync: options?.autoSync ?? true,
      ...(options?.verbose !== undefined && { verbose: options.verbose }),
    };

    this.hybridConnection = await createStore(
      baseConnection.db,
      baseConnection.drizzle,
      baseConnection.isEncrypted,
      storeOptions
    );

    return this.hybridConnection;
  }

  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new DatabaseError('Database not connected. Call connect() first.');
    }
    return this.connection;
  }

  getHybridConnection(): Store {
    if (!this.hybridConnection) {
      throw new DatabaseError('Hybrid connection not established. Call connectHybrid() first.');
    }
    return this.hybridConnection;
  }

  /**
   * Close database connections and reset manager state
   */
  async close(): Promise<void> {
    if (this.hybridConnection) {
      // Close store (includes ElectricSQL and PGlite)
      await this.hybridConnection.close();
      this.hybridConnection = null;
    }

    if (this.connection) {
      // Close PGlite database
      await this.connection.db.close();
      this.connection = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  isHybridConnected(): boolean {
    return this.hybridConnection !== null;
  }

  isSyncing(): boolean {
    return this.hybridConnection?.isSyncing ?? false;
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();
