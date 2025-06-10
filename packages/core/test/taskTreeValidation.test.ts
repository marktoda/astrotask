import { describe, it, expect } from 'vitest';
import { TaskTree } from '../src/entities/TaskTree.js';
import { validateTaskTree, validateMoveOperation, validateTaskForest } from '../src/entities/TaskTreeValidation.js';
import type { Task } from '../src/schemas/task.js';

function createMockTask(id: string, title: string, parentId: string | null = null): Task {
  return {
    id,
    parentId,
    title,
    description: null,
    status: 'pending',
    priorityScore: 50,
    prd: null,
    contextDigest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('TaskTreeValidation', () => {
  describe('validateTaskTree', () => {
    it('validates a simple valid tree', () => {
      const task = createMockTask('1', 'Root Task');
      const tree = TaskTree.fromTask(task);
      
      const result = validateTaskTree(tree);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a tree with children', () => {
      const rootTask = createMockTask('1', 'Root Task');
      const childTask1 = createMockTask('2', 'Child 1', '1');
      const childTask2 = createMockTask('3', 'Child 2', '1');
      
      const child1Tree = TaskTree.fromTask(childTask1);
      const child2Tree = TaskTree.fromTask(childTask2);
      const rootTree = TaskTree.fromTask(rootTask, [child1Tree, child2Tree]);
      
      const result = validateTaskTree(rootTree);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects deep nesting warning', () => {
      const rootTask = createMockTask('1', 'Root');
      const level1 = createMockTask('2', 'Level 1', '1');
      const level2 = createMockTask('3', 'Level 2', '2');
      
      const level2Tree = TaskTree.fromTask(level2);
      const level1Tree = TaskTree.fromTask(level1, [level2Tree]);
      const rootTree = TaskTree.fromTask(rootTask, [level1Tree]);
      
      const result = validateTaskTree(rootTree, { maxDepth: 1 });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('deep_nesting');
    });

    it('detects status inconsistency warning', () => {
      const rootTask = createMockTask('1', 'Root');
      const completedChild = createMockTask('2', 'Completed Child', '1');
      completedChild.status = 'done';
      
      const childTree = TaskTree.fromTask(completedChild);
      const rootTree = TaskTree.fromTask(rootTask, [childTree]);
      
      const result = validateTaskTree(rootTree, { checkStatusConsistency: true });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('status_inconsistency');
    });
  });

  describe('validateMoveOperation', () => {
    it('allows moving to root', () => {
      const rootTask = createMockTask('1', 'Root');
      const childTask = createMockTask('2', 'Child', '1');
      
      const childTree = TaskTree.fromTask(childTask);
      const tree = TaskTree.fromTask(rootTask, [childTree]);
      
      const result = validateMoveOperation('2', null, tree);
      expect(result.isValid).toBe(true);
    });

    it('prevents moving to descendant (cycle prevention)', () => {
      const rootTask = createMockTask('1', 'Root');
      const childTask = createMockTask('2', 'Child', '1');
      const grandchildTask = createMockTask('3', 'Grandchild', '2');
      
      const grandchildTree = TaskTree.fromTask(grandchildTask);
      const childTree = TaskTree.fromTask(childTask, [grandchildTree]);
      const tree = TaskTree.fromTask(rootTask, [childTree]);
      
      // Try to move root to be child of grandchild (would create cycle)
      const result = validateMoveOperation('1', '3', tree);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('cycle');
    });

    it('handles missing task', () => {
      const rootTask = createMockTask('1', 'Root');
      const tree = TaskTree.fromTask(rootTask);
      
      const result = validateMoveOperation('nonexistent', '1', tree);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid_parent');
    });

    it('handles missing target parent', () => {
      const rootTask = createMockTask('1', 'Root');
      const tree = TaskTree.fromTask(rootTask);
      
      const result = validateMoveOperation('1', 'nonexistent', tree);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid_parent');
    });
  });

  describe('validateTaskForest', () => {
    it('validates multiple valid trees', () => {
      const tree1 = TaskTree.fromTask(createMockTask('1', 'Tree 1'));
      const tree2 = TaskTree.fromTask(createMockTask('2', 'Tree 2'));
      
      const result = validateTaskForest([tree1, tree2]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects duplicate IDs across trees', () => {
      const tree1 = TaskTree.fromTask(createMockTask('1', 'Tree 1'));
      const tree2 = TaskTree.fromTask(createMockTask('1', 'Tree 2')); // Same ID
      
      const result = validateTaskForest([tree1, tree2]);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('duplicate_id');
    });
  });
});
