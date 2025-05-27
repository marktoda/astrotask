import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  createRequestContext,
  errorHandlingMiddleware,
  requestLoggingMiddleware,
  toolValidationMiddleware,
  composeMiddleware,
  createStandardMiddlewareStack,
  type RequestContext,
  type MCPResponse,
} from '../src/middleware/index.js';
import {
  ValidationError,
  DatabaseError,
  ToolNotFoundError,
} from '../src/errors/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('Middleware', () => {
  describe('createRequestContext', () => {
    it('should create a valid request context', () => {
      const context = createRequestContext('test_tool', { param: 'value' });
      
      expect(context.toolName).toBe('test_tool');
      expect(context.args).toEqual({ param: 'value' });
      expect(context.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(context.timestamp).toBeDefined();
      expect(new Date(context.timestamp)).toBeInstanceOf(Date);
      expect(context.metadata).toEqual({});
    });

    it('should generate unique request IDs', () => {
      const context1 = createRequestContext('tool1', {});
      const context2 = createRequestContext('tool2', {});
      
      expect(context1.requestId).not.toBe(context2.requestId);
    });
  });

  describe('errorHandlingMiddleware', () => {
    let context: RequestContext;

    beforeEach(() => {
      context = createRequestContext('test_tool', {});
    });

    it('should handle MCPError properly', async () => {
      const validationError = new ValidationError('Test validation error');
      const next = vi.fn().mockRejectedValue(validationError);

      const result = await errorHandlingMiddleware(context, next);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle ZodError and convert to ValidationError', async () => {
      // Create a real ZodError by parsing invalid data
      const schema = z.object({ age: z.number().min(18) });
      let zodError: unknown;

      try {
        schema.parse({ age: 'not-a-number' });
      } catch (err) {
        zodError = err;
      }

      const next = vi.fn().mockRejectedValue(zodError);

      const result = await errorHandlingMiddleware(context, next);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('SQLITE database is locked');
      const next = vi.fn().mockRejectedValue(dbError);

      const result = await errorHandlingMiddleware(context, next);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.code).toBe('DATABASE_ERROR');
    });

    it('should handle generic errors as internal server errors', async () => {
      const genericError = new Error('Something went wrong');
      const next = vi.fn().mockRejectedValue(genericError);

      const result = await errorHandlingMiddleware(context, next);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error.code).toBe('INTERNAL_ERROR');
    });

    it('should pass through successful responses', async () => {
      const successResponse: MCPResponse = {
        content: [{ type: 'text', text: 'Success' }],
        isError: false,
      };
      const next = vi.fn().mockResolvedValue(successResponse);

      const result = await errorHandlingMiddleware(context, next);

      expect(result).toBe(successResponse);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('requestLoggingMiddleware', () => {
    let context: RequestContext;

    beforeEach(() => {
      context = createRequestContext('test_tool', { param: 'value' });
    });

    it('should log successful requests', async () => {
      const result = { success: true };
      const next = vi.fn().mockResolvedValue(result);

      const response = await requestLoggingMiddleware(context, next);

      expect(response).toBe(result);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle and re-throw errors', async () => {
      const error = new Error('Test error');
      const next = vi.fn().mockRejectedValue(error);

      await expect(requestLoggingMiddleware(context, next)).rejects.toThrow('Test error');
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('toolValidationMiddleware', () => {
    let context: RequestContext;
    const mockTools: Tool[] = [
      { 
        name: 'valid_tool', 
        description: 'A valid tool',
        inputSchema: { type: 'object', properties: {} }
      },
      { 
        name: 'another_tool', 
        description: 'Another valid tool',
        inputSchema: { type: 'object', properties: {} }
      },
    ];

    beforeEach(() => {
      context = createRequestContext('valid_tool', {});
    });

    it('should allow valid tools to proceed', async () => {
      const result = { success: true };
      const next = vi.fn().mockResolvedValue(result);

      const response = await toolValidationMiddleware(context, next, mockTools);

      expect(response).toBe(result);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should throw ToolNotFoundError for invalid tools', async () => {
      context.toolName = 'invalid_tool';
      const next = vi.fn();

      await expect(
        toolValidationMiddleware(context, next, mockTools)
      ).rejects.toThrow(ToolNotFoundError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('composeMiddleware', () => {
    it('should execute middleware in order and call final handler', async () => {
      const executionOrder: string[] = [];
      
      const middleware1 = vi.fn(async (context: RequestContext, next: () => Promise<unknown>) => {
        executionOrder.push('middleware1-start');
        const result = await next();
        executionOrder.push('middleware1-end');
        return result;
      });

      const middleware2 = vi.fn(async (context: RequestContext, next: () => Promise<unknown>) => {
        executionOrder.push('middleware2-start');
        const result = await next();
        executionOrder.push('middleware2-end');
        return result;
      });

      const finalHandler = vi.fn(async (context: RequestContext) => {
        executionOrder.push('handler');
        return { result: 'success' };
      });

      const composed = composeMiddleware([middleware1, middleware2], finalHandler);
      const context = createRequestContext('test', {});

      const result = await composed(context);

      expect(result).toEqual({ result: 'success' });
      expect(executionOrder).toEqual([
        'middleware1-start',
        'middleware2-start',
        'handler',
        'middleware2-end',
        'middleware1-end',
      ]);
    });

    it('should handle empty middleware array', async () => {
      const finalHandler = vi.fn(async () => ({ result: 'success' }));
      const composed = composeMiddleware([], finalHandler);
      const context = createRequestContext('test', {});

      const result = await composed(context);

      expect(result).toEqual({ result: 'success' });
      expect(finalHandler).toHaveBeenCalledWith(context);
    });
  });

  describe('createStandardMiddlewareStack', () => {
    it('should create a middleware stack with expected middleware functions', () => {
      const tools: Tool[] = [{ 
        name: 'test_tool', 
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} }
      }];
      const isInitialized = () => true;

      const stack = createStandardMiddlewareStack(tools, isInitialized);

      expect(stack).toHaveLength(5); // Based on the implementation
      expect(Array.isArray(stack)).toBe(true);
    });
  });
}); 