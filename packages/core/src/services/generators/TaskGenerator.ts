/**
 * @fileoverview Base TaskGenerator interface for extensible task generation
 *
 * This module defines the core interface that all task generators must implement.
 * It provides a consistent API for different generation strategies (PRD, TDD, etc.)
 *
 * @module services/generators/TaskGenerator
 * @since 1.0.0
 */

import type { ReconciliationPlan, TrackingTaskTree } from '../../utils/TrackingTaskTree.js';
import type { GenerationInput, ValidationResult } from './schemas.js';

/**
 * Base interface for all task generators
 *
 * Task generators are responsible for converting input content (PRDs, test descriptions, etc.)
 * into structured task hierarchies that can be stored in the database.
 *
 * @interface TaskGenerator
 * @example
 * ```typescript
 * class PRDTaskGenerator implements TaskGenerator {
 *   readonly type = 'prd';
 *
 *   async generate(input: GenerationInput, parentId?: string | null): Promise<ReconciliationPlan> {
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
   * Generate a reconciliation plan representing the task hierarchy from the provided input
   *
   * This is the primary generation method that creates a complete task hierarchy
   * and returns it as a ReconciliationPlan that can be applied to any compatible store.
   * This enables the AI to generate proper hierarchical structures with multiple layers,
   * subtasks, and complex relationships in a single operation.
   *
   * @param input - The input content and context for generation
   * @returns Promise resolving to a ReconciliationPlan representing the task hierarchy
   *
   * @throws {Error} When generation fails due to invalid input or processing errors
   */
  generate(input: GenerationInput): Promise<ReconciliationPlan>;

  /**
   * Validate input before generation
   *
   * @param input - The input to validate
   * @returns Promise resolving to validation results with errors/warnings/suggestions
   */
  validate(input: GenerationInput): Promise<ValidationResult>;

  /**
   * Generate a hierarchical task tree from the provided input
   *
   * This method creates a root task representing the entire generation context
   * with generated subtasks as children, enabling atomic tree operations.
   *
   * @param input - The input content and context for generation
   * @returns Promise resolving to a TrackingTaskTree with root task and generated children
   *
   * @throws {Error} When generation fails due to invalid input or processing errors
   */
  generateTaskTree?(input: GenerationInput): Promise<TrackingTaskTree>;
}
