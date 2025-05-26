/**
 * Tests for the database migration system
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { initializeDatabase, type DatabaseConnection } from '../src/database/config.js';
import { runMigrations, needsMigration, autoMigrate } from '../src/database/migrate.js';

describe('Database Migration System', () => {
  const testDbPath = join(process.cwd(), 'test-migration.db');
  let connection: DatabaseConnection;

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean up after tests
    if (connection) {
      await connection.db.close();
    }
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  it('should detect that migrations are needed on fresh database', async () => {
    connection = await initializeDatabase({
      dbPath: testDbPath,
      autoMigrate: false, // Don't auto-migrate for this test
      verbose: false,
    });

    const migrationsNeeded = await needsMigration(connection);
    expect(migrationsNeeded).toBe(true);
  });

  it('should run migrations successfully', async () => {
    connection = await initializeDatabase({
      dbPath: testDbPath,
      autoMigrate: false,
      verbose: false,
    });

    // Run migrations manually
    await runMigrations(connection, { verbose: false });

    // Verify migrations were applied
    const migrationsNeeded = await needsMigration(connection);
    expect(migrationsNeeded).toBe(false);

    // Verify tables exist
    const result = await connection.db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableNames = result.rows.map((row: any) => row.table_name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('context_slices');
  });

  it('should auto-migrate during database initialization', async () => {
    // Initialize with auto-migration enabled (default)
    connection = await initializeDatabase({
      dbPath: testDbPath,
      verbose: false,
    });

    // Verify tables were created automatically
    const migrationsNeeded = await needsMigration(connection);
    expect(migrationsNeeded).toBe(false);

    // Verify core tables exist
    const result = await connection.db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name IN ('projects', 'tasks', 'context_slices')
    `);

    const tableCount = (result.rows[0] as { count: number })?.count || 0;
    expect(tableCount).toBe(3);
  });

  it('should skip migrations when database is up to date', async () => {
    // First initialization with migrations
    connection = await initializeDatabase({
      dbPath: testDbPath,
      verbose: false,
    });

    // Close and reconnect
    await connection.db.close();
    connection = await initializeDatabase({
      dbPath: testDbPath,
      verbose: false,
    });

    // Should still be up to date
    const migrationsNeeded = await needsMigration(connection);
    expect(migrationsNeeded).toBe(false);
  });

  it('should handle migration errors gracefully', async () => {
    connection = await initializeDatabase({
      dbPath: testDbPath,
      autoMigrate: false,
      verbose: false,
    });

    // Try to run migrations with invalid path
    await expect(
      runMigrations(connection, {
        migrationsFolder: '/invalid/path',
        verbose: false,
      })
    ).rejects.toThrow();
  });
}); 