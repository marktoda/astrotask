/**
 * Tests for TaskHandlers class
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandlers } from '../src/handlers/TaskHandlers.js';
import type { HandlerContext } from '../src/handlers/types.js';

// Mock the core dependencies
const mockStore = {
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  listTasksByStatus: vi.fn(),
  listRootTasks: vi.fn(),
  // Keep convenience methods for backward compatibility
  listSubtasks: vi.fn(),
};

const mockTaskService = {
  getTaskTree: vi.fn(),
  getTaskTrees: vi.fn(),
  getTaskWithContext: vi.fn(),
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

describe('TaskHandlers', () => {
  let taskHandlers: TaskHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    taskHandlers = new TaskHandlers(mockContext);
  });

  describe('listTasks', () => {
    it('should list all tasks when no filters provided', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'done' }
      ];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      const result = await taskHandlers.listTasks({ includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({});
      expect(result).toEqual(mockTasks);
    });

    it('should filter tasks by status', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' }
      ];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      const result = await taskHandlers.listTasks({ status: 'pending', includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({ status: 'pending' });
      expect(result).toEqual(mockTasks);
    });

    it('should filter tasks by parentId', async () => {
      const mockTasks = [{ id: '1.1', title: 'Subtask 1', parentId: 'parent-1' }];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      await taskHandlers.listTasks({ parentId: 'parent-1', includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({ parentId: 'parent-1' });
    });

    it('should list subtasks of specific parent', async () => {
      const mockSubtasks = [
        { id: '1.1', title: 'Subtask 1', parentId: '1' }
      ];
      mockStore.listTasks.mockResolvedValue(mockSubtasks);

      const result = await taskHandlers.listTasks({ parentId: '1', includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({ parentId: '1' });
      expect(result).toEqual(mockSubtasks);
    });

    it('should include subtasks when requested', async () => {
      const mockTasks = [{ id: '1', title: 'Task 1' }];
      const mockTaskTreePlain = { task: { id: '1', title: 'Task 1' }, children: [] };
      const mockTaskTree = {
        toPlainObject: vi.fn().mockReturnValue(mockTaskTreePlain)
      };
      
      mockStore.listTasks.mockResolvedValue(mockTasks);
      mockTaskService.getTaskTrees.mockResolvedValue([mockTaskTree]);

      const result = await taskHandlers.listTasks({ includeSubtasks: true });

      expect(mockTaskService.getTaskTrees).toHaveBeenCalledWith(['1']);
      expect(result).toEqual([mockTaskTreePlain]);
    });

    it('should filter out null task trees', async () => {
      const mockTasks = [{ id: '1' }, { id: '2' }];
      const mockValidTreePlain = { task: { id: '1', title: 'Task 1' }, children: [] };
      const mockValidTree = {
        toPlainObject: vi.fn().mockReturnValue(mockValidTreePlain)
      };
      
      mockStore.listTasks.mockResolvedValue(mockTasks);
      // getTaskTrees filters out null results internally, so only valid trees are returned
      mockTaskService.getTaskTrees.mockResolvedValue([mockValidTree]);

      const result = await taskHandlers.listTasks({ includeSubtasks: true });

      expect(result).toEqual([mockValidTreePlain]);
    });
  });

  describe('createTask', () => {
    it('should create a new task with provided data', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Task description',
        status: 'pending' as const,
        priority: 'medium' as const
      };
      const createdTask = { id: 'A', ...taskData };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      const result = await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith({
        ...taskData,
        parentId: undefined,
        prd: undefined,
        contextDigest: undefined,
      });
      expect(result).toEqual(createdTask);
    });

    it('should create task with default status', async () => {
      const taskData = { 
        title: 'New Task', 
        status: 'pending' as const,
        priority: 'medium' as const
      };
      const createdTask = { id: 'A', title: 'New Task', status: 'pending', priority: 'medium' };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith({
        title: 'New Task',
        description: undefined,
        parentId: undefined,
        priority: 'medium',
        status: 'pending',
        prd: undefined,
        contextDigest: undefined,
      });
    });

    it('should create task with all optional fields', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Description',
        parentId: 'A',
        priority: 'high' as const,
        status: 'in-progress' as const,
        prd: 'PRD content',
        contextDigest: 'digest-123'
      };
      const createdTask = { id: 'A.1', ...taskData };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      const result = await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith(taskData);
      expect(result).toEqual(createdTask);
    });
  });

  describe('updateTask', () => {
    it('should update existing task', async () => {
      const existingTask = { id: 'A', title: 'Old Title' };
      const updateData = { id: 'A', title: 'New Title' };
      const updatedTask = { id: 'A', title: 'New Title' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(updatedTask);

      const result = await taskHandlers.updateTask(updateData);

      expect(mockStore.getTask).toHaveBeenCalledWith('A');
      expect(mockStore.updateTask).toHaveBeenCalledWith('A', {
        title: 'New Title',
        description: undefined,
        status: undefined,
        parentId: undefined,
        prd: undefined,
        contextDigest: undefined,
      });
      expect(result).toEqual(updatedTask);
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.updateTask({ id: 'A', title: 'New Title' }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when update fails', async () => {
      const existingTask = { id: 'A', title: 'Old Title' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(null);

      await expect(taskHandlers.updateTask({ id: 'A', title: 'New Title' }))
        .rejects.toThrow('Failed to update task');
    });
  });

  describe('deleteTask', () => {
    it('should delete task without subtasks', async () => {
      const existingTask = { id: 'A', title: 'Task to delete' };
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listTasks.mockResolvedValue([]);
      mockStore.deleteTask.mockResolvedValue(undefined);

      const result = await taskHandlers.deleteTask({ id: 'A', cascade: false });

      expect(mockStore.getTask).toHaveBeenCalledWith('A');
      expect(mockStore.listTasks).toHaveBeenCalledWith({ parentId: 'A' });
      expect(mockStore.deleteTask).toHaveBeenCalledWith('A');
      expect(result).toEqual({
        success: true,
        message: 'Task A deleted'
      });
    });

    it('should delete task with cascade option', async () => {
      const existingTask = { id: 'A', title: 'Task to delete' };
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockTaskService.deleteTaskTree.mockResolvedValue(undefined);

      const result = await taskHandlers.deleteTask({ id: 'A', cascade: true });

      expect(mockTaskService.deleteTaskTree).toHaveBeenCalledWith('A', true);
      expect(result).toEqual({
        success: true,
        message: 'Task A deleted with all subtasks'
      });
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.deleteTask({ id: 'A', cascade: false }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when deleting task with subtasks without cascade', async () => {
      const existingTask = { id: 'A', title: 'Task with subtasks' };
      const subtasks = [{ id: 'A.1', title: 'Subtask' }];
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listTasks.mockResolvedValue(subtasks);

      await expect(taskHandlers.deleteTask({ id: 'A', cascade: false }))
        .rejects.toThrow('Cannot delete task with subtasks without cascade option');
    });
  });

  describe('completeTask', () => {
    it('should mark task as done', async () => {
      const existingTask = { id: 'A', title: 'Task', status: 'pending' };
      const completedTask = { id: 'A', title: 'Task', status: 'done' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(completedTask);

      const result = await taskHandlers.completeTask({ id: 'A' });

      expect(mockStore.getTask).toHaveBeenCalledWith('A');
      expect(mockStore.updateTask).toHaveBeenCalledWith('A', { status: 'done' });
      expect(result).toEqual(completedTask);
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.completeTask({ id: 'A' }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when completion fails', async () => {
      const existingTask = { id: 'A', title: 'Task' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(null);

      await expect(taskHandlers.completeTask({ id: 'A' }))
        .rejects.toThrow('Failed to complete task');
    });
  });

  describe('getTaskContext', () => {
    it('should return basic task context', async () => {
      const task = { id: 'A', title: 'Test Task' };
      const subtasks = [
        { id: 'A.1', status: 'done' },
        { id: 'A.2', status: 'pending' }
      ];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue(subtasks);

      const result = await taskHandlers.getTaskContext({ 
        id: 'A',
        includeAncestors: false,
        includeDescendants: false,
        maxDepth: 3
      });

      expect(result).toEqual({
        task,
        ancestors: [],
        descendants: [],
        relatedTasks: [],
        metadata: {
          totalSubtasks: 2,
          completedSubtasks: 1,
          pendingSubtasks: 1,
        },
      });
    });

    it('should include ancestors when requested', async () => {
      const task = { id: 'A.1', title: 'Subtask' };
      const ancestors = [{ id: 'A', title: 'Parent Task' }];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue([]);
      mockTaskService.getTaskAncestors.mockResolvedValue(ancestors);

      const result = await taskHandlers.getTaskContext({ 
        id: 'A.1',
        includeAncestors: true,
        includeDescendants: false,
        maxDepth: 3
      });

      expect(mockTaskService.getTaskAncestors).toHaveBeenCalledWith('A.1');
      expect(result.ancestors).toEqual(ancestors);
    });

    it('should include descendants when requested', async () => {
      const task = { id: 'A', title: 'Parent Task' };
      const descendants = [{ id: 'A.1', title: 'Child Task' }];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue([]);
      mockTaskService.getTaskDescendants.mockResolvedValue(descendants);

      const result = await taskHandlers.getTaskContext({ 
        id: 'A',
        includeAncestors: false,
        includeDescendants: true,
        maxDepth: 3
      });

      expect(mockTaskService.getTaskDescendants).toHaveBeenCalledWith('A');
      expect(result.descendants).toEqual(descendants);
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.getTaskContext({ 
        id: 'A',
        includeAncestors: false,
        includeDescendants: false,
        maxDepth: 3
      }))
        .rejects.toThrow('Task not found');
    });

    it('should calculate metadata correctly', async () => {
      const task = { id: 'A', title: 'Test Task' };
      const subtasks = [
        { id: 'A.1', status: 'done' },
        { id: 'A.2', status: 'done' },
        { id: 'A.3', status: 'pending' },
        { id: 'A.4', status: 'in-progress' }
      ];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue(subtasks);

      const result = await taskHandlers.getTaskContext({ 
        id: 'A',
        includeAncestors: false,
        includeDescendants: false,
        maxDepth: 3
      });

      expect(result.metadata).toEqual({
        totalSubtasks: 4,
        completedSubtasks: 2,
        pendingSubtasks: 1, // Only counts 'pending' status, not 'in-progress'
      });
    });
  });
}); 