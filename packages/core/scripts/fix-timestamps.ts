#!/usr/bin/env tsx
/**
 * Fix invalid timestamps in the database
 * 
 * Some tasks have corrupted timestamps (showing 1970 dates) that cause
 * date parsing errors. This script identifies and fixes them.
 */

import { createAdapter } from '../src/database/adapters/index.js';
import { parseDbUrl } from '../src/database/url-parser.js';
import { createModuleLogger } from '../src/utils/logger.js';
import { sql, eq, and, or, lt } from 'drizzle-orm';
import { tasks } from '../src/database/schema.js';
import { tasks as sqliteTasks } from '../src/database/schema-sqlite.js';

const logger = createModuleLogger('FixTimestamps');

/**
 * Fix invalid timestamps in the database
 */
async function fixTimestamps(databaseUrl?: string): Promise<void> {
  logger.info('Starting timestamp repair...');
  
  const dbUrl = databaseUrl || process.env.DATABASE_URI || '../../data/astrotask.db';
  const parsed = parseDbUrl(dbUrl);
  const adapter = createAdapter(parsed, { debug: false });
  
  try {
    await adapter.init();
    logger.info(`Connected to database: ${adapter.type}`);
    
    // Get the appropriate schema based on adapter type
    const schema = adapter.type === 'sqlite' ? sqliteTasks : tasks;
    
    // For SQLite, timestamps are stored as integer milliseconds
    // Find tasks with invalid timestamps (before 2020-01-01)
    const cutoffDate = new Date('2020-01-01');
    const cutoffTimestamp = cutoffDate.getTime();
    
    // Find all tasks to check their timestamps
    const allTasks = await adapter.drizzle
      .select()
      .from(schema);
    
    logger.info(`Checking ${allTasks.length} tasks for invalid timestamps`);
    
    const invalidTasks = allTasks.filter(task => {
      const createdAt = new Date(task.createdAt);
      const updatedAt = new Date(task.updatedAt);
      
      return (
        isNaN(createdAt.getTime()) || 
        isNaN(updatedAt.getTime()) ||
        createdAt.getTime() < cutoffTimestamp ||
        updatedAt.getTime() < cutoffTimestamp ||
        createdAt.getTime() > Date.now() + 86400000 || // Future dates (more than 1 day)
        updatedAt.getTime() > Date.now() + 86400000
      );
    });
    
    logger.info(`Found ${invalidTasks.length} tasks with invalid timestamps`);
    
    if (invalidTasks.length === 0) {
      logger.info('No invalid timestamps found');
      return;
    }
    
    // Fix each task by setting reasonable timestamps
    const now = new Date();
    const baseDate = new Date('2025-06-01'); // Reasonable fallback date
    
    for (const task of invalidTasks) {
      const currentCreatedAt = new Date(task.createdAt);
      const currentUpdatedAt = new Date(task.updatedAt);
      
      // Determine if timestamps need fixing
      const needsCreatedAtFix = isNaN(currentCreatedAt.getTime()) || currentCreatedAt.getTime() < cutoffTimestamp;
      const needsUpdatedAtFix = isNaN(currentUpdatedAt.getTime()) || currentUpdatedAt.getTime() < cutoffTimestamp;
      
      const fixedCreatedAt = needsCreatedAtFix ? baseDate : currentCreatedAt;
      const fixedUpdatedAt = needsUpdatedAtFix ? now : currentUpdatedAt;
      
      logger.info(`Fixing task ${task.id}: ${task.title}`);
      
      // Safe logging that handles invalid dates
      const createdAtStr = isNaN(currentCreatedAt.getTime()) ? 'Invalid Date' : currentCreatedAt.toISOString();
      const updatedAtStr = isNaN(currentUpdatedAt.getTime()) ? 'Invalid Date' : currentUpdatedAt.toISOString();
      
      logger.info(`  Created: ${createdAtStr} -> ${fixedCreatedAt.toISOString()}`);
      logger.info(`  Updated: ${updatedAtStr} -> ${fixedUpdatedAt.toISOString()}`);
      
      await adapter.drizzle
        .update(schema)
        .set({
          createdAt: fixedCreatedAt,
          updatedAt: fixedUpdatedAt,
        })
        .where(eq(schema.id, task.id));
    }
    
    logger.info(`Fixed ${invalidTasks.length} tasks with invalid timestamps`);
    
  } catch (error) {
    logger.error('Error fixing timestamps:', error);
    throw error;
  } finally {
    await adapter.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixTimestamps().catch((error) => {
    console.error('Failed to fix timestamps:', error);
    process.exit(1);
  });
} 