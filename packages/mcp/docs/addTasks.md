# addTasks

Creates multiple tasks in a single batch operation, with support for parent-child relationships and dependencies between tasks in the same batch.

## Purpose

This tool enables efficient bulk task creation with complex relationships. It's particularly useful for breaking down large features or projects into constituent tasks while establishing their interdependencies in a single atomic operation.

## Parameters

- **tasks**: Array of task objects to create (minimum 1 required)

### Task Object Properties

- **title**: Task title (required, non-empty)
- **description**: Detailed task description (optional)
- **parentTaskId**: ID of existing parent task (optional)
- **parentIndex**: Index of parent task within this batch (optional)
- **priority**: Task priority - `low`, `medium`, `high` (default: `medium`)
- **status**: Task status - `pending`, `in-progress`, `done`, `cancelled` (default: `pending`)
- **details**: Additional task instructions or context (optional)
- **dependsOn**: Array of indices within this batch that this task depends on (optional)

## Key Features

### Local Referencing
Use `parentIndex` and `dependsOn` to reference other tasks within the same batch by their array index (0-based).

### Dependency Management
The `dependsOn` array creates dependency relationships where this task cannot start until all referenced tasks are complete.

### Hierarchical Structure
Use `parentTaskId` for existing parents or `parentIndex` for parents created in the same batch.

## Example Calls

### Simple batch creation
```json
{
  "tasks": [
    {
      "title": "Research user authentication patterns",
      "priority": "high"
    },
    {
      "title": "Design login API endpoints",
      "priority": "medium",
      "dependsOn": [0]
    },
    {
      "title": "Implement user registration",
      "priority": "medium",
      "dependsOn": [1]
    }
  ]
}
```

### Complex hierarchy with mixed referencing
```json
{
  "tasks": [
    {
      "title": "User Authentication Feature",
      "description": "Complete user auth system",
      "parentTaskId": "project_main"
    },
    {
      "title": "Frontend Auth Components",
      "parentIndex": 0
    },
    {
      "title": "Backend Auth API",
      "parentIndex": 0
    },
    {
      "title": "Login Form Component",
      "parentIndex": 1,
      "dependsOn": [2]
    },
    {
      "title": "Registration Form Component", 
      "parentIndex": 1,
      "dependsOn": [2]
    }
  ]
}
```

### Project breakdown
```json
{
  "tasks": [
    {
      "title": "E-commerce Dashboard",
      "description": "Admin dashboard for managing products and orders"
    },
    {
      "title": "Product Management Module",
      "parentIndex": 0
    },
    {
      "title": "Order Management Module", 
      "parentIndex": 0
    },
    {
      "title": "Product CRUD Operations",
      "parentIndex": 1,
      "priority": "high"
    },
    {
      "title": "Order Processing Pipeline",
      "parentIndex": 2,
      "dependsOn": [3],
      "priority": "high"
    }
  ]
}
```

## Return Value

Returns an array of created task objects with their assigned IDs and metadata.

## Best Practices

- **Start with structure**: Create parent tasks first in the array
- **Use local references**: Prefer `parentIndex` over `parentTaskId` for batch-created parents
- **Model dependencies**: Use `dependsOn` to ensure proper task ordering
- **Set priorities**: Use priority levels to guide task execution order
- **Provide context**: Include descriptions and details for complex tasks

## Common Use Cases

- **Feature decomposition**: Break down epics into stories and tasks
- **Project initialization**: Set up entire project task hierarchies
- **Sprint planning**: Create related tasks for a development sprint
- **Workflow modeling**: Establish task sequences with dependencies 