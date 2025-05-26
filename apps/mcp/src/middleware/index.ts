/**
 * Middleware framework for MCP Server
 * 
 * Provides:
 * - Centralized error handling
 * - Request/response logging
 * - Performance monitoring
 * - Security middleware
 */

import { createModuleLogger, logError, startTimer } from '../../../../src/utils/logger.js';
import { 
  MCPError, 
  ValidationError, 
  DatabaseError, 
  InternalServerError,
  InitializationError,
  ToolNotFoundError
} from '../errors/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const logger = createModuleLogger('MCPMiddleware');

/**
 * Request context for middleware chain
 */
export interface RequestContext {
  toolName: string;
  args: unknown;
  requestId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Middleware function type
 */
export type MiddlewareFunction = (
  context: RequestContext,
  next: () => Promise<any>
) => Promise<any>;

/**
 * MCP Response type
 */
export interface MCPResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Create request context for middleware chain
 */
export function createRequestContext(toolName: string, args: unknown): RequestContext {
  return {
    toolName,
    args,
    requestId: generateRequestId(),
    timestamp: new Date().toISOString(),
    metadata: {}
  };
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Error handling middleware - converts all errors to proper MCP responses
 */
export function errorHandlingMiddleware(
  context: RequestContext,
  next: () => Promise<any>
): Promise<MCPResponse> {
  return next().catch((error: unknown) => {
    const requestLogger = logger.child({ 
      requestId: context.requestId,
      tool: context.toolName 
    });

    // Handle known MCP errors
    if (error instanceof MCPError) {
      logError(requestLogger, error, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        isUserError: error.isUserError,
        context: error.context
      });
      return error.toMCPResponse();
    }

    // Handle validation errors that might not be wrapped
    if (error instanceof Error && error.name === 'ZodError') {
      const validationError = ValidationError.fromZodError(error as any);
      logError(requestLogger, validationError, {
        statusCode: validationError.statusCode,
        errorCode: validationError.errorCode
      });
      return validationError.toMCPResponse();
    }

    // Handle database errors
    if (error instanceof Error && error.message.includes('SQLITE')) {
      const dbError = new DatabaseError(context.toolName, error);
      logError(requestLogger, dbError, {
        statusCode: dbError.statusCode,
        errorCode: dbError.errorCode
      });
      return dbError.toMCPResponse();
    }

    // Handle generic errors
    const internalError = new InternalServerError(
      context.toolName,
      error instanceof Error ? error : undefined,
      { args: context.args }
    );

    logError(requestLogger, internalError, {
      statusCode: internalError.statusCode,
      errorCode: internalError.errorCode,
      originalError: error instanceof Error ? error.message : String(error)
    });

    return internalError.toMCPResponse();
  });
}

/**
 * Request logging middleware - logs incoming requests and responses
 */
export async function requestLoggingMiddleware(
  context: RequestContext,
  next: () => Promise<any>
): Promise<any> {
  const requestLogger = logger.child({ 
    requestId: context.requestId,
    tool: context.toolName 
  });

  requestLogger.info({
    tool: context.toolName,
    args: sanitizeArgsForLogging(context.args),
    timestamp: context.timestamp
  }, `Incoming request: ${context.toolName}`);

  const endTimer = startTimer(requestLogger, context.toolName);

  try {
    const result = await next();
    
    endTimer({
      success: true,
      hasError: result?.isError || false
    });

    requestLogger.debug({
      tool: context.toolName,
      resultType: typeof result,
      hasError: result?.isError || false
    }, `Request completed: ${context.toolName}`);

    return result;
  } catch (error) {
    endTimer({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });

    throw error; // Re-throw for error handling middleware
  }
}

/**
 * Tool validation middleware - ensures tool exists and is properly configured
 */
export async function toolValidationMiddleware(
  context: RequestContext,
  next: () => Promise<any>,
  availableTools: Tool[]
): Promise<any> {
  const toolExists = availableTools.some(tool => tool.name === context.toolName);
  
  if (!toolExists) {
    const availableToolNames = availableTools.map(tool => tool.name);
    throw new ToolNotFoundError(context.toolName, availableToolNames, {
      requestId: context.requestId
    });
  }

  return next();
}

/**
 * Security middleware - basic security checks
 */
export async function securityMiddleware(
  context: RequestContext,
  next: () => Promise<any>
): Promise<any> {
  const requestLogger = logger.child({ 
    requestId: context.requestId,
    tool: context.toolName 
  });

  // Check for suspicious patterns in args
  const argsString = JSON.stringify(context.args);
  
  const suspiciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /eval\s*\(/gi,
    /document\.cookie/gi,
    /\.\.\/\.\.\//g, // Path traversal
    /\bUNION\b.*\bSELECT\b/gi, // SQL injection
    /\bDROP\b.*\bTABLE\b/gi
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(argsString)) {
      requestLogger.warn({
        pattern: pattern.source,
        tool: context.toolName,
        suspiciousContent: argsString.substring(0, 100) // First 100 chars for logging
      }, 'Suspicious content detected in request');
      
      throw new ValidationError(
        'Request contains potentially malicious content',
        'args',
        undefined,
        { pattern: pattern.source, requestId: context.requestId }
      );
    }
  }

  return next();
}

/**
 * Performance monitoring middleware
 */
export async function performanceMiddleware(
  context: RequestContext,
  next: () => Promise<any>
): Promise<any> {
  const startMemory = process.memoryUsage();
  const startTime = process.hrtime.bigint();

  try {
    const result = await next();
    
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms
    
    const performanceMetrics = {
      duration: `${duration.toFixed(2)}ms`,
      memoryDelta: {
        rss: endMemory.rss - startMemory.rss,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal
      }
    };

    // Log performance warnings for slow operations
    if (duration > 5000) { // > 5 seconds
      logger.warn({
        tool: context.toolName,
        requestId: context.requestId,
        ...performanceMetrics
      }, `Slow operation detected: ${context.toolName}`);
    }

    // Add performance data to context for potential response headers
    context.metadata = {
      ...context.metadata,
      performance: performanceMetrics
    };

    return result;
  } catch (error) {
    // Still log performance data for failed requests
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1_000_000;
    
    logger.debug({
      tool: context.toolName,
      requestId: context.requestId,
      duration: `${duration.toFixed(2)}ms`,
      success: false
    }, `Performance data for failed request: ${context.toolName}`);

    throw error;
  }
}

/**
 * Initialization check middleware
 */
export async function initializationMiddleware(
  context: RequestContext,
  next: () => Promise<any>,
  isInitialized: () => boolean
): Promise<any> {
  if (!isInitialized()) {
    throw new InitializationError('MCPServer', undefined, {
      tool: context.toolName,
      requestId: context.requestId
    });
  }

  return next();
}

/**
 * Compose multiple middleware functions into a single handler
 */
export function composeMiddleware(
  middlewares: MiddlewareFunction[],
  finalHandler: (context: RequestContext) => Promise<any>
): (context: RequestContext) => Promise<any> {
  return (context: RequestContext) => {
    let index = 0;

    function dispatch(i: number): Promise<any> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      
      index = i;
      
      let fn = middlewares[i];
      if (i === middlewares.length) {
        fn = finalHandler as MiddlewareFunction;
      }

      if (!fn) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(fn(context, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

/**
 * Sanitize arguments for logging (remove sensitive data)
 */
function sanitizeArgsForLogging(args: unknown): unknown {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  const sanitized = JSON.parse(JSON.stringify(args));

  function sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeObject(value);
        }
      }
      return result;
    }
    
    return obj;
  }

  return sanitizeObject(sanitized);
}

/**
 * Create standard middleware stack for MCP server
 */
export function createStandardMiddlewareStack(
  availableTools: Tool[],
  isInitialized: () => boolean
): MiddlewareFunction[] {
  return [
    requestLoggingMiddleware,
    (context, next) => initializationMiddleware(context, next, isInitialized),
    (context, next) => toolValidationMiddleware(context, next, availableTools),
    securityMiddleware,
    performanceMiddleware
  ];
} 