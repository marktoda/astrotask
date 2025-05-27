/**
 * Demonstration of the new human-readable task ID system
 * 
 * This example shows how task IDs are generated in a more human-friendly format:
 * - Root tasks: A, B, C, ..., Z, AA, AB, AC, etc.
 * - Subtasks: A.1, A.2, B.1, etc.
 * - Sub-subtasks: A.1.1, A.1.2, etc.
 */

import { createDatabase, TaskService } from '../src/index.js';
import { numberToLetters, lettersToNumber, parseTaskId } from '../src/utils/taskId.js';

async function demonstrateHumanReadableIds() {
  console.log('🎯 Human-Readable Task ID System Demo\n');

  // Create an in-memory database for this demo
  const store = await createDatabase({ dbPath: ':memory:' });
  const taskService = new TaskService(store);

  console.log('📝 Creating root tasks...');
  
  // Create some root tasks - they'll get letter IDs automatically
  const taskA = await store.addTask({
    title: 'Setup project infrastructure',
    description: 'Initialize the project with proper tooling and CI/CD',
    status: 'pending',
    priority: 'high'
  });
  console.log(`✅ Created root task: ${taskA.id} - "${taskA.title}"`);

  const taskB = await store.addTask({
    title: 'Design user interface',
    description: 'Create wireframes and mockups for the application',
    status: 'pending',
    priority: 'medium'
  });
  console.log(`✅ Created root task: ${taskB.id} - "${taskB.title}"`);

  const taskC = await store.addTask({
    title: 'Implement backend API',
    description: 'Build the REST API with authentication and data models',
    status: 'pending',
    priority: 'high'
  });
  console.log(`✅ Created root task: ${taskC.id} - "${taskC.title}"`);

  console.log('\n📋 Creating subtasks...');

  // Create subtasks - they'll get dotted number IDs
  const subtaskA1 = await store.addTask({
    title: 'Setup CI/CD pipeline',
    description: 'Configure GitHub Actions for automated testing and deployment',
    status: 'pending',
    priority: 'high',
    parentId: taskA.id
  });
  console.log(`✅ Created subtask: ${subtaskA1.id} - "${subtaskA1.title}"`);

  const subtaskA2 = await store.addTask({
    title: 'Configure development environment',
    description: 'Setup Docker, environment variables, and local development tools',
    status: 'pending',
    priority: 'medium',
    parentId: taskA.id
  });
  console.log(`✅ Created subtask: ${subtaskA2.id} - "${subtaskA2.title}"`);

  const subtaskB1 = await store.addTask({
    title: 'Create wireframes',
    description: 'Design low-fidelity wireframes for all main screens',
    status: 'pending',
    priority: 'medium',
    parentId: taskB.id
  });
  console.log(`✅ Created subtask: ${subtaskB1.id} - "${subtaskB1.title}"`);

  console.log('\n🔗 Creating sub-subtasks...');

  // Create sub-subtasks - they'll get deeper dotted IDs
  const subSubtaskA11 = await store.addTask({
    title: 'Setup GitHub Actions workflow',
    description: 'Create workflow files for testing and deployment',
    status: 'pending',
    priority: 'high',
    parentId: subtaskA1.id
  });
  console.log(`✅ Created sub-subtask: ${subSubtaskA11.id} - "${subSubtaskA11.title}"`);

  const subSubtaskA12 = await store.addTask({
    title: 'Configure deployment environments',
    description: 'Setup staging and production environments',
    status: 'pending',
    priority: 'medium',
    parentId: subtaskA1.id
  });
  console.log(`✅ Created sub-subtask: ${subSubtaskA12.id} - "${subSubtaskA12.title}"`);

  console.log('\n🔍 Analyzing the ID system...');

  // Demonstrate the ID conversion utilities
  console.log('\n📊 Letter-to-Number conversion examples:');
  const examples = ['A', 'B', 'Z', 'AA', 'AB', 'BA', 'ZZ'];
  examples.forEach(letter => {
    const number = lettersToNumber(letter);
    const backToLetter = numberToLetters(number);
    console.log(`  ${letter} → ${number} → ${backToLetter}`);
  });

  console.log('\n🔍 Task ID parsing examples:');
  const taskIds = [taskA.id, subtaskA1.id, subSubtaskA11.id];
  taskIds.forEach(id => {
    const parsed = parseTaskId(id);
    console.log(`  ${id}:`);
    console.log(`    Root: ${parsed.rootId}`);
    console.log(`    Segments: [${parsed.segments.join(', ')}]`);
    console.log(`    Depth: ${parsed.depth}`);
    console.log(`    Is Root: ${parsed.isRoot}`);
  });

  console.log('\n🌳 Task hierarchy visualization:');
  
  // Get the full task tree
  const tree = await taskService.getTaskTree(taskA.id);
  if (tree) {
    printTaskTree(tree, 0);
  }

  console.log('\n📋 All tasks in the system:');
  const allTasks = await store.listTasks();
  allTasks.forEach(task => {
    const indent = '  '.repeat(parseTaskId(task.id).depth);
    console.log(`${indent}${task.id}: ${task.title}`);
  });

  // Clean up
  await store.close();
  
  console.log('\n✨ Demo completed! The new ID system provides:');
  console.log('  • Human-readable root task IDs (A, B, C, ...)');
  console.log('  • Clear hierarchical structure (A.1, A.1.1, ...)');
  console.log('  • Easy typing and referencing');
  console.log('  • Automatic gap filling when tasks are deleted');
  console.log('  • Scalable to thousands of tasks (A, B, ..., Z, AA, AB, ...)');
}

function printTaskTree(task: any, depth: number) {
  const indent = '  '.repeat(depth);
  const prefix = depth === 0 ? '📁' : '📄';
  console.log(`${indent}${prefix} ${task.id}: ${task.title}`);
  
  if (task.children) {
    task.children.forEach((child: any) => printTaskTree(child, depth + 1));
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateHumanReadableIds().catch(console.error);
} 