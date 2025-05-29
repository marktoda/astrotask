import type { TaskTree, TaskTreeData } from './TaskTree.js';
import { taskTreeSchema } from './TaskTree.js';
import { VALIDATION_CONFIG } from './TaskTreeConstants.js';

/**
 * TaskTreeValidation - Utilities for validating tree structure and detecting issues
 *
 * Provides validation functions for:
 * - Cycle detection in task hierarchies
 * - Tree structure integrity validation
 * - Parent-child relationship validation
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'cycle' | 'orphaned_child' | 'invalid_parent' | 'duplicate_id' | 'malformed_tree';
  taskId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  type: 'deep_nesting' | 'orphaned_subtree' | 'status_inconsistency';
  taskId: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validates a task tree for structural integrity and business rule violations
 */
export function validateTaskTree(
  tree: TaskTree,
  options: ValidationOptions = {}
): ValidationResult {
  const opts = { ...defaultValidationOptions, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const visitedIds = new Set<string>();

  // Collect all task IDs in the tree
  const allTaskIds = new Set<string>();
  tree.walkDepthFirst((node) => {
    allTaskIds.add(node.id);
  });

  // Check for cycles using DFS
  const cycleDetection = detectCycles(tree, visitedIds, new Set<string>());
  errors.push(...cycleDetection);

  // Check for duplicate IDs
  const duplicateIds = findDuplicateIds(tree);
  errors.push(...duplicateIds);

  // Check parent-child relationships
  const relationshipErrors = validateParentChildRelationships(tree);
  errors.push(...relationshipErrors);

  // Check for deep nesting (warning)
  if (opts.maxDepth) {
    const maxDepth = opts.maxDepth; // Capture the value to avoid undefined issues in callback
    tree.walkDepthFirst((node) => {
      if (node.getDepth() > maxDepth) {
        warnings.push({
          type: 'deep_nesting',
          taskId: node.id,
          message: `Task exceeds maximum depth of ${maxDepth} (current: ${node.getDepth()})`,
          details: { maxDepth, currentDepth: node.getDepth() },
        });
      }
    });
  }

  // Check for status inconsistencies (warning)
  const statusWarnings = validateStatusConsistency(tree, opts);
  warnings.push(...statusWarnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detects cycles in a task tree using depth-first search with recursion stack tracking
 *
 * Implements the "white-gray-black" DFS algorithm for cycle detection:
 * - White: unvisited nodes (not in visited set)
 * - Gray: currently being processed (in recursionStack)
 * - Black: fully processed (in visited but not recursionStack)
 *
 * A cycle exists if we encounter a gray node during traversal.
 *
 * @param node - Current tree node being processed
 * @param visited - Set of fully processed node IDs (black nodes)
 * @param recursionStack - Set of currently processing node IDs (gray nodes)
 * @returns Array of validation errors for any cycles detected
 *
 * @complexity O(V + E) where V=nodes, E=parent-child edges
 *
 * @algorithm
 * 1. Check if current node is in recursion stack (gray) → cycle found
 * 2. Skip if already fully processed (black)
 * 3. Mark as currently processing (gray)
 * 4. Recursively process all children
 * 5. Mark as fully processed (black) and remove from gray set
 */
function detectCycles(
  node: TaskTree,
  visited: Set<string>,
  recursionStack: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (recursionStack.has(node.id)) {
    errors.push({
      type: 'cycle',
      taskId: node.id,
      message: `Cycle detected involving task "${node.title}"`,
      details: { cyclePath: Array.from(recursionStack) },
    });
    return errors;
  }

  if (visited.has(node.id)) {
    return errors;
  }

  visited.add(node.id);
  recursionStack.add(node.id);

  for (const child of node.getChildren()) {
    errors.push(...detectCycles(child, visited, recursionStack));
  }

  recursionStack.delete(node.id);
  return errors;
}

/**
 * Finds duplicate task IDs in the tree
 */
function findDuplicateIds(tree: TaskTree): ValidationError[] {
  const errors: ValidationError[] = [];
  const idCounts = new Map<string, number>();

  tree.walkDepthFirst((node) => {
    const count = idCounts.get(node.id) || 0;
    idCounts.set(node.id, count + 1);
  });

  for (const [id, count] of idCounts) {
    if (count > 1) {
      const node = tree.find((task) => task.id === id);
      errors.push({
        type: 'duplicate_id',
        taskId: id,
        message: `Duplicate task ID found: "${id}" (appears ${count} times)`,
        details: { count, title: node?.title },
      });
    }
  }

  return errors;
}

/**
 * Validates parent-child relationship consistency
 */
function validateParentChildRelationships(tree: TaskTree): ValidationError[] {
  const errors: ValidationError[] = [];

  tree.walkDepthFirst((node) => {
    const parent = node.getParent();

    // Check if parentId matches actual parent
    // Note: null and undefined are treated as equivalent for root tasks
    const declaredParentId = node.task.parentId;
    const actualParentId = parent?.id;

    // Both should be null/undefined for root tasks, or equal for non-root tasks
    const parentIdsMatch =
      (declaredParentId == null && actualParentId == null) || declaredParentId === actualParentId;

    if (!parentIdsMatch) {
      errors.push({
        type: 'invalid_parent',
        taskId: node.id,
        message: `Task parentId "${declaredParentId}" does not match actual parent "${actualParentId}"`,
        details: {
          declaredParentId,
          actualParentId,
          title: node.title,
        },
      });
    }

    // Check if children have correct parentId
    for (const child of node.getChildren()) {
      if (child.task.parentId !== node.id) {
        errors.push({
          type: 'orphaned_child',
          taskId: child.id,
          message: `Child task parentId "${child.task.parentId}" does not reference parent "${node.id}"`,
          details: {
            childParentId: child.task.parentId,
            parentId: node.id,
            childTitle: child.title,
            parentTitle: node.title,
          },
        });
      }
    }
  });

  return errors;
}

/**
 * Validates status consistency between parent tasks and their children
 *
 * Implements business rule validation for task completion states:
 * - Rule 1: A parent task marked as "done" should have all children completed
 * - Rule 2: A parent with all children completed should typically be marked as "done"
 *
 * These are warnings rather than errors to allow for flexible project management workflows.
 *
 * @param tree - The task tree to validate
 * @param options - Validation configuration options
 * @returns Array of warning objects for status inconsistencies
 *
 * @complexity O(n) where n = number of nodes in tree
 *
 * @sideEffects None - pure validation function
 *
 * @businessLogic
 * - Leaf nodes (no children) are always consistent
 * - Parent status vs children completion mismatch generates warnings
 * - Provides detailed context for manual review and resolution
 */
function validateStatusConsistency(
  tree: TaskTree,
  options: ValidationOptions
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!options.checkStatusConsistency) return warnings;

  tree.walkDepthFirst((node) => {
    const children = node.getChildren();

    if (children.length === 0) return; // Leaf nodes don't need consistency checks

    const allChildrenComplete = children.every((child) => child.status === 'done');
    const someChildrenComplete = children.some((child) => child.status === 'done');

    // Warning: Parent marked as done but has incomplete children
    if (node.status === 'done' && !allChildrenComplete) {
      warnings.push({
        type: 'status_inconsistency',
        taskId: node.id,
        message: 'Task marked as done but has incomplete children',
        details: {
          parentStatus: node.status,
          incompleteChildren: children
            .filter((child) => child.status !== 'done')
            .map((child) => ({ id: child.id, title: child.title, status: child.status })),
        },
      });
    }

    // Warning: All children complete but parent not marked as done
    if (allChildrenComplete && someChildrenComplete && node.status !== 'done') {
      warnings.push({
        type: 'status_inconsistency',
        taskId: node.id,
        message: 'All children complete but parent not marked as done',
        details: {
          parentStatus: node.status,
          childrenCount: children.length,
          completedCount: children.filter((child) => child.status === 'done').length,
        },
      });
    }
  });

  return warnings;
}

/**
 * Validates a move operation before execution to prevent structural violations
 *
 * Pre-validation for tree rearrangement operations that could introduce cycles
 * or violate tree integrity. This is critical for maintaining the DAG (Directed
 * Acyclic Graph) property of task hierarchies.
 *
 * @param taskId - ID of the task to be moved
 * @param newParentId - ID of the new parent (null for root level)
 * @param existingTree - Current tree structure for validation context
 * @returns Validation result indicating if move is safe to perform
 *
 * @complexity O(h) where h = tree height (for ancestor checking)
 *
 * @sideEffects None - pure validation, does not modify tree structure
 *
 * @algorithm
 * 1. Handle root moves (always safe)
 * 2. Validate both source and target tasks exist
 * 3. Use isAncestorOf() to detect potential cycles
 * 4. Return detailed error context for debugging
 *
 * @prevention
 * - Prevents moving a task to its own descendant (cycle creation)
 * - Validates existence of both source and target nodes
 * - Maintains referential integrity of parent-child relationships
 */
export function validateMoveOperation(
  taskId: string,
  newParentId: string | null,
  existingTree: TaskTree
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!newParentId) {
    // Moving to root is always safe
    return { isValid: true, errors, warnings };
  }

  // Find the task being moved and the target parent
  const taskToMove = existingTree.find((task) => task.id === taskId);
  const targetParent = existingTree.find((task) => task.id === newParentId);

  if (!taskToMove) {
    errors.push({
      type: 'invalid_parent',
      taskId,
      message: `Task to move not found: "${taskId}"`,
    });
  }

  if (!targetParent) {
    errors.push({
      type: 'invalid_parent',
      taskId: newParentId,
      message: `Target parent not found: "${newParentId}"`,
    });
  }

  if (!taskToMove || !targetParent) {
    return { isValid: false, errors, warnings };
  }

  // Check if the target parent is a descendant of the task being moved
  if (taskToMove.isAncestorOf(targetParent)) {
    errors.push({
      type: 'cycle',
      taskId,
      message: `Cannot move task "${taskToMove.title}" to descendant "${targetParent.title}" - would create cycle`,
      details: {
        taskTitle: taskToMove.title,
        targetTitle: targetParent.title,
        wouldCreateCycle: true,
      },
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates multiple task trees for consistency across a forest
 */
export function validateTaskForest(
  trees: TaskTree[],
  options: ValidationOptions = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const allTaskIds = new Set<string>();

  // First, validate each tree individually
  for (const tree of trees) {
    const result = validateTaskTree(tree, options);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    // Collect all task IDs across trees
    tree.walkDepthFirst((node) => {
      if (allTaskIds.has(node.id)) {
        errors.push({
          type: 'duplicate_id',
          taskId: node.id,
          message: `Task ID "${node.id}" appears in multiple trees`,
          details: { title: node.title },
        });
      }
      allTaskIds.add(node.id);
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface ValidationOptions {
  maxDepth?: number;
  checkStatusConsistency?: boolean;
  allowOrphanedTasks?: boolean;
}

const defaultValidationOptions: ValidationOptions = {
  maxDepth: VALIDATION_CONFIG.DEFAULT_MAX_DEPTH,
  checkStatusConsistency: VALIDATION_CONFIG.DEFAULT_CHECK_STATUS_CONSISTENCY,
  allowOrphanedTasks: false,
};

/**
 * Validation helper for TaskTreeData schema validation
 */
export function validateTaskTreeData(data: unknown): data is TaskTreeData {
  return taskTreeSchema.safeParse(data).success;
}