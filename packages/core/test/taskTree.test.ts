import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskTree, type TaskTreeData } from '../src/entities/TaskTree.js';
import type { Task } from '../src/schemas/task.js';

describe('TaskTree', () => {
  const mockTask: Task = {
    id: 'root',
    parentId: null,
    title: 'Root Task',
    description: 'Root task description',
    status: 'pending',
    priority: 'medium',
    prd: null,
    contextDigest: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockChild: Task = {
    id: 'child1',
    parentId: 'root',
    title: 'Child Task 1',
    description: 'Child task description',
    status: 'pending',
    priority: 'high',
    prd: null,
    contextDigest: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockGrandchild: Task = {
    id: 'grandchild1',
    parentId: 'child1',
    title: 'Grandchild Task 1',
    description: 'Grandchild task description',
    status: 'done',
    priority: 'low',
    prd: null,
    contextDigest: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createTreeData = (): TaskTreeData => ({
    task: mockTask,
    children: [
      {
        task: mockChild,
        children: [
          {
            task: mockGrandchild,
            children: [],
          },
        ],
      },
    ],
  });

  describe('Construction and Basic Properties', () => {
    it('creates a TaskTree from TaskTreeData', () => {
      const data = createTreeData();
      const tree = new TaskTree(data);
      
      expect(tree.task).toEqual(mockTask);
      expect(tree.id).toBe('root');
      expect(tree.title).toBe('Root Task');
    });

    it('provides immutable access to task data', () => {
      const tree = new TaskTree(createTreeData());
      const taskRef = tree.task;
      
      // Task should have the same data
      expect(taskRef).toEqual(mockTask);
      // This may or may not be a reference depending on implementation
    });
  });

  describe('Navigation Methods', () => {
    it('provides access to children', () => {
      const tree = new TaskTree(createTreeData());
      const children = tree.getChildren();
      
      expect(children).toHaveLength(1);
      expect(children[0]?.task.id).toBe('child1');
    });

    it('provides parent access for child nodes', () => {
      const tree = new TaskTree(createTreeData());
      const child = tree.getChildren()[0];
      const parent = child?.getParent();
      
      expect(parent?.task.id).toBe('root');
    });

    it('returns null parent for root node', () => {
      const tree = new TaskTree(createTreeData());
      expect(tree.getParent()).toBeNull();
    });

    it('finds root correctly', () => {
      const tree = new TaskTree(createTreeData());
      const grandchild = tree.getChildren()[0]?.getChildren()[0];
      const root = grandchild?.getRoot();
      
      expect(root?.task.id).toBe('root');
    });

    it('calculates depth correctly', () => {
      const tree = new TaskTree(createTreeData());
      const child = tree.getChildren()[0];
      const grandchild = child?.getChildren()[0];
      
      expect(tree.getDepth()).toBe(0);
      expect(child?.getDepth()).toBe(1);
      expect(grandchild?.getDepth()).toBe(2);
    });

    it('gets path from root', () => {
      const tree = new TaskTree(createTreeData());
      const grandchild = tree.getChildren()[0]?.getChildren()[0];
      const path = grandchild?.getPath();
      
      expect(path).toHaveLength(3);
      expect(path?.[0]?.task.id).toBe('root');
      expect(path?.[1]?.task.id).toBe('child1');
      expect(path?.[2]?.task.id).toBe('grandchild1');
    });
  });

  describe('Traversal Methods', () => {
    it('walks depth-first correctly', () => {
      const tree = new TaskTree(createTreeData());
      const visited: string[] = [];
      
      tree.walkDepthFirst((node) => {
        visited.push(node.task.id);
      });
      
      expect(visited).toEqual(['root', 'child1', 'grandchild1']);
    });

    it('walks breadth-first correctly', () => {
      const tree = new TaskTree(createTreeData());
      const visited: string[] = [];
      
      tree.walkBreadthFirst((node) => {
        visited.push(node.task.id);
      });
      
      expect(visited).toEqual(['root', 'child1', 'grandchild1']);
    });

    it('finds nodes by predicate', () => {
      const tree = new TaskTree(createTreeData());
      const found = tree.find((task) => task.status === 'done');
      
      expect(found?.task.id).toBe('grandchild1');
    });

    it('filters nodes by predicate', () => {
      const tree = new TaskTree(createTreeData());
      const filtered = tree.filter((task) => task.status === 'pending');
      
      expect(filtered).toHaveLength(2);
      expect(filtered.map(n => n.task.id)).toEqual(['root', 'child1']);
    });
  });

  describe('Immutable Operations', () => {
    it('updates task immutably', () => {
      const tree = new TaskTree(createTreeData());
      const updated = tree.withTask({ status: 'in-progress' });
      
      expect(tree.task.status).toBe('pending');
      expect(updated.task.status).toBe('in-progress');
      expect(tree).not.toBe(updated);
    });

    it('updates children immutably', () => {
      const tree = new TaskTree(createTreeData());
      const newChildren = tree.getChildren().slice(0, 0); // Empty array
      const updated = tree.withChildren(newChildren);
      
      expect(tree.getChildren()).toHaveLength(1);
      expect(updated.getChildren()).toHaveLength(0);
    });

    it('adds child immutably', () => {
      const tree = new TaskTree(createTreeData());
      const newChild = TaskTree.fromTask({
        ...mockChild,
        id: 'child2',
        title: 'Child Task 2',
      });
      const updated = tree.addChild(newChild);
      
      expect(tree.getChildren()).toHaveLength(1);
      expect(updated.getChildren()).toHaveLength(2);
    });

    it('removes child immutably', () => {
      const tree = new TaskTree(createTreeData());
      const updated = tree.removeChild('child1');
      
      expect(tree.getChildren()).toHaveLength(1);
      expect(updated.getChildren()).toHaveLength(0);
    });
  });

  describe('Batch Operations', () => {
    it('applies batch updates correctly', () => {
      const tree = new TaskTree(createTreeData());
      const operations = [
        { type: 'update_task' as const, taskId: 'root', updates: { status: 'in-progress' as const } },
        { type: 'bulk_status_update' as const, taskIds: ['child1', 'grandchild1'], status: 'done' as const },
      ];
      
      const updated = tree.batchUpdate(operations);
      
      expect(updated.task.status).toBe('in-progress');
      const child = updated.getChildren()[0];
      const grandchild = child?.getChildren()[0];
      expect(child?.task.status).toBe('done');
      expect(grandchild?.task.status).toBe('done');
    });
  });

  describe('Serialization', () => {
    it('converts to plain object', () => {
      const tree = new TaskTree(createTreeData());
      const plain = tree.toPlainObject();
      
      expect(plain.task).toEqual(mockTask);
      expect(plain.children).toHaveLength(1);
      expect(plain.children[0]?.task).toEqual(mockChild);
    });

    it('converts to markdown', () => {
      const tree = new TaskTree(createTreeData());
      const markdown = tree.toMarkdown();
      
      expect(markdown).toContain('- [ ] Root Task');
      expect(markdown).toContain('- [ ] Child Task 1 (high)');
      expect(markdown).toContain('- [x] Grandchild Task 1 (low)');
    });
  });

  describe('Factory Methods', () => {
    it('creates tree from task', () => {
      const tree = TaskTree.fromTask(mockTask);
      
      expect(tree.task).toEqual(mockTask);
      expect(tree.getChildren()).toHaveLength(0);
    });

    it('creates tree from task with children', () => {
      const childTree = TaskTree.fromTask(mockChild);
      const tree = TaskTree.fromTask(mockTask, [childTree]);
      
      expect(tree.getChildren()).toHaveLength(1);
      expect(tree.getChildren()[0]?.task.id).toBe('child1');
    });
  });

  describe('Tree Metrics', () => {
    it('calculates descendant count', () => {
      const tree = new TaskTree(createTreeData());
      
      expect(tree.getDescendantCount()).toBe(2); // child1 + grandchild1
    });

    it('checks ancestry relationships', () => {
      const tree = new TaskTree(createTreeData());
      const child = tree.getChildren()[0];
      const grandchild = child?.getChildren()[0];
      
      expect(tree.isAncestorOf(child!)).toBe(true);
      expect(tree.isAncestorOf(grandchild!)).toBe(true);
      expect(child?.isAncestorOf(grandchild!)).toBe(true);
      expect(grandchild?.isAncestorOf(tree)).toBe(false);
    });

    it('aggregates metrics across multiple trees', () => {
      const tree1 = new TaskTree(createTreeData());
      const tree2 = TaskTree.fromTask({
        ...mockTask,
        id: 'root2',
        title: 'Root Task 2',
      });
      
      const metrics = TaskTree.aggregateMetrics([tree1, tree2]);
      
      expect(metrics.totalTasks).toBe(4); // 3 from tree1 + 1 from tree2
      expect(metrics.treeCount).toBe(2);
      expect(metrics.maxDepth).toBe(2); // tree1 has depth 2
      expect(metrics.statusDistribution.pending).toBe(3);
      expect(metrics.statusDistribution.done).toBe(1);
    });
  });
});
