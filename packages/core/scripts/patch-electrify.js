#!/usr/bin/env node

/**
 * Auto-electrify Drizzle migrations
 * 
 * This script creates electrified versions of migrations in a separate folder
 * for deployment to production via Electric's migration proxy.
 * 
 * - Input: drizzle/ (local migrations without ENABLE ELECTRIC)
 * - Output: drizzle-electric/ (remote migrations with ENABLE ELECTRIC)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..', 'migrations', 'drizzle');
const TARGET_DIR = path.join(__dirname, '..', 'migrations', 'drizzle-electric');

console.log('🔌 Electrifying migrations...');

try {
  // Check if source migrations directory exists
  try {
    await fs.access(SOURCE_DIR);
  } catch {
    console.log(`📁 Source migrations directory not found: ${SOURCE_DIR}`);
    console.log('   Run `pnpm db:generate` first to create migrations');
    process.exit(0);
  }

  // Create target directory if it doesn't exist
  await fs.mkdir(TARGET_DIR, { recursive: true });

  // Copy meta directory
  const metaSourceDir = path.join(SOURCE_DIR, 'meta');
  const metaTargetDir = path.join(TARGET_DIR, 'meta');
  
  try {
    await fs.access(metaSourceDir);
    await fs.cp(metaSourceDir, metaTargetDir, { recursive: true });
    console.log('📋 Copied migration metadata');
  } catch {
    console.log('📝 No metadata directory found (this is OK for simple migrations)');
  }

  // Process SQL files
  const files = await fs.readdir(SOURCE_DIR);
  const sqlFiles = files.filter(file => file.endsWith('.sql'));

  if (sqlFiles.length === 0) {
    console.log('📝 No SQL migration files found');
    process.exit(0);
  }

  let totalTables = 0;
  let processedFiles = 0;

  for (const file of sqlFiles) {
    const sourcePath = path.join(SOURCE_DIR, file);
    const targetPath = path.join(TARGET_DIR, file);
    
    let sql = await fs.readFile(sourcePath, 'utf8');
    
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
      
      processedFiles++;
    }
    
    // Write to target directory
    await fs.writeFile(targetPath, sql, 'utf8');
  }

  if (totalTables > 0) {
    console.log(`✅ Created ${processedFiles} electrified migration file(s) with ${totalTables} ENABLE ELECTRIC statement(s)`);
    console.log(`📁 Electrified migrations saved to: ${TARGET_DIR}`);
  } else if (processedFiles > 0) {
    console.log(`✨ Copied ${processedFiles} migration file(s) (already electrified)`);
  } else {
    console.log('📋 All migrations copied without changes');
  }

  console.log('\n🚀 Next steps:');
  console.log('   - Local development: Migrations in drizzle/ will be used automatically');
  console.log('   - Production deploy: Run `pnpm db:deploy` to push drizzle-electric/ through Electric proxy');

} catch (error) {
  console.error('❌ Error electrifying migrations:', error.message);
  process.exit(1);
} 