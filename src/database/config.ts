import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';

// Database configuration constants
export const DATABASE_CONFIG = {
  // Default database location in user's home directory
  DEFAULT_DB_DIR: join(homedir(), '.astrolabe'),
  DEFAULT_DB_NAME: 'astrolabe.db',
  
  // SQLCipher encryption settings
  CIPHER_SETTINGS: {
    // Use AES-256 encryption (SQLCipher 4.x default)
    cipher: 'aes-256-cbc',
    // Key derivation iterations (higher = more secure but slower)
    kdfIter: 4000,
    // Page size optimization for encrypted databases
    pageSize: 4096,
  },
  
  // Database connection options
  CONNECTION_OPTIONS: {
    // Enable Write-Ahead Logging for better concurrency
    verbose: undefined as ((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined,
    fileMustExist: false,
    timeout: 5000,
    readonly: false,
  },
  
  // Performance pragmas for SQLite
  PRAGMAS: {
    // Enable foreign key constraints
    foreign_keys: 'ON',
    // Use WAL mode for better concurrency
    journal_mode: 'WAL',
    // Synchronous mode for data safety vs performance balance
    synchronous: 'NORMAL',
    // Cache size (negative value = KB, positive = pages)
    cache_size: -2000, // 2MB cache
    // Memory-mapped I/O size
    mmap_size: 268435456, // 256MB
    // Optimize for SSD storage
    optimize: true,
  },
} as const;

// Database connection interface
export interface DatabaseConnection {
  db: Database.Database;
  drizzle: BetterSQLite3Database;
  close: () => void;
  isEncrypted: boolean;
}

// Error types for database operations
export class DatabaseError extends Error {
  constructor(message: string, public cause?: Error) {
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
  // For now, use environment variable or generate a simple key
  // TODO: Implement proper key management (keychain integration, user-provided key, etc.)
  const envKey = process.env.ASTROLABE_DB_KEY;
  if (envKey) {
    return envKey;
  }
  
  // Fallback: generate a simple key (not secure for production)
  // This should be replaced with proper key management
  console.warn('No encryption key provided via ASTROLABE_DB_KEY environment variable');
  console.warn('Using default key - NOT SECURE for production use');
  return 'astrolabe-default-key-change-in-production';
}

/**
 * Initialize SQLite database with optional encryption
 */
export function initializeDatabase(options: {
  dbPath?: string;
  encrypted?: boolean;
  verbose?: boolean;
} = {}): DatabaseConnection {
  const {
    dbPath = join(DATABASE_CONFIG.DEFAULT_DB_DIR, DATABASE_CONFIG.DEFAULT_DB_NAME),
    encrypted = true,
    verbose = false,
  } = options;

  try {
    // Ensure database directory exists
    const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Create database connection
    const connectionOptions = {
      ...DATABASE_CONFIG.CONNECTION_OPTIONS,
      verbose: verbose ? console.log : undefined,
    };

    const db = new Database(dbPath, connectionOptions);

    // Configure encryption if requested
    if (encrypted) {
      try {
        const encryptionKey = getEncryptionKey();
        // Set encryption key using SQLCipher PRAGMA
        db.pragma(`key = '${encryptionKey}'`);
        
        // Configure SQLCipher settings
        db.pragma(`cipher = '${DATABASE_CONFIG.CIPHER_SETTINGS.cipher}'`);
        db.pragma(`kdf_iter = ${DATABASE_CONFIG.CIPHER_SETTINGS.kdfIter}`);
        
        // Test encryption by attempting to read from database
        // This will fail if the key is wrong or encryption is not working
        db.pragma('user_version');
        
        console.log('Database encryption initialized successfully');
      } catch (error) {
        db.close();
        throw new EncryptionError(
          'Failed to initialize database encryption',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    // Apply performance pragmas
    Object.entries(DATABASE_CONFIG.PRAGMAS).forEach(([key, value]) => {
      db.pragma(`${key} = ${value}`);
    });

    // Initialize Drizzle ORM
    const drizzleDb = drizzle(db);

    // Create connection object
    const connection: DatabaseConnection = {
      db,
      drizzle: drizzleDb,
      close: () => {
        try {
          db.close();
        } catch (error) {
          console.warn('Error closing database connection:', error);
        }
      },
      isEncrypted: encrypted,
    };

    // Verify database is working
    try {
      db.prepare('SELECT 1').get();
      console.log(`Database initialized successfully at: ${dbPath}`);
      console.log(`Encryption: ${encrypted ? 'enabled' : 'disabled'}`);
    } catch (error) {
      connection.close();
      throw new DatabaseError(
        'Database verification failed',
        error instanceof Error ? error : new Error(String(error))
      );
    }

    return connection;

  } catch (error) {
    if (error instanceof DatabaseError || error instanceof EncryptionError) {
      throw error;
    }
    throw new DatabaseError(
      `Failed to initialize database at ${dbPath}`,
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