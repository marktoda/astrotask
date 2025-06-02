# Hierarchical Task Status Implementation Plan

## Overview
Implement hierarchical task status where parent task completion affects child task status. This feature will integrate seamlessly with existing TaskTree, TrackingTaskTree, and DependencyGraph components.

## Design Approach: Implicit with Optional Explicit Cascading

### Core Concepts

1. **Effective Status vs Actual Status**
   - **Actual Status**: The status stored in the database (existing)
   - **Effective Status**: The computed status considering parent hierarchy (new)

2. **Hierarchical Rules**
   - If any ancestor task is `done`, the task's effective status is `done`
   - If any ancestor task is `cancelled`, the task's effective status is `cancelled`
   - If any ancestor task is `archived`, the task's effective status is `archived`
   - Otherwise, use the task's actual status
   - Dependencies still check actual status for blocking logic

### Implementation Tasks

#### Task 1: Add Effective Status to TaskTree
- Add `getEffectiveStatus(): TaskStatus` method to ITaskTree interface
- Implement in TaskTree class
- Implement in TrackingTaskTree class
- Add unit tests

#### Task 2: Add Effective Status Helper Methods
- Add `hasAncestorWithStatus(status: TaskStatus): boolean` to ITaskTree
- Add `getAncestorWithStatus(status: TaskStatus): ITaskTree | null` to ITaskTree
- Implement efficient traversal logic

#### Task 3: Update Store Methods for Hierarchical Queries
- Modify `listTasks` to optionally filter by effective status
- Add `effectiveStatusFilter` option to query methods
- Update indexes if needed for performance

#### Task 4: Add Cascade Option to Status Updates
- Add `cascade?: boolean` option to `updateTaskStatus` in TaskService
- Implement cascading logic when `cascade: true`
- Add validation to prevent invalid cascade operations

#### Task 5: Update UI Components
- Update TaskTreeComponent to show effective status
- Update status icons/colors to differentiate effective vs actual
- Add visual indicator when status is inherited

#### Task 6: Update Dashboard and CLI Commands
- Update task tree display to show effective status
- Add option to toggle between actual/effective status view
- Update progress calculations to consider effective status

#### Task 7: Add MCP Handler Support
- Update `updateStatus` handler to support cascade option
- Add documentation for hierarchical status behavior
- Update API schemas

#### Task 8: Integration Tests
- Test hierarchical status with complex tree structures
- Test interaction with dependency system
- Test performance with large hierarchies

## Implementation Details

### TaskTree Changes

```typescript
interface ITaskTree {
  // ... existing methods ...
  
  // New methods
  getEffectiveStatus(): TaskStatus;
  hasAncestorWithStatus(status: TaskStatus): boolean;
  getAncestorWithStatus(status: TaskStatus): ITaskTree | null;
}
```

### TaskService Changes

```typescript
interface StatusUpdateOptions {
  force?: boolean;
  cascade?: boolean; // New option
}

async updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  options?: StatusUpdateOptions
): Promise<StatusUpdateResult>
```

### Store Query Changes

```typescript
interface TaskListFilters {
  statuses?: TaskStatus[];
  parentId?: string | null;
  includeProjectRoot?: boolean;
  effectiveStatuses?: TaskStatus[]; // New filter
}
```

## Testing Strategy

1. Unit tests for each new method
2. Integration tests for hierarchical scenarios
3. Performance tests for deep hierarchies
4. UI tests for visual indicators

## Migration Considerations

- No database schema changes required
- Backward compatible - effective status is computed
- Optional cascade behavior preserves existing functionality

## Future Enhancements

1. Configurable inheritance rules per project
2. Partial completion states (e.g., 80% done inherits as "in-progress")
3. Status inheritance policies (strict, lenient, custom) 