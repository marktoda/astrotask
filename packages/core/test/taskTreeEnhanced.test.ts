import { describe, it, expect } from 'vitest';
import { TaskTree, type BatchUpdateOperation } from '../src/utils/TaskTree.js';
import type { Task } from '../src/schemas/task.js';

function createMockTask(id: string, title: string, status: string = 'pending', priority: string = 'medium'): Task {
  return {
    id,
    parentId: null,
    title,
    description: null,
    status: status as any,
    priority: priority as any,
    prd: null,
    contextDigest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('TaskTree Enhanced Features', () => {
  describe('batch operations', () => {
    it('applies single task update', () => {
      const task = createMockTask('1', 'Original Title');
      const tree = TaskTree.fromTask(task);
      
      const operations: BatchUpdateOperation[] = [
        { type: 'update_task', taskId: '1', updates: { title: 'Updated Title', status: 'done' } }
      ];
      
      const result = tree.batchUpdate(operations);
      expect(result.task.title).toBe('Updated Title');
      expect(result.task.status).toBe('done');
    });

    it('applies predicate-based updates', () => {
      const rootTask = createMockTask('1', 'Root', 'pending');
      const child1 = createMockTask('2', 'Child 1', 'pending');
      const child2 = createMockTask('3', 'Child 2', 'done');
      
      const tree = TaskTree.fromTask(rootTask, [
        TaskTree.fromTask(child1),
        TaskTree.fromTask(child2)
      ]);
      
      const operations: BatchUpdateOperation[] = [
        { 
          type: 'bulk_status_update', 
          taskIds: ['1', '2'], // Root and child1 IDs
          status: 'in-progress'
        }
      ];
      
      const result = tree.batchUpdate(operations);
      expect(result.task.status).toBe('in-progress'); // Root was updated
      
      const children = result.getChildren();
      expect(children[0].task.status).toBe('in-progress'); // Child1 was updated
      expect(children[1].task.status).toBe('done'); // Child2 was unchanged
    });

    it('applies bulk status updates', () => {
      const rootTask = createMockTask('1', 'Root');
      const child1 = createMockTask('2', 'Child 1');
      const child2 = createMockTask('3', 'Child 2');
      
      const tree = TaskTree.fromTask(rootTask, [
        TaskTree.fromTask(child1),
        TaskTree.fromTask(child2)
      ]);
      
      const operations: BatchUpdateOperation[] = [
        { type: 'bulk_status_update', taskIds: ['1', '2'], status: 'done' }
      ];
      
      const result = tree.batchUpdate(operations);
      expect(result.task.status).toBe('done');
      
      const children = result.getChildren();
      expect(children[0].task.status).toBe('done');
      expect(children[1].task.status).toBe('pending'); // Not in the update list
    });

    it('chains multiple operations', () => {
      const task = createMockTask('1', 'Original', 'pending', 'low');
      const tree = TaskTree.fromTask(task);
      
      const operations: BatchUpdateOperation[] = [
        { type: 'update_task', taskId: '1', updates: { title: 'Updated' } },
        { type: 'update_task', taskId: '1', updates: { status: 'in-progress' } },
        { type: 'update_task', taskId: '1', updates: { priority: 'high' } }
      ];
      
      const result = tree.batchUpdate(operations);
      expect(result.task.title).toBe('Updated');
      expect(result.task.status).toBe('in-progress');
      expect(result.task.priority).toBe('high');
    });
  });

  describe('static batch operations', () => {
    it('finds tasks across multiple trees', () => {
      const tree1 = TaskTree.fromTask(createMockTask('1', 'High Priority Task', 'pending', 'high'));
      const tree2 = TaskTree.fromTask(createMockTask('2', 'Low Priority Task', 'pending', 'low'));
      const tree3 = TaskTree.fromTask(createMockTask('3', 'Another High Priority', 'done', 'high'));
      
      const results = TaskTree.batchFind(
        [tree1, tree2, tree3],
        (task) => task.priority === 'high'
      );
      
      expect(results.size).toBe(2);
      expect(results.get('1')).toBeDefined();
      expect(results.get('3')).toBeDefined();
      expect(results.get('2')).toBeUndefined();
    });

    it('transforms multiple trees', () => {
      const tree1 = TaskTree.fromTask(createMockTask('1', 'Task 1', 'pending'));
      const tree2 = TaskTree.fromTask(createMockTask('2', 'Task 2', 'pending'));
      
      const transformed = TaskTree.batchTransform(
        [tree1, tree2],
        (tree) => tree.withTask({ status: 'done' })
      );
      
      expect(transformed).toHaveLength(2);
      expect(transformed[0].task.status).toBe('done');
      expect(transformed[1].task.status).toBe('done');
    });
  });

  describe('tree aggregation', () => {
    it('aggregates metrics across trees', () => {
      // Create a complex tree structure
      const root1 = createMockTask('1', 'Root 1', 'done', 'high');
      const child1 = createMockTask('2', 'Child 1', 'pending', 'medium');
      const grandchild1 = createMockTask('3', 'Grandchild 1', 'in-progress', 'low');
      
      const root2 = createMockTask('4', 'Root 2', 'pending', 'high');
      
      const tree1 = TaskTree.fromTask(root1, [
        TaskTree.fromTask(child1, [
          TaskTree.fromTask(grandchild1)
        ])
      ]);
      const tree2 = TaskTree.fromTask(root2);
      
      const metrics = TaskTree.aggregateMetrics([tree1, tree2]);
      
      expect(metrics.totalTasks).toBe(4);
      expect(metrics.treeCount).toBe(2);
      expect(metrics.maxDepth).toBe(2); // Root1 -> Child1 -> Grandchild1
      expect(metrics.averageDepth).toBe(0.75); // (0 + 1 + 2 + 0) / 4 = 0.75
      
      // Status distribution
      expect(metrics.statusDistribution).toEqual({
        'done': 1,
        'pending': 2,
        'in-progress': 1
      });
      
      // Priority distribution
      expect(metrics.priorityDistribution).toEqual({
        'high': 2,
        'medium': 1,
        'low': 1
      });
    });

    it('handles empty tree list', () => {
      const metrics = TaskTree.aggregateMetrics([]);
      
      expect(metrics.totalTasks).toBe(0);
      expect(metrics.treeCount).toBe(0);
      expect(metrics.maxDepth).toBe(0);
      expect(metrics.averageDepth).toBe(0);
      expect(metrics.statusDistribution).toEqual({});
      expect(metrics.priorityDistribution).toEqual({});
    });
  });

  describe('enhanced queries', () => {
    it('finds deeply nested tasks efficiently', () => {
      const root = createMockTask('1', 'Root');
      const level1 = createMockTask('2', 'Level 1', 'pending');
      const level2a = createMockTask('3', 'Level 2A', 'done');
      const level2b = createMockTask('4', 'Level 2B', 'pending');
      const level3 = createMockTask('5', 'Level 3', 'done');
      
      const tree = TaskTree.fromTask(root, [
        TaskTree.fromTask(level1, [
          TaskTree.fromTask(level2a, [
            TaskTree.fromTask(level3)
          ]),
          TaskTree.fromTask(level2b)
        ])
      ]);
      
      const completedTasks = tree.filter((task) => task.status === 'done');
      expect(completedTasks).toHaveLength(2);
      expect(completedTasks.map(t => t.id).sort()).toEqual(['3', '5']);
    });

    it('navigates complex tree relationships', () => {
      const root = createMockTask('1', 'Root');
      const child1 = createMockTask('2', 'Child 1');
      const child2 = createMockTask('3', 'Child 2');
      const grandchild = createMockTask('4', 'Grandchild');
      
      const tree = TaskTree.fromTask(root, [
        TaskTree.fromTask(child1, [
          TaskTree.fromTask(grandchild)
        ]),
        TaskTree.fromTask(child2)
      ]);
      
      const grandchildNode = tree.find((task) => task.id === '4')!;
      expect(grandchildNode).toBeDefined();
      
      // Test path from root to grandchild
      const path = grandchildNode.getPath();
      expect(path.map(n => n.id)).toEqual(['1', '2', '4']);
      
      // Test depth
      expect(grandchildNode.getDepth()).toBe(2);
      
      // Test ancestry
      expect(tree.isAncestorOf(grandchildNode)).toBe(true);
      expect(grandchildNode.isDescendantOf(tree)).toBe(true);
      
      // Test sibling relationships
      const child1Node = tree.find((task) => task.id === '2')!;
      const child2Node = tree.find((task) => task.id === '3')!;
      expect(child1Node.isSiblingOf(child2Node)).toBe(true);
      expect(child1Node.isSiblingOf(grandchildNode)).toBe(false);
    });
  });
});