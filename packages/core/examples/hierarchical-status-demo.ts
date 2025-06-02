#!/usr/bin/env tsx

import { TaskTree } from '../src/entities/TaskTree.js';
import type { Task } from '../src/schemas/task.js';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants.js';

// Helper to create a task
const createTask = (id: string, title: string, status: Task['status'], parentId: string | null = null): Task => ({
  id,
  parentId,
  title,
  description: null,
  status,
  priority: 'medium',
  prd: null,
  contextDigest: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Create a sample project hierarchy
const projectTree = new TaskTree({
  task: createTask('proj-1', 'E-commerce Website', 'done', TASK_IDENTIFIERS.PROJECT_ROOT),
  children: [
    {
      task: createTask('feat-1', 'User Authentication', 'done', 'proj-1'),
      children: [
        {
          task: createTask('task-1', 'Design login UI', 'done', 'feat-1'),
          children: []
        },
        {
          task: createTask('task-2', 'Implement JWT tokens', 'pending', 'feat-1'),
          children: []
        },
        {
          task: createTask('task-3', 'Add password reset', 'in-progress', 'feat-1'),
          children: []
        }
      ]
    },
    {
      task: createTask('feat-2', 'Shopping Cart', 'cancelled', 'proj-1'),
      children: [
        {
          task: createTask('task-4', 'Cart UI design', 'pending', 'feat-2'),
          children: []
        },
        {
          task: createTask('task-5', 'Cart API', 'in-progress', 'feat-2'),
          children: []
        }
      ]
    }
  ]
});

// Function to print task with both actual and effective status
function printTaskStatus(node: TaskTree, indent = 0) {
  const prefix = '  '.repeat(indent);
  const actualStatus = node.status;
  const effectiveStatus = node.getEffectiveStatus();
  
  const statusDiff = actualStatus !== effectiveStatus ? ` → ${effectiveStatus}` : '';
  
  console.log(`${prefix}${node.title}`);
  console.log(`${prefix}  Actual: ${actualStatus}${statusDiff}`);
  
  if (statusDiff) {
    const ancestor = node.getAncestorWithStatus(effectiveStatus);
    if (ancestor) {
      console.log(`${prefix}  (inherited from: ${ancestor.title})`);
    }
  }
  
  console.log('');
  
  for (const child of node.getChildren()) {
    printTaskStatus(child as TaskTree, indent + 1);
  }
}

console.log('=== Hierarchical Task Status Demo ===\n');
console.log('This demo shows how child tasks inherit status from their parent tasks.\n');
console.log('Legend: actual status → effective status\n');

printTaskStatus(projectTree);

console.log('\n=== Summary ===');
console.log('- All tasks under "E-commerce Website" have effective status "done"');
console.log('- Even though some tasks have actual status of "pending" or "in-progress"');
console.log('- This is because the root project is marked as "done"');
console.log('- The "Shopping Cart" feature would show "cancelled" if the project wasn\'t done'); 