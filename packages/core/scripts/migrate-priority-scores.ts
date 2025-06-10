#!/usr/bin/env tsx
/**
 * Data migration script to set priority scores for existing tasks
 * 
 * This script updates all existing tasks to set their priority_score field based on
 * their current priority field values:
 * - high priority -> 75 score
 * - medium priority -> 50 score (default, likely already set)
 * - low priority -> 25 score
 */

import { createAdapter } from '../src/database/adapters/index.js';
import { parseDbUrl } from '../src/database/url-parser.js';
import { priorityToScore } from '../src/schemas/task.js';
import { createModuleLogger } from '../src/utils/logger.js';
import { eq, sql } from 'drizzle-orm';
import { tasks } from '../src/database/schema.js';
import { tasks as sqliteTasks } from '../src/database/schema-sqlite.js';

const logger = createModuleLogger('PriorityScoreMigration');

interface MigrationStats {
  totalTasks: number;
  updated: {
    high: number;
    medium: number;
    low: number;
  };
  errors: number;
}

/**
 * Run the priority score migration
 */
async function migratePriorityScores(databaseUrl?: string): Promise<MigrationStats> {
  logger.info('Starting priority score migration...');
  
  const dbUrl = databaseUrl || process.env.DATABASE_URI || '../../data/astrotask.db';
  const parsed = parseDbUrl(dbUrl);
  const adapter = createAdapter(parsed, { debug: false });
  
  try {
    await adapter.init();
    logger.info(`Connected to database: ${adapter.type}`);
    
    // Check if priority_score column exists, if not, add it
    try {
      const schema = adapter.type === 'sqlite' ? sqliteTasks : tasks;
      await adapter.drizzle.select({ priorityScore: schema.priorityScore }).from(schema).limit(1);
      logger.info('priority_score column already exists');
    } catch (error) {
      logger.info('priority_score column does not exist, adding it...');
      if (adapter.type === 'sqlite') {
        // Add the column manually for SQLite
        if (adapter.type === 'sqlite') {
          const sqliteAdapter = adapter as any;
          sqliteAdapter.rawClient.exec('ALTER TABLE tasks ADD COLUMN priority_score REAL DEFAULT 50.0 NOT NULL');
        }
        logger.info('Added priority_score column to SQLite database');
      } else {
        throw new Error('PostgreSQL migration not implemented in this script');
      }
    }
    
    const stats: MigrationStats = {
      totalTasks: 0,
      updated: { high: 0, medium: 0, low: 0 },
      errors: 0,
    };
    
    // Get the appropriate schema based on adapter type
    const schema = adapter.type === 'sqlite' ? sqliteTasks : tasks;
    
    // First, get count of all tasks
    const countResult = await adapter.drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema);
    stats.totalTasks = countResult[0]?.count || 0;
    
    logger.info(`Found ${stats.totalTasks} tasks to process`);
    
    if (stats.totalTasks === 0) {
      logger.info('No tasks found, migration complete');
      return stats;
    }
    
    // Update tasks by priority level
    const priorities = ['high', 'medium', 'low'] as const;
    
    for (const priority of priorities) {
      const score = priorityToScore(priority);
      
      try {
        logger.info(`Updating ${priority} priority tasks to score ${score}...`);
        
        // Update all tasks with this priority that don't already have the correct score
        const result = await adapter.drizzle
          .update(schema)
          .set({ 
            priorityScore: score,
            updatedAt: new Date()
          })
          .where(
            sql`${schema.priority} = ${priority} AND (${schema.priorityScore} != ${score} OR ${schema.priorityScore} IS NULL)`
          );
        
        // Get count of updated rows (implementation varies by database)
        let updatedCount = 0;
        if (adapter.type === 'sqlite') {
          // For SQLite, we need to count manually since changes() is not available in Drizzle
          const countAfterUpdate = await adapter.drizzle
            .select({ count: sql<number>`count(*)` })
            .from(schema)
            .where(eq(schema.priority, priority));
          updatedCount = countAfterUpdate[0]?.count || 0;
          
          // This is an approximation - we assume all tasks of this priority were updated
          stats.updated[priority] = updatedCount;
        } else {
          // For PostgreSQL, we can use returning() to get exact count
          updatedCount = result.length || 0;
          stats.updated[priority] = updatedCount;
        }
        
        logger.info(`Updated ${updatedCount} tasks with ${priority} priority`);
        
      } catch (error) {
        logger.error(`Error updating ${priority} priority tasks:`, error);
        stats.errors++;
      }
    }
    
    // Verify the migration by checking final state
    const verificationQueries = await Promise.all([
      adapter.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema)
        .where(eq(schema.priority, 'high')),
      adapter.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema)
        .where(eq(schema.priority, 'medium')),
      adapter.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema)
        .where(eq(schema.priority, 'low')),
    ]);
    
    const finalCounts = {
      high: verificationQueries[0][0]?.count || 0,
      medium: verificationQueries[1][0]?.count || 0,
      low: verificationQueries[2][0]?.count || 0,
    };
    
    logger.info('Migration verification:', {
      totalProcessed: stats.totalTasks,
      finalCounts,
      errors: stats.errors,
    });
    
    logger.info('Priority score migration completed successfully!');
    return stats;
    
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await adapter.close();
  }
}

/**
 * Dry run mode - show what would be updated without making changes
 */
async function dryRun(databaseUrl?: string): Promise<void> {
  logger.info('Running in DRY RUN mode - no changes will be made');
  
  const dbUrl = databaseUrl || process.env.DATABASE_URI || '../../data/astrotask.db';
  const parsed = parseDbUrl(dbUrl);
  const adapter = createAdapter(parsed, { debug: false });
  
  try {
    await adapter.init();
    const schema = adapter.type === 'sqlite' ? sqliteTasks : tasks;
    
    // Count tasks by priority
    const priorityCounts = await Promise.all([
      adapter.drizzle
        .select({ 
          priority: schema.priority,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${schema.priorityScore})`,
        })
        .from(schema)
        .where(eq(schema.priority, 'high')),
      adapter.drizzle
        .select({ 
          priority: schema.priority,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${schema.priorityScore})`,
        })
        .from(schema)
        .where(eq(schema.priority, 'medium')),
      adapter.drizzle
        .select({ 
          priority: schema.priority,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${schema.priorityScore})`,
        })
        .from(schema)
        .where(eq(schema.priority, 'low')),
    ]);
    
    logger.info('Current priority distribution:');
    priorityCounts.forEach((result, index) => {
      const priority = ['high', 'medium', 'low'][index];
      const count = result[0]?.count || 0;
      const avgScore = result[0]?.avgScore || 0;
      const targetScore = priorityToScore(priority as any);
      
      logger.info(`  ${priority}: ${count} tasks, avg score: ${avgScore.toFixed(1)}, target: ${targetScore}`);
    });
    
  } finally {
    await adapter.close();
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const databaseUrl = process.argv.find(arg => arg.startsWith('--db='))?.split('=')[1];
  
  if (isDryRun) {
    dryRun(databaseUrl).catch((error) => {
      logger.error('Dry run failed:', error);
      console.error('Full error details:', error);
      process.exit(1);
    });
  } else {
    migratePriorityScores(databaseUrl)
      .then((stats) => {
        logger.info('Migration completed with stats:', stats);
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Migration failed:', error);
        process.exit(1);
      });
  }
} 