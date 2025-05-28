/**
 * Task operation handlers for MCP server
 *
 * Extracted from main server class to improve separation of concerns
 * and reduce file size.
 */

import type { HandlerContext, CreateTaskInput, UpdateTaskInput, DeleteTaskInput, CompleteTaskInput, GetTaskContextInput, ListTasksInput } from './types.js';
import type { Task, TaskTree } from '@astrolabe/core';

export interface TaskContext {
  task: Task;
  ancestors: Task[];
  descendants: Task[];
  relatedTasks: Task[];
  metadata: {
    totalSubtasks: number;
    completedSubtasks: number;
    pendingSubtasks: number;
  };
}

export class TaskHandlers {
  constructor(readonly context: HandlerContext) { }

  async listTasks(args: ListTasksInput): Promise<Task[] | any[]> {
    // Use synthetic root with predicate filtering for all cases
    const syntheticTree = await this.context.taskService.getTaskTree();
    if (!syntheticTree) {
      return [];
    }

    // Build predicate based on filter arguments
    let predicate: (task: Task) => boolean = () => true;
    
    if (args.parentId && args.status) {
      // Both parentId and status filters
      predicate = (task: Task) => task.parentId === args.parentId && task.status === args.status;
    } else if (args.parentId) {
      // Filter by parentId only
      predicate = (task: Task) => task.parentId === args.parentId;
    } else if (args.status) {
      // Filter by status only
      predicate = (task: Task) => task.status === args.status;
    }
    // For no filters, predicate remains () => true

    // Apply predicate filtering to get matching TaskTree instances
    const filteredTrees = syntheticTree.filter(predicate);

    if (args.includeSubtasks) {
      // Return TaskTree objects converted to plain objects for MCP serialization
      return filteredTrees.map(tree => tree.toPlainObject());
    } else {
      // Return just the tasks (without subtree structure)
      return filteredTrees.map(tree => tree.task);
    }
  }

  async createTask(args: CreateTaskInput): Promise<Task> {
    return await this.context.store.addTask({
      title: args.title,
      description: args.description,
      parentId: args.parentId,
      status: args.status ?? 'pending' as const,
      priority: args.priority ?? 'medium' as const,
      prd: args.prd,
      contextDigest: args.contextDigest,
    });
  }

  async updateTask(args: UpdateTaskInput): Promise<Task> {
    const existingTask = await this.context.store.getTask(args.id);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    const updatedTask = await this.context.store.updateTask(args.id, {
      title: args.title,
      description: args.description,
      status: args.status,
      priority: args.priority,
      parentId: args.parentId,
      prd: args.prd,
      contextDigest: args.contextDigest,
    });

    if (!updatedTask) {
      throw new Error('Failed to update task');
    }

    return updatedTask;
  }

  async deleteTask(args: DeleteTaskInput): Promise<{ success: boolean; message: string }> {
    const existingTask = await this.context.store.getTask(args.id);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    if (args.cascade) {
      await this.context.taskService.deleteTaskTree(args.id, true);
    } else {
      // Check if task has subtasks
      const subtasks = await this.context.store.listTasks({ parentId: args.id });
      if (subtasks.length > 0) {
        throw new Error('Cannot delete task with subtasks without cascade option');
      }
      await this.context.store.deleteTask(args.id);
    }

    return {
      success: true,
      message: `Task ${args.id} deleted${args.cascade ? ' with all subtasks' : ''}`
    };
  }

  async completeTask(args: CompleteTaskInput): Promise<Task> {
    const existingTask = await this.context.store.getTask(args.id);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    const completedTask = await this.context.store.updateTask(args.id, {
      status: 'done',
    });

    if (!completedTask) {
      throw new Error('Failed to complete task');
    }

    return completedTask;
  }

  async getTaskContext(args: GetTaskContextInput): Promise<TaskContext> {
    // Use the optimized getTaskWithContext method that handles everything in one call
    const taskWithContext = await this.context.taskService.getTaskWithContext(args.id);
    if (!taskWithContext) {
      throw new Error('Task not found');
    }

    const context: TaskContext = {
      task: taskWithContext.task,
      ancestors: args.includeAncestors ? taskWithContext.ancestors : [],
      descendants: args.includeDescendants ? taskWithContext.descendants.map(tree => tree.task) : [],
      relatedTasks: [],
      metadata: {
        totalSubtasks: 0,
        completedSubtasks: 0,
        pendingSubtasks: 0,
      },
    };

    // Calculate metadata from direct subtasks
    const allSubtasks = await this.context.store.listTasks({ parentId: taskWithContext.task.id });
    context.metadata.totalSubtasks = allSubtasks.length;
    context.metadata.completedSubtasks = allSubtasks.filter((t: Task) => t.status === 'done').length;
    context.metadata.pendingSubtasks = allSubtasks.filter((t: Task) => t.status === 'pending').length;

    return context;
  }
}
