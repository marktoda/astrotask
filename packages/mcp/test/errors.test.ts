import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  MCPError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  ConflictError,
  DatabaseError,
  InternalServerError,
  ToolNotFoundError,
  InitializationError,
} from '../src/errors/index.js';

describe('Error Classes', () => {
  describe('MCPError (base class)', () => {
    class TestError extends MCPError {
      readonly statusCode = 400;
      readonly errorCode = 'TEST_ERROR';
      readonly isUserError = true;
    }

    it('should set basic properties correctly', () => {
      const error = new TestError('Test message');
      
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('TestError');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.isUserError).toBe(true);
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include context when provided', () => {
      const context = { userId: '123', action: 'test' };
      const error = new TestError('Test message', context);
      
      expect(error.context).toEqual(context);
    });

    it('should return user message for user errors', () => {
      const error = new TestError('User-facing error');
      
      expect(error.getClientMessage()).toBe('User-facing error');
    });

    it('should return generic message for non-user errors', () => {
      class InternalTestError extends MCPError {
        readonly statusCode = 500;
        readonly errorCode = 'INTERNAL_TEST_ERROR';
        readonly isUserError = false;
      }

      const error = new InternalTestError('Internal error details');
      
      expect(error.getClientMessage()).toBe('An internal server error occurred');
    });

    it('should convert to MCP response format', () => {
      const error = new TestError('Test error', { field: 'test' });
      const response = error.toMCPResponse();
      
      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.error.code).toBe('TEST_ERROR');
      expect(parsedContent.error.message).toBe('Test error');
      expect(parsedContent.error.details).toEqual({ field: 'test' });
    });
  });

  describe('ValidationError', () => {
    it('should create error with field and value', () => {
      const error = new ValidationError('Invalid input', 'email', 'invalid-email');
      
      expect(error.message).toBe('Invalid input');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid-email');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.isUserError).toBe(true);
    });

    it('should create error from Zod error', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      try {
        schema.parse({ email: 'invalid', age: 16 });
      } catch (zodError) {
        const error = ValidationError.fromZodError(zodError as z.ZodError);
        
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Validation failed for field');
        expect(error.statusCode).toBe(400);
        expect(error.errorCode).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle object values by stringifying them', () => {
      const complexValue = { nested: { value: 123 } };
      const error = new ValidationError('Invalid object', 'data', complexValue);
      
      expect(error.context?.value).toBe(JSON.stringify(complexValue));
    });
  });

  describe('NotFoundError', () => {
    it('should create proper not found error', () => {
      const error = new NotFoundError('Task', '123');
      
      expect(error.message).toBe("Task with ID '123' not found");
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.isUserError).toBe(true);
      expect(error.context).toEqual({
        resource: 'Task',
        resourceId: '123',
      });
    });
  });

  describe('ForbiddenError', () => {
    it('should create error without resource', () => {
      const error = new ForbiddenError('delete');
      
      expect(error.message).toBe('Access denied: Cannot delete');
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('FORBIDDEN');
      expect(error.isUserError).toBe(true);
    });

    it('should create error with resource', () => {
      const error = new ForbiddenError('update', 'user profile');
      
      expect(error.message).toBe('Access denied: Cannot update user profile');
      expect(error.context).toEqual({
        operation: 'update',
        resource: 'user profile',
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry info', () => {
      const error = new RateLimitError(60);
      
      expect(error.message).toBe('Rate limit exceeded. Try again after 60 seconds');
      expect(error.retryAfter).toBe(60);
      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.isUserError).toBe(true);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with details', () => {
      const error = new ConflictError('User', 'email', 'test@example.com');
      
      expect(error.message).toBe("User with email 'test@example.com' already exists");
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('CONFLICT');
      expect(error.isUserError).toBe(true);
      expect(error.context).toEqual({
        resource: 'User',
        conflictField: 'email',
        conflictValue: 'test@example.com',
      });
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('user creation');
      
      expect(error.message).toBe('Database error during user creation');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('DATABASE_ERROR');
      expect(error.isUserError).toBe(false);
    });

    it('should include cause when provided', () => {
      const cause = new Error('Connection timeout');
      const error = new DatabaseError('data retrieval', cause);
      
      expect(error.context?.cause).toBe('Connection timeout');
    });
  });

  describe('InternalServerError', () => {
    it('should create internal server error', () => {
      const error = new InternalServerError('request processing');
      
      expect(error.message).toBe('Internal error during request processing');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('INTERNAL_ERROR');
      expect(error.isUserError).toBe(false);
    });

    it('should include cause when provided', () => {
      const cause = new Error('Unexpected null pointer');
      const error = new InternalServerError('calculation', cause);
      
      expect(error.context?.cause).toBe('Unexpected null pointer');
    });
  });

  describe('ToolNotFoundError', () => {
    it('should create tool not found error', () => {
      const error = new ToolNotFoundError('unknown_tool');
      
      expect(error.message).toBe("Tool 'unknown_tool' not found");
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe('TOOL_NOT_FOUND');
      expect(error.isUserError).toBe(true);
      expect(error.context?.requestedTool).toBe('unknown_tool');
    });

    it('should include available tools when provided', () => {
      const availableTools = ['tool1', 'tool2', 'tool3'];
      const error = new ToolNotFoundError('unknown_tool', availableTools);
      
      expect(error.context?.availableTools).toEqual(availableTools);
    });
  });

  describe('InitializationError', () => {
    it('should create initialization error', () => {
      const error = new InitializationError('database');
      
      expect(error.message).toBe('Service database not properly initialized');
      expect(error.statusCode).toBe(503);
      expect(error.errorCode).toBe('SERVICE_UNAVAILABLE');
      expect(error.isUserError).toBe(false);
    });

    it('should include cause when provided', () => {
      const cause = new Error('Config file not found');
      const error = new InitializationError('config service', cause);
      
      expect(error.context?.cause).toBe('Config file not found');
    });
  });
}); 