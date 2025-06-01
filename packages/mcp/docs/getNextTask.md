# getNextTask

Returns the next available task to work on, with optional filtering by parent task, status, and priority.

## Purpose

This tool is designed to help AI agents efficiently identify the next actionable task in a project. It automatically filters for tasks that are ready to be worked on (no blocking dependencies) and can be scoped to specific subtrees or filtered by status/priority.

## Parameters

- **parentTaskId** (optional): Limit results to direct children of this task ID
- **status** (optional): Filter by task status (`pending`, `in-progress`, `done`, `cancelled`)
- **priority** (optional): Filter by task priority (`low`, `medium`, `high`)

## Behavior

1. **Dependency-aware**: Only returns tasks with no unresolved dependencies
2. **Hierarchical**: Respects parent-child relationships when `parentTaskId` is specified
3. **Status filtering**: Typically used with `status: "pending"` to find unstarted work
4. **Priority ordering**: Higher priority tasks are preferred when multiple options exist

## Example Calls

### Get any next available task
```json
{}
```

### Get next subtask within a project
```json
{
  "parentTaskId": "task_12345"
}
```

### Get next high-priority pending task
```json
{
  "status": "pending",
  "priority": "high"
}
```

### Get next task in a specific parent that's in progress
```json
{
  "parentTaskId": "task_12345",
  "status": "in-progress"
}
```

## Return Value

Returns a task object with all task properties, or null if no suitable task is found.

## Common Use Cases

- **AI Agent Workflow**: Agent asks "what should I work on next?"
- **Project Focus**: Get next task within a specific project or feature
- **Priority Triage**: Focus on high-priority items during time constraints
- **Status Transitions**: Find tasks ready to move from pending to in-progress 