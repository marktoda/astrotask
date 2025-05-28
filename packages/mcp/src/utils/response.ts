/**
 * @fileoverview MCP response utilities
 * 
 * Provides consistent response formatting and error handling for MCP tools.
 * Centralizes response wrapping logic to eliminate duplication across handlers.
 * 
 * @module utils/response
 * @since 1.0.0
 */

/**
 * Standard MCP response format that matches the SDK expectations
 */
export interface MCPResponse {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Wraps handler responses in the standard MCP response format
 * 
 * @param data - The data to wrap in the response
 * @param isError - Whether this is an error response
 * @returns Formatted MCP response
 */
export function wrapMCPResponse<T>(data: T, isError: boolean = false): MCPResponse {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ],
    isError
  };
}

/**
 * Wraps error information in the standard MCP response format
 * 
 * @param error - The error to wrap
 * @param context - Optional context information
 * @returns Formatted MCP error response
 */
export function wrapMCPError(error: unknown, context?: string): MCPResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: fullMessage }, null, 2)
      }
    ],
    isError: true
  };
}

/**
 * Generic wrapper for MCP tool handlers that adds error handling and response formatting
 * 
 * @param handler - The handler function to wrap
 * @returns Wrapped handler with error handling and response formatting
 */
export function wrapMCPHandler<T extends any[], R>(
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<MCPResponse> {
  return async (...args: T) => {
    try {
      const result = await handler(...args);
      return wrapMCPResponse(result);
    } catch (error) {
      return wrapMCPError(error);
    }
  };
}

/**
 * Success response helper
 * 
 * @param data - The success data
 * @returns Formatted success response
 */
export function successResponse<T>(data: T): MCPResponse {
  return wrapMCPResponse(data, false);
}

/**
 * Error response helper
 * 
 * @param error - The error
 * @param context - Optional context
 * @returns Formatted error response
 */
export function errorResponse(error: unknown, context?: string): MCPResponse {
  return wrapMCPError(error, context);
} 