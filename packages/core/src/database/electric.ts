/**
 * Simple Electric SQL Integration
 *
 * Provides real-time database synchronization using Electric SQL's built-in capabilities.
 * This implementation focuses on simplicity and reliability over complex features.
 */

import { Shape, ShapeStream } from '@electric-sql/client';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import type { schema } from './schema.js';
import * as dbSchema from './schema.js';

const logger = createModuleLogger('electric');

/**
 * Configuration for Electric SQL sync
 */
export interface ElectricConfig {
  /** Electric SQL server URL */
  syncUrl?: string;
  /** Tables to sync (defaults to ['tasks', 'context_slices']) */
  tables?: string[];
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Electric SQL sync manager
 *
 * Handles bidirectional synchronization between local PGlite database
 * and remote Electric SQL server.
 */
export class ElectricSync {
  private shapes = new Map<string, Shape>();
  private streams = new Map<string, ShapeStream>();
  private isActive = false;

  constructor(
    private readonly db: PgliteDatabase<typeof schema>,
    private readonly config: ElectricConfig = {}
  ) {
    this.config.tables = config.tables || ['tasks', 'context_slices'];
    this.config.verbose = config.verbose ?? cfg.DB_VERBOSE;
  }

  /**
   * Start Electric SQL synchronization
   */
  async start(): Promise<void> {
    const syncUrl = this.config.syncUrl || cfg.ELECTRIC_URL;

    if (!syncUrl) {
      if (this.config.verbose) {
        logger.info('No Electric SQL URL configured - running in local-only mode');
      }
      return;
    }

    logger.info({ syncUrl, tables: this.config.tables }, 'Starting Electric SQL sync');

    try {
      // Initialize sync for each table
      const tables = this.config.tables || [];
      for (const table of tables) {
        await this.initializeTableSync(table, syncUrl);
      }

      this.isActive = true;
      logger.info('Electric SQL sync started successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to start Electric SQL sync - continuing in local-only mode');
      throw error;
    }
  }

  /**
   * Stop Electric SQL synchronization
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    logger.info('Stopping Electric SQL sync');

    // Clean up all streams
    for (const stream of this.streams.values()) {
      try {
        stream.unsubscribeAll();
      } catch (error) {
        logger.warn({ error }, 'Error unsubscribing from stream');
      }
    }

    this.shapes.clear();
    this.streams.clear();
    this.isActive = false;

    logger.info('Electric SQL sync stopped');
  }

  /**
   * Check if sync is currently active
   */
  get syncing(): boolean {
    return this.isActive;
  }

  /**
   * Initialize synchronization for a single table
   */
  private async initializeTableSync(tableName: string, baseUrl: string): Promise<void> {
    logger.debug({ table: tableName }, 'Initializing table sync');

    // Create shape stream for the table
    const stream = new ShapeStream({
      url: `${baseUrl}/v1/shape/${tableName}`,
    });

    // Wait for initial connection
    await this.waitForConnection(stream, tableName);

    // Create shape and subscribe to changes
    // biome-ignore lint/suspicious/noExplicitAny: Electric SQL client has complex type interface issues - ShapeStream doesn't fully implement ShapeStreamInterface
    const shape = new Shape(stream as any);

    // Subscribe to shape data changes
    // biome-ignore lint/suspicious/noExplicitAny: Shape data structure varies by table
    shape.subscribe((shapeData: any) => {
      this.handleShapeData(tableName, shapeData).catch((error) => {
        logger.error({ error, table: tableName }, 'Error processing shape data');
      });
    });

    // Store references for cleanup
    this.shapes.set(tableName, shape);
    this.streams.set(tableName, stream);

    logger.debug({ table: tableName }, 'Table sync initialized');
  }

  /**
   * Wait for stream connection with timeout
   */
  private async waitForConnection(stream: ShapeStream, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout for table ${tableName}`));
      }, 10000);

      const unsubscribe = stream.subscribe(
        () => {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        },
        (error) => {
          clearTimeout(timeout);
          unsubscribe();
          reject(error);
        }
      );
    });
  }

  /**
   * Handle incoming shape data from Electric SQL
   */
  // biome-ignore lint/suspicious/noExplicitAny: Electric SQL shape data has dynamic structure
  private async handleShapeData(tableName: string, shapeData: any): Promise<void> {
    if (!shapeData?.rows || shapeData.rows.length === 0) {
      return;
    }

    logger.debug(
      {
        table: tableName,
        rowCount: shapeData.rows.length,
      },
      'Processing shape data'
    );

    // Process all changes in a transaction
    await this.db.transaction(async (tx) => {
      for (const row of shapeData.rows || []) {
        await this.upsertRow(tx, tableName, row);
      }
    });
  }

  /**
   * Upsert a row into the local database
   */
  // biome-ignore lint/suspicious/noExplicitAny: Transaction and row data types are complex from Electric SQL
  private async upsertRow(tx: any, tableName: string, rowData: any): Promise<void> {
    try {
      switch (tableName) {
        case 'tasks':
          await tx
            .insert(dbSchema.tasks)
            .values(rowData)
            .onConflictDoUpdate({
              target: dbSchema.tasks.id,
              set: {
                ...rowData,
                updatedAt: new Date(), // Update timestamp on conflict
              },
            });
          break;

        case 'context_slices':
          await tx.insert(dbSchema.contextSlices).values(rowData).onConflictDoUpdate({
            target: dbSchema.contextSlices.id,
            set: rowData,
          });
          break;

        default:
          logger.warn({ table: tableName }, 'Unknown table for sync');
      }
    } catch (error) {
      logger.error({ error, table: tableName, rowId: rowData?.id }, 'Failed to upsert row');
      throw error;
    }
  }
}

/**
 * Create Electric SQL sync instance
 */
export function createElectricSync(
  db: PgliteDatabase<typeof schema>,
  config?: ElectricConfig
): ElectricSync {
  return new ElectricSync(db, config);
}
