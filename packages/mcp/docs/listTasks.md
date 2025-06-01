# listTasks

Returns an array of tasks that match optional status, parent, and other filters.

## Purpose

This tool provides flexible task querying capabilities for project oversight, status tracking, and filtered task exploration. It's essential for understanding project structure, monitoring progress, and finding specific subsets of tasks.

## Parameters

- **status** (optional): Filter by task status (`pending`, `in-progress`, `done`, `cancelled`)
- **parentId** (optional): Limit results to direct children of this parent task ID
- **includeProjectRoot** (optional): Whether to include the project root task in results (default: false)

## Filtering Behavior

### Status Filtering
- `pending`: Tasks not yet started
- `in-progress`: Tasks currently being worked on
- `done`: Completed tasks
- `cancelled`: Tasks that were cancelled or abandoned

### Hierarchical Filtering
- **No parentId**: Returns all tasks at any level
- **With parentId**: Returns only direct children of the specified parent
- **includeProjectRoot**: Controls whether root-level project tasks appear in results

## Example Calls

### List all tasks
```json
{}
```

### List all pending tasks
```json
{
  "status": "pending"
}
```

### List all subtasks of a specific task
```json
{
  "parentId": "task_12345"
}
```

### List pending subtasks within a project
```json
{
  "parentId": "project_auth_feature",
  "status": "pending"
}
```

### List completed tasks with project roots
```json
{
  "status": "done",
  "includeProjectRoot": true
}
```

### List all in-progress work
```json
{
  "status": "in-progress"
}
```

## Return Value

Returns an array of task objects matching the specified filters. Each task includes:
- Task metadata (id, title, description, status, priority)
- Hierarchy information (parentId, child relationships)
- Timestamps (created, updated)
- Context and dependency information

## Common Query Patterns

### Project Management
```json
// Get project overview
{ "parentId": "project_main" }

// Check project progress
{ "parentId": "project_main", "status": "done" }

// Find blocking issues
{ "status": "in-progress" }
```

### Sprint Planning
```json
// Available work
{ "status": "pending" }

// Current sprint status
{ "status": "in-progress" }

// Completed this sprint
{ "status": "done" }
```

### Hierarchical Navigation
```json
// Top-level projects
{ "includeProjectRoot": true }

// Drill down into feature
{ "parentId": "feature_user_auth" }

// Find specific work items
{ "parentId": "feature_user_auth", "status": "pending" }
```

## Performance Notes

- **Indexed queries**: Status and parent filters use database indexes for fast results
- **Minimal data**: Returns only essential task properties by default
- **Efficient pagination**: Large result sets are handled efficiently

## Common Use Cases

- **Dashboard views**: Project managers getting overview of work status
- **Agent task selection**: AI agents finding available work within a project scope
- **Progress reporting**: Tracking completion rates and current work
- **Dependency analysis**: Understanding task relationships and hierarchies
- **Sprint retrospectives**: Reviewing completed and cancelled work 