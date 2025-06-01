/**
 * Ultra-Minimal MCP Handlers
 * 
 * Implements only the 5 essential tools for AI agent task management:
 * - getNextTask: Get next available task to work on (with optional parent)
 * - addTasks: Create tasks in batch (with dependencies and hierarchies)
 * - addTaskContext: Add context slice to a task
 * - addDependency: Add dependency relationships
 * - listTasks: List tasks with optional filters
 */

import { createModuleLogger, TASK_IDENTIFIERS, validateTaskId } from '@astrolabe/core';
import { TrackingTaskTree } from '@astrolabe/core';
import type {
  GetNextTaskInput,
  AddTaskInput,
  AddTasksInput,
  ListTasksInput,
  AddTaskContextInput,
  AddDependencyInput,
  HandlerContext,
  MCPHandler,
} from './types.js';
import type { Task, TaskDependency, TaskTree, ContextSlice } from '@astrolabe/core';

export class MinimalHandlers implements MCPHandler {
  private logger = createModuleLogger('MinimalHandlers');

  constructor(public readonly context: HandlerContext) {}

  /**
   * Get the next available task to work on
   * Supports optional parent ID to get next subtask within a specific parent
   */
  async getNextTask(args: GetNextTaskInput = {}): Promise<{
    task: Task | null;
    availableTasks: Task[];
    message: string;
    context?: {
      ancestors: Task[];
      descendants: { task: Task; children: any[] }[]; // TaskTreeData[]
      root: { task: Task; children: any[] } | null; // TaskTreeData | null
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
      let availableTasks: Task[] = [];
      let parentTask: Task | null = null;
      let siblings: Task[] | undefined;

      if (args.parentTaskId) {
        // Get parent task and its children
        parentTask = await this.context.store.getTask(args.parentTaskId);
        if (!parentTask) {
          throw new Error(`Parent task ${args.parentTaskId} not found`);
        }

        // Get all children of the parent
        const tree = await this.context.taskService.getTaskTree(args.parentTaskId);
        if (!tree) {
          // No children exist, return empty
          availableTasks = [];
          siblings = [];
        } else {
          const children = tree.getChildren().map(child => child.task);
          // Filter to available tasks (no incomplete dependencies)
          availableTasks = await this.filterAvailableTasks(children, args);
          siblings = children;
        }
      } else {
        // Get all available tasks (no incomplete dependencies)
        availableTasks = await this.context.taskService.getAvailableTasks({
          status: args.status,
          priority: args.priority,
        });
      }

      // Find the highest priority pending task
      const nextTask = availableTasks
        .filter(task => task.status === 'pending')
        .sort((a, b) => {
          // Sort by priority (high > medium > low), then by ID
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
          const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
          
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          
          return a.id.localeCompare(b.id);
        })[0] || null;

      const message = nextTask 
        ? `Next task to work on: ${nextTask.title}`
        : availableTasks.length > 0
        ? 'No pending tasks available (all tasks are in progress or completed)'
        : args.parentTaskId
        ? `No tasks available under parent ${args.parentTaskId}`
        : 'No tasks available';

      let context = undefined;

      // If we have a next task, get its full context
      if (nextTask) {
        const taskWithContext = await this.context.taskService.getTaskWithContext(nextTask.id);
        if (taskWithContext) {
          const contextSlices = await this.context.store.listContextSlices(nextTask.id);
          
          context = {
            ancestors: taskWithContext.ancestors,
            descendants: taskWithContext.descendants.map(tree => tree.toPlainObject()), // Convert to plain objects
            root: taskWithContext.root ? taskWithContext.root.toPlainObject() : null, // Convert to plain object
            dependencies: taskWithContext.dependencies,
            dependents: taskWithContext.dependents,
            isBlocked: taskWithContext.isBlocked,
            blockedBy: taskWithContext.blockedBy,
            contextSlices,
            ...(parentTask && { parentTask }),
            ...(siblings && { siblings }),
          };
        }
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
          const parentTask = await this.context.store.getTask(parentTaskId);
          if (!parentTask) {
            throw new Error(`Parent task ${parentTaskId} not found for task ${i}`);
          }

          // Create subtask using store directly for batch operations
          createdTask = await this.context.store.addTask({
            title: taskInput.title,
            description: taskInput.description,
            status: taskInput.status || 'pending',
            priority: taskInput.priority || 'medium',
            parentId: parentTaskId,
          });
        } else {
          // Create standalone task
          createdTask = await this.context.store.addTask({
            title: taskInput.title,
            description: taskInput.description,
            status: taskInput.status || 'pending',
            priority: taskInput.priority || 'medium',
          });
        }

        createdTasks.push(createdTask);
      }

      // Second pass: Create dependencies
      for (let i = 0; i < args.tasks.length; i++) {
        const taskInput = args.tasks[i];
        if (taskInput.dependsOn && taskInput.dependsOn.length > 0) {
          const dependentTask = createdTasks[i];
          
          for (const depIndex of taskInput.dependsOn) {
            if (depIndex >= createdTasks.length || depIndex < 0) {
              throw new Error(`Invalid dependency index ${depIndex} for task ${i}`);
            }
            
            const dependencyTask = createdTasks[depIndex];
            const dependency = await this.context.taskService.addTaskDependency(
              dependentTask.id,
              dependencyTask.id
            );
            dependenciesCreated.push(dependency);
          }
        }
      }

      const message = `Successfully created ${createdTasks.length} tasks with ${dependenciesCreated.length} dependencies`;

      return {
        tasks: createdTasks,
        message,
        dependenciesCreated,
      };
    } catch (error) {
      this.logger.error('Adding tasks batch failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * List tasks with optional filters
   */
  async listTasks(args: {
    status?: string;
    parentId?: string;
    includeProjectRoot?: boolean;
  } = {}): Promise<{
    tasks: Task[];
    total: number;
    message: string;
  }> {
    try {
      const filters: any = {};
      
      if (args.status) {
        filters.status = args.status;
      }
      
      if (args.parentId !== undefined) {
        filters.parentId = args.parentId;
      }
      
      if (args.includeProjectRoot !== undefined) {
        filters.includeProjectRoot = args.includeProjectRoot;
      }

      const tasks = await this.context.store.listTasks(filters);

      return {
        tasks,
        total: tasks.length,
        message: `Found ${tasks.length} tasks`
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
   * Add a context slice to a task
   */
  async addTaskContext(args: AddTaskContextInput): Promise<{
    contextSlice: ContextSlice;
    task: Task;
    message: string;
  }> {
    try {
      // Verify task exists
      const task = await this.context.store.getTask(args.taskId);
      if (!task) {
        throw new Error(`Task ${args.taskId} not found`);
      }

      // Create context slice
      const contextSlice = await this.context.store.addContextSlice({
        taskId: args.taskId,
        title: args.title,
        description: args.description,
      });

      return {
        contextSlice,
        task,
        message: `Successfully added context slice "${args.title}" to task ${args.taskId}`
      };
    } catch (error) {
      this.logger.error('Adding task context failed', {
        error: error instanceof Error ? error.message : String(error),
        taskId: args.taskId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Add a dependency between two tasks
   */
  async addDependency(args: AddDependencyInput): Promise<{
    dependency: TaskDependency;
    message: string;
  }> {
    try {
      const dependency = await this.context.taskService.addTaskDependency(
        args.dependentTaskId,
        args.dependencyTaskId
      );

      return {
        dependency,
        message: `Successfully added dependency: ${args.dependentTaskId} depends on ${args.dependencyTaskId}`
      };
    } catch (error) {
      this.logger.error('Adding dependency failed', {
        error: error instanceof Error ? error.message : String(error),
        dependentTaskId: args.dependentTaskId,
        dependencyTaskId: args.dependencyTaskId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Helper to filter tasks by availability (respecting dependencies)
   */
  private async filterAvailableTasks(tasks: Task[], filters: GetNextTaskInput): Promise<Task[]> {
    const availableTasks: Task[] = [];
    
    for (const task of tasks) {
      // Apply status filter if provided
      if (filters.status && task.status !== filters.status) {
        continue;
      }
      
      // Apply priority filter if provided
      if (filters.priority && task.priority !== filters.priority) {
        continue;
      }

      // Check if task has incomplete dependencies
      const dependencies = await this.context.dependencyService.getDependencies(task.id);
      let hasIncompleteDependencies = false;
      
      // Check each dependency
      for (const depId of dependencies) {
        const depTask = await this.context.store.getTask(depId);
        if (depTask && depTask.status !== 'done' && depTask.status !== 'cancelled') {
          hasIncompleteDependencies = true;
          break;
        }
      }

      if (!hasIncompleteDependencies) {
        availableTasks.push(task);
      }
    }

    return availableTasks;
  }
} 