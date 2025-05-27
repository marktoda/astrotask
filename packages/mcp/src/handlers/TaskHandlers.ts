/**
 * Task operation handlers for MCP server
 *
 * Extracted from main server class to improve separation of concerns
 * and reduce file size.
 */

import type { HandlerContext, CreateTaskInput, UpdateTaskInput, DeleteTaskInput, CompleteTaskInput, GetTaskContextInput, ListTasksInput } from './types.js';
import type { Task } from '@astrolabe/core';

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

  async listTasks(args: ListTasksInput): Promise<Task[] | Array<NonNullable<Awaited<ReturnType<typeof this.context.taskService.getTaskTree>>>>> {
    let tasks: Task[];

    if (args.parentId) {
      // Get subtasks of a specific parent
      tasks = await this.context.store.listTasks({ parentId: args.parentId });
    } else if (args.status) {
      // Filter by status
      tasks = await this.context.store.listTasks({ status: args.status });
    } else {
      // Get all tasks
      tasks = await this.context.store.listTasks({});
    }

    if (args.includeSubtasks) {
      // Get all subtasks for each task
      const taskTrees = await Promise.all(
        tasks.map((task: Task) => this.context.taskService.getTaskTree(task.id))
      );

      // Filter out null results and extract tasks
      return taskTrees.filter((tree): tree is NonNullable<typeof tree> => tree !== null);
    }

    return tasks;
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
    const task = await this.context.store.getTask(args.id);
    if (!task) {
      throw new Error('Task not found');
    }

    const context: TaskContext = {
      task,
      ancestors: [],
      descendants: [],
      relatedTasks: [],
      metadata: {
        totalSubtasks: 0,
        completedSubtasks: 0,
        pendingSubtasks: 0,
      },
    };

    // Get ancestors if requested
    if (args.includeAncestors) {
      context.ancestors = await this.context.taskService.getTaskAncestors(args.id);
    }

    // Get descendants if requested
    if (args.includeDescendants) {
      context.descendants = await this.context.taskService.getTaskDescendants(args.id);
    }

    // Calculate metadata
    const allSubtasks = await this.context.store.listTasks({ parentId: task.id });
    context.metadata.totalSubtasks = allSubtasks.length;
    context.metadata.completedSubtasks = allSubtasks.filter((t: Task) => t.status === 'done').length;
    context.metadata.pendingSubtasks = allSubtasks.filter((t: Task) => t.status === 'pending').length;

    return context;
  }
}
