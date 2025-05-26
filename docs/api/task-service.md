---
description: TaskService – business logic helper for hierarchical task operations
globs: src/core/services/TaskService.ts, test/taskService.test.ts
alwaysApply: false
---

# TaskService API

`TaskService` encapsulates business-level functionality for working with hierarchical **Task** records.  
It builds on top of the lower-level `Store` data-access layer, adding helper methods for:

* Building task trees
* Traversing ancestor / descendant relations
* Calculating depth within a hierarchy
* Moving/deleting entire sub-trees
* Bulk status updates

The service contains **no persistence logic of its own** – all reads and writes are delegated to the injected `Store` instance.  This keeps the service easily testable (see [`taskService.test.ts`](mdc:test/taskService.test.ts)).

## Importing

```typescript
import { TaskService } from '@astrolabe/core/services/TaskService';
```

---

## Constructor

```typescript
new TaskService(store: Store): TaskService
```

* **store** – an implementation of the [`Store`](mdc:src/database/store.ts) interface that knows how to load and persist tasks.

---

## Methods

### `getTaskTree(rootId: string, maxDepth?: number): Promise<TaskTree | null>`
Returns a nested tree starting from `rootId`.  
Set `maxDepth` to limit traversal depth – handy when you only need the first *n* levels.

### `getTaskAncestors(taskId: string): Promise<Task[]>`
Returns all parents up to the root task.  The array is **root-first** (root at index 0, immediate parent last).

### `getTaskDescendants(taskId: string): Promise<Task[]>`
Depth-first collection of every child, grand-child … beneath `taskId`.

### `getTaskDepth(taskId: string): Promise<number>`
Zero-based depth – i.e. root tasks return `0`, their direct children return `1`, and so on.

### `moveTaskTree(taskId: string, newParentId: string | null): Promise<boolean>`
Re-parents an entire task sub-tree.  Guards against circular references and missing parents.  
Returns `true` if the move succeeded.

### `deleteTaskTree(taskId: string, cascade = true): Promise<boolean>`
Deletes `taskId` and, when `cascade` is `true` (default), all descendants (children first to satisfy FK constraints).

### `updateTreeStatus(rootId: string, status: string): Promise<number>`
Bulk update – sets `status` on the root task *and* every descendant.  Returns the number of tasks updated.

---

## Usage Example

```typescript
const store = /* your Store implementation */;
const tasks = new TaskService(store);

// Move an entire feature branch under a new epic
await tasks.moveTaskTree('feature-123', 'epic-45');

// Close a completed epic and everything under it
await tasks.updateTreeStatus('epic-45', 'done');
```

---

## Testing

Unit tests live in [`test/taskService.test.ts`](mdc:test/taskService.test.ts).  They use a tiny in-memory `Store` stub so they run quickly without touching a real database.

```bash
pnpm test --filter taskService
```

---

## See Also

* [`Store` interface](mdc:src/database/store.ts)
* [`Task` database schema](mdc:src/database/schema.ts)
* [Task-related CLI helpers](mdc:.cursor/rules/taskmaster.mdc) 