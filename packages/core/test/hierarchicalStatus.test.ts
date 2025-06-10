import { describe, expect, it } from 'vitest';
import { TaskTree } from '../src/entities/TaskTree.js';
import type { Task } from '../src/schemas/task.js';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants.js';

describe('Hierarchical Status', () => {
  const createTask = (id: string, status: Task['status'], parentId: string | null = null): Task => ({
    id,
    parentId,
    title: `Task ${id}`,
    description: null,
    status,
    priorityScore: 50,
    prd: null,
    contextDigest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('getEffectiveStatus', () => {
    it('should return actual status when no ancestors have overriding status', () => {
      const root = createTask('root', 'pending', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'in-progress', 'root');
      const grandchild = createTask('grandchild', 'pending', 'child');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: [{
            task: grandchild,
            children: []
          }]
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      const grandchildNode = tree.find(t => t.id === 'grandchild')!;

      expect(childNode.getEffectiveStatus()).toBe('in-progress');
      expect(grandchildNode.getEffectiveStatus()).toBe('pending');
    });

    it('should return done when any ancestor is done', () => {
      const root = createTask('root', 'done', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'in-progress', 'root');
      const grandchild = createTask('grandchild', 'pending', 'child');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: [{
            task: grandchild,
            children: []
          }]
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      const grandchildNode = tree.find(t => t.id === 'grandchild')!;

      expect(childNode.getEffectiveStatus()).toBe('done');
      expect(grandchildNode.getEffectiveStatus()).toBe('done');
    });

    it('should return cancelled when ancestor is cancelled but not done', () => {
      const root = createTask('root', 'cancelled', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'in-progress', 'root');
      const grandchild = createTask('grandchild', 'pending', 'child');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: [{
            task: grandchild,
            children: []
          }]
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      const grandchildNode = tree.find(t => t.id === 'grandchild')!;

      expect(childNode.getEffectiveStatus()).toBe('cancelled');
      expect(grandchildNode.getEffectiveStatus()).toBe('cancelled');
    });

    it('should prioritize done over cancelled status', () => {
      const root = createTask('root', 'done', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'cancelled', 'root');
      const grandchild = createTask('grandchild', 'pending', 'child');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: [{
            task: grandchild,
            children: []
          }]
        }]
      });

      const grandchildNode = tree.find(t => t.id === 'grandchild')!;
      
      // Even though immediate parent is cancelled, grandparent's done status takes precedence
      expect(grandchildNode.getEffectiveStatus()).toBe('done');
    });

    it('should handle archived status inheritance', () => {
      const root = createTask('root', 'archived', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'in-progress', 'root');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: []
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      expect(childNode.getEffectiveStatus()).toBe('archived');
    });
  });

  describe('hasAncestorWithStatus', () => {
    it('should return true when ancestor has specified status', () => {
      const root = createTask('root', 'done', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'pending', 'root');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: []
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      expect(childNode.hasAncestorWithStatus('done')).toBe(true);
      expect(childNode.hasAncestorWithStatus('cancelled')).toBe(false);
    });

    it('should return false for root node', () => {
      const root = createTask('root', 'done', TASK_IDENTIFIERS.PROJECT_ROOT);

      const tree = new TaskTree({
        task: root,
        children: []
      });

      expect(tree.hasAncestorWithStatus('done')).toBe(false);
      expect(tree.hasAncestorWithStatus('pending')).toBe(false);
    });
  });

  describe('getAncestorWithStatus', () => {
    it('should return the first ancestor with specified status', () => {
      const root = createTask('root', 'done', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'pending', 'root');
      const grandchild = createTask('grandchild', 'pending', 'child');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: [{
            task: grandchild,
            children: []
          }]
        }]
      });

      const grandchildNode = tree.find(t => t.id === 'grandchild')!;
      const ancestor = grandchildNode.getAncestorWithStatus('done');
      
      expect(ancestor).not.toBeNull();
      expect(ancestor?.id).toBe('root');
    });

    it('should return null when no ancestor has specified status', () => {
      const root = createTask('root', 'pending', TASK_IDENTIFIERS.PROJECT_ROOT);
      const child = createTask('child', 'in-progress', 'root');

      const tree = new TaskTree({
        task: root,
        children: [{
          task: child,
          children: []
        }]
      });

      const childNode = tree.find(t => t.id === 'child')!;
      const ancestor = childNode.getAncestorWithStatus('done');
      
      expect(ancestor).toBeNull();
    });
  });
}); 