# Entities Module

The entities module provides the core domain objects and business logic for Astrolabe Task Manager. It implements a sophisticated dual-architecture pattern with immutable entities for data integrity and tracking entities for efficient batch operations.

## Architecture Overview

This module follows a **dual-pattern architecture**:

- **Immutable Entities**: Pure, functional data structures for reliable operations
- **Tracking Entities**: Mutable counterparts that track changes for efficient batch processing

### Core Design Principles

1. **Immutability First**: All primary entities are immutable with functional APIs
2. **Type Safety**: Comprehensive TypeScript coverage with Zod schema validation
3. **Performance**: Efficient algorithms for tree/graph operations with caching
4. **Separation of Concerns**: Pure domain logic separate from persistence
5. **Batch Optimization**: Tracking entities enable efficient bulk operations

## File Structure

```
entities/
├── README.md                    # This file
├── TaskTree.ts                  # Immutable task hierarchy
├── TrackingTaskTree.ts          # Mutable task tree with change tracking
├── DependencyGraph.ts           # Immutable dependency relationships
├── TrackingDependencyGraph.ts   # Mutable dependency graph with change tracking
├── TaskTreeValidation.ts        # Tree structure validation utilities
├── TaskTreeCache.ts             # Performance optimization caching
├── TaskTreeConstants.ts         # Configuration constants
├── TrackingTypes.ts             # Service interfaces for tracking
└── TrackingErrors.ts            # Specialized error classes
```

## Core Entities

### TaskTree (Immutable)

The foundational entity representing hierarchical task structures.

```typescript
import { TaskTree } from './entities/TaskTree.js';

// Create from data
const tree = new TaskTree({
  task: { id: '1', title: 'Project Setup', /* ... */ },
  children: [
    {
      task: { id: '1.1', title: 'Initialize Repository', /* ... */ },
      children: []
    }
  ]
});

// Navigate the tree
const parent = tree.getParent();
const children = tree.getChildren();
const root = tree.getRoot();

// Traverse with visitors
tree.walkDepthFirst((node) => {
  console.log(`Task: ${node.title} (depth: ${node.getDepth()})`);
});

// Immutable transformations
const updatedTree = tree
  .withTask({ status: 'done' })
  .addChild(childTree);

// Queries
const found = tree.find(task => task.status === 'pending');
const depth = tree.getDepth();
const descendants = tree.getAllDescendants();
```

**Key Features:**
- Immutable operations return new instances
- Depth-first and breadth-first traversal
- Path finding and relationship queries
- Batch operations for performance
- Type-safe task transformations

### DependencyGraph (Immutable)

Manages task dependency relationships and provides graph analysis.

```typescript
import { DependencyGraph } from './entities/DependencyGraph.js';

// Create from dependencies
const graph = DependencyGraph.fromDependencies([
  { dependentTaskId: '2', dependencyTaskId: '1' },
  { dependentTaskId: '3', dependencyTaskId: '2' }
]);

// Query dependencies
const dependencies = graph.getDependencies('2'); // ['1']
const dependents = graph.getDependents('1');     // ['2']

// Analyze structure
const cycles = graph.findCycles();
const topological = graph.getTopologicalOrder();
const blocked = graph.getBlockedTasks();
const executable = graph.getExecutableTasks();

// Graph traversal
graph.walkDepthFirst('1', (taskId, depth) => {
  console.log(`${' '.repeat(depth)}Task: ${taskId}`);
});

// Metrics
const metrics = graph.getMetrics();
console.log(`Total tasks: ${metrics.totalTasks}`);
console.log(`Has cycles: ${metrics.hasCycles}`);
```

**Key Features:**
- Cycle detection and prevention
- Topological sorting for execution order
- Blocked/executable task identification
- Graph traversal algorithms
- Performance metrics and analysis

### TrackingTaskTree (Mutable)

Efficient change tracking for batch operations on task trees.

```typescript
import { TrackingTaskTree } from './entities/TrackingTaskTree.js';

// Create tracking tree
const trackingTree = new TrackingTaskTree(initialTree);

// Make multiple changes (tracked internally)
trackingTree.updateTask('1', { status: 'in-progress' });
trackingTree.addChild('1', newChildData);
trackingTree.deleteTask('1.2');

// Review pending operations
const operations = trackingTree.getPendingOperations();
console.log(`${operations.length} operations pending`);

// Generate reconciliation plan
const plan = trackingTree.buildReconciliationPlan();

// Flush to service (applies all changes atomically)
const result = await trackingTree.flush(reconciliationService);
const { updatedTree, idMappings } = result;
```

**Key Features:**
- Tracks all mutations for batch processing
- Generates reconciliation plans
- Atomic flush operations
- ID mapping for temporary entities
- Conflict detection and resolution

### TrackingDependencyGraph (Mutable)

Change tracking for dependency relationships.

```typescript
import { TrackingDependencyGraph } from './entities/TrackingDependencyGraph.js';

// Create tracking graph
const trackingGraph = new TrackingDependencyGraph(initialGraph);

// Track dependency changes
trackingGraph.addDependency('3', '1');
trackingGraph.removeDependency('2', '1');

// Generate and apply reconciliation plan
const plan = trackingGraph.buildReconciliationPlan();
const result = await trackingGraph.flush(dependencyService);
```

## Validation System

Comprehensive validation for tree structure and business rules.

```typescript
import { validateTaskTree, validateTaskForest } from './entities/TaskTreeValidation.js';

// Validate single tree
const result = validateTaskTree(tree, {
  maxDepth: 10,
  checkStatusConsistency: true
});

if (!result.isValid) {
  for (const error of result.errors) {
    console.error(`${error.type}: ${error.message}`);
  }
}

// Validate multiple trees
const forestResult = validateTaskForest(trees);

// Validate operations before applying
const moveResult = validateMoveOperation('1.1', '2', existingTree);
```

**Validation Types:**
- **Errors**: Structure violations (cycles, invalid parents, duplicates)
- **Warnings**: Best practice violations (deep nesting, status inconsistency)

## Caching System

Performance optimization through intelligent caching.

```typescript
import { TaskTreeCache } from './entities/TaskTreeCache.js';

// Create cache with options
const cache = new TaskTreeCache({
  maxSize: 100,
  ttlMs: 300000, // 5 minutes
  enableMetrics: true
});

// Cache operations are automatic for most use cases
// Manual cache management for custom scenarios
cache.set('tree-key', tree);
const cached = cache.get('tree-key');

// Monitor performance
const stats = cache.getStats();
console.log(`Cache hit rate: ${stats.hitRate}%`);
```

## Error Handling

Specialized error classes for better debugging and error handling.

```typescript
import { 
  TrackingError, 
  ReconciliationError, 
  IdMappingError 
} from './entities/TrackingErrors.js';

try {
  await trackingTree.flush(service);
} catch (error) {
  if (error instanceof ReconciliationError) {
    console.log(`Failed operations: ${error.failedOperations.length}`);
    console.log(`Successful operations: ${error.successfulOperations.length}`);
  } else if (error instanceof IdMappingError) {
    console.log(`Unmapped IDs: ${error.unmappedIds}`);
  }
}
```

## Configuration

Centralized configuration constants for consistent behavior.

```typescript
import { 
  TASK_IDENTIFIERS, 
  CACHE_CONFIG, 
  VALIDATION_CONFIG 
} from './entities/TaskTreeConstants.js';

// Special identifiers
const projectRoot = TASK_IDENTIFIERS.PROJECT_ROOT;

// Cache settings
const maxCacheSize = CACHE_CONFIG.DEFAULT_MAX_SIZE;

// Validation limits
const maxDepth = VALIDATION_CONFIG.DEFAULT_MAX_DEPTH;
```

## Usage Patterns

### 1. Simple Read Operations

For read-only operations, use immutable entities directly:

```typescript
// Query tasks
const pendingTasks = tree.filter(task => task.status === 'pending');
const nextExecutable = graph.getExecutableTasks()[0];

// Navigate structure
const taskPath = tree.getPath();
const isBlocked = graph.getBlockedTasks().includes(taskId);
```

### 2. Single Modifications

For individual changes, use immutable transformations:

```typescript
// Update single task
const updatedTree = tree.withTask({ status: 'done' });

// Add dependency
const updatedGraph = graph.withDependency('child', 'parent');
```

### 3. Batch Operations

For multiple changes, use tracking entities:

```typescript
// Multiple task changes
const tracking = new TrackingTaskTree(tree);
tracking.updateTask('1', { status: 'done' });
tracking.updateTask('2', { status: 'in-progress' });
tracking.addChild('3', newTaskData);

// Apply all changes atomically
const result = await tracking.flush(service);
```

### 4. Validation Before Changes

Always validate complex operations:

```typescript
// Validate before move
const validation = validateMoveOperation(taskId, newParentId, tree);
if (validation.isValid) {
  // Proceed with move
} else {
  // Handle validation errors
}
```

### 5. Performance Optimization

Use caching for frequently accessed trees:

```typescript
// Let the cache handle optimization
const tree = cache.getOrCompute(`project-${id}`, () => {
  return loadTaskTree(id);
});
```

## Integration with Services

The entities work with service interfaces for persistence:

```typescript
// Task reconciliation service
interface ITaskReconciliationService {
  executeReconciliationOperations(plan: ReconciliationPlan): Promise<{
    tree: TaskTree;
    idMappings: Map<string, string>;
  }>;
}

// Dependency reconciliation service  
interface IDependencyReconciliationService {
  applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<IDependencyGraph>;
}
```

## Performance Considerations

### Memory Management

- Immutable entities create new instances for transformations
- Use tracking entities for multiple related changes
- Cache frequently accessed trees
- Clean up tracking entities after flushing

### Algorithm Complexity

- Tree traversal: O(n) where n = number of nodes
- Dependency cycle detection: O(V + E) where V = vertices, E = edges  
- Topological sort: O(V + E)
- Tree validation: O(n) for structure, O(n²) for relationships

### Optimization Tips

1. **Batch Changes**: Use tracking entities for multiple operations
2. **Cache Results**: Enable caching for read-heavy workloads
3. **Validate Early**: Check constraints before expensive operations
4. **Lazy Loading**: Only load required tree portions when possible
5. **Dispose Tracking**: Clear tracking entities after flushing

## Testing

The entities include comprehensive test coverage for:

- Immutable operation correctness
- Tracking and reconciliation logic
- Validation rule enforcement
- Performance characteristics
- Error handling scenarios

See the test files in the `tests/` directory for examples and patterns.

## Migration Guide

### From Legacy TaskService

```typescript
// Old pattern
const tasks = await taskService.getAllTasks();
const tree = buildTreeFromTasks(tasks);

// New pattern  
const tree = await createDatabase().store.getTaskTree('PROJECT_ROOT');
```

### From Direct Database Manipulation

```typescript
// Old pattern
await db.task.update({ id: '1' }, { status: 'done' });
await db.task.update({ id: '2' }, { status: 'in-progress' });

// New pattern
const tracking = new TrackingTaskTree(tree);
tracking.updateTask('1', { status: 'done' });
tracking.updateTask('2', { status: 'in-progress' });
await tracking.flush(reconciliationService);
```

## Future Enhancements

Planned improvements include:

- **Undo/Redo**: Leveraging immutable snapshots
- **Real-time Sync**: Integration with Electric SQL
- **Advanced Queries**: SQL-like filtering and aggregation
- **Performance Monitoring**: Built-in performance metrics
- **Schema Evolution**: Migration support for data structure changes

---

This entities module provides the foundation for reliable, efficient task management with strong type safety and performance optimization. The dual-pattern architecture ensures both data integrity and operational efficiency for complex task hierarchies and dependency relationships. 