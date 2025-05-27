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

      expect(mockStore.listTasks).toHaveBeenCalledWith({ projectId: undefined });
      expect(result).toEqual(mockTasks);
    });

    it('should filter tasks by status', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' }
      ];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      const result = await taskHandlers.listTasks({ status: 'pending', includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({ status: 'pending', projectId: undefined });
      expect(result).toEqual(mockTasks);
    });

    it('should filter tasks by projectId', async () => {
      const mockTasks = [{ id: '1', title: 'Task 1' }];
      mockStore.listTasks.mockResolvedValue(mockTasks);

      await taskHandlers.listTasks({ projectId: 'project-1', includeSubtasks: false });

      expect(mockStore.listTasks).toHaveBeenCalledWith({ projectId: 'project-1' });
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
      const mockTaskTree = { id: '1', title: 'Task 1', subtasks: [] };
      
      mockStore.listTasks.mockResolvedValue(mockTasks);
      mockTaskService.getTaskTree.mockResolvedValue(mockTaskTree);

      const result = await taskHandlers.listTasks({ includeSubtasks: true });

      expect(mockTaskService.getTaskTree).toHaveBeenCalledWith('1');
      expect(result).toEqual([mockTaskTree]);
    });

    it('should filter out null task trees', async () => {
      const mockTasks = [{ id: '1' }, { id: '2' }];
      const mockValidTree = { id: '1', title: 'Task 1' };
      
      mockStore.listTasks.mockResolvedValue(mockTasks);
      mockTaskService.getTaskTree
        .mockResolvedValueOnce(mockValidTree)
        .mockResolvedValueOnce(null);

      const result = await taskHandlers.listTasks({ includeSubtasks: true });

      expect(result).toEqual([mockValidTree]);
    });
  });

  describe('createTask', () => {
    it('should create a new task with provided data', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Task description',
        status: 'pending' as const
      };
      const createdTask = { id: '1', ...taskData };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      const result = await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith({
        ...taskData,
        parentId: undefined,
        projectId: undefined,
        prd: undefined,
        contextDigest: undefined,
      });
      expect(result).toEqual(createdTask);
    });

    it('should create task with default status', async () => {
      const taskData = { title: 'New Task', status: 'pending' as const };
      const createdTask = { id: '1', title: 'New Task', status: 'pending' };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith({
        title: 'New Task',
        description: undefined,
        parentId: undefined,
        projectId: undefined,
        status: 'pending',
        prd: undefined,
        contextDigest: undefined,
      });
    });

    it('should create task with all optional fields', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Description',
        parentId: 'parent-1',
        projectId: 'project-1',
        status: 'in-progress' as const,
        prd: 'PRD content',
        contextDigest: 'digest-123'
      };
      const createdTask = { id: '1', ...taskData };
      
      mockStore.addTask.mockResolvedValue(createdTask);

      const result = await taskHandlers.createTask(taskData);

      expect(mockStore.addTask).toHaveBeenCalledWith(taskData);
      expect(result).toEqual(createdTask);
    });
  });

  describe('updateTask', () => {
    it('should update existing task', async () => {
      const existingTask = { id: '1', title: 'Old Title' };
      const updateData = { id: '1', title: 'New Title' };
      const updatedTask = { id: '1', title: 'New Title' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(updatedTask);

      const result = await taskHandlers.updateTask(updateData);

      expect(mockStore.getTask).toHaveBeenCalledWith('1');
      expect(mockStore.updateTask).toHaveBeenCalledWith('1', {
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

      await expect(taskHandlers.updateTask({ id: '1', title: 'New Title' }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when update fails', async () => {
      const existingTask = { id: '1', title: 'Old Title' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(null);

      await expect(taskHandlers.updateTask({ id: '1', title: 'New Title' }))
        .rejects.toThrow('Failed to update task');
    });
  });

  describe('deleteTask', () => {
    it('should delete task without subtasks', async () => {
      const existingTask = { id: '1', title: 'Task to delete' };
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listTasks.mockResolvedValue([]);
      mockStore.deleteTask.mockResolvedValue(undefined);

      const result = await taskHandlers.deleteTask({ id: '1', cascade: false });

      expect(mockStore.getTask).toHaveBeenCalledWith('1');
      expect(mockStore.listTasks).toHaveBeenCalledWith({ parentId: '1' });
      expect(mockStore.deleteTask).toHaveBeenCalledWith('1');
      expect(result).toEqual({
        success: true,
        message: 'Task 1 deleted'
      });
    });

    it('should delete task with cascade option', async () => {
      const existingTask = { id: '1', title: 'Task to delete' };
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockTaskService.deleteTaskTree.mockResolvedValue(undefined);

      const result = await taskHandlers.deleteTask({ id: '1', cascade: true });

      expect(mockTaskService.deleteTaskTree).toHaveBeenCalledWith('1', true);
      expect(result).toEqual({
        success: true,
        message: 'Task 1 deleted with all subtasks'
      });
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.deleteTask({ id: '1', cascade: false }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when deleting task with subtasks without cascade', async () => {
      const existingTask = { id: '1', title: 'Task with subtasks' };
      const subtasks = [{ id: '1.1', title: 'Subtask' }];
      
      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.listTasks.mockResolvedValue(subtasks);

      await expect(taskHandlers.deleteTask({ id: '1', cascade: false }))
        .rejects.toThrow('Cannot delete task with subtasks without cascade option');
    });
  });

  describe('completeTask', () => {
    it('should mark task as done', async () => {
      const existingTask = { id: '1', title: 'Task', status: 'pending' };
      const completedTask = { id: '1', title: 'Task', status: 'done' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(completedTask);

      const result = await taskHandlers.completeTask({ id: '1' });

      expect(mockStore.getTask).toHaveBeenCalledWith('1');
      expect(mockStore.updateTask).toHaveBeenCalledWith('1', { status: 'done' });
      expect(result).toEqual(completedTask);
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.completeTask({ id: '1' }))
        .rejects.toThrow('Task not found');
    });

    it('should throw error when completion fails', async () => {
      const existingTask = { id: '1', title: 'Task' };

      mockStore.getTask.mockResolvedValue(existingTask);
      mockStore.updateTask.mockResolvedValue(null);

      await expect(taskHandlers.completeTask({ id: '1' }))
        .rejects.toThrow('Failed to complete task');
    });
  });

  describe('getTaskContext', () => {
    it('should return basic task context', async () => {
      const task = { id: '1', title: 'Test Task' };
      const subtasks = [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'pending' }
      ];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue(subtasks);

      const result = await taskHandlers.getTaskContext({ 
        id: '1',
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
      const task = { id: '1.1', title: 'Subtask' };
      const ancestors = [{ id: '1', title: 'Parent Task' }];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue([]);
      mockTaskService.getTaskAncestors.mockResolvedValue(ancestors);

      const result = await taskHandlers.getTaskContext({ 
        id: '1.1',
        includeAncestors: true,
        includeDescendants: false,
        maxDepth: 3
      });

      expect(mockTaskService.getTaskAncestors).toHaveBeenCalledWith('1.1');
      expect(result.ancestors).toEqual(ancestors);
    });

    it('should include descendants when requested', async () => {
      const task = { id: '1', title: 'Parent Task' };
      const descendants = [{ id: '1.1', title: 'Child Task' }];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue([]);
      mockTaskService.getTaskDescendants.mockResolvedValue(descendants);

      const result = await taskHandlers.getTaskContext({ 
        id: '1',
        includeAncestors: false,
        includeDescendants: true,
        maxDepth: 3
      });

      expect(mockTaskService.getTaskDescendants).toHaveBeenCalledWith('1');
      expect(result.descendants).toEqual(descendants);
    });

    it('should throw error when task not found', async () => {
      mockStore.getTask.mockResolvedValue(null);

      await expect(taskHandlers.getTaskContext({ 
        id: '1',
        includeAncestors: false,
        includeDescendants: false,
        maxDepth: 3
      }))
        .rejects.toThrow('Task not found');
    });

    it('should calculate metadata correctly', async () => {
      const task = { id: '1', title: 'Test Task' };
      const subtasks = [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'done' },
        { id: '1.3', status: 'pending' },
        { id: '1.4', status: 'in-progress' }
      ];

      mockStore.getTask.mockResolvedValue(task);
      mockStore.listTasks.mockResolvedValue(subtasks);

      const result = await taskHandlers.getTaskContext({ 
        id: '1',
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