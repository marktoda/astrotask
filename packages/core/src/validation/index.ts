/**
 * Centralized Validation Module
 * 
 * Consolidates validation logic from across the application into a single place.
 * This module provides:
 * - Task validation (status transitions, hierarchy, dates)
 * - Tree structure validation
 * 
 * TODO: Future consolidation opportunities:
 * - Move dependency validation from DependencyService
 * - Create schema validation wrappers for consistent error handling
 * - Extract validation logic from entities into this module
 */

export * from './task-validation.js';
export * from './tree-validation.js'; 