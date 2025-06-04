/**
 * Default configuration constants for Astrotask SDK
 */

export const DEFAULT_CONFIG = {
  /** Default database URL for in-memory storage */
  DATABASE_URL: 'memory://default',

  /** Default complexity analysis settings */
  COMPLEXITY: {
    THRESHOLD: 7,
    RESEARCH: false,
    BATCH_SIZE: 5,
  },

  /** Default task expansion settings */
  EXPANSION: {
    USE_COMPLEXITY_ANALYSIS: true,
    RESEARCH: false,
    COMPLEXITY_THRESHOLD: 7,
    DEFAULT_SUBTASKS: 3,
    MAX_SUBTASKS: 10,
    FORCE_REPLACE: false,
    CREATE_CONTEXT_SLICES: true,
  },

  /** Default store settings */
  STORE: {
    IS_SYNCING: false, // deprecated
    IS_ENCRYPTED: false, // not implemented yet
  },
} as const;

export const TEST_CONFIG = {
  DATABASE_URL: 'memory://test',
} as const;
