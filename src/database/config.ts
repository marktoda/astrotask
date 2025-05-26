import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { cfg } from '../config/index.js';
import { schema } from './schema.js';

/**
 * Resolve tilde (~) in database paths to home directory
 */
function resolveDatabasePath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

// Database connection interface
export interface DatabaseConnection<TSchema extends Record<string, unknown> = typeof schema> {
  db: Database.Database;
  drizzle: BetterSQLite3Database<TSchema>;
  close: () => void;
  isEncrypted: boolean;
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
 * Generate or retrieve encryption key for SQLCipher
 * In production, this should be more sophisticated (e.g., key derivation from user input)
 */
function getEncryptionKey(): string {
  // Use configured encryption key
  const envKey = cfg.ASTROLABE_DB_KEY;
  if (envKey && envKey !== 'TEST') {
    return envKey;
  }

  // Fallback: generate a simple key based on system info
  // This is NOT secure for production use!
  const systemInfo = `${homedir()}-astrolabe-key`;
  return Buffer.from(systemInfo).toString('base64').slice(0, 32);
}

/**
 * Configure database encryption
 */
function configureEncryption(db: Database.Database, verbose: boolean): void {
  const encryptionKey = getEncryptionKey();

  // Set encryption key using SQLCipher PRAGMA
  db.pragma(`key = '${encryptionKey}'`);

  // Configure SQLCipher settings
  db.pragma(`cipher = '${cfg.DB_CIPHER}'`);
  db.pragma(`kdf_iter = ${cfg.DB_KDF_ITER}`);

  // Test encryption by attempting to read from database
  // This will fail if the key is wrong or encryption is not working
  db.pragma('user_version');

  if (verbose) {
    console.info('Database encryption initialized successfully');
  }
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
function createDatabaseConnection(dbPath: string, verbose: boolean): Database.Database {
  const connectionOptions = {
    verbose: verbose ? console.log : undefined,
    fileMustExist: false,
    timeout: cfg.DB_TIMEOUT,
    readonly: false,
  };

  return new Database(dbPath, connectionOptions);
}

/**
 * Apply performance pragmas to database
 */
function applyPerformancePragmas(db: Database.Database): void {
  const pragmas = {
    foreign_keys: 'ON',
    journal_mode: cfg.DB_JOURNAL_MODE,
    synchronous: cfg.DB_SYNCHRONOUS,
    cache_size: cfg.DB_CACHE_SIZE,
    mmap_size: cfg.DB_MMAP_SIZE,
    optimize: true,
  };

  for (const [key, value] of Object.entries(pragmas)) {
    db.pragma(`${key} = ${value}`);
  }
}

/**
 * Verify database is working
 */
function verifyDatabase(
  db: Database.Database,
  dbPath: string,
  encrypted: boolean,
  verbose: boolean
): void {
  try {
    db.prepare('SELECT 1').get();
    if (verbose) {
      console.info(`Database initialized successfully at: ${dbPath}`);
      console.info(`Encryption: ${encrypted ? 'enabled' : 'disabled'}`);
    }
  } catch (error) {
    throw new DatabaseError(
      'Database verification failed',
      error instanceof Error ? error : new Error(String(error))
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
  const defaultDbDir = resolveDatabasePath(cfg.DB_DEFAULT_DIR);
  const {
    dbPath = cfg.DATABASE_URL.startsWith('./') || cfg.DATABASE_URL.startsWith('/')
      ? cfg.DATABASE_URL
      : join(defaultDbDir, cfg.DB_DEFAULT_NAME),
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
    applyPerformancePragmas(db);

    // Verify the database is working
    verifyDatabase(db, dbPath, encrypted, verbose);

    // Initialize Drizzle ORM
    const drizzleDb = drizzle(db, { schema });

    return {
      db,
      drizzle: drizzleDb,
      close: () => db.close(),
      isEncrypted: encrypted,
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

  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new DatabaseError('Database not connected. Call connect() first.');
    }
    return this.connection;
  }

  disconnect(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();
