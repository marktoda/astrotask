/**
 * Database initialization and seeding logic
 *
 * Handles business logic for setting up the database with required data,
 * separated from the infrastructure concerns in the factory.
 */

import { eq } from 'drizzle-orm';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseBackend } from './adapters/types.js';
import { tasks } from './schema.js';

const logger = createModuleLogger('DatabaseInitialization');

/**
 * Ensure PROJECT_ROOT task exists with proper conflict handling
 *
 * This is business logic that sets up the required root task for the application.
 * It's separated from the database factory to maintain clear separation of concerns.
 */
export async function ensureProjectRoot(backend: DatabaseBackend): Promise<void> {
  try {
    // Check if PROJECT_ROOT already exists using native Drizzle
    const existing = await backend.drizzle
      .select()
      .from(tasks)
      .where(eq(tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT))
      .limit(1);

    if (existing.length === 0) {
      // Insert PROJECT_ROOT task using native Drizzle with proper conflict handling
      try {
        await backend.drizzle.insert(tasks).values({
          id: TASK_IDENTIFIERS.PROJECT_ROOT,
          title: 'Project Root',
          description: 'Root container for all project tasks',
          status: 'done',
          priority: 'low',
          parentId: null,
          prd: null,
          contextDigest: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        logger.info('Created PROJECT_ROOT task');
      } catch (insertError) {
        // Handle constraint violations (task already exists from race condition)
        if (insertError instanceof Error) {
          if (
            insertError.message.includes('UNIQUE constraint') ||
            insertError.message.includes('duplicate key') ||
            insertError.message.includes('already exists')
          ) {
            logger.debug('PROJECT_ROOT task already exists (race condition handled)');
          } else {
            throw insertError;
          }
        } else {
          throw insertError;
        }
      }
    } else {
      logger.debug('PROJECT_ROOT task already exists');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to ensure PROJECT_ROOT task exists');
  }
}

/**
 * Run all database initialization tasks
 *
 * This function can be expanded to include other initialization logic
 * like seeding lookup tables, creating default configurations, etc.
 */
export async function initializeDatabase(backend: DatabaseBackend): Promise<void> {
  logger.debug('Starting database initialization');

  await ensureProjectRoot(backend);

  // Future initialization tasks can be added here
  // await seedLookupTables(backend);
  // await createDefaultConfiguration(backend);

  logger.debug('Database initialization completed');
}
