/**
 * Integration tests for MCP wrapper with TaskHandlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandlers } from '../src/handlers/TaskHandlers.js';
import type { HandlerContext } from '../src/handlers/types.js';

// Test versions of the wrapper functions from index.ts
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

// Mock dependencies
const mockStore = {
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  listSubtasks: vi.fn(),
  listTasksByStatus: vi.fn(),
};

const mockTaskService = {
  getTaskTree: vi.fn(),
  getTaskAncestors: vi.fn(),
  getTaskDescendants: vi.fn(),
  deleteTaskTree: vi.fn(),
};

const mockContext: HandlerContext = {
  store: mockStore as any,
  taskService: mockTaskService as any,
  requestId: 'test-request',
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('MCP Wrapper Integration', () => {
  let taskHandlers: TaskHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    taskHandlers = new TaskHandlers(mockContext);
  });

  describe('Successful operations wrapped', () => {
    it('should wrap listTasks response in MCP format', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'done' }
      ];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      const wrappedHandler = wrap(taskHandlers.listTasks.bind(taskHandlers));
      const result = await wrappedHandler({ includeSubtasks: false });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockTasks, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should wrap createTask response in MCP format', async () => {
      const createdTask = { id: '1', title: 'New Task', status: 'pending' };
      mockStore.addTask.mockResolvedValue(createdTask);

      const wrappedHandler = wrap(taskHandlers.createTask.bind(taskHandlers));
      const result = await wrappedHandler({ title: 'New Task' });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(createdTask, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should wrap deleteTask success response in MCP format', async () => {
      const existingTask = { id: '1', title: 'Task to delete' };
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listSubtasks.mockResolvedValue([]);
      mockStore.deleteTask.mockResolvedValue(undefined);

      const wrappedHandler = wrap(taskHandlers.deleteTask.bind(taskHandlers));
      const result = await wrappedHandler({ id: '1', cascade: false });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Task 1 deleted'
            }, null, 2)
          }
        ],
        isError: false
      });
    });

    it('should wrap complex TaskContext response in MCP format', async () => {
      const task = { id: '1', title: 'Test Task' };
      const subtasks = [{ id: '1.1', status: 'done' }];
      const ancestors = [{ id: '0', title: 'Parent' }];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listSubtasks.mockResolvedValue(subtasks);
      mockTaskService.getTaskAncestors.mockResolvedValue(ancestors);

      const wrappedHandler = wrap(taskHandlers.getTaskContext.bind(taskHandlers));
      const result = await wrappedHandler({ 
        id: '1',
        includeAncestors: true,
        includeDescendants: false,
        maxDepth: 3
      });

      const expectedContext = {
        task,
        ancestors,
        descendants: [],
        relatedTasks: [],
        metadata: {
          totalSubtasks: 1,
          completedSubtasks: 1,
          pendingSubtasks: 0,
        },
      };

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(expectedContext, null, 2)
          }
        ],
        isError: false
      });
    });
  });

  describe('Error handling wrapped', () => {
    it('should wrap TaskHandlers errors in MCP error format', async () => {
      mockStore.getTask.mockResolvedValue(null);

      const wrappedHandler = wrap(taskHandlers.updateTask.bind(taskHandlers));
      const result = await wrappedHandler({ id: '1', title: 'New Title' });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Task not found' }, null, 2)
          }
        ],
        isError: true
      });
    });

    it('should wrap store errors in MCP error format', async () => {
      const storeError = new Error('Database connection failed');
      mockStore.listTasks.mockRejectedValue(storeError);

      const wrappedHandler = wrap(taskHandlers.listTasks.bind(taskHandlers));
      const result = await wrappedHandler({ includeSubtasks: false });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Database connection failed' }, null, 2)
          }
        ],
        isError: true
      });
    });

    it('should wrap validation errors in MCP error format', async () => {
      const existingTask = { id: '1', title: 'Task with subtasks' };
      const subtasks = [{ id: '1.1', title: 'Subtask' }];
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listSubtasks.mockResolvedValue(subtasks);

      const wrappedHandler = wrap(taskHandlers.deleteTask.bind(taskHandlers));
      const result = await wrappedHandler({ id: '1', cascade: false });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              error: 'Cannot delete task with subtasks without cascade option' 
            }, null, 2)
          }
        ],
        isError: true
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle null/undefined responses correctly', async () => {
      mockStore.listTasks.mockResolvedValue([]);

      const wrappedHandler = wrap(taskHandlers.listTasks.bind(taskHandlers));
      const result = await wrappedHandler({ includeSubtasks: false });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify([], null, 2)
          }
        ],
        isError: false
      });
    });

    it('should handle promise rejections with non-Error objects', async () => {
      mockStore.getTask.mockRejectedValue('String error message');

      const wrappedHandler = wrap(taskHandlers.completeTask.bind(taskHandlers));
      const result = await wrappedHandler({ id: '1' });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'String error message' }, null, 2)
          }
        ],
        isError: true
      });
    });
  });

  describe('Real-world simulation', () => {
    it('should simulate a complete task workflow with wrapper', async () => {
      // Simulate creating a task
      const newTask = { id: '1', title: 'Complete Project', status: 'pending' };
      mockStore.addTask.mockResolvedValue(newTask);

      const createHandler = wrap(taskHandlers.createTask.bind(taskHandlers));
      const createResult = await createHandler({ title: 'Complete Project' });

      expect(createResult.isError).toBe(false);
      expect(JSON.parse(createResult.content[0].text)).toEqual(newTask);

      // Simulate completing the task
      const completedTask = { ...newTask, status: 'done' };
      mockStore.getTask.mockResolvedValue(newTask);
      mockStore.updateTask.mockResolvedValue(completedTask);

      const completeHandler = wrap(taskHandlers.completeTask.bind(taskHandlers));
      const completeResult = await completeHandler({ id: '1' });

      expect(completeResult.isError).toBe(false);
      expect(JSON.parse(completeResult.content[0].text)).toEqual(completedTask);

      // Simulate listing tasks
      mockStore.listTasks.mockResolvedValue([completedTask]);

      const listHandler = wrap(taskHandlers.listTasks.bind(taskHandlers));
      const listResult = await listHandler({ includeSubtasks: false });

      expect(listResult.isError).toBe(false);
      expect(JSON.parse(listResult.content[0].text)).toEqual([completedTask]);
    });
  });
}); 