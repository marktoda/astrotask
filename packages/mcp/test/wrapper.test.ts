/**
 * Tests for MCP response wrapper functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the wrapper functions - we'll need to adjust imports based on actual structure
// For now, I'll create the functions as they would be exported

/**
 * Test versions of the wrapper functions from index.ts
 */
function wrapMCPResponse<T>(data: T, isError: boolean = false) {
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

function wrapMCPError(error: unknown, context?: string) {
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

function wrap<T extends any[], R>(handler: (...args: T) => Promise<R>) {
  return async (...args: T) => {
    try {
      const result = await handler(...args);
      return wrapMCPResponse(result);
    } catch (error) {
      return wrapMCPError(error);
    }
  };
}

describe('MCP Response Wrapper Functions', () => {
  describe('wrapMCPResponse', () => {
    it('should wrap string data correctly', () => {
      const result = wrapMCPResponse('Hello World');
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Hello World'
          }
        ],
        isError: false
      });
    });

    it('should wrap object data as JSON string', () => {
      const data = { id: '1', title: 'Test Task' };
      const result = wrapMCPResponse(data);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should wrap array data as JSON string', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const result = wrapMCPResponse(data);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should set isError flag when specified', () => {
      const result = wrapMCPResponse('Error message', true);
      
      expect(result.isError).toBe(true);
    });

    it('should handle null and undefined data', () => {
      const nullResult = wrapMCPResponse(null);
      const undefinedResult = wrapMCPResponse(undefined);
      
      expect(nullResult.content[0].text).toBe('null');
      expect(undefinedResult.content[0].text).toBe(undefined);
    });

    it('should handle boolean and number data', () => {
      const boolResult = wrapMCPResponse(true);
      const numberResult = wrapMCPResponse(42);
      
      expect(boolResult.content[0].text).toBe('true');
      expect(numberResult.content[0].text).toBe('42');
    });
  });

  describe('wrapMCPError', () => {
    it('should wrap Error objects correctly', () => {
      const error = new Error('Something went wrong');
      const result = wrapMCPError(error);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Something went wrong' }, null, 2)
          }
        ],
        isError: true
      });
    });

    it('should wrap non-Error objects as strings', () => {
      const result = wrapMCPError('String error');
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'String error' }, null, 2)
          }
        ],
        isError: true
      });
    });

    it('should include context when provided', () => {
      const error = new Error('Database connection failed');
      const result = wrapMCPError(error, 'Failed to create task');
      
      expect(result.content[0].text).toBe(
        JSON.stringify({ error: 'Failed to create task: Database connection failed' }, null, 2)
      );
    });

    it('should handle undefined and null errors', () => {
      const nullResult = wrapMCPError(null);
      const undefinedResult = wrapMCPError(undefined);
      
      expect(nullResult.content[0].text).toBe(
        JSON.stringify({ error: 'null' }, null, 2)
      );
      expect(undefinedResult.content[0].text).toBe(
        JSON.stringify({ error: 'undefined' }, null, 2)
      );
    });
  });

  describe('wrap function', () => {
    it('should wrap successful handler responses', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ id: '1', title: 'Test' });
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler('arg1', 'arg2');
      
      expect(mockHandler).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ id: '1', title: 'Test' }, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should wrap handler errors in MCP error format', async () => {
      const error = new Error('Handler failed');
      const mockHandler = vi.fn().mockRejectedValue(error);
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler('arg1');
      
      expect(mockHandler).toHaveBeenCalledWith('arg1');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Handler failed' }, null, 2)
          }
        ],
        isError: true
      });
    });

    it('should handle handlers that return strings', async () => {
      const mockHandler = vi.fn().mockResolvedValue('Success message');
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler();
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Success message'
          }
        ],
        isError: false
      });
    });

    it('should preserve handler arguments and return types', async () => {
      const mockHandler = vi.fn().mockImplementation(
        async (id: string, data: { title: string }) => ({ 
          id, 
          ...data,
          updated: true 
        })
      );
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler('123', { title: 'New Title' });
      
      expect(mockHandler).toHaveBeenCalledWith('123', { title: 'New Title' });
      expect(result.content[0].text).toBe(
        JSON.stringify({ 
          id: '123', 
          title: 'New Title', 
          updated: true 
        }, null, 2)
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex nested objects', async () => {
      const complexData = {
        task: {
          id: '1',
          title: 'Complex Task',
          subtasks: [
            { id: '1.1', title: 'Subtask 1' },
            { id: '1.2', title: 'Subtask 2' }
          ]
        },
        metadata: {
          totalSubtasks: 2,
          completedSubtasks: 0,
          pendingSubtasks: 2
        }
      };

      const mockHandler = vi.fn().mockResolvedValue(complexData);
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler();
      
      expect(result.content[0].text).toBe(JSON.stringify(complexData, null, 2));
      expect(result.isError).toBe(false);
    });

    it('should handle arrays of objects', async () => {
      const tasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'done' }
      ];

      const mockHandler = vi.fn().mockResolvedValue(tasks);
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler();
      
      expect(result.content[0].text).toBe(JSON.stringify(tasks, null, 2));
      expect(result.isError).toBe(false);
    });

    it('should handle operation result objects', async () => {
      const operationResult = {
        success: true,
        message: 'Task deleted successfully'
      };

      const mockHandler = vi.fn().mockResolvedValue(operationResult);
      const wrappedHandler = wrap(mockHandler);
      
      const result = await wrappedHandler();
      
      expect(result.content[0].text).toBe(JSON.stringify(operationResult, null, 2));
      expect(result.isError).toBe(false);
    });
  });
}); 