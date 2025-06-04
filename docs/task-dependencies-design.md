# Task Dependencies Design Document

**Version:** 1.0  
**Author:** Claude  
**Date:** 2025-05-28  
**Issue:** #26 - Handle task dependencies

---

## 1. Executive Summary

This document outlines the design for implementing task dependencies in Astrolabe, enabling tasks to specify prerequisite relationships where certain tasks must be completed before others can begin. The design integrates seamlessly with the existing hierarchical task system while maintaining Astrolabe's core principles of local-first operation, type safety, and MCP compatibility.

### Key Features
- **Dependency Graph:** Directed acyclic graph (DAG) of task dependencies alongside existing hierarchy
- **Execution Constraints:** Automatic blocking of tasks until dependencies complete
- **Validation:** Cycle detection and constraint validation
- **MCP Integration:** New API functions for dependency management
- **Local-First:** Full offline support with sync-friendly data structures

---

## 2. Problem Statement

Currently, Astrolabe supports hierarchical parent-child task relationships but lacks the ability to model dependencies between tasks at different levels of the hierarchy. Users need to express relationships like:

- "Task B cannot start until Task A is done"
- "Multiple tasks must complete before this milestone begins" 
- "A code review task depends on development tasks being finished"

These dependency relationships are orthogonal to the hierarchical parent-child structure and require a separate modeling approach.

---

## 3. Design Principles

Following Astrolabe's core principles:

| Principle | Application |
|-----------|-------------|
| **Local-First (G1)** | All dependency operations work offline; sync-compatible data model |
| **Type Safety (G4)** | Full Zod schemas and TypeScript types for all dependency operations |
| **MCP Integration (G2)** | Dependency context included in single MCP calls |
| **Performance** | Efficient DAG operations with caching support |
| **Simplicity** | Clean integration with existing TaskService and schemas |

---

## 4. Data Model Design

### 4.1 Database Schema Extension

Add a new `task_dependencies` table to model the dependency graph:

```sql
CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  dependentTaskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependencyTaskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure no duplicate dependencies
  UNIQUE(dependentTaskId, dependencyTaskId),
  
  -- Prevent self-dependencies
  CHECK(dependentTaskId != dependencyTaskId)
);

-- Index for efficient lookups
CREATE INDEX idx_task_dependencies_dependent ON task_dependencies(dependentTaskId);
CREATE INDEX idx_task_dependencies_dependency ON task_dependencies(dependencyTaskId);
```

### 4.2 Zod Schema Definitions

```typescript
// schemas/dependency.ts
import { z } from 'zod';
import { taskId } from './base.js';

export const taskDependencySchema = z.object({
  id: z.string().uuid(),
  dependentTaskId: taskId,
  dependencyTaskId: taskId,
  createdAt: z.date(),
});

export const createTaskDependencySchema = taskDependencySchema.omit({
  id: true,
  createdAt: true,
});

export const taskDependencyGraphSchema = z.object({
  taskId: taskId,
  dependencies: z.array(taskId),           // Tasks this task depends on
  dependents: z.array(taskId),             // Tasks that depend on this task
  isBlocked: z.boolean(),                  // Whether task can start
  blockedBy: z.array(taskId),              // Which incomplete dependencies block this task
});

// Extend existing task schema with dependency info
export const taskWithDependenciesSchema = taskSchema.extend({
  dependencies: z.array(taskId).optional(),
  dependents: z.array(taskId).optional(),
  isBlocked: z.boolean().optional(),
  blockedBy: z.array(taskId).optional(),
});

export type TaskDependency = z.infer<typeof taskDependencySchema>;
export type CreateTaskDependency = z.infer<typeof createTaskDependencySchema>;
export type TaskDependencyGraph = z.infer<typeof taskDependencyGraphSchema>;
export type TaskWithDependencies = z.infer<typeof taskWithDependenciesSchema>;
```

### 4.3 Status Integration

Enhance task status validation to respect dependencies:

```typescript
// Valid status transitions considering dependencies
export const taskStatusTransitions = {
  'pending': ['in-progress', 'cancelled'], // Can only start if not blocked
  'in-progress': ['done', 'pending', 'cancelled'],
  'done': ['in-progress'], // Can reopen, which may block dependents
  'cancelled': ['pending'],
  'archived': [], // Terminal state
} as const;

// Enhanced validation function
export function canTransitionStatus(
  currentStatus: TaskStatus, 
  newStatus: TaskStatus,
  isBlocked: boolean
): boolean {
  if (newStatus === 'in-progress' && isBlocked) {
    return false; // Cannot start blocked tasks
  }
  return taskStatusTransitions[currentStatus].includes(newStatus);
}
```

---

## 5. Service Layer Design

### 5.1 DependencyService

Create a new service for dependency-specific operations:

```typescript
// services/DependencyService.ts
export class DependencyService {
  constructor(private store: Store) {}

  // Core dependency management
  async addDependency(dependentId: string, dependencyId: string): Promise<TaskDependency>
  async removeDependency(dependentId: string, dependencyId: string): Promise<boolean>
  async getDependencies(taskId: string): Promise<string[]>
  async getDependents(taskId: string): Promise<string[]>
  
  // Validation and analysis
  async validateDependency(dependentId: string, dependencyId: string): Promise<ValidationResult>
  async findCycles(taskIds: string[]): Promise<string[][]>
  async getBlockedTasks(): Promise<TaskWithDependencies[]>
  
  // Graph operations
  async getDependencyGraph(rootId?: string): Promise<Map<string, TaskDependencyGraph>>
  async getTopologicalOrder(taskIds: string[]): Promise<string[]>
  async getExecutableTasks(): Promise<Task[]> // Tasks that can start now
}
```

### 5.2 TaskService Integration

Extend existing TaskService with dependency-aware methods:

```typescript
// Add to TaskService class
export class TaskService {
  constructor(
    private store: Store,
    private dependencyService: DependencyService,
    cacheOptions?: Partial<{ maxSize: number; ttlMs: number; maxAge: number }>
  ) {
    // existing constructor
  }

  // Enhanced context method including dependencies
  async getTaskWithContext(taskId: string): Promise<{
    task: Task;
    ancestors: Task[];
    descendants: TaskTree[];
    root: TaskTree | null;
    dependencies: Task[];
    dependents: Task[];
    isBlocked: boolean;
    blockedBy: Task[];
  } | null>

  // Dependency-aware status updates
  async updateTaskStatus(
    taskId: string, 
    status: TaskStatus,
    options?: { force?: boolean }
  ): Promise<{ success: boolean; blocked?: Task[] }>

  // Get tasks that can be started immediately
  async getAvailableTasks(filter?: TaskFilter): Promise<Task[]>
}
```

---

## 6. MCP API Extensions

### 6.1 New MCP Functions

Add dependency-related functions to the MCP interface:

```typescript
// New MCP functions for dependencies
export const dependencyMcpFunctions = {
  addTaskDependency: {
    name: 'addTaskDependency',
    description: 'Add a dependency relationship between tasks',
    inputSchema: createTaskDependencySchema,
  },
  
  removeTaskDependency: {
    name: 'removeTaskDependency', 
    description: 'Remove a dependency relationship',
    inputSchema: z.object({
      dependentTaskId: taskId,
      dependencyTaskId: taskId,
    }),
  },
  
  getTaskDependencies: {
    name: 'getTaskDependencies',
    description: 'Get dependency information for a task',
    inputSchema: z.object({ taskId }),
    outputSchema: taskDependencyGraphSchema,
  },
  
  validateTaskDependency: {
    name: 'validateTaskDependency',
    description: 'Check if a dependency can be safely added',
    inputSchema: createTaskDependencySchema,
    outputSchema: z.object({
      valid: z.boolean(),
      cycles: z.array(z.array(taskId)),
      errors: z.array(z.string()),
    }),
  },
  
  getAvailableTasks: {
    name: 'getAvailableTasks',
    description: 'Get tasks that can be started immediately',
    inputSchema: z.object({
      status: taskStatus.optional(),
      priority: taskPriority.optional(),
    }),
    outputSchema: z.array(taskWithDependenciesSchema),
  },
  
  getDependencyGraph: {
    name: 'getDependencyGraph',
    description: 'Get dependency graph for visualization',
    inputSchema: z.object({
      rootTaskId: taskId.optional(),
      format: z.enum(['json', 'mermaid']).default('json'),
    }),
  },
};
```

### 6.2 Enhanced Context Bundle

Update `getTaskContext` to include dependency information:

```typescript
export interface TaskContextBundle {
  task: TaskWithDependencies;
  ancestors: Task[];
  descendants: TaskTree[];
  dependencies: Task[];        // Tasks this task depends on
  dependents: Task[];          // Tasks depending on this task
  blockedTasks: Task[];        // Tasks blocked by this task
  isBlocked: boolean;
  blockedBy: Task[];
  dependencyGraph?: DependencyGraphData; // Optional graph representation
  executionPath?: string[];    // Suggested execution order
}
```

---

## 7. Implementation Plan

### 7.1 Phase 1: Core Data Model (Week 1)
- [ ] Add `task_dependencies` table to schema
- [ ] Create Zod schemas for dependencies
- [ ] Implement basic DependencyService CRUD operations
- [ ] Add database migration

### 7.2 Phase 2: Validation & Business Logic (Week 2)  
- [ ] Implement cycle detection algorithms
- [ ] Add dependency validation to TaskService
- [ ] Create status transition guards
- [ ] Add comprehensive test suite

### 7.3 Phase 3: MCP Integration (Week 3)
- [ ] Add new MCP functions for dependencies
- [ ] Enhance `getTaskContext` with dependency data
- [ ] Update existing MCP functions to respect dependencies
- [ ] Add dependency visualization support

### 7.4 Phase 4: CLI & Tooling (Week 4)
- [ ] Add CLI commands for dependency management
- [ ] Create graph rendering for dependencies
- [ ] Add dependency validation to import/export
- [ ] Performance optimization and caching

---

## 8. Technical Considerations

### 8.1 Performance

**Cycle Detection:** Use DFS-based algorithms with memoization for efficient cycle detection even in large graphs.

**Query Optimization:** Strategic database indexes on foreign keys and composite unique constraints.

**Caching Strategy:** Extend existing TaskTreeCache to include dependency graphs with intelligent invalidation.

### 8.2 Sync Compatibility

**CRDT-Friendly:** Dependencies use append-only operations with tombstone deletion for ElectricSQL compatibility.

**Conflict Resolution:** Last-writer-wins for dependency addition/removal with timestamps for ordering.

### 8.3 Validation Rules

```typescript
// Core validation rules
export const dependencyValidationRules = {
  // No self-dependencies
  noSelfDependency: (dependent: string, dependency: string) => 
    dependent !== dependency,
    
  // No cycles in dependency graph  
  noCycles: async (dependent: string, dependency: string, service: DependencyService) => {
    const wouldCreateCycle = await service.wouldCreateCycle(dependent, dependency);
    return !wouldCreateCycle;
  },
  
  // Both tasks must exist
  tasksExist: async (dependent: string, dependency: string, store: Store) => {
    const [depTask, reqTask] = await Promise.all([
      store.getTask(dependent),
      store.getTask(dependency),
    ]);
    return !!(depTask && reqTask);
  },
  
  // No duplicate dependencies
  noDuplicate: async (dependent: string, dependency: string, service: DependencyService) => {
    const existing = await service.getDependencies(dependent);
    return !existing.includes(dependency);
  },
};
```

---

## 9. User Experience

### 9.1 CLI Commands

```bash
# Add dependency relationship
astro task add-dependency <dependent-task> <dependency-task>
astro task remove-dependency <dependent-task> <dependency-task>

# Query dependencies
astro task dependencies <task-id>
astro task dependents <task-id>

# Find available work
astro task available --priority high

# Visualize dependencies
astro graph dependencies --root <task-id> --format mermaid

# Validate dependency graph
astro task validate-dependencies --fix-cycles
```

### 9.2 Status Feedback

```bash
$ astro task update ABCD --status in-progress
# Warning: This will block task EFGH which depends on ABCD

$ astro task available
# Shows only tasks with no unmet dependencies

$ astro task dependencies ABCD
# Shows: Task ABCD depends on: [XYZ-123, ABC-456] (2 incomplete)
```

---

## 10. Migration Strategy

### 10.1 Backward Compatibility

- Existing tasks work unchanged (no dependencies = no blocking)
- All current MCP functions remain compatible
- Optional fields in API responses for gradual adoption

### 10.2 Database Migration

```sql
-- Migration: Add task dependencies table
CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  dependentTaskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependencyTaskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(dependentTaskId, dependencyTaskId),
  CHECK(dependentTaskId != dependencyTaskId)
);

CREATE INDEX idx_task_dependencies_dependent ON task_dependencies(dependentTaskId);
CREATE INDEX idx_task_dependencies_dependency ON task_dependencies(dependencyTaskId);
```

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Dependency Operations** | < 50ms | API response time for add/remove |
| **Graph Validation** | < 200ms | Cycle detection on 1000-node graph |
| **Context Loading** | < 400ms | Enhanced `getTaskContext` with dependencies |
| **Memory Usage** | < 20% increase | Runtime memory with dependency caching |
| **Query Efficiency** | < 3 DB queries | Load task with full dependency context |

---

## 12. Future Enhancements

### 12.1 Advanced Features
- **Conditional Dependencies:** Dependencies based on task outcomes
- **Partial Dependencies:** Tasks can start when subset of dependencies complete
- **Dependency Templates:** Reusable dependency patterns for project types
- **Time-based Dependencies:** Dependencies with time delays

### 12.2 Integration Opportunities
- **Linear Sync:** Export dependency relationships to Linear
- **Calendar Integration:** Schedule tasks based on dependency completion
- **Notifications:** Alert when blocked tasks become available

---

## 13. Conclusion

This design provides a robust foundation for task dependencies in Astrolabe while maintaining the system's core principles. The approach:

- **Preserves existing functionality** through careful schema extensions
- **Enables powerful workflow modeling** with DAG-based dependencies  
- **Maintains performance** through efficient algorithms and caching
- **Supports offline-first operation** with sync-compatible data structures
- **Provides rich MCP integration** for AI agent workflows

The phased implementation plan allows for incremental delivery and validation, ensuring the dependency system integrates seamlessly with Astrolabe's existing task management capabilities.

---

**Implementation Priority:** High  
**Estimated Effort:** 4 weeks  
**Risk Level:** Medium (well-understood algorithms, clear integration points)
