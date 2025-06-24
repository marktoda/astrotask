/**
 * Ultra-Minimal MCP Handlers
 * 
 * Implements only the 6 essential tools for AI agent task management:
 * - getNextTask: Get next available task to work on (with optional parent)
 * - addTasks: Create tasks in batch (with dependencies and hierarchies)
 * - addTaskContext: Add context slice to a task
 * - addDependency: Add dependency relationships
 * - updateStatus: Update task status (pending, in-progress, done, etc.)
 * - listTasks: List tasks with optional filters
 */

import type { Task, TaskStatus } from '@astrotask/core';
import type { TaskDependency, ContextSlice, TaskTreeData } from '@astrotask/core';
import { TASK_IDENTIFIERS } from '@astrotask/core';
import { validateTaskId } from '@astrotask/core';
import { createModuleLogger } from '@astrotask/core';
import type { HandlerContext, MCPHandler } from './types.js';
import type {
  GetNextTaskInput,
  GetTaskInput,
  AddTaskInput,
  AddTaskContextInput,
  AddDependencyInput,
  UpdateStatusInput,
  DeleteTaskInput,
} from './types.js';

export class MinimalHandlers implements MCPHandler {
  private logger = createModuleLogger('MinimalHandlers');

  constructor(public readonly context: HandlerContext) {}

  /**
   * Get the next available task to work on
   */
  async getNextTask(args: GetNextTaskInput = {}): Promise<{
    task: Task | null;
    availableTasks: Task[];
    message: string;
    context?: {
      ancestors: Task[];
      descendants: TaskTreeData[];
      root: TaskTreeData | null;
      dependencies: Task[];
      dependents: Task[];
      isBlocked: boolean;
      blockedBy: Task[];
      contextSlices: ContextSlice[];
      parentTask?: Task;
      siblings?: Task[];
    };
  }> {
    try {
      // NEW TREE API: Much simpler and more intelligent
      const filter = {
        status: args.status,
        priorityScore: args.priorityScore,
        parentId: args.parentTaskId,
      };

      // Get next task using the enhanced tree-centric API
      const nextTaskTree = await this.context.astrotask.getNextTask(filter);
      const availableTaskTrees = await this.context.astrotask.getAvailableTasks(filter);
      
      // Convert to plain tasks for response compatibility
      const nextTask = nextTaskTree?.task || null;
      const availableTasks = availableTaskTrees.map(tree => tree.task);

      const message = nextTask 
        ? `Recommended task: ${nextTask.title}` 
        : availableTasks.length === 0 
          ? 'No available tasks found'
          : 'No unblocked tasks available';

      let context = undefined;

      // Enhanced context using tree API
      if (nextTaskTree) {
        const contextSlices = await this.context.astrotask.store.listContextSlices(nextTask!.id);
        
        context = {
          // Tree context
          ancestors: nextTaskTree.getPath().slice(0, -1).map(node => node.task),
          descendants: nextTaskTree.getAllDescendants().map(node => node.toPlainObject()),
          root: nextTaskTree.getRoot().toPlainObject(),
          
          // Enhanced dependency context
          dependencies: [], // Would need to fetch full Task objects for blocking tasks
          dependents: [], // Would need dependency graph for this
          isBlocked: nextTaskTree.isBlocked(),
          blockedBy: [], // Would need to fetch full Task objects for blocking tasks
          
          
          contextSlices,
        };
      }

      return {
        task: nextTask,
        availableTasks,
        message,
        context
      };
    } catch (error) {
      this.logger.error('Getting next task failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Get a specific task by ID with full context
   */
  async getTask(args: GetTaskInput): Promise<{
    task: Task | null;
    message: string;
    context?: {
      ancestors: Task[];
      descendants: TaskTreeData[];
      root: TaskTreeData | null;
      dependencies: Task[];
      dependents: Task[];
      isBlocked: boolean;
      blockedBy: Task[];
      contextSlices: ContextSlice[];
    };
  }> {
    try {
      // Get the task by ID
      const task = await this.context.astrotask.store.getTask(args.taskId);
      
      if (!task) {
        return {
          task: null,
          message: `Task with ID ${args.taskId} not found`,
        };
      }

      // Get enhanced context using tree API
      const rootTree = await this.context.astrotask.tasks();
      const taskNode = rootTree.find(t => t.id === task.id);
      let context = undefined;

      if (taskNode) {
        const contextSlices = await this.context.astrotask.store.listContextSlices(task.id);
        
        context = {
          // Tree context using enhanced API
          ancestors: taskNode.getPath().slice(0, -1).map(node => node.task),
          descendants: taskNode.getAllDescendants().map(node => node.toPlainObject()),
          root: taskNode.getRoot().toPlainObject(),
          
          // Enhanced dependency context
          dependencies: [], // Would need to fetch full Task objects for blocking tasks
          dependents: [], // Would need dependency graph for this
          isBlocked: taskNode.isBlocked(),
          blockedBy: [], // Would need to fetch full Task objects for blocking tasks
          
          
          contextSlices,
        };
      }

      return {
        task,
        message: `Found task: ${task.title}`,
        context
      };
    } catch (error) {
      this.logger.error('Getting task failed', {
        error: error instanceof Error ? error.message : String(error),
        taskId: args.taskId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Add multiple tasks in batch with support for hierarchies and dependencies
   * Supports local referencing by array index for parent/dependency relationships
   */
  async addTasks(args: {
    tasks: Array<AddTaskInput & {
      parentIndex?: number; // Reference to parent by array index
      dependsOn?: number[]; // Array of indices this task depends on
    }>;
  }): Promise<{
    tasks: Task[];
    message: string;
    dependenciesCreated: TaskDependency[];
  }> {
    try {
      const createdTasks: Task[] = [];
      const dependenciesCreated: TaskDependency[] = [];

      // Validate all tasks before creating any
      for (let i = 0; i < args.tasks.length; i++) {
        const taskInput = args.tasks[i];
        
        // Validate that parentTaskId doesn't contain __PROJECT_ROOT__
        if (taskInput.parentTaskId) {
          // If parent is literally __PROJECT_ROOT__, treat it as null (root task)
          if (taskInput.parentTaskId === TASK_IDENTIFIERS.PROJECT_ROOT) {
            this.logger.warn(`Task ${i} has PROJECT_ROOT as parent, treating as root task`);
            taskInput.parentTaskId = undefined;
          } else if (taskInput.parentTaskId.includes(TASK_IDENTIFIERS.PROJECT_ROOT)) {
            throw new Error(`Task ${i} has invalid parent ID containing PROJECT_ROOT: ${taskInput.parentTaskId}. PROJECT_ROOT should not be part of task IDs.`);
          } else if (!validateTaskId(taskInput.parentTaskId)) {
            throw new Error(`Task ${i} has invalid parent ID format: ${taskInput.parentTaskId}`);
          }
        }
        
        // Validate title and description
        if (!taskInput.title || taskInput.title.trim().length === 0) {
          throw new Error(`Task ${i} has empty or missing title`);
        }
        
        if (taskInput.title.length > 200) {
          throw new Error(`Task ${i} title is too long (${taskInput.title.length} chars, max 200)`);
        }
        
        if (taskInput.description && taskInput.description.length > 1000) {
          throw new Error(`Task ${i} description is too long (${taskInput.description.length} chars, max 1000)`);
        }
      }

      // First pass: Create all tasks
      for (let i = 0; i < args.tasks.length; i++) {
        const taskInput = args.tasks[i];
        let parentTaskId: string | undefined;

        // Resolve parent reference
        if (taskInput.parentIndex !== undefined) {
          if (taskInput.parentIndex >= createdTasks.length || taskInput.parentIndex < 0) {
            throw new Error(`Invalid parentIndex ${taskInput.parentIndex} for task ${i}`);
          }
          parentTaskId = createdTasks[taskInput.parentIndex].id;
        } else if (taskInput.parentTaskId) {
          parentTaskId = taskInput.parentTaskId;
        }

        // Create the task
        let createdTask: Task;
        if (parentTaskId) {
          // Verify parent exists
          const parentTask = await this.context.astrotask.store.getTask(parentTaskId);
          if (!parentTask) {
            throw new Error(`Parent task ${parentTaskId} not found for task ${i}`);
          }

          // Create subtask using store directly for batch operations
          createdTask = await this.context.astrotask.store.addTask({
            title: taskInput.title,
            description: taskInput.description,
            status: taskInput.status || 'pending',
            priorityScore: taskInput.priorityScore || 50,
            parentId: parentTaskId,
          });
        } else {
          // Create standalone task
          createdTask = await this.context.astrotask.store.addTask({
            title: taskInput.title,
            description: taskInput.description,
            status: taskInput.status || 'pending',
            priorityScore: taskInput.priorityScore || 50,
          });
        }

        createdTasks.push(createdTask);
      }

      // Second pass: Create dependencies
      for (let i = 0; i < args.tasks.length; i++) {
        const taskInput = args.tasks[i];
        if (taskInput.dependsOn && taskInput.dependsOn.length > 0) {
          for (const depIndex of taskInput.dependsOn) {
            if (depIndex >= createdTasks.length || depIndex < 0) {
              throw new Error(`Invalid dependency index ${depIndex} for task ${i}`);
            }
            
            await this.context.astrotask.store.addTaskDependency(
              createdTasks[i].id,
              createdTasks[depIndex].id
            );
            const dependency = {
              id: 'generated-id',
              dependentTaskId: createdTasks[i].id,
              dependencyTaskId: createdTasks[depIndex].id,
              createdAt: new Date(),
            };
            dependenciesCreated.push(dependency);
          }
        }
      }

      return {
        tasks: createdTasks,
        message: `Successfully created ${createdTasks.length} tasks with ${dependenciesCreated.length} dependencies`,
        dependenciesCreated,
      };
    } catch (error) {
      this.logger.error('Adding tasks failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * List tasks with optional filtering
   */
  async listTasks(args: {
    statuses?: string[];
    parentId?: string;
    includeProjectRoot?: boolean;
  } = {}): Promise<{
    tasks: Task[];
    total: number;
    message: string;
  }> {
    try {
      const filters: {
        statuses?: TaskStatus[];
        parentId?: string;
        includeProjectRoot?: boolean;
      } = {};
      
      if (args.statuses) {
        // Cast string[] to TaskStatus[] since they come from schema validation
        filters.statuses = args.statuses as TaskStatus[];
      }
      
      if (args.parentId !== undefined) {
        filters.parentId = args.parentId;
      }
      
      if (args.includeProjectRoot !== undefined) {
        filters.includeProjectRoot = args.includeProjectRoot;
      }

      const tasks = await this.context.astrotask.store.listTasks(filters);

      return {
        tasks,
        total: tasks.length,
        message: `Found ${tasks.length} tasks`,
      };
    } catch (error) {
      this.logger.error('Listing tasks failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Add context slice to a task
   */
  async addTaskContext(args: AddTaskContextInput): Promise<{
    contextSlice: ContextSlice;
    task: Task;
    message: string;
  }> {
    try {
      // Verify task exists
      const task = await this.context.astrotask.store.getTask(args.taskId);
      if (!task) {
        throw new Error(`Task ${args.taskId} not found`);
      }

      const contextSlice = await this.context.astrotask.store.addContextSlice({
        taskId: args.taskId,
        title: args.title,
        description: args.description,
        contextType: args.contextType,
      });

      return {
        contextSlice,
        task,
        message: `Added context slice "${args.title}" to task "${task.title}"`,
      };
    } catch (error) {
      this.logger.error('Adding task context failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Add dependency between tasks
   */
  async addDependency(args: AddDependencyInput): Promise<{
    dependency: TaskDependency;
    message: string;
  }> {
    try {
      // Verify both tasks exist
      const dependentTask = await this.context.astrotask.store.getTask(args.dependentTaskId);
      if (!dependentTask) {
        throw new Error(`Dependent task ${args.dependentTaskId} not found`);
      }
      
      const dependencyTask = await this.context.astrotask.store.getTask(args.dependencyTaskId);
      if (!dependencyTask) {
        throw new Error(`Dependency task ${args.dependencyTaskId} not found`);
      }

      await this.context.astrotask.store.addTaskDependency(
        args.dependentTaskId,
        args.dependencyTaskId
      );
      const dependency = {
        id: 'generated-id',
        dependentTaskId: args.dependentTaskId,
        dependencyTaskId: args.dependencyTaskId,
        createdAt: new Date(),
      };

      return {
        dependency,
        message: `Added dependency: "${dependentTask.title}" depends on "${dependencyTask.title}"`,
      };
    } catch (error) {
      this.logger.error('Adding dependency failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateStatus(args: UpdateStatusInput & { cascade?: boolean }): Promise<{
    task: Task;
    message: string;
    cascadeCount?: number;
  }> {
    try {
      // Verify task exists
      const existingTask = await this.context.astrotask.store.getTask(args.taskId);
      if (!existingTask) {
        throw new Error(`Task ${args.taskId} not found`);
      }

      const updatedTask = await this.context.astrotask.store.updateTaskStatus(args.taskId, args.status);
      if (!updatedTask) {
        throw new Error(`Failed to update task ${args.taskId}`);
      }

      let cascadeCount: number | undefined;
      
      // Handle cascade if requested
      if (args.cascade && (args.status === 'done' || args.status === 'cancelled' || args.status === 'archived')) {
        try {
          // Use tree API for cascading updates
          const rootTree = await this.context.astrotask.tasks();
          const taskNode = rootTree.find(t => t.id === args.taskId);
          if (taskNode) {
            taskNode.markDone(true); // Mark done and cascade
            await this.context.astrotask.flushTree(rootTree);
            cascadeCount = taskNode.getAllDescendants().length;
          }
        } catch (cascadeError) {
          this.logger.warn('Cascade update failed', {
            error: cascadeError instanceof Error ? cascadeError.message : String(cascadeError),
            taskId: args.taskId,
            status: args.status,
          });
        }
      }

      const message = cascadeCount !== undefined 
        ? `Updated task "${updatedTask.title}" to ${args.status} and cascaded to ${cascadeCount} descendants`
        : `Updated task "${updatedTask.title}" to ${args.status}`;

      return {
        task: updatedTask,
        message,
        cascadeCount,
      };
    } catch (error) {
      this.logger.error('Updating task status failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Delete task with optional cascading to descendants
   */
  async deleteTask(args: DeleteTaskInput): Promise<{
    deletedTask: Task;
    message: string;
    deletedCount: number;
    cascaded: boolean;
  }> {
    try {
      // Verify task exists
      const existingTask = await this.context.astrotask.store.getTask(args.taskId);
      if (!existingTask) {
        throw new Error(`Task ${args.taskId} not found`);
      }

      let deletedCount = 1;
      let cascaded = false;

      if (args.cascade) {
        // Get all descendants before deletion using tree API
        const rootTree = await this.context.astrotask.tasks();
        const taskNode = rootTree.find(t => t.id === args.taskId);
        const descendants = taskNode ? taskNode.getAllDescendants().map(n => n.task) : [];
        
        // Delete all descendants first (bottom-up to avoid orphaning)
        for (const descendant of descendants.reverse()) {
          const deleted = await this.context.astrotask.store.deleteTask(descendant.id);
          if (deleted) {
            deletedCount++;
          }
        }
        
        cascaded = descendants.length > 0;
      }

      // Delete the main task
      const deleted = await this.context.astrotask.store.deleteTask(args.taskId);
      if (!deleted) {
        throw new Error(`Failed to delete task ${args.taskId}`);
      }

      const message = cascaded
        ? `Deleted task "${existingTask.title}" and ${deletedCount - 1} descendants (${deletedCount} total)`
        : `Deleted task "${existingTask.title}"`;

      return {
        deletedTask: existingTask,
        message,
        deletedCount,
        cascaded,
      };
    } catch (error) {
      this.logger.error('Deleting task failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * NEW: Start work on a task with intelligent dependency checking
   */
  async startWork(args: {
    taskId: string;
    force?: boolean;
  }): Promise<{
    success: boolean;
    task: Task | null;
    message: string;
    warnings?: string[];
  }> {
    try {
      // Get the task tree
      const rootTree = await this.context.astrotask.tasks();
      const taskNode = rootTree.find(t => t.id === args.taskId);

      if (!taskNode) {
        return {
          success: false,
          task: null,
          message: `Task ${args.taskId} not found`,
        };
      }

      // Check if task can be started
      if (taskNode.isBlocked() && !args.force) {
        const blockingTasks = taskNode.getBlockingTasks();
        return {
          success: false,
          task: taskNode.task,
          message: `Cannot start task - blocked by: ${blockingTasks.join(', ')}`,
        };
      }

      // Use the enhanced startWork method
      const started = taskNode.startWork();
      const warnings: string[] = [];

      if (!started && args.force) {
        taskNode.markInProgress();
        warnings.push("Task was force-started despite blocking dependencies");
      }

      // Flush changes to persist
      await this.context.astrotask.flushTree(taskNode);

      return {
        success: true,
        task: taskNode.task,
        message: `Successfully started work on "${taskNode.title}"`,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      this.logger.error('Starting work failed', {
        error: error instanceof Error ? error.message : String(error),
        taskId: args.taskId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * NEW: Complete a task with intelligent workflow automation
   */
  async completeTask(args: {
    taskId: string;
    cascade?: boolean;
    autoStart?: boolean;
  }): Promise<{
    success: boolean;
    task: Task | null;
    message: string;
    cascadedTasks?: string[];
    autoStartedTasks?: Task[];
    unblockedTasks?: string[];
  }> {
    try {
      const taskTree = await this.context.astrotask.tasks();
      const targetTask = taskTree.find(t => t.id === args.taskId);

      if (!targetTask) {
        return {
          success: false,
          task: null,
          message: `Task ${args.taskId} not found`,
        };
      }

      // Get dependents before completing (to track unblocking)
      const dependencyGraph = await this.context.astrotask.dependencies();
      const dependents = dependencyGraph.getDependents(args.taskId);

      // Mark as complete with optional cascading
      let cascadedTasks: string[] = [];
      if (args.cascade) {
        const descendants = targetTask.getAllDescendants();
        targetTask.markDone(true);
        cascadedTasks = descendants.map(d => d.id);
      } else {
        targetTask.markDone(false);
      }

      // Auto-start available tasks if requested
      let autoStartedTasks: Task[] = [];
      if (args.autoStart) {
        const started = targetTask.completeAndStartNext();
        autoStartedTasks = started.map(t => t.task);
      }

      // Flush all changes
      await this.context.astrotask.flushTree(targetTask);

      // Find unblocked tasks
      const unblockedTasks: string[] = [];
      for (const dependentId of dependents) {
        const dependentNode = taskTree.find(t => t.id === dependentId);
        if (dependentNode && !dependentNode.isBlocked()) {
          unblockedTasks.push(dependentId);
        }
      }

      return {
        success: true,
        task: targetTask.task,
        message: `Successfully completed "${targetTask.title}"`,
        cascadedTasks: cascadedTasks.length > 0 ? cascadedTasks : undefined,
        autoStartedTasks: autoStartedTasks.length > 0 ? autoStartedTasks : undefined,
        unblockedTasks: unblockedTasks.length > 0 ? unblockedTasks : undefined,
      };
    } catch (error) {
      this.logger.error('Completing task failed', {
        error: error instanceof Error ? error.message : String(error),
        taskId: args.taskId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * NEW: Get available tasks with enhanced filtering and context
   */
  async getAvailableTasks(args: {
    status?: TaskStatus;
    priorityScore?: number;
    parentId?: string;
    includeBlocked?: boolean;
  }): Promise<{
    tasks: Task[];
    message: string;
    summary: {
      totalAvailable: number;
      blockedCount: number;
      readyToStart: number;
      inProgress: number;
    };
  }> {
    try {
      const filter = {
        status: args.status,
        priorityScore: args.priorityScore,
        parentId: args.parentId,
      };

      const availableTaskTrees = await this.context.astrotask.getAvailableTasks(filter);
      
      // Calculate summary statistics
      const totalAvailable = availableTaskTrees.length;
      const blockedCount = availableTaskTrees.filter(t => t.isBlocked()).length;
      const readyToStart = availableTaskTrees.filter(t => t.canStart()).length;
      const inProgress = availableTaskTrees.filter(t => t.status === 'in-progress').length;

      // Filter out blocked tasks unless specifically requested
      const filteredTrees = args.includeBlocked 
        ? availableTaskTrees 
        : availableTaskTrees.filter(t => !t.isBlocked());

      const message = `Found ${filteredTrees.length} available tasks` + 
        (blockedCount > 0 && !args.includeBlocked ? ` (${blockedCount} blocked tasks hidden)` : '');

      return {
        tasks: filteredTrees.map(t => t.task),
        message,
        summary: {
          totalAvailable,
          blockedCount,
          readyToStart,
          inProgress,
        },
      };
    } catch (error) {
      this.logger.error('Getting available tasks failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }
}
