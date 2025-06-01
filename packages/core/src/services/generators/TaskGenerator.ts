/**
 * @fileoverview Base TaskGenerator interface for extensible task generation
 *
 * This module defines the core interface that all task generators must implement.
 * It provides a consistent API for different generation strategies (PRD, TDD, etc.)
 *
 * @module services/generators/TaskGenerator
 * @since 1.0.0
 */

import type { TrackingDependencyGraph } from '../../entities/TrackingDependencyGraph.js';
import type { TrackingTaskTree } from '../../entities/TrackingTaskTree.js';
import type { GenerationInput, ValidationResult } from './schemas.js';

/**
 * Result of task generation containing both task tree and dependency graph
 */
export interface GenerationResult {
  /** Tracking task tree with generated tasks */
  tree: TrackingTaskTree;
  /** Tracking dependency graph with generated dependencies */
  graph: TrackingDependencyGraph;
}

/**
 * Base interface for all task generators
 *
 * Task generators are responsible for converting input content (PRDs, test descriptions, etc.)
 * into structured task hierarchies with dependency relationships that can be stored in the database.
 *
 * @interface TaskGenerator
 * @example
 * ```typescript
 * class PRDTaskGenerator implements TaskGenerator {
 *   readonly type = 'prd';
 *
 *   async generate(input: GenerationInput): Promise<GenerationResult> {
 *     // Implementation logic here
 *   }
 *
 *   async validate(input: GenerationInput): Promise<ValidationResult> {
 *     // Validation logic here
 *   }
 * }
 * ```
 */
export interface TaskGenerator {
  /** Unique identifier for this generator type */
  readonly type: string;

  /**
   * Generate both task tree and dependency graph from the provided input
   *
   * This is the primary generation method that creates a complete task hierarchy
   * with dependency relationships and returns both as tracking structures that
   * can be applied to any compatible store.
   *
   * @param input - The input content and context for generation
   * @returns Promise resolving to GenerationResult with both tree and graph
   *
   * @throws {Error} When generation fails due to invalid input or processing errors
   */
  generate(input: GenerationInput): Promise<GenerationResult>;

  /**
   * Validate input before generation
   *
   * @param input - The input to validate
   * @returns Promise resolving to validation results with errors/warnings/suggestions
   */
  validate(input: GenerationInput): Promise<ValidationResult>;
}
