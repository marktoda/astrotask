/**
 * Unified response builder for MCP operations
 * 
 * Provides consistent response formatting and eliminates duplicate
 * JSON stringification patterns throughout the codebase.
 */

import type { MCPResponse } from './types.js';

export class ResponseBuilder {
  /**
   * Create a successful response with data
   */
  static success<T>(data: T, message?: string): MCPResponse {
    const response = message ? { success: true, message, data } : data;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * Create a successful response with task data
   */
  static taskSuccess<T>(task: T, message?: string): MCPResponse {
    const response = {
      success: true,
      ...(message && { message }),
      task,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * Create a successful response with task list data
   */
  static taskListSuccess<T>(tasks: T[], count?: number): MCPResponse {
    const response = {
      tasks,
      count: count ?? tasks.length,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * Create a successful response with context data
   */
  static contextSuccess<T>(context: T): MCPResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(context, null, 2),
        },
      ],
    };
  }

  /**
   * Create an error response
   */
  static error(message: string, code?: string, details?: Record<string, unknown>): MCPResponse {
    const response = {
      error: {
        message,
        ...(code && { code }),
        ...(details && { details }),
        timestamp: new Date().toISOString(),
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
      isError: true,
    };
  }

  /**
   * Create a deletion success response
   */
  static deleteSuccess(id: string, cascade = false): MCPResponse {
    return this.success({
      success: true,
      message: `Task ${id} deleted${cascade ? ' with all subtasks' : ''}`,
    });
  }
} 