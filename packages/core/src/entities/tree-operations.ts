/**
 * Common Tree Operations Module
 *
 * Provides reusable tree traversal and manipulation utilities that can be used
 * by TaskTree, TrackingTaskTree, and other tree structures in the application.
 *
 * This module extracts common patterns to reduce code duplication and ensure
 * consistent tree operations across the codebase.
 */

/**
 * Generic tree node interface
 */
export interface TreeNode<T> {
  id: string;
  getParent(): TreeNode<T> | null;
  getChildren(): readonly TreeNode<T>[];
  getData(): T;
}

/**
 * Tree visitor function type
 * Returns false to stop traversal, void to continue
 */
export type TreeVisitor<T> = (node: TreeNode<T>) => undefined | false;

/**
 * Tree predicate function type
 */
export type TreePredicate<T> = (data: T) => boolean;

/**
 * Common tree traversal algorithms
 */
export class TreeTraversal {
  /**
   * Depth-first search (pre-order) traversal
   * Visits parent before children
   */
  static walkDepthFirst<T>(root: TreeNode<T>, visitor: TreeVisitor<T>): void {
    const shouldContinue = visitor(root);
    if (shouldContinue === false) return;

    for (const child of root.getChildren()) {
      TreeTraversal.walkDepthFirst(child, visitor);
    }
  }

  /**
   * Breadth-first search (level-order) traversal
   * Visits all nodes at current depth before moving to next depth
   */
  static walkBreadthFirst<T>(root: TreeNode<T>, visitor: TreeVisitor<T>): void {
    const queue: TreeNode<T>[] = [root];

    while (queue.length > 0) {
      const node = queue.shift()!;
      visitor(node);
      queue.push(...node.getChildren());
    }
  }

  /**
   * Post-order depth-first traversal
   * Visits children before parent
   */
  static walkPostOrder<T>(root: TreeNode<T>, visitor: TreeVisitor<T>): void {
    for (const child of root.getChildren()) {
      TreeTraversal.walkPostOrder(child, visitor);
    }
    visitor(root);
  }
}

/**
 * Common tree search operations
 */
export class TreeSearch {
  /**
   * Find the first node matching a predicate
   */
  static find<T>(root: TreeNode<T>, predicate: TreePredicate<T>): TreeNode<T> | null {
    if (predicate(root.getData())) return root;

    for (const child of root.getChildren()) {
      const found = TreeSearch.find(child, predicate);
      if (found) return found;
    }

    return null;
  }

  /**
   * Find all nodes matching a predicate
   */
  static filter<T>(root: TreeNode<T>, predicate: TreePredicate<T>): TreeNode<T>[] {
    const results: TreeNode<T>[] = [];

    TreeTraversal.walkDepthFirst(root, (node) => {
      if (predicate(node.getData())) {
        results.push(node);
      }
      return undefined;
    });

    return results;
  }

  /**
   * Find the path from root to a specific node
   */
  static findPath<T>(root: TreeNode<T>, targetId: string): TreeNode<T>[] | null {
    if (root.id === targetId) return [root];

    for (const child of root.getChildren()) {
      const path = TreeSearch.findPath(child, targetId);
      if (path) return [root, ...path];
    }

    return null;
  }
}

/**
 * Common tree analysis operations
 */
export class TreeAnalysis {
  /**
   * Calculate the depth of a node (distance from root)
   */
  static getDepth<T>(node: TreeNode<T>): number {
    let depth = 0;
    let current = node.getParent();

    while (current) {
      depth++;
      current = current.getParent();
    }

    return depth;
  }

  /**
   * Calculate the height of a tree (max distance to any leaf)
   */
  static getHeight<T>(root: TreeNode<T>): number {
    if (root.getChildren().length === 0) return 0;

    let maxHeight = 0;
    for (const child of root.getChildren()) {
      maxHeight = Math.max(maxHeight, TreeAnalysis.getHeight(child));
    }

    return maxHeight + 1;
  }

  /**
   * Count total nodes in the tree
   */
  static countNodes<T>(root: TreeNode<T>): number {
    let count = 0;
    TreeTraversal.walkDepthFirst(root, () => {
      count++;
      return undefined;
    });
    return count;
  }

  /**
   * Get all leaf nodes (nodes with no children)
   */
  static getLeafNodes<T>(root: TreeNode<T>): TreeNode<T>[] {
    const leaves: TreeNode<T>[] = [];

    TreeTraversal.walkDepthFirst(root, (node) => {
      if (node.getChildren().length === 0) {
        leaves.push(node);
      }
      return undefined;
    });

    return leaves;
  }

  /**
   * Check if one node is an ancestor of another
   */
  static isAncestorOf<T>(ancestor: TreeNode<T>, descendant: TreeNode<T>): boolean {
    let current = descendant.getParent();

    while (current) {
      if (current.id === ancestor.id) return true;
      current = current.getParent();
    }

    return false;
  }

  /**
   * Get all ancestors of a node (path to root)
   */
  static getAncestors<T>(node: TreeNode<T>): TreeNode<T>[] {
    const ancestors: TreeNode<T>[] = [];
    let current = node.getParent();

    while (current) {
      ancestors.push(current);
      current = current.getParent();
    }

    return ancestors;
  }

  /**
   * Get all descendants of a node
   */
  static getDescendants<T>(node: TreeNode<T>): TreeNode<T>[] {
    const descendants: TreeNode<T>[] = [];

    TreeTraversal.walkDepthFirst(node, (descendant) => {
      if (descendant.id !== node.id) {
        descendants.push(descendant);
      }
      return undefined;
    });

    return descendants;
  }

  /**
   * Get siblings of a node
   */
  static getSiblings<T>(node: TreeNode<T>): TreeNode<T>[] {
    const parent = node.getParent();
    if (!parent) return [];

    return parent.getChildren().filter((child) => child.id !== node.id) as TreeNode<T>[];
  }
}

/**
 * Tree transformation utilities
 */
export class TreeTransform {
  /**
   * Map tree nodes to a new structure
   */
  static map<T, U>(
    root: TreeNode<T>,
    transformer: (node: TreeNode<T>) => U
  ): { data: U; children: Array<{ data: U; children: unknown[] }> } {
    return {
      data: transformer(root),
      children: root.getChildren().map((child) => TreeTransform.map(child, transformer)),
    };
  }

  /**
   * Prune tree based on predicate (keeps node if predicate is true)
   */
  static prune<T>(root: TreeNode<T>, shouldKeep: TreePredicate<T>): TreeNode<T> | null {
    if (!shouldKeep(root.getData())) return null;

    // For actual implementation, would need to create new node with filtered children
    // This is a conceptual implementation
    return root;
  }

  /**
   * Flatten tree to array using specified traversal
   */
  static flatten<T>(
    root: TreeNode<T>,
    traversalType: 'depth-first' | 'breadth-first' = 'depth-first'
  ): TreeNode<T>[] {
    const nodes: TreeNode<T>[] = [];

    if (traversalType === 'depth-first') {
      TreeTraversal.walkDepthFirst(root, (node) => {
        nodes.push(node);
        return undefined;
      });
    } else {
      TreeTraversal.walkBreadthFirst(root, (node) => {
        nodes.push(node);
        return undefined;
      });
    }

    return nodes;
  }
}

/**
 * Tree validation utilities
 */
export class TreeValidation {
  /**
   * Check if tree has cycles (should always be false for valid trees)
   */
  static hasCycles<T>(root: TreeNode<T>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function dfs(node: TreeNode<T>): boolean {
      if (recursionStack.has(node.id)) return true;
      if (visited.has(node.id)) return false;

      visited.add(node.id);
      recursionStack.add(node.id);

      for (const child of node.getChildren()) {
        if (dfs(child)) return true;
      }

      recursionStack.delete(node.id);
      return false;
    }

    return dfs(root);
  }

  /**
   * Validate parent-child relationships
   */
  static validateRelationships<T>(root: TreeNode<T>): string[] {
    const errors: string[] = [];

    TreeTraversal.walkDepthFirst(root, (node) => {
      // Check if children reference this node as parent
      for (const child of node.getChildren()) {
        const childParent = child.getParent();
        if (!childParent || childParent.id !== node.id) {
          errors.push(`Child ${child.id} does not correctly reference parent ${node.id}`);
        }
      }
      return undefined;
    });

    return errors;
  }
}

/**
 * Batch tree operations for performance
 */
export class TreeBatch {
  /**
   * Find multiple nodes in a single traversal
   */
  static findMany<T>(
    root: TreeNode<T>,
    predicates: Map<string, TreePredicate<T>>
  ): Map<string, TreeNode<T>[]> {
    const results = new Map<string, TreeNode<T>[]>();

    // Initialize result arrays
    for (const [key] of predicates) {
      results.set(key, []);
    }

    // Single traversal for all predicates
    TreeTraversal.walkDepthFirst(root, (node) => {
      for (const [key, predicate] of predicates) {
        if (predicate(node.getData())) {
          results.get(key)?.push(node);
        }
      }
      return undefined;
    });

    return results;
  }

  /**
   * Collect statistics in a single traversal
   */
  static collectStats<T>(
    root: TreeNode<T>,
    collectors: Map<string, (node: TreeNode<T>) => void>
  ): void {
    TreeTraversal.walkDepthFirst(root, (node) => {
      for (const [, collector] of collectors) {
        collector(node);
      }
      return undefined;
    });
  }
}
