/**
 * Centralized Validation Module
 *
 * Consolidates validation logic from across the application into a single place.
 * This module provides:
 * - Task validation (status transitions, hierarchy, dates)
 * - Tree structure validation
 * - Dependency validation (cycles, self-dependencies, duplicates)
 *
 * TODO: Future consolidation opportunities:
 * - Create schema validation wrappers for consistent error handling
 * - Extract validation logic from entities into this module
 */

export * from './task-validation.js';
export * from './tree-validation.js';
export * from './dependency-validation.js';
