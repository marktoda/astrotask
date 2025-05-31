#!/usr/bin/env node

/**
 * Auto-electrify Drizzle migrations
 * 
 * This script patches generated SQL migrations to include `ALTER TABLE ... ENABLE ELECTRIC`
 * statements for all created tables. This ensures tables are ready for ElectricSQL replication
 * when deployed to production.
 * 
 * Local PGlite ignores these statements, but Electric's migration proxy processes them.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'drizzle');

console.log('🔌 Electrifying migrations...');

try {
  // Check if migrations directory exists
  try {
    await fs.access(MIGRATIONS_DIR);
  } catch {
    console.log(`📁 Migrations directory not found: ${MIGRATIONS_DIR}`);
    console.log('   Run `pnpm db:generate` first to create migrations');
    process.exit(0);
  }

  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter(file => file.endsWith('.sql'));

  if (sqlFiles.length === 0) {
    console.log('📝 No SQL migration files found');
    process.exit(0);
  }

  let totalTables = 0;
  let processedFiles = 0;

  for (const file of sqlFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    let sql = await fs.readFile(filePath, 'utf8');
    
    // Track original content to see if we need to update
    const originalSql = sql;
    
    // Find all CREATE TABLE statements and extract table names
    const createTableMatches = sql.matchAll(/CREATE TABLE\s+(?:"?(\w+)"?)/gi);
    const tables = Array.from(createTableMatches, match => match[1]);
    
    if (tables.length > 0) {
      console.log(`📄 ${file}: Found ${tables.length} table(s): ${tables.join(', ')}`);
      
      // Add ENABLE ELECTRIC for each table
      for (const tableName of tables) {
        const enableStatement = `ALTER TABLE "${tableName}" ENABLE ELECTRIC;`;
        
        // Only add if not already present
        if (!sql.includes(enableStatement)) {
          sql += `\n${enableStatement}`;
          totalTables++;
        }
      }
      
      // Only write if we made changes
      if (sql !== originalSql) {
        await fs.writeFile(filePath, sql, 'utf8');
        processedFiles++;
      }
    }
  }

  if (totalTables > 0) {
    console.log(`✅ Electrified ${totalTables} table(s) across ${processedFiles} migration file(s)`);
  } else {
    console.log('✨ All migrations already electrified');
  }

} catch (error) {
  console.error('❌ Error electrifying migrations:', error.message);
  process.exit(1);
} 