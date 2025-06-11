/**
 * @fileoverview Acceptance criteria utilities for working with context slices
 *
 * This module provides helper functions for filtering, validating, and working
 * with acceptance criteria stored as context slices with contextType 'acceptance'.
 *
 * @module utils/acceptanceCriteria
 * @since 3.0.0
 */

import type { ContextSlice } from '../schemas/contextSlice.js';

/**
 * Context type constant for acceptance criteria
 */
export const ACCEPTANCE_CONTEXT_TYPE = 'acceptance';

/**
 * Filters context slices to only include acceptance criteria
 *
 * @param contextSlices - Array of context slices to filter
 * @returns Array containing only acceptance criteria context slices
 */
export function filterAcceptanceCriteria(contextSlices: ContextSlice[]): ContextSlice[] {
  return contextSlices.filter((slice) => slice.contextType === ACCEPTANCE_CONTEXT_TYPE);
}

/**
 * Validates that acceptance criteria are well-formed
 *
 * @param acceptanceCriteria - Array of acceptance criteria context slices
 * @returns Validation result with any issues found
 */
export function validateAcceptanceCriteria(acceptanceCriteria: ContextSlice[]): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (acceptanceCriteria.length === 0) {
    suggestions.push('Consider adding acceptance criteria to define clear completion conditions');
    return { isValid: true, issues, suggestions };
  }

  for (const criteria of acceptanceCriteria) {
    // Check for clear, testable titles
    if (criteria.title.length < 10) {
      issues.push(`Acceptance criteria title too short: "${criteria.title}"`);
    }

    // Check for measurable language
    const hasActionVerb =
      /\b(returns?|loads?|responds?|validates?|accepts?|rejects?|handles?|displays?|completes?)\b/i.test(
        criteria.title
      );
    if (!hasActionVerb) {
      suggestions.push(
        `Consider using action verbs in "${criteria.title}" for clearer expectations`
      );
    }

    // Check for specific details in description
    if (!criteria.description || criteria.description.length < 20) {
      issues.push(`Acceptance criteria "${criteria.title}" needs more detailed description`);
    }

    // Check for vague language
    const hasVagueLanguage = /\b(works?|good|bad|nice|better|properly|correctly)\b/i.test(
      `${criteria.title} ${criteria.description || ''}`
    );
    if (hasVagueLanguage) {
      suggestions.push(
        `Avoid vague language in "${criteria.title}" - be specific about expected behavior`
      );
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Generates a summary of acceptance criteria for a task
 *
 * @param acceptanceCriteria - Array of acceptance criteria context slices
 * @returns Formatted summary string
 */
export function summarizeAcceptanceCriteria(acceptanceCriteria: ContextSlice[]): string {
  if (acceptanceCriteria.length === 0) {
    return 'No acceptance criteria defined';
  }

  const summary = acceptanceCriteria
    .map((criteria, index) => `${index + 1}. ${criteria.title}`)
    .join('\n');

  return `Acceptance Criteria (${acceptanceCriteria.length}):\n${summary}`;
}

/**
 * Checks if all acceptance criteria appear to be met based on keywords
 * This is a simple heuristic - real validation would require manual review
 *
 * @param acceptanceCriteria - Array of acceptance criteria context slices
 * @returns Basic completion assessment
 */
export function assessAcceptanceCriteriaCompletion(acceptanceCriteria: ContextSlice[]): {
  totalCriteria: number;
  potentiallyMet: number;
  needsReview: number;
  summary: string;
} {
  if (acceptanceCriteria.length === 0) {
    return {
      totalCriteria: 0,
      potentiallyMet: 0,
      needsReview: 0,
      summary: 'No acceptance criteria to evaluate',
    };
  }

  // This is a simple heuristic - in practice, would need manual validation
  const potentiallyMet = acceptanceCriteria.filter((criteria) => {
    const text = `${criteria.title} ${criteria.description || ''}`.toLowerCase();
    // Look for completion indicators in the description
    return (
      text.includes('✓') ||
      text.includes('complete') ||
      text.includes('done') ||
      text.includes('met')
    );
  }).length;

  const needsReview = acceptanceCriteria.length - potentiallyMet;

  return {
    totalCriteria: acceptanceCriteria.length,
    potentiallyMet,
    needsReview,
    summary: `${potentiallyMet}/${acceptanceCriteria.length} criteria appear to be met, ${needsReview} need review`,
  };
}

/**
 * Suggests acceptance criteria based on common patterns for task types
 *
 * @param taskTitle - Title of the task to suggest criteria for
 * @param taskDescription - Description of the task (optional)
 * @returns Array of suggested acceptance criteria
 */
export function suggestAcceptanceCriteria(
  taskTitle: string,
  taskDescription?: string
): Array<{
  title: string;
  description: string;
}> {
  const suggestions: Array<{ title: string; description: string }> = [];
  const titleLower = taskTitle.toLowerCase();
  const descLower = taskDescription?.toLowerCase() || '';
  const combined = `${titleLower} ${descLower}`;

  // API-related tasks
  if (combined.includes('api') || combined.includes('endpoint')) {
    suggestions.push({
      title: 'API returns expected status codes',
      description:
        'Endpoint returns 200 for success, 400 for bad requests, 404 for not found, 500 for server errors',
    });
    suggestions.push({
      title: 'API validates input data',
      description:
        'Endpoint properly validates required fields and returns descriptive error messages for invalid input',
    });
  }

  // UI/Frontend tasks
  if (
    combined.includes('ui') ||
    combined.includes('frontend') ||
    combined.includes('page') ||
    combined.includes('component')
  ) {
    suggestions.push({
      title: 'UI renders correctly on different screen sizes',
      description:
        'Component displays properly on mobile (320px), tablet (768px), and desktop (1024px+) viewports',
    });
    suggestions.push({
      title: 'UI is accessible to screen readers',
      description:
        'All interactive elements have proper ARIA labels and can be navigated using keyboard only',
    });
  }

  // Authentication tasks
  if (combined.includes('auth') || combined.includes('login') || combined.includes('user')) {
    suggestions.push({
      title: 'Invalid credentials are rejected',
      description:
        'System returns appropriate error message for wrong username/password without revealing which field is incorrect',
    });
    suggestions.push({
      title: 'Sessions expire appropriately',
      description:
        'User sessions expire after configured timeout period and require re-authentication',
    });
  }

  // Performance tasks
  if (combined.includes('performance') || combined.includes('speed') || combined.includes('load')) {
    suggestions.push({
      title: 'Response time meets requirements',
      description:
        'Operation completes within acceptable time limits (specify exact timing requirements)',
    });
  }

  // Database tasks
  if (
    combined.includes('database') ||
    combined.includes('data') ||
    combined.includes('migration')
  ) {
    suggestions.push({
      title: 'Data integrity is maintained',
      description: 'All existing data remains valid and accessible after changes are applied',
    });
  }

  return suggestions;
}
