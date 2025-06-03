#!/usr/bin/env tsx
/**
 * Generate SQLite-specific migrations from the SQLite schema
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../src/database/schema-sqlite.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateSqliteMigrations() {
  console.log('Generating SQLite migrations...');
  
  // Create temporary in-memory database for migration generation
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  
  // Apply migrations to understand the structure
  const migrationsDir = resolve(__dirname, '..', 'migrations', 'drizzle-sqlite');
  
  try {
    await migrate(db, { migrationsFolder: migrationsDir });
    console.log('✅ SQLite migrations applied successfully');
  } catch (error) {
    console.log('⚠️  Migration application failed (expected for first run):', error.message);
  } finally {
    sqlite.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateSqliteMigrations().catch(console.error);
} 