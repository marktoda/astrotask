/**
 * Tree Adapters Module
 * 
 * Provides adapters to make TaskTree and TrackingTaskTree compatible with
 * the generic TreeNode interface, allowing them to use common tree operations.
 */

import type { Task } from '../schemas/index.js';
import type { TaskTree } from './TaskTree.js';
import type { TrackingTaskTree } from './TrackingTaskTree.js';
import type { TreeNode } from './tree-operations.js';

/**
 * Adapter to make TaskTree compatible with TreeNode interface
 */
export class TaskTreeAdapter implements TreeNode<Task> {
  constructor(private readonly taskTree: TaskTree) {}

  get id(): string {
    return this.taskTree.id;
  }

  getParent(): TaskTreeAdapter | null {
    const parent = this.taskTree.getParent();
    return parent ? new TaskTreeAdapter(parent) : null;
  }

  getChildren(): readonly TaskTreeAdapter[] {
    return this.taskTree.getChildren().map(child => new TaskTreeAdapter(child));
  }

  getData(): Task {
    return this.taskTree.task;
  }

  /**
   * Get the underlying TaskTree
   */
  getTaskTree(): TaskTree {
    return this.taskTree;
  }

  /**
   * Create adapter from TaskTree
   */
  static from(taskTree: TaskTree): TaskTreeAdapter {
    return new TaskTreeAdapter(taskTree);
  }
}

/**
 * Adapter to make TrackingTaskTree compatible with TreeNode interface
 */
export class TrackingTaskTreeAdapter implements TreeNode<Task> {
  constructor(private readonly trackingTree: TrackingTaskTree) {}

  get id(): string {
    return this.trackingTree.id;
  }

  getParent(): TrackingTaskTreeAdapter | null {
    const parent = this.trackingTree.getParent();
    return parent ? new TrackingTaskTreeAdapter(parent) : null;
  }

  getChildren(): readonly TrackingTaskTreeAdapter[] {
    return this.trackingTree.getChildren().map(child => new TrackingTaskTreeAdapter(child));
  }

  getData(): Task {
    return this.trackingTree.task;
  }

  /**
   * Get the underlying TrackingTaskTree
   */
  getTrackingTree(): TrackingTaskTree {
    return this.trackingTree;
  }

  /**
   * Create adapter from TrackingTaskTree
   */
  static from(trackingTree: TrackingTaskTree): TrackingTaskTreeAdapter {
    return new TrackingTaskTreeAdapter(trackingTree);
  }
}

/**
 * Utility functions for working with adapted trees
 */
export class TreeAdapterUtils {
  /**
   * Convert adapter results back to original tree type
   */
  static unwrapTaskTrees(adapters: TaskTreeAdapter[]): TaskTree[] {
    return adapters.map(adapter => adapter.getTaskTree());
  }

  /**
   * Convert adapter results back to original tracking tree type
   */
  static unwrapTrackingTrees(adapters: TrackingTaskTreeAdapter[]): TrackingTaskTree[] {
    return adapters.map(adapter => adapter.getTrackingTree());
  }

  /**
   * Create a map of adapters for batch operations
   */
  static createAdapterMap<T extends TaskTree | TrackingTaskTree>(
    trees: T[]
  ): Map<string, TreeNode<Task>> {
    const map = new Map<string, TreeNode<Task>>();
    
    for (const tree of trees) {
      if ('getOperations' in tree) {
        // TrackingTaskTree
        map.set(tree.id, new TrackingTaskTreeAdapter(tree as TrackingTaskTree));
      } else {
        // TaskTree
        map.set(tree.id, new TaskTreeAdapter(tree as TaskTree));
      }
    }
    
    return map;
  }
} 