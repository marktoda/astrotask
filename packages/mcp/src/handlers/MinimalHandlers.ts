/**
 * Ultra-Minimal MCP Handlers
 * 
 * Implements only the 4 essential tools for AI agent task management:
 * - parsePRD: Bootstrap project from requirements
 * - expandTask: Break down tasks into subtasks  
 * - addDependency: Add dependency relationships
 * - getNextTask: Get next available task to work on
 */

import type { 
  HandlerContext, 
  MCPHandler, 
  ParsePRDInput,
  ExpandTaskInput,
  AddDependencyInput,
  GetNextTaskInput
} from './types.js';
import type { Task, TaskDependency } from '@astrolabe/core';
import { createPRDTaskGenerator, createModuleLogger } from '@astrolabe/core';

export class MinimalHandlers implements MCPHandler {
  private logger = createModuleLogger('MinimalHandlers');

  constructor(public readonly context: HandlerContext) {}

  /**
   * Parse PRD content and generate initial task structure
   */
  async parsePRD(args: ParsePRDInput): Promise<{
    rootTask: Task;
    totalTasks: number;
    message: string;
  }> {
    try {
      // Create PRD generator
      const prdGenerator = createPRDTaskGenerator(this.logger, this.context.store);

      // Generate task tree from PRD content
      const result = await prdGenerator.generate({
        content: args.content,
        context: {
          parentTaskId: args.parentTaskId,
        },
        metadata: {
          maxTasks: args.maxTasks,
        },
      });

      // Apply the generated tree to persistence
      const { updatedTree } = await result.tree.flush(this.context.taskService);
      
      // Apply dependency graph if it has operations
      if (result.graph.hasPendingChanges) {
        await result.graph.flush(this.context.dependencyService);
      }

      // Count all tasks in the tree
      let totalTasks = 1; // Root task
      const countTasks = (tree: any): void => {
        totalTasks += tree.getChildren().length;
        for (const child of tree.getChildren()) {
          countTasks(child);
        }
      };
      countTasks(updatedTree);

      return {
        rootTask: updatedTree.task,
        totalTasks,
        message: `Successfully generated ${totalTasks} tasks from PRD`
      };
    } catch (error) {
      this.logger.error('PRD parsing failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Expand a task into subtasks
   */
  async expandTask(args: ExpandTaskInput): Promise<{
    parentTask: Task;
    subtasks: Task[];
    message: string;
  }> {
    try {
      // Get the parent task
      const parentTask = await this.context.store.getTask(args.taskId);
      if (!parentTask) {
        throw new Error(`Task ${args.taskId} not found`);
      }

      // Create a simple expansion prompt
      const expansionContent = `
Expand this task into ${args.numSubtasks || 3} concrete subtasks:

Title: ${parentTask.title}
Description: ${parentTask.description || 'No description'}

${args.context ? `Additional context: ${args.context}` : ''}

Each subtask should be specific and actionable.
`;

      // Use PRD generator to create subtasks
      const prdGenerator = createPRDTaskGenerator(this.logger, this.context.store);
      const result = await prdGenerator.generate({
        content: expansionContent,
        context: {
          parentTaskId: args.taskId,
        },
        metadata: {
          maxTasks: args.numSubtasks || 3,
        },
      });

      // Apply the generated subtasks
      const { updatedTree } = await result.tree.flush(this.context.taskService);
      const subtasks = updatedTree.getChildren().map(child => child.task);

      return {
        parentTask,
        subtasks,
        message: `Successfully expanded task ${args.taskId} into ${subtasks.length} subtasks`
      };
    } catch (error) {
      this.logger.error('Task expansion failed', {
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
   * Get the next available task to work on
   */
  async getNextTask(args: GetNextTaskInput = {}): Promise<{
    task: Task | null;
    availableTasks: Task[];
    message: string;
  }> {
    try {
      // Get available tasks (no incomplete dependencies)
      const availableTasks = await this.context.taskService.getAvailableTasks({
        status: args.status,
        priority: args.priority,
      });

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
          ? `No pending tasks available. ${availableTasks.length} tasks are available but not pending.`
          : 'No tasks available to work on';

      return {
        task: nextTask,
        availableTasks,
        message
      };
    } catch (error) {
      this.logger.error('Getting next task failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }
} 