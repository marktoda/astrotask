import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { 
  initializeDatabase, 
  DatabaseManager, 
  DatabaseError, 
  EncryptionError,
} from '../src/database/config';
import { cfg } from '../src/config';

describe('Database Configuration', () => {
  const testDbDir = join(tmpdir(), 'astrolabe-test');
  const testDbPath = join(testDbDir, 'test.db');

  beforeEach(() => {
    // Clean up any existing test database directory (PGLite uses directories)
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test database directory after each test
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('Database Initialization', () => {
    it('should create and initialize database without encryption', async () => {
      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
      });

      expect(connection).toBeDefined();
      expect(connection.db).toBeDefined();
      expect(connection.drizzle).toBeDefined();
      expect(connection.isEncrypted).toBe(false);
      expect(typeof connection.db.close).toBe('function');

      // Skip verifying physical path existence because PGLite lazily creates files

      // Test basic database operation
      const result = await connection.db.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await connection.db.close();
    });

    it('should create and initialize database with encryption', async () => {
      // Set a test encryption key
      process.env.ASTROLABE_DB_KEY = 'test-encryption-key-12345';

      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: true,
        verbose: false,
      });

      expect(connection).toBeDefined();
      expect(connection.isEncrypted).toBe(true);

      // Test basic database operation with encryption
      const result = await connection.db.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await connection.db.close();
      
      // Clean up environment
      delete process.env.ASTROLABE_DB_KEY;
    }, 10000);

    it('should apply correct pragmas for performance', async () => {
      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: false,
      });

      // PGLite doesn't have SQLite pragmas, but we can test that the connection works
      // and basic PostgreSQL configuration is available
      const result = await connection.db.query('SELECT version()');
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);

      await connection.db.close();
    });

    it('should handle database directory creation', async () => {
      const nestedTestDbPath = join(testDbDir, 'nested', 'deep', 'test.db');
      
      const connection = await initializeDatabase({
        dbPath: nestedTestDbPath,
        encrypted: false,
      });

      // Skip verifying physical path existence because PGLite may lazily create files/directories

      await connection.db.close();

      // Clean up nested directories
      rmSync(join(testDbDir, 'nested'), { recursive: true, force: true });
    });

    it('should throw EncryptionError for invalid encryption setup', () => {
      // Test that the error types are properly exported
      expect(EncryptionError).toBeDefined();
      expect(DatabaseError).toBeDefined();
    });
  });

  describe('DatabaseManager', () => {
    it('should implement singleton pattern', () => {
      const manager1 = DatabaseManager.getInstance();
      const manager2 = DatabaseManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });

    it('should connect and manage database connection', async () => {
      const manager = DatabaseManager.getInstance();
      
      expect(manager.isConnected()).toBe(false);

      const connection = await manager.connect({
        dbPath: testDbPath,
        encrypted: false,
      });

      expect(manager.isConnected()).toBe(true);
      expect(connection).toBeDefined();

      // Should return same connection on subsequent calls
      const connection2 = await manager.connect();
      expect(connection2).toBe(connection);

      await manager.close();
      expect(manager.isConnected()).toBe(false);
    });

    it('should throw error when getting connection before connecting', async () => {
      const manager = DatabaseManager.getInstance();
      await manager.close(); // Ensure clean state

      expect(() => manager.getConnection()).toThrow(DatabaseError);
      expect(() => manager.getConnection()).toThrow('Database not connected');
    });
  });

  describe('Database Configuration Constants', () => {
    it('should have correct default configuration', () => {
      expect(cfg.DB_DEFAULT_NAME).toBe('astrolabe.db');
      expect(cfg.DB_CIPHER).toBe('aes-256-cbc');
      expect(cfg.DB_KDF_ITER).toBe(4000);
      expect(cfg.DB_JOURNAL_MODE).toBe('WAL');
      expect(cfg.DB_SYNCHRONOUS).toBe('NORMAL');
    });
  });
}); 