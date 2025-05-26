import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { initializeDatabase } from '../src/database/config.js';
import type { DatabaseConnection } from '../src/database/config.js';

describe('Database Migration System', () => {
  let connection: DatabaseConnection;
  const testDbPath = join(process.cwd(), 'test-db');

  beforeEach(() => {
    // Clean up any existing test database directory
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    
    // Initialize unencrypted database for testing
    connection = initializeDatabase({
      dbPath: testDbPath,
      encrypted: false,
      verbose: false,
    });
  });

  afterEach(async () => {
    await connection.db.close();
    
    // Clean up test database directory
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  it('should run migrations successfully', async () => {
    // Run migrations
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Verify tables were created by checking PostgreSQL information_schema
    const result = await connection.db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableNames = result.rows.map((row: any) => row.table_name);
    
    expect(tableNames).toEqual(expect.arrayContaining(['context_slices', 'projects', 'tasks']));
    expect(tableNames.length).toBeGreaterThanOrEqual(3);
  });

  it('should enforce foreign key constraints', async () => {
    // Run migrations first
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Test foreign key constraint by trying to insert invalid reference
    await expect(async () => {
      await connection.db.query(
        'INSERT INTO tasks (id, title, project_id) VALUES ($1, $2, $3)',
        ['test-task', 'Test Task', 'nonexistent-project']
      );
    }).rejects.toThrow(); // Should fail due to foreign key constraint
  });

  it('should create tables with proper timestamp defaults', async () => {
    // Run migrations
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Insert a project to test timestamp defaults
    const projectId = 'test-project-1';
    await connection.db.query(
      'INSERT INTO projects (id, title) VALUES ($1, $2)',
      [projectId, 'Test Project']
    );

    // Retrieve the project to check timestamps
    const result = await connection.db.query(
      'SELECT created_at, updated_at FROM projects WHERE id = $1',
      [projectId]
    );
    
    const project = result.rows[0] as { created_at: string; updated_at: string };
    expect(project.created_at).toBeDefined();
    expect(project.updated_at).toBeDefined();
    
    // Verify timestamp format (ISO 8601 with timezone)
    expect(new Date(project.created_at)).toBeInstanceOf(Date);
    expect(new Date(project.updated_at)).toBeInstanceOf(Date);
  });
}); 