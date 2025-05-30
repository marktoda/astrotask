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
  GetNextTaskInput,
  AnalyzeNodeComplexityInput,
  AnalyzeComplexityInput,
  ComplexityReportInput
} from './types.js';
import type { Task, TaskDependency, TaskTree, ContextSlice } from '@astrolabe/core';
import { 
  createPRDTaskGenerator, 
  createModuleLogger,
  createComplexityAnalyzer,
  createComplexityContextService,
  type ComplexityReport 
} from '@astrolabe/core';
import { promises as fs } from 'fs';
import { dirname } from 'path';

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
    savedTo: string;
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

      // Save report to file
      const outputPath = args.output || 'scripts/task-complexity-report.json';
      
      // Ensure directory exists
      await fs.mkdir(dirname(outputPath), { recursive: true });
      
      // Write report
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

      return {
        report,
        savedTo: outputPath,
        message: `Analyzed ${report.meta.tasksAnalyzed} tasks. Report saved to ${outputPath}`,
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
    savedTo: string;
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

      // Save report to file
      const outputPath = args.output || `scripts/task-complexity-report-${args.nodeId}.json`;
      
      // Ensure directory exists
      await fs.mkdir(dirname(outputPath), { recursive: true });
      
      // Write report
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

      return {
        report,
        savedTo: outputPath,
        message: `Analyzed node ${args.nodeId} and its ${report.meta.tasksAnalyzed - 1} children. Report saved to ${outputPath}`,
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
   * Display complexity report in readable format
   */
  async complexityReport(args: ComplexityReportInput): Promise<{
    report: ComplexityReport;
    formatted: string;
    message: string;
  }> {
    try {
      const reportPath = args.file || 'scripts/task-complexity-report.json';
      
      // Read report file
      const reportData = await fs.readFile(reportPath, 'utf-8');
      const report: ComplexityReport = JSON.parse(reportData);

      // Create analyzer to format the report
      const analyzer = createComplexityAnalyzer(this.logger);
      const formatted = analyzer.formatReport(report);

      return {
        report,
        formatted,
        message: `Complexity report loaded from ${reportPath}`
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Complexity report not found at ${args.file || 'scripts/task-complexity-report.json'}. Run analyze-complexity first.`);
      }
      
      this.logger.error('Loading complexity report failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: this.context.requestId,
      });
      throw error;
    }
  }
} 