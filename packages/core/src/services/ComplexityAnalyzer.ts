/**
 * @fileoverview Task Complexity Analysis Service
 *
 * This service analyzes tasks using LLM to determine implementation complexity
 * on a scale of 1-10, providing detailed reasoning and recommendations for
 * task breakdown and subtask allocation.
 *
 * @module services/ComplexityAnalyzer
 * @since 1.0.0
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { RunnableSequence } from '@langchain/core/runnables';
import type { ChatOpenAI } from '@langchain/openai';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { Task } from '../schemas/task.js';
import { createLLM } from '../utils/llm.js';
import type { ILLMService } from './LLMService.js';

/**
 * Schema for individual task complexity analysis
 */
export const taskComplexitySchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  complexityScore: z.number().min(1).max(10),
  recommendedSubtasks: z.number().min(1).max(20),
  expansionPrompt: z.string(),
  reasoning: z.string(),
});

/**
 * Schema for complete complexity analysis report
 */
export const complexityReportSchema = z.object({
  meta: z.object({
    generatedAt: z.string(),
    tasksAnalyzed: z.number(),
    totalTasks: z.number(),
    analysisCount: z.number(),
    thresholdScore: z.number(),
    projectName: z.string().optional(),
    usedResearch: z.boolean(),
  }),
  complexityAnalysis: z.array(taskComplexitySchema),
});

/**
 * Types for complexity analysis
 */
export type TaskComplexity = z.infer<typeof taskComplexitySchema>;
export type ComplexityReport = z.infer<typeof complexityReportSchema>;

/**
 * Configuration for complexity analysis
 */
export interface ComplexityAnalysisConfig {
  /** Minimum complexity score threshold for recommendations */
  threshold: number;
  /** Enable research mode for more accurate analysis */
  research: boolean;
  /** Project name for metadata */
  projectName?: string;
  /** Maximum number of tasks to analyze in a single batch */
  batchSize: number;
}

/**
 * Task Complexity Analyzer using LLM
 */
export class ComplexityAnalyzer {
  private chain: RunnableSequence<{ prompt: string }, TaskComplexity[]> | null = null;
  private llm: ChatOpenAI;

  constructor(
    private logger: Logger,
    private config: ComplexityAnalysisConfig,
    llmService?: ILLMService
  ) {
    this.llm = llmService?.getChatModel() ?? createLLM();
    this.initializeChain();
  }

  /**
   * Analyze complexity of multiple tasks
   */
  async analyzeTasks(tasks: Task[]): Promise<ComplexityReport> {
    this.logger.info('Starting complexity analysis', {
      tasksCount: tasks.length,
      threshold: this.config.threshold,
      research: this.config.research,
    });

    const startTime = Date.now();
    const complexityAnalysis: TaskComplexity[] = [];

    // Process tasks in batches to avoid overwhelming the LLM
    for (let i = 0; i < tasks.length; i += this.config.batchSize) {
      const batch = tasks.slice(i, i + this.config.batchSize);
      const batchResults = await this.analyzeBatch(batch);
      complexityAnalysis.push(...batchResults);
    }

    const report: ComplexityReport = {
      meta: {
        generatedAt: new Date().toISOString(),
        tasksAnalyzed: complexityAnalysis.length,
        totalTasks: tasks.length,
        analysisCount: complexityAnalysis.length,
        thresholdScore: this.config.threshold,
        projectName: this.config.projectName,
        usedResearch: this.config.research,
      },
      complexityAnalysis,
    };

    this.logger.info('Complexity analysis completed', {
      duration: Date.now() - startTime,
      tasksAnalyzed: complexityAnalysis.length,
      avgComplexity: this.calculateAverageComplexity(complexityAnalysis),
    });

    return report;
  }

  /**
   * Analyze a single task's complexity
   */
  async analyzeTask(task: Task): Promise<TaskComplexity> {
    const results = await this.analyzeBatch([task]);
    const result = results[0];
    if (!result) {
      throw new Error('Failed to analyze task complexity');
    }
    return result;
  }

  /**
   * Analyze a specific node and all its children
   */
  async analyzeNodeAndChildren(
    nodeId: string,
    getAllTasks: () => Promise<Task[]>
  ): Promise<ComplexityReport> {
    this.logger.info('Starting node-specific complexity analysis', {
      nodeId,
      threshold: this.config.threshold,
      research: this.config.research,
    });

    const startTime = Date.now();

    // Get all tasks
    const allTasks = await getAllTasks();

    // Find the target node
    const targetNode = allTasks.find((task) => task.id === nodeId);
    if (!targetNode) {
      throw new Error(`Task with ID ${nodeId} not found`);
    }

    // Get all children recursively
    const tasksToAnalyze = this.getNodeAndAllChildren(targetNode, allTasks);

    this.logger.info('Found tasks to analyze', {
      nodeId,
      targetNode: targetNode.title,
      totalChildren: tasksToAnalyze.length - 1, // Subtract 1 for the parent node
      tasksToAnalyze: tasksToAnalyze.length,
    });

    // Analyze the tasks
    const complexityAnalysis: TaskComplexity[] = [];

    // Process tasks in batches to avoid overwhelming the LLM
    for (let i = 0; i < tasksToAnalyze.length; i += this.config.batchSize) {
      const batch = tasksToAnalyze.slice(i, i + this.config.batchSize);
      const batchResults = await this.analyzeBatch(batch);
      complexityAnalysis.push(...batchResults);
    }

    const report: ComplexityReport = {
      meta: {
        generatedAt: new Date().toISOString(),
        tasksAnalyzed: complexityAnalysis.length,
        totalTasks: tasksToAnalyze.length,
        analysisCount: complexityAnalysis.length,
        thresholdScore: this.config.threshold,
        projectName: `${this.config.projectName || 'Unknown'} (Node: ${nodeId})`,
        usedResearch: this.config.research,
      },
      complexityAnalysis,
    };

    this.logger.info('Node complexity analysis completed', {
      nodeId,
      duration: Date.now() - startTime,
      tasksAnalyzed: complexityAnalysis.length,
      avgComplexity: this.calculateAverageComplexity(complexityAnalysis),
    });

    return report;
  }

  /**
   * Get a node and all its children recursively
   */
  private getNodeAndAllChildren(targetNode: Task, allTasks: Task[]): Task[] {
    const result: Task[] = [targetNode];
    const children = allTasks.filter((task) => task.parentId === targetNode.id);

    for (const child of children) {
      result.push(...this.getNodeAndAllChildren(child, allTasks));
    }

    return result;
  }

  /**
   * Generate human-readable complexity report
   */
  formatReport(report: ComplexityReport): string {
    const lines: string[] = [];

    lines.push('# Task Complexity Analysis Report');
    lines.push('');
    lines.push(`Generated: ${new Date(report.meta.generatedAt).toLocaleString()}`);
    lines.push(`Project: ${report.meta.projectName || 'Unknown'}`);
    lines.push(`Tasks Analyzed: ${report.meta.tasksAnalyzed}/${report.meta.totalTasks}`);
    lines.push(`Threshold Score: ${report.meta.thresholdScore}`);
    lines.push(`Research Mode: ${report.meta.usedResearch ? 'Enabled' : 'Disabled'}`);
    lines.push('');

    // Summary statistics
    const avgComplexity = this.calculateAverageComplexity(report.complexityAnalysis);
    const highComplexityTasks = report.complexityAnalysis.filter(
      (t) => t.complexityScore >= report.meta.thresholdScore
    );

    lines.push('## Summary');
    lines.push(`- Average Complexity: ${avgComplexity.toFixed(1)}/10`);
    lines.push(
      `- High Complexity Tasks (>=${report.meta.thresholdScore}): ${highComplexityTasks.length}`
    );
    lines.push(
      `- Total Recommended Subtasks: ${report.complexityAnalysis.reduce((sum, t) => sum + t.recommendedSubtasks, 0)}`
    );
    lines.push('');

    // Complexity distribution
    const distribution = this.calculateComplexityDistribution(report.complexityAnalysis);
    lines.push('## Complexity Distribution');
    for (const [score, count] of Object.entries(distribution).sort()) {
      lines.push(`- Score ${score}: ${count} tasks`);
    }
    lines.push('');

    // High priority tasks for expansion
    if (highComplexityTasks.length > 0) {
      lines.push('## Recommended for Expansion');
      for (const task of highComplexityTasks.sort(
        (a, b) => b.complexityScore - a.complexityScore
      )) {
        lines.push(`### Task ${task.taskId}: ${task.taskTitle}`);
        lines.push(`**Complexity Score:** ${task.complexityScore}/10`);
        lines.push(`**Recommended Subtasks:** ${task.recommendedSubtasks}`);
        lines.push(`**Reasoning:** ${task.reasoning}`);
        lines.push('');
        lines.push('**Expansion Command:**');
        lines.push('```bash');
        lines.push(
          `task-master expand --id=${task.taskId} --num=${task.recommendedSubtasks} --research`
        );
        lines.push('```');
        lines.push('');
      }
    }

    // All tasks details
    lines.push('## Detailed Analysis');
    for (const task of report.complexityAnalysis.sort(
      (a, b) => b.complexityScore - a.complexityScore
    )) {
      lines.push(`### Task ${task.taskId}: ${task.taskTitle}`);
      lines.push(`- **Complexity Score:** ${task.complexityScore}/10`);
      lines.push(`- **Recommended Subtasks:** ${task.recommendedSubtasks}`);
      lines.push(`- **Reasoning:** ${task.reasoning}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Initialize the LLM chain for complexity analysis
   */
  private initializeChain(): void {
    const systemPrompt = `You are an expert software engineering consultant specializing in task complexity analysis. Your job is to analyze software development tasks and provide detailed complexity assessments.

COMPLEXITY SCORING GUIDELINES (1-10 scale):
1-2: Trivial tasks (simple config changes, documentation updates)
3-4: Simple tasks (basic CRUD operations, straightforward UI components)
5-6: Moderate tasks (API integrations, business logic implementation)
7-8: Complex tasks (system architecture, performance optimization, advanced algorithms)
9-10: Extremely complex tasks (distributed systems, security implementations, novel research)

ANALYSIS CRITERIA:
- Technical complexity and skill requirements
- Number of dependencies and integration points
- Risk factors and potential complications
- Testing and validation requirements
- Documentation and maintenance needs
- Performance and scalability considerations

SUBTASK RECOMMENDATIONS:
- 1-3 subtasks: Simple tasks that can be broken down minimally
- 4-6 subtasks: Moderate complexity requiring logical breakdown
- 7-12 subtasks: Complex tasks needing detailed decomposition
- 13+ subtasks: Extremely complex tasks requiring extensive planning

OUTPUT REQUIREMENTS:
For each task, provide:
1. complexityScore: Integer from 1-10
2. recommendedSubtasks: Suggested number of subtasks (1-20)
3. expansionPrompt: Specific guidance for breaking down the task
4. reasoning: Detailed explanation of the complexity assessment

Return a JSON array of task complexity objects.`;

    const humanPrompt = `Analyze the complexity of these software development tasks:

{prompt}

Consider the technical requirements, dependencies, potential risks, and implementation challenges for each task. Provide detailed complexity analysis for all tasks.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', humanPrompt],
    ]);

    const parser = new JsonOutputParser();

    this.chain = prompt.pipe(this.llm).pipe(parser) as RunnableSequence<
      { prompt: string },
      TaskComplexity[]
    >;
  }

  /**
   * Analyze a batch of tasks
   */
  private async analyzeBatch(tasks: Task[]): Promise<TaskComplexity[]> {
    if (!this.chain) {
      throw new Error('LLM chain not initialized');
    }

    const tasksDescription = tasks
      .map(
        (task) =>
          `Task ${task.id}: ${task.title}
Description: ${task.description || 'No description provided'}
Priority: ${task.priority}
Status: ${task.status}
PRD Context: ${task.prd || 'No PRD context available'}
---`
      )
      .join('\n\n');

    try {
      const result = await this.chain.invoke({ prompt: tasksDescription });

      // Validate and sanitize the results
      return this.validateAndSanitizeResults(result, tasks);
    } catch (error) {
      this.logger.error('LLM analysis failed for batch', {
        error: error instanceof Error ? error.message : String(error),
        tasksCount: tasks.length,
      });

      // Fallback: return basic analysis
      return tasks.map((task) => this.createFallbackAnalysis(task));
    }
  }

  /**
   * Validate and sanitize LLM results
   */
  private validateAndSanitizeResults(results: unknown[], tasks: Task[]): TaskComplexity[] {
    const validResults: TaskComplexity[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task) {
        this.logger.warn('Undefined task in results, skipping', { index: i });
        continue;
      }

      const result = results[i] as Record<string, unknown> | undefined;

      try {
        const validated = taskComplexitySchema.parse({
          taskId: task.id,
          taskTitle: task.title,
          complexityScore: Math.max(
            1,
            Math.min(10, Math.round(Number(result?.complexityScore) || 5))
          ),
          recommendedSubtasks: Math.max(
            1,
            Math.min(20, Math.round(Number(result?.recommendedSubtasks) || 3))
          ),
          expansionPrompt: String(
            result?.expansionPrompt ||
              `Break down "${task.title}" into ${Number(result?.recommendedSubtasks) || 3} specific subtasks.`
          ),
          reasoning: String(
            result?.reasoning || 'Analysis not available - using default complexity assessment.'
          ),
        });
        validResults.push(validated);
      } catch (error) {
        this.logger.warn('Invalid LLM result, using fallback', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
        validResults.push(this.createFallbackAnalysis(task));
      }
    }

    return validResults;
  }

  /**
   * Create fallback analysis when LLM fails
   */
  private createFallbackAnalysis(task: Task): TaskComplexity {
    // Simple heuristic based on task properties
    let score = 5; // Default moderate complexity

    if (task.description && task.description.length > 200) score += 1;
    if (task.prd && task.prd.length > 500) score += 1;
    if (task.priority === 'high') score += 1;

    score = Math.max(1, Math.min(10, score));
    const subtasks = Math.max(1, Math.min(20, Math.ceil(score * 0.8)));

    return {
      taskId: task.id,
      taskTitle: task.title,
      complexityScore: score,
      recommendedSubtasks: subtasks,
      expansionPrompt: `Break down "${task.title}" into ${subtasks} specific, actionable subtasks focusing on implementation details.`,
      reasoning: 'Heuristic analysis based on task properties. LLM analysis was not available.',
    };
  }

  /**
   * Calculate average complexity score
   */
  private calculateAverageComplexity(analyses: TaskComplexity[]): number {
    if (analyses.length === 0) return 0;
    const sum = analyses.reduce((acc, analysis) => acc + analysis.complexityScore, 0);
    return sum / analyses.length;
  }

  /**
   * Calculate complexity distribution
   */
  private calculateComplexityDistribution(analyses: TaskComplexity[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const analysis of analyses) {
      const score = analysis.complexityScore.toString();
      distribution[score] = (distribution[score] || 0) + 1;
    }

    return distribution;
  }
}

/**
 * Factory function to create a ComplexityAnalyzer instance
 */
export function createComplexityAnalyzer(
  logger: Logger,
  config: Partial<ComplexityAnalysisConfig> = {},
  llmService?: ILLMService
): ComplexityAnalyzer {
  const defaultConfig: ComplexityAnalysisConfig = {
    threshold: 5,
    research: false,
    batchSize: 5,
    ...config,
  };

  return new ComplexityAnalyzer(logger, defaultConfig, llmService);
}
