import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { initializeDatabase } from '../src/database/config.js';
import type { DatabaseConnection } from '../src/database/config.js';

describe('Database Migration System', () => {
  let connection: DatabaseConnection;
  const testDbPath = join(process.cwd(), 'test.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    
    // Initialize unencrypted database for testing
    connection = initializeDatabase({
      dbPath: testDbPath,
      encrypted: false,
      verbose: false,
    });
  });

  afterEach(() => {
    connection.close();
    
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('should run migrations successfully', async () => {
    // Run migrations
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Verify tables were created by checking schema
    const result = connection.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all();

    const tableNames = result.map((row: any) => row.name);
    
    expect(tableNames).toEqual(['__drizzle_migrations', 'context_slices', 'projects', 'tasks']);
  });

  it('should enforce foreign key constraints', async () => {
    // Run migrations first
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Test foreign key constraint by trying to insert invalid reference
    expect(() => {
      connection.db
        .prepare('INSERT INTO tasks (id, title, project_id) VALUES (?, ?, ?)')
        .run('test-task', 'Test Task', 'nonexistent-project');
    }).toThrow(); // Should fail due to foreign key constraint
  });

  it('should create tables with proper timestamp defaults', async () => {
    // Run migrations
    await migrate(connection.drizzle, {
      migrationsFolder: join(process.cwd(), 'src/database/migrations'),
    });

    // Insert a project to test timestamp defaults
    const projectId = 'test-project-1';
    connection.db
      .prepare('INSERT INTO projects (id, title) VALUES (?, ?)')
      .run(projectId, 'Test Project');

    // Retrieve the project to check timestamps
    const project = connection.db
      .prepare('SELECT created_at, updated_at FROM projects WHERE id = ?')
      .get(projectId) as any;

    expect(project.created_at).toBeDefined();
    expect(project.updated_at).toBeDefined();
    
    // Verify timestamp format (ISO 8601)
    expect(project.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(project.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
}); 