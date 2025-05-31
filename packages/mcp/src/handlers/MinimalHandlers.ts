/**
 * Ultra-Minimal MCP Handlers
 * 
 * Implements only the 4 essential tools for AI agent task management:
 * - parsePRD: Bootstrap project from requirements
 * - expandTask: Break down tasks into subtasks  
 * - addDependency: Add dependency relationships
 * - getNextTask: Get next available task to work on
 */

import { createModuleLogger } from '@astrolabe/core';
import {
  createComplexityAnalyzer,
  createComplexityContextService,
  type ComplexityReport,
  DependencyService,
  TaskService,
  TrackingDependencyGraph,
  TrackingTaskTree,
} from '@astrolabe/core';
import type {
  AddDependencyInput,
  AnalyzeComplexityInput,
  AnalyzeNodeComplexityInput,
  ComplexityReportInput,
  ExpandTaskInput,
  GetNextTaskInput,
  HandlerContext,
  MCPHandler,
  ParsePRDInput,
} from './types.js';
import type { Task, TaskDependency, TaskTree, ContextSlice } from '@astrolabe/core';
import { 
  createPRDTaskGenerator, 
} from '@astrolabe/core';

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
    context?: {
      ancestors: Task[];
      descendants: TaskTree[];
      root: TaskTree | null;
      dependencies: Task[];
      dependents: Task[];
      isBlocked: boolean;
      blockedBy: Task[];
      contextSlices: ContextSlice[];
    };
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
        ? 'No pending tasks available (all tasks are in progress or completed)'
        : 'No tasks available';

      let context = undefined;

      // If we have a next task, get its full context
      if (nextTask) {
        const taskWithContext = await this.context.taskService.getTaskWithContext(nextTask.id);
        if (taskWithContext) {
          const contextSlices = await this.context.store.listContextSlices(nextTask.id);
          
          context = {
            ancestors: taskWithContext.ancestors,
            descendants: taskWithContext.descendants,
            root: taskWithContext.root,
            dependencies: taskWithContext.dependencies,
            dependents: taskWithContext.dependents,
            isBlocked: taskWithContext.isBlocked,
            blockedBy: taskWithContext.blockedBy,
            contextSlices,
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
   * Analyze project complexity and generate recommendations
   */
  async analyzeComplexity(args: AnalyzeComplexityInput): Promise<{
    report: ComplexityReport;
    message: string;
    contextSlicesCreated: number;
    contextMessage: string;
  }> {
    try {
      // Get all tasks from the store
      const allTasks = await this.context.store.listTasks();
      
      if (allTasks.length === 0) {
        throw new Error('No tasks found to analyze');
      }

      // Create complexity analyzer
      const analyzer = createComplexityAnalyzer(this.logger, {
        threshold: args.threshold || 5,
        research: args.research || false,
        batchSize: 5,
      });

      // Create complexity context service
      const contextService = createComplexityContextService(this.logger, this.context.store, {
        threshold: args.threshold || 5,
        research: args.research || false,
        batchSize: 5,
        autoUpdate: true,
        includeRecommendations: true,
      });

      // Analyze tasks
      const report = await analyzer.analyzeTasks(allTasks);

      // Create context slices for all tasks
      let contextSlicesCreated = 0;
      let contextMessage = "";
      
      try {
        const taskIds = allTasks.map(task => task.id);
        const contexts = await contextService.generateComplexityContextBatch(taskIds);
        contextSlicesCreated = contexts.length;
        contextMessage = `Created ${contextSlicesCreated} context slices for analyzed tasks`;
      } catch (contextError) {
        this.logger.warn("Failed to create context slices", { error: contextError });
        contextMessage = "Failed to create context slices (analysis still completed)";
      }

      return {
        report,
        message: `Analyzed ${report.meta.tasksAnalyzed} tasks and saved complexity data to database`,
        contextSlicesCreated,
        contextMessage,
      };
    } catch (error) {
      this.logger.error('Complexity analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Analyze a specific node and all its children
   */
  async analyzeNodeComplexity(args: AnalyzeNodeComplexityInput): Promise<{
    report: ComplexityReport;
    message: string;
    contextSlicesCreated: number;
    contextMessage: string;
  }> {
    try {
      // Create complexity analyzer
      const analyzer = createComplexityAnalyzer(this.logger, {
        threshold: args.threshold || 5,
        research: args.research || false,
        batchSize: 5,
      });

      // Create complexity context service
      const contextService = createComplexityContextService(this.logger, this.context.store, {
        threshold: args.threshold || 5,
        research: args.research || false,
        batchSize: 5,
        autoUpdate: true,
        includeRecommendations: true,
      });

      // Analyze the specific node and its children
      const report = await analyzer.analyzeNodeAndChildren(
        args.nodeId,
        async () => await this.context.store.listTasks()
      );

      // Create context slices for node and children
      let contextSlicesCreated = 0;
      let contextMessage = "";
      
      try {
        const contextResult = await contextService.generateComplexityContextForNodeAndChildren(args.nodeId);
        contextSlicesCreated = contextResult.contexts.length;
        contextMessage = `Created ${contextSlicesCreated} context slices for node and children`;
      } catch (contextError) {
        this.logger.warn("Failed to create context slices", { error: contextError });
        contextMessage = "Failed to create context slices (analysis still completed)";
      }

      return {
        report,
        message: `Analyzed node ${args.nodeId} and its ${report.meta.tasksAnalyzed - 1} children and saved complexity data to database`,
        contextSlicesCreated,
        contextMessage,
      };
    } catch (error) {
      this.logger.error('Node complexity analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        nodeId: args.nodeId,
        requestId: this.context.requestId,
      });
      throw error;
    }
  }

  /**
   * Display complexity information from database context slices
   */
  async complexityReport(args: ComplexityReportInput): Promise<{
    complexityData: Array<{ taskId: string; taskTitle: string; complexity: number | null; analysis: string | null }>;
    formatted: string;
    message: string;
  }> {
    try {
      // Get all tasks from the database
      const allTasks = await this.context.store.listTasks();
      
      if (allTasks.length === 0) {
        return {
          complexityData: [],
          formatted: "No tasks found in the database.",
          message: "No tasks available for complexity analysis"
        };
      }

      // Get complexity data from context slices for each task
      const complexityData = [];
      
      for (const task of allTasks) {
        const contextSlices = await this.context.store.listContextSlices(task.id);
        const complexitySlice = contextSlices.find(slice => 
          slice.title.toLowerCase().includes('complexity')
        );
        
        let complexity: number | null = null;
        let analysis: string | null = null;
        
        if (complexitySlice && complexitySlice.description) {
          // Extract complexity score from description
          const match = complexitySlice.description.match(/complexity[:\s]*(\d+(?:\.\d+)?)/i);
          complexity = match && match[1] ? parseFloat(match[1]) : null;
          analysis = complexitySlice.description;
        }
        
        complexityData.push({
          taskId: task.id,
          taskTitle: task.title,
          complexity,
          analysis
        });
      }

      // Filter to only tasks with complexity data
      const tasksWithComplexity = complexityData.filter(item => item.complexity !== null);
      
      if (tasksWithComplexity.length === 0) {
        return {
          complexityData,
          formatted: "No complexity analysis found in database. Run 'analyze-complexity' first to generate complexity data.",
          message: "No complexity data available"
        };
      }

      // Format the report
      const avgComplexity = tasksWithComplexity.reduce((sum, item) => sum + (item.complexity || 0), 0) / tasksWithComplexity.length;
      const highComplexityTasks = tasksWithComplexity.filter(item => (item.complexity || 0) >= 7);
      
      const formatted = [
        '📊 Task Complexity Analysis (from Database)',
        '============================================',
        '',
        `Tasks with Complexity Data: ${tasksWithComplexity.length}`,
        `Average Complexity: ${avgComplexity.toFixed(1)}/10`,
        `High Complexity Tasks (≥7): ${highComplexityTasks.length}`,
        '',
        'Task Details:',
        ...tasksWithComplexity
          .sort((a, b) => (b.complexity || 0) - (a.complexity || 0))
          .map(item => `  ${item.taskId}: ${item.taskTitle} [${item.complexity}/10]`)
      ].join('\n');

      return {
        complexityData,
        formatted,
        message: `Found complexity data for ${tasksWithComplexity.length} tasks in database`
      };
    } catch (error) {
      this.logger.error('Loading complexity data from database failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }
} 