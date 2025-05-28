/**
 * Dependency operation handlers for MCP server
 *
 * Provides MCP functions for managing task dependencies, including
 * adding/removing dependencies, validation, and dependency-aware operations.
 */

import type { HandlerContext } from './types.js';
import type { 
  Task, 
  TaskDependency, 
  TaskDependencyGraph, 
  TaskWithDependencies,
  DependencyValidationResult,
  StatusTransitionResult
} from '@astrolabe/core';

/**
 * Input schemas for dependency operations
 */
export interface AddTaskDependencyInput {
  dependentTaskId: string;
  dependencyTaskId: string;
}

export interface RemoveTaskDependencyInput {
  dependentTaskId: string;
  dependencyTaskId: string;
}

export interface GetTaskDependenciesInput {
  taskId: string;
}

export interface ValidateTaskDependencyInput {
  dependentTaskId: string;
  dependencyTaskId: string;
}

export interface GetAvailableTasksInput {
  status?: string;
  priority?: string;
}

export interface UpdateTaskStatusInput {
  taskId: string;
  status: string;
  force?: boolean;
}

export interface GetTasksWithDependenciesInput {
  taskIds: string[];
}

/**
 * Enhanced task context that includes dependency information
 */
export interface TaskContextWithDependencies {
  task: Task;
  ancestors: Task[];
  descendants: Task[];
  dependencies: Task[];
  dependents: Task[];
  isBlocked: boolean;
  blockedBy: Task[];
  metadata: {
    totalSubtasks: number;
    completedSubtasks: number;
    pendingSubtasks: number;
    totalDependencies: number;
    totalDependents: number;
    blockedDependents: number;
  };
}

export class DependencyHandlers {
  constructor(readonly context: HandlerContext) {}

  /**
   * Add a dependency relationship between two tasks
   */
  async addTaskDependency(args: AddTaskDependencyInput): Promise<TaskDependency> {
    return await this.context.taskService.addTaskDependency(
      args.dependentTaskId,
      args.dependencyTaskId
    );
  }

  /**
   * Remove a dependency relationship between two tasks
   */
  async removeTaskDependency(args: RemoveTaskDependencyInput): Promise<{ success: boolean; message: string }> {
    const removed = await this.context.taskService.removeTaskDependency(
      args.dependentTaskId,
      args.dependencyTaskId
    );

    return {
      success: removed,
      message: removed 
        ? 'Dependency removed successfully'
        : 'Dependency not found or could not be removed'
    };
  }

  /**
   * Get dependency graph information for a task
   */
  async getTaskDependencies(args: GetTaskDependenciesInput): Promise<TaskDependencyGraph> {
    return await this.context.taskService.getTaskDependencyGraph(args.taskId);
  }

  /**
   * Validate if a dependency can be safely added
   */
  async validateTaskDependency(args: ValidateTaskDependencyInput): Promise<DependencyValidationResult> {
    return await this.context.taskService.validateTaskDependency(
      args.dependentTaskId,
      args.dependencyTaskId
    );
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies)
   */
  async getAvailableTasks(args: GetAvailableTasksInput): Promise<Task[]> {
    const filter: { status?: any; priority?: string } = {};
    
    if (args.status) {
      filter.status = args.status as any;
    }
    if (args.priority) {
      filter.priority = args.priority;
    }

    return await this.context.taskService.getAvailableTasks(filter);
  }

  /**
   * Update task status with dependency validation
   */
  async updateTaskStatus(args: UpdateTaskStatusInput): Promise<{
    success: boolean;
    task?: Task;
    blocked?: Task[];
    validation?: StatusTransitionResult;
    message: string;
  }> {
    const result = await this.context.taskService.updateTaskStatus(
      args.taskId,
      args.status as any,
      { force: args.force }
    );

    if (result.success) {
      const updatedTask = await this.context.store.getTask(args.taskId);
      return {
        success: true,
        task: updatedTask || undefined,
        validation: result.validation,
        message: 'Task status updated successfully'
      };
    } else {
      return {
        success: false,
        blocked: result.blocked,
        validation: result.validation,
        message: result.validation?.reason || 'Status update failed'
      };
    }
  }

  /**
   * Get multiple tasks with their dependency information
   */
  async getTasksWithDependencies(args: GetTasksWithDependenciesInput): Promise<TaskWithDependencies[]> {
    return await this.context.taskService.getTasksWithDependencies(args.taskIds);
  }

  /**
   * Enhanced task context that includes dependency information
   */
  async getTaskContextWithDependencies(args: GetTaskDependenciesInput): Promise<TaskContextWithDependencies> {
    const taskWithContext = await this.context.taskService.getTaskWithContext(args.taskId);
    if (!taskWithContext) {
      throw new Error('Task not found');
    }

    // Calculate metadata from direct subtasks
    const allSubtasks = await this.context.store.listTasks({ parentId: taskWithContext.task.id });
    
    // Calculate blocked dependents
    const dependentGraphs = await Promise.all(
      taskWithContext.dependents.map(dep => 
        this.context.taskService.getTaskDependencyGraph(dep.id)
      )
    );
    const blockedDependents = dependentGraphs.filter(graph => graph.isBlocked).length;

    return {
      task: taskWithContext.task,
      ancestors: taskWithContext.ancestors,
      descendants: taskWithContext.descendants.map(tree => tree.task),
      dependencies: taskWithContext.dependencies,
      dependents: taskWithContext.dependents,
      isBlocked: taskWithContext.isBlocked,
      blockedBy: taskWithContext.blockedBy,
      metadata: {
        totalSubtasks: allSubtasks.length,
        completedSubtasks: allSubtasks.filter((t: Task) => t.status === 'done').length,
        pendingSubtasks: allSubtasks.filter((t: Task) => t.status === 'pending').length,
        totalDependencies: taskWithContext.dependencies.length,
        totalDependents: taskWithContext.dependents.length,
        blockedDependents,
      },
    };
  }

  /**
   * Get all blocked tasks in the system
   */
  async getBlockedTasks(): Promise<TaskWithDependencies[]> {
    // Get all tasks and filter for blocked ones
    const allTasks = await this.context.store.listTasks({});
    const tasksWithDeps = await this.context.taskService.getTasksWithDependencies(
      allTasks.map(t => t.id)
    );
    
    return tasksWithDeps.filter(task => task.isBlocked);
  }

  /**
   * Get topological order for a set of tasks
   */
  async getTopologicalOrder(args: { taskIds: string[] }): Promise<{ order: string[]; cycles?: string[][] }> {
    try {
      const order = await this.context.taskService.getTopologicalOrder(args.taskIds);
      return { order };
    } catch (error) {
      // If there are cycles, try to detect them
      const cycles = await this.context.taskService.findDependencyCycles();
      return { 
        order: [], 
        cycles: cycles.length > 0 ? cycles : undefined 
      };
    }
  }
} 