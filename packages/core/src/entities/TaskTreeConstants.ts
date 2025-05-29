/**
 * Configuration constants for TaskTree operations
 *
 * This module centralizes all magic numbers and default values used across
 * the TaskTree implementation to improve maintainability and consistency.
 */

/**
 * Special task identifiers
 */
export const TASK_IDENTIFIERS = {
  /** Special task ID used as the parent for all root-level tasks */
  PROJECT_ROOT: '__PROJECT_ROOT__',
} as const;

/**
 * Cache configuration constants
 */
export const CACHE_CONFIG = {
  /** Default maximum number of entries in the main cache */
  DEFAULT_MAX_SIZE: 100,

  /** Time-to-live for cache entries in milliseconds (5 minutes) */
  DEFAULT_TTL_MS: 5 * 60 * 1000,

  /** Maximum age for cache entries in milliseconds (30 minutes) */
  DEFAULT_MAX_AGE_MS: 30 * 60 * 1000,

  /** Multiplier for metadata cache size relative to main cache */
  METADATA_CACHE_SIZE_MULTIPLIER: 2,

  /** Divisor for query cache size relative to main cache */
  QUERY_CACHE_SIZE_DIVISOR: 2,
} as const;

/**
 * Tree validation configuration constants
 */
export const VALIDATION_CONFIG = {
  /** Default maximum depth allowed for task trees */
  DEFAULT_MAX_DEPTH: 10,

  /** Default setting for status consistency validation */
  DEFAULT_CHECK_STATUS_CONSISTENCY: true,
} as const;

/**
 * Tree traversal configuration constants
 */
export const TRAVERSAL_CONFIG = {
  /** Maximum iterations to prevent infinite loops in traversal */
  MAX_TRAVERSAL_ITERATIONS: 10000,
} as const;