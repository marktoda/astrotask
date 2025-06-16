/**
 * Tree Operations Example
 *
 * This file demonstrates how TaskTree and TrackingTaskTree can be refactored
 * to use the common tree operations, reducing code duplication.
 *
 * NOTE: This is an example file showing the refactoring approach.
 * Actual refactoring would be done in the TaskTree and TrackingTaskTree files.
 */

import type { Task } from '../schemas/index.js';
import type { TaskTree } from './TaskTree.js';
import { TaskTreeAdapter } from './tree-adapters.js';
import {
  TreeAnalysis,
  TreeBatch,
  type TreePredicate,
  TreeSearch,
  TreeTraversal,
} from './tree-operations.js';

/**
 * Example: Refactored TaskTree methods using common operations
 */
export class TaskTreeRefactored {
  /**
   * Original walkDepthFirst can be replaced with:
   */
  static walkDepthFirst(taskTree: TaskTree, visitor: (node: TaskTree) => undefined | false): void {
    const adapter = TaskTreeAdapter.from(taskTree);
    TreeTraversal.walkDepthFirst(adapter, (node) => {
      const taskTreeNode = (node as TaskTreeAdapter).getTaskTree();
      return visitor(taskTreeNode);
    });
  }

  /**
   * Original walkBreadthFirst can be replaced with:
   */
  static walkBreadthFirst(taskTree: TaskTree, visitor: (node: TaskTree) => void): void {
    const adapter = TaskTreeAdapter.from(taskTree);
    TreeTraversal.walkBreadthFirst(adapter, (node) => {
      const taskTreeNode = (node as TaskTreeAdapter).getTaskTree();
      visitor(taskTreeNode);
      return undefined;
    });
  }

  /**
   * Original find can be replaced with:
   */
  static find(taskTree: TaskTree, predicate: (task: Task) => boolean): TaskTree | null {
    const adapter = TaskTreeAdapter.from(taskTree);
    const found = TreeSearch.find(adapter, predicate);
    return found ? (found as TaskTreeAdapter).getTaskTree() : null;
  }

  /**
   * Original filter can be replaced with:
   */
  static filter(taskTree: TaskTree, predicate: (task: Task) => boolean): TaskTree[] {
    const adapter = TaskTreeAdapter.from(taskTree);
    const results = TreeSearch.filter(adapter, predicate);
    return results.map((node) => (node as TaskTreeAdapter).getTaskTree());
  }

  /**
   * Original getDepth can be replaced with:
   */
  static getDepth(taskTree: TaskTree): number {
    const adapter = TaskTreeAdapter.from(taskTree);
    return TreeAnalysis.getDepth(adapter);
  }

  /**
   * Original countNodes can be replaced with:
   */
  static countNodes(taskTree: TaskTree): number {
    const adapter = TaskTreeAdapter.from(taskTree);
    return TreeAnalysis.countNodes(adapter);
  }

  /**
   * Original isAncestorOf can be replaced with:
   */
  static isAncestorOf(ancestor: TaskTree, descendant: TaskTree): boolean {
    const ancestorAdapter = TaskTreeAdapter.from(ancestor);
    const descendantAdapter = TaskTreeAdapter.from(descendant);
    return TreeAnalysis.isAncestorOf(ancestorAdapter, descendantAdapter);
  }

  /**
   * New functionality: Get all leaf tasks (tasks with no children)
   */
  static getLeafTasks(taskTree: TaskTree): TaskTree[] {
    const adapter = TaskTreeAdapter.from(taskTree);
    const leaves = TreeAnalysis.getLeafNodes(adapter);
    return leaves.map((node) => (node as TaskTreeAdapter).getTaskTree());
  }

  /**
   * New functionality: Get tree height
   */
  static getHeight(taskTree: TaskTree): number {
    const adapter = TaskTreeAdapter.from(taskTree);
    return TreeAnalysis.getHeight(adapter);
  }

  /**
   * New functionality: Batch find operations
   */
  static batchFind(
    taskTree: TaskTree,
    predicates: Map<string, TreePredicate<Task>>
  ): Map<string, TaskTree[]> {
    const adapter = TaskTreeAdapter.from(taskTree);
    const results = TreeBatch.findMany(adapter, predicates);

    const taskTreeResults = new Map<string, TaskTree[]>();
    for (const [key, nodes] of results) {
      taskTreeResults.set(
        key,
        nodes.map((node) => (node as TaskTreeAdapter).getTaskTree())
      );
    }

    return taskTreeResults;
  }
}

/**
 * Example usage showing the benefits
 */
export function demonstrateUsage(taskTree: TaskTree): void {
  // Find all high-priority pending tasks in a single traversal
  const predicates = new Map<string, TreePredicate<Task>>([
    ['highPriority', (task) => task.priorityScore > 70],
    ['pending', (task) => task.status === 'pending'],
    ['hasDescription', (task) => task.description !== null],
  ]);

  TaskTreeRefactored.batchFind(taskTree, predicates);

  // Get tree statistics
  TaskTreeRefactored.getDepth(taskTree);
  TaskTreeRefactored.getHeight(taskTree);
  TaskTreeRefactored.countNodes(taskTree);
  TaskTreeRefactored.getLeafTasks(taskTree);
}

/**
 * Migration guide for refactoring existing code
 *
 * 1. Replace direct method calls with static utility calls:
 *    Before: taskTree.walkDepthFirst(visitor)
 *    After:  TaskTreeRefactored.walkDepthFirst(taskTree, visitor)
 *
 * 2. Use adapters for new functionality:
 *    const adapter = TaskTreeAdapter.from(taskTree);
 *    const ancestors = TreeAnalysis.getAncestors(adapter);
 *
 * 3. Batch operations for performance:
 *    Instead of multiple find() calls, use batchFind() for single traversal
 *
 * 4. Consistent error handling and validation:
 *    Use TreeValidation utilities for consistent validation
 */
