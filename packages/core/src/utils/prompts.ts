/**
 * @fileoverview Shared LLM prompts for task generation
 *
 * This module contains prompt templates used by task generators to ensure
 * consistent and effective task generation across different input types.
 *
 * @module utils/prompts
 * @since 1.0.0
 */

import type { Task } from '../schemas/task.js';

/**
 * System prompt for PRD-based task generation
 */
export const PRD_SYSTEM_PROMPT = `You are an expert software project manager and technical lead. Your job is to analyze Product Requirements Documents (PRDs) and generate actionable, implementable tasks.

TASK GENERATION GUIDELINES:
1. Break down requirements into concrete, implementable tasks
2. Each task should be focused and achievable in 1-4 hours
3. Tasks should be technically specific but not overly detailed
4. Use clear, action-oriented titles (e.g., "Implement JWT authentication" not "Authentication")
5. Include enough context in descriptions for developers to understand the work
6. Set appropriate priorities based on dependencies and business value
7. Extract relevant PRD content for the prd field

TASK STRUCTURE:
- title: Clear, actionable task name (3-80 characters)
- description: Detailed explanation of what needs to be done (optional but recommended)
- priority: "high" for critical path items, "medium" for standard features, "low" for nice-to-haves
- status: Always "pending" for new tasks
- prd: Relevant excerpt from the original PRD that relates to this task

PRIORITIES:
- high: Core functionality, security features, critical user flows
- medium: Standard features, UI/UX improvements, integrations
- low: Optional features, optimizations, documentation

OUTPUT FORMAT:
Return a JSON object with a "tasks" array containing task objects. Each task must have title, priority, and status fields. Description and prd fields are optional but recommended.

Example:
{{
  "tasks": [
    {{
      "title": "Set up user authentication database schema",
      "description": "Create users table with email, password hash, and basic profile fields",
      "priority": "high",
      "status": "pending",
      "prd": "Users should be able to register with email/password and log in securely"
    }}
  ],
  "confidence": 0.95,
  "warnings": []
}}`;

/**
 * User prompt template for PRD analysis
 */
export const PRD_USER_PROMPT_TEMPLATE = `Analyze the following Product Requirements Document and generate a comprehensive set of implementation tasks.

CONTEXT:
{existingTasksContext}

REQUIREMENTS DOCUMENT:
{content}

ADDITIONAL CONTEXT:
{metadata}

Generate 5-15 tasks that cover the complete implementation of these requirements. Focus on creating a logical development sequence that considers dependencies and priorities.`;

/**
 * Helper to format existing tasks for context
 */
export function formatExistingTasksContext(existingTasks: Task[]): string {
  if (!existingTasks || existingTasks.length === 0) {
    return 'No existing tasks provided.';
  }

  const taskSummary = existingTasks
    .map((task: Task) => `- ${task.title} (${task.status})`)
    .join('\n');

  return `Existing tasks for context:\n${taskSummary}\n\nEnsure new tasks complement and don't duplicate existing work.`;
}

/**
 * Helper to format metadata for context
 */
export function formatMetadataContext(metadata: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return 'No additional context provided.';
  }

  const metadataEntries = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');

  return `Additional context:\n${metadataEntries}`;
}

/**
 * Generate the complete user prompt for PRD analysis
 */
export function generatePRDPrompt(
  content: string,
  existingTasks: Task[] = [],
  metadata: Record<string, unknown> = {}
): string {
  return PRD_USER_PROMPT_TEMPLATE.replace('{content}', content)
    .replace('{existingTasksContext}', formatExistingTasksContext(existingTasks))
    .replace('{metadata}', formatMetadataContext(metadata));
}
