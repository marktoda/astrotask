# Task ID System and TaskTree Architecture

This document provides comprehensive documentation for Astrolabe's task identification system and hierarchical task tree architecture.

## Overview

Astrolabe uses a human-readable, hierarchical task ID system that supports:
- **Root tasks**: Independent top-level tasks (e.g., `ABCD`, `XYZW`)
- **Subtasks**: Hierarchical child tasks (e.g., `ABCD-EFGH`, `ABCD-EFGH-IJKL`)
- **Special system tasks**: Reserved IDs for system functionality (e.g., `__PROJECT_ROOT__`)

## Task ID Format

### Regular Task IDs

#### Root Tasks
- **Format**: 4+ uppercase letters
- **Examples**: `ABCD`, `XYZW`, `QRST`, `HELLO`, `WORLD`
- **Pattern**: `/^[A-Z]+$/`
- **Usage**: Independent tasks with no parent

#### Subtasks
- **Format**: Parent ID + dash + 4+ uppercase letters
- **Examples**: 
  - Level 1: `ABCD-EFGH`, `XYZW-IJKL`
  - Level 2: `ABCD-EFGH-MNOP`, `XYZW-IJKL-QRST`
  - Level N: `ABCD-EFGH-MNOP-QRST-UVWX`
- **Pattern**: `/^[A-Z]+(-[A-Z]+)+$/`
- **Usage**: Child tasks that belong to a parent task

### Special System Task IDs

#### PROJECT_ROOT
- **ID**: `__PROJECT_ROOT__`
- **Purpose**: Virtual root container for all root-level tasks
- **Database Role**: Parent ID for tasks with no explicit parent
- **Display Role**: Hidden from user interfaces, used internally for tree operations

#### Subtasks of PROJECT_ROOT
- **Format**: `__PROJECT_ROOT__-ABCD`, `__PROJECT_ROOT__-EFGH-IJKL`
- **Usage**: Tasks that are direct or indirect children of the project root
- **Validation**: Special handling in validation functions

## Task ID Generation

### Generation Algorithm

1. **Random Generation**: IDs use random 4-letter combinations from A-Z
2. **Collision Detection**: Each generated ID is checked against existing tasks
3. **Retry Logic**: Up to 100 attempts before throwing `TaskIdGenerationError`
4. **Uniqueness Guarantee**: No duplicate IDs can exist in the system

### Generation Functions

```typescript
// Generate a new root task ID
const rootId = await generateNextRootTaskId(store);
// Example result: "ABCD"

// Generate a subtask ID for a parent
const subtaskId = await generateNextSubtaskId(store, "ABCD");
// Example result: "ABCD-EFGH"

// Generate either root or subtask based on parent
const taskId = await generateNextTaskId(store, parentId);
// If parentId is undefined: generates root ID
// If parentId is provided: generates subtask ID
```

### Error Handling

```typescript
try {
  const taskId = await generateNextRootTaskId(store);
} catch (error) {
  if (error instanceof TaskIdGenerationError) {
    console.error(`Failed to generate unique ID: ${error.message}`);
    // Handle the error appropriately
  }
}
```

## Task ID Validation

### Validation Functions

```typescript
// Validate any task ID format
validateTaskId("ABCD");                    // true
validateTaskId("ABCD-EFGH");              // true
validateTaskId("__PROJECT_ROOT__");       // true
validateTaskId("invalid");                // false

// Validate parent-child relationship
validateSubtaskId("ABCD-EFGH", "ABCD");   // true
validateSubtaskId("ABCD-EFGH", "XYZW");   // false

// Parse task ID components
const parsed = parseTaskId("ABCD-EFGH-IJKL");
// Result: {
//   rootId: "ABCD",
//   segments: ["EFGH", "IJKL"],
//   depth: 2,
//   isRoot: false
// }
```

### Zod Schema Validation

```typescript
import { taskId } from '@astrotask/core/schemas/base';

// Validate with Zod schema
const validatedId = taskId.parse("ABCD-EFGH");
// Throws ZodError if invalid

// Safe parsing
const result = taskId.safeParse("ABCD-EFGH");
if (result.success) {
  console.log("Valid ID:", result.data);
} else {
  console.error("Invalid ID:", result.error);
}
```

## PROJECT_ROOT Concept

### Purpose

The `__PROJECT_ROOT__` serves as a virtual container that:
- **Unifies the task forest**: Provides a single root for all task hierarchies
- **Simplifies tree operations**: Enables consistent tree traversal algorithms
- **Maintains clean IDs**: Root tasks keep simple IDs (not `__PROJECT_ROOT__-ABCD`)
- **Supports database integrity**: All tasks have a non-null parent ID

### Implementation Details

#### Database Storage
```sql
-- Root tasks are stored with PROJECT_ROOT as parent
INSERT INTO tasks (id, parent_id, title) VALUES 
  ('ABCD', '__PROJECT_ROOT__', 'My Root Task');

-- Subtasks reference their actual parent
INSERT INTO tasks (id, parent_id, title) VALUES 
  ('ABCD-EFGH', 'ABCD', 'My Subtask');
```

#### Task Creation Logic
```typescript
// When creating a task without explicit parent
const task = await store.addTask({
  title: "New Root Task",
  // parentId is undefined
});
// Result: task.parentId = "__PROJECT_ROOT__" in database
// Result: task.id = "ABCD" (not "__PROJECT_ROOT__-ABCD")

// When creating a task with explicit parent
const subtask = await store.addTask({
  title: "New Subtask",
  parentId: "ABCD"
});
// Result: subtask.parentId = "ABCD" in database
// Result: subtask.id = "ABCD-EFGH"
```

#### Tree Operations
```typescript
// Get project tree (all root tasks under PROJECT_ROOT)
const projectTree = await taskService.getTaskTree();
// Returns TaskTree with PROJECT_ROOT as root containing all root tasks

// Get specific task tree
const taskTree = await taskService.getTaskTree("ABCD");
// Returns TaskTree rooted at task ABCD
```

## TaskTree Architecture

### Core Classes

#### TaskTree
```typescript
class TaskTree {
  constructor(data: TaskTreeData);
  
  // Navigation
  getParent(): TaskTree | null;
  getChildren(): TaskTree[];
  getRoot(): TaskTree;
  
  // Traversal
  traverse(callback: (tree: TaskTree) => void): void;
  find(predicate: (task: Task) => boolean): TaskTree | null;
  
  // Queries
  getDepth(): number;
  getTaskCount(): number;
  isLeaf(): boolean;
  
  // Transformation
  toArray(): Task[];
  toJSON(): TaskTreeData;
}
```

#### TaskService
```typescript
class TaskService {
  // Tree operations
  async getTaskTree(rootId?: string, maxDepth?: number): Promise<TaskTree | null>;
  async getTaskAncestors(taskId: string): Promise<Task[]>;
  async getTaskDescendants(taskId: string): Promise<Task[]>;
  
  // Validation
  async validateTaskTree(tree: TaskTree, options?: ValidationOptions): Promise<ValidationResult>;
  
  // Manipulation
  async moveTask(taskId: string, newParentId: string): Promise<void>;
}
```

### Tree Data Structure

```typescript
interface TaskTreeData {
  task: Task;
  children: TaskTreeData[];
  metadata?: {
    depth: number;
    childCount: number;
    descendantCount: number;
  };
}
```

### Caching System

The TaskTree system includes sophisticated caching:

```typescript
// Cached tree operations
const cache = new TaskTreeCache({
  maxSize: 100,
  ttl: 5 * 60 * 1000, // 5 minutes
});

// Trees are automatically cached by root ID and depth
const tree1 = await taskService.getTaskTree("ABCD", 3);
const tree2 = await taskService.getTaskTree("ABCD", 3); // Cache hit
```

## Usage Examples

### Creating a Task Hierarchy

```typescript
// Create root task
const rootTask = await store.addTask({
  title: "Implement Authentication",
  description: "Add user authentication system",
  status: "pending",
  priority: "high"
});
// Result: rootTask.id = "ABCD", rootTask.parentId = "__PROJECT_ROOT__"

// Create subtasks
const loginTask = await store.addTask({
  title: "Implement Login",
  parentId: rootTask.id,
  status: "pending",
  priority: "high"
});
// Result: loginTask.id = "ABCD-EFGH", loginTask.parentId = "ABCD"

const signupTask = await store.addTask({
  title: "Implement Signup",
  parentId: rootTask.id,
  status: "pending",
  priority: "medium"
});
// Result: signupTask.id = "ABCD-IJKL", signupTask.parentId = "ABCD"

// Create sub-subtask
const validationTask = await store.addTask({
  title: "Add Form Validation",
  parentId: loginTask.id,
  status: "pending",
  priority: "medium"
});
// Result: validationTask.id = "ABCD-EFGH-MNOP", validationTask.parentId = "ABCD-EFGH"
```

### Working with TaskTrees

```typescript
// Get the complete project tree
const projectTree = await taskService.getTaskTree();
console.log(`Project has ${projectTree.getTaskCount()} total tasks`);

// Traverse all tasks
projectTree.traverse((tree) => {
  console.log(`Task: ${tree.task.title} (${tree.task.id})`);
});

// Get specific task tree
const authTree = await taskService.getTaskTree("ABCD");
console.log(`Auth feature has ${authTree.getTaskCount()} tasks`);

// Find specific tasks
const pendingTasks = [];
authTree.traverse((tree) => {
  if (tree.task.status === 'pending') {
    pendingTasks.push(tree.task);
  }
});

// Get task ancestors (breadcrumb trail)
const ancestors = await taskService.getTaskAncestors("ABCD-EFGH-MNOP");
// Result: [PROJECT_ROOT, ABCD, ABCD-EFGH] (filtered to exclude PROJECT_ROOT in practice)

// Get all descendants
const descendants = await taskService.getTaskDescendants("ABCD");
// Result: [ABCD-EFGH, ABCD-IJKL, ABCD-EFGH-MNOP]
```

### Validation and Error Handling

```typescript
// Validate task tree structure
const validationResult = await taskService.validateTaskTree(tree, {
  maxDepth: 5,
  checkStatusConsistency: true
});

if (!validationResult.isValid) {
  console.error("Tree validation failed:", validationResult.errors);
}

// Validate task IDs
if (!validateTaskId("ABCD-EFGH")) {
  throw new Error("Invalid task ID format");
}

if (!validateSubtaskId("ABCD-EFGH", "ABCD")) {
  throw new Error("Invalid parent-child relationship");
}
```

## Best Practices

### Task ID Management

1. **Never manually create task IDs** - Always use generation functions
2. **Validate IDs at boundaries** - Use validation functions when accepting external input
3. **Handle generation errors** - Implement proper error handling for ID generation failures
4. **Use constants for special IDs** - Import `TASK_IDENTIFIERS.PROJECT_ROOT` instead of hardcoding

### Tree Operations

1. **Use caching wisely** - TaskTree operations are cached, but be mindful of cache invalidation
2. **Limit tree depth** - Use `maxDepth` parameter to prevent performance issues
3. **Batch operations** - When possible, batch multiple tree operations together
4. **Validate before mutations** - Always validate tree structure before making changes

### Performance Considerations

1. **Tree depth**: Deeper trees require more processing time
2. **Cache size**: Larger caches use more memory but improve performance
3. **Traversal patterns**: Prefer specific queries over full tree traversals
4. **Database queries**: Tree operations may trigger multiple database queries

## Migration and Compatibility

### Schema Evolution

The task ID system is designed to be forward-compatible:
- New special ID patterns can be added without breaking existing validation
- The dash-separated format allows for future extensions
- Database schema supports arbitrary string IDs

### Backward Compatibility

When updating the system:
- Existing task IDs remain valid
- New validation rules are additive, not restrictive
- Migration scripts handle any necessary ID format updates

## Troubleshooting

### Common Issues

1. **TaskIdGenerationError**: Usually indicates database connectivity issues or extremely high collision rates
2. **Validation failures**: Check for typos in task IDs or incorrect parent-child relationships
3. **Cache inconsistencies**: Clear cache after direct database modifications
4. **Performance issues**: Check tree depth and consider using `maxDepth` limits

### Debugging Tools

```typescript
// Enable debug logging
const logger = createModuleLogger('TaskTree');
logger.setLevel('debug');

// Inspect task ID components
const parsed = parseTaskId(taskId);
console.log('Task ID analysis:', parsed);

// Validate tree structure
const result = await validateTaskTree(tree, { verbose: true });
console.log('Validation details:', result);
```

## API Reference

For complete API documentation, see:
- [TaskTree API](./api/task-tree.md)
- [TaskService API](./api/task-service.md)
- [Task ID Utilities API](./api/task-id-utils.md)
- [Validation API](./api/validation.md) 
