import { Shape, ShapeStream } from '@electric-sql/client';
import type { ShapeStreamOptions } from '@electric-sql/client';
import type { PGlite } from '@electric-sql/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { cfg } from '../utils/config.js';
import type { schema } from './schema.js';
import { DatabaseStore, type Store } from './store.js';

/**
 * Store initialization options
 */
export interface StoreOptions {
  sync?: boolean;
  verbose?: boolean;
  databasePath?: string;
}

/**
 * ElectricSQL connection interface for real-time synchronization
 */
export interface ElectricConnection {
  streams: Map<string, ShapeStream>;
  shapes: Map<string, Shape>;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sync: (table: string, options?: Partial<ShapeStreamOptions>) => Promise<void>;
}

/**
 * Create a store following the ElectricSQL + Drizzle + PGlite guide pattern.
 *
 * This creates:
 * - One embedded PGlite database file (or idb:// for browsers)
 * - A typed Drizzle instance sharing the same handle
 * - ElectricSQL sync integration (if enabled)
 *
 * @param pgLite Pre-created PGlite instance
 * @param sql Pre-created Drizzle instance
 * @param isEncrypted Whether encryption is enabled
 * @param options Configuration options
 * @returns Store interface with all three components
 */
export async function createStore(
  pgLite: PGlite,
  sql: PgliteDatabase<typeof schema>,
  isEncrypted: boolean,
  options: StoreOptions = {}
): Promise<Store> {
  const { sync = false, verbose = cfg.DB_VERBOSE } = options;

  if (verbose) {
    console.info(`Creating store with sync: ${sync}, encrypted: ${isEncrypted}`);
  }

  // Create ElectricSQL connection
  const electric = await createElectricConnection({ verbose });

  // Initialize sync for core tables if enabled
  if (sync && electric.isConnected) {
    try {
      await Promise.all([electric.sync('tasks'), electric.sync('context_slices')]);

      if (verbose) {
        console.info('Sync enabled for core tables: tasks, context_slices');
      }
    } catch (error) {
      console.warn('Failed to initialize sync, continuing in local-only mode:', error);
    }
  }

  // Create and return the DatabaseStore instance
  return new DatabaseStore(pgLite, sql, electric, isEncrypted);
}

// ---------------------------------------------------------------------------
// ElectricSQL Implementation
// ---------------------------------------------------------------------------

/**
 * Error types for ElectricSQL operations
 */
export class ElectricError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ElectricError';
  }
}

export class SyncError extends ElectricError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'SyncError';
  }
}

/**
 * Get ElectricSQL configuration
 */
function getElectricConfig() {
  return {
    url: cfg.ELECTRIC_URL,
    isEnabled: Boolean(cfg.ELECTRIC_URL),
  };
}

/**
 * No-op ElectricSQL connection for local-only mode
 */
class NoOpElectricConnection implements ElectricConnection {
  streams = new Map<string, ShapeStream>();
  shapes = new Map<string, Shape>();
  isConnected = false;

  async connect(): Promise<void> {
    // No-op for local-only mode
  }

  async disconnect(): Promise<void> {
    // No-op for local-only mode
  }

  async sync(_table: string, _options?: Partial<ShapeStreamOptions>): Promise<void> {
    // No-op for local-only mode - data stays local
  }
}

/**
 * Create ElectricSQL connection
 */
export async function createElectricConnection(
  options: {
    verbose?: boolean;
  } = {}
): Promise<ElectricConnection> {
  const { verbose = false } = options;
  const config = getElectricConfig();

  // Return no-op connection if ElectricSQL is not configured
  if (!config.isEnabled || !config.url) {
    if (verbose) {
      console.info('ElectricSQL not configured - running in local-only mode');
    }
    return new NoOpElectricConnection();
  }

  try {
    const streams = new Map<string, ShapeStream>();
    const shapes = new Map<string, Shape>();
    let isConnected = false;

    const connection: ElectricConnection = {
      streams,
      shapes,
      isConnected,

      async connect() {
        try {
          isConnected = true;
          if (verbose) {
            console.info('ElectricSQL connected');
          }
        } catch (error) {
          throw new ElectricError(
            'Failed to connect to ElectricSQL',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      },

      async disconnect() {
        try {
          // Clean up all active streams
          for (const stream of streams.values()) {
            stream.unsubscribeAll();
          }
          streams.clear();
          shapes.clear();
          isConnected = false;
          if (verbose) {
            console.info('ElectricSQL disconnected');
          }
        } catch (error) {
          throw new ElectricError(
            'Failed to disconnect from ElectricSQL',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      },

      async sync(table: string, options: Partial<ShapeStreamOptions> = {}) {
        try {
          if (!isConnected) {
            await connection.connect();
          }

          if (!config.url) {
            throw new SyncError('ElectricSQL URL is not configured');
          }

          // Create a shape stream for the specified table
          const stream = new ShapeStream({
            url: config.url,
            params: {
              table,
              ...options.params,
            },
            ...options,
          });

          // Wait for stream to establish connection
          await new Promise<void>((resolve, reject) => {
            let subscribed = false;
            stream.subscribe(
              () => {
                if (!subscribed && stream.shapeHandle) {
                  subscribed = true;
                  resolve();
                }
              },
              (error) => {
                if (!subscribed) {
                  subscribed = true;
                  reject(error);
                }
              }
            );
          });

          if (!stream.shapeHandle) {
            throw new SyncError(`Stream for table ${table} failed to establish shapeHandle`);
          }

          // Create the shape
          const shape = new Shape(stream as ShapeStream & { shapeHandle: string });

          // Store references
          streams.set(table, stream);
          shapes.set(table, shape);

          if (verbose) {
            console.info(`Started syncing table: ${table}`);
          }
        } catch (error) {
          throw new SyncError(
            `Failed to sync table ${table}`,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      },
    };

    return connection;
  } catch (error) {
    throw new ElectricError(
      'Failed to create ElectricSQL connection',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
