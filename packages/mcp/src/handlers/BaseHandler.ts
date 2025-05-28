/**
 * @fileoverview Base handler class for MCP operations
 * 
 * Provides common functionality and error handling patterns for all MCP handlers.
 * Reduces duplication and ensures consistent behavior across the system.
 * 
 * @module handlers/BaseHandler
 * @since 1.0.0
 */

import { createModuleLogger } from '@astrolabe/core';
import type { HandlerContext, MCPHandler, LoggingContext, OperationResult } from './types.js';

/**
 * Base class for all MCP handlers providing common functionality
 * 
 * @abstract
 * @implements {MCPHandler}
 */
export abstract class BaseHandler implements MCPHandler {
  protected readonly logger: ReturnType<typeof createModuleLogger>;

  constructor(public readonly context: HandlerContext) {
    this.logger = createModuleLogger(this.constructor.name);
  }

  /**
   * Validates that a task exists and throws if not found
   * 
   * @param taskId - The task ID to validate
   * @throws {Error} When task is not found
   * @returns Promise that resolves to the task
   */
  protected async validateTaskExists(taskId: string) {
    const task = await this.context.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  /**
   * Logs operation start with context
   * 
   * @param operation - The operation name
   * @param context - Logging context with operation details
   */
  protected logOperationStart(operation: string, context: Partial<LoggingContext> = {}) {
    this.logger.info(`Starting ${operation}`, {
      operation,
      requestId: this.context.requestId,
      ...context,
    });
  }

  /**
   * Logs operation success with context
   * 
   * @param operation - The operation name
   * @param result - Operation result metadata
   */
  protected logOperationSuccess(operation: string, result: Partial<OperationResult> = {}) {
    this.logger.info(`${operation} completed successfully`, {
      operation,
      requestId: this.context.requestId,
      success: true,
      ...result,
    });
  }

  /**
   * Logs operation error with context
   * 
   * @param operation - The operation name
   * @param error - The error that occurred
   * @param context - Original operation context
   */
  protected logOperationError(
    operation: string, 
    error: unknown, 
    context: Partial<LoggingContext> = {}
  ) {
    this.logger.error(`${operation} failed`, {
      operation,
      requestId: this.context.requestId,
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
  }

  /**
   * Wraps an operation with consistent logging and error handling
   * 
   * @param operation - The operation name
   * @param context - Operation context for logging
   * @param fn - The operation function to execute
   * @returns Promise that resolves to the operation result
   */
  protected async withLogging<T>(
    operation: string,
    context: Partial<LoggingContext>,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    this.logOperationStart(operation, context);
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.logOperationSuccess(operation, { 
        success: true, 
        duration,
        ...('length' in (result as any) ? { itemsAffected: (result as any).length } : {})
      });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logOperationError(operation, error, { ...context, operationData: { duration } });
      throw error;
    }
  }
} 