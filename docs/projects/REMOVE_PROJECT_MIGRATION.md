# Project Removal Migration Summary

This document summarizes the major refactor that removed the "projects" concept from Astrolabe and replaced it with a pure task hierarchy where root tasks (tasks with no parentId) serve the same organizational purpose.

## Changes Made

### 1. Database Schema Changes

**File: `packages/core/src/database/schema.ts`**
- Removed `projects` table definition
- Added `priority` field to `tasks` table with enum constraint ('low', 'medium', 'high')
- Updated task status enum to include 'archived' status

**File: `packages/core/migrations/01_remove_projects.sql`**
- Created migration script to:
  - Add priority column to existing tasks
  - Convert existing projects to root tasks (parentId = NULL)
  - Map project status to task status (active → pending, completed → done, archived → archived)
  - Move project tasks to become subtasks of converted root tasks
  - Remove project_id column from tasks
  - Drop projects table
  - Clean up orphaned task references

### 2. Schema Updates

**File: `packages/core/src/schemas/task.ts`**
- Added `taskPriority` enum with values: 'low', 'medium', 'high'
- Updated `taskStatus` enum to include 'archived'
- Added `priority` field to task schemas
- Removed all project-related references

**File: `packages/core/src/schemas/contextSlice.ts`**
- Removed project references (projectId field)

**File: `packages/core/src/schemas/project.ts`**
- **DELETED** - Entire file removed

**File: `packages/core/src/schemas/index.ts`**
- Removed all project schema exports and imports
- Updated schema registry to exclude project schemas
- Removed project type guards and validation functions

### 3. Core Database Layer

**File: `packages/core/src/database/store.ts`**
- Removed all project-related methods (`listProjects`, `addProject`, `getProject`, etc.)
- Updated task filtering to remove `projectId` parameter
- Added convenience methods for root tasks (`listRootTasks`)

**File: `packages/core/src/database/electric.ts`**
- Removed 'projects' table from sync initialization
- Updated sync to only handle 'tasks' and 'context_slices' tables

**File: `packages/core/src/database/index.ts`**
- Removed project type exports
- Added TaskStatus and TaskPriority exports

### 4. MCP Server Updates

**File: `packages/mcp/src/handlers/types.ts`**
- Updated task schemas to include priority field
- Removed project-related parameters from task operations
- Updated task status enum to include 'archived'

**File: `packages/mcp/src/handlers/TaskHandlers.ts`**
- Removed project filtering from task operations
- Added priority field support in task creation and updates
- Updated task listing to work with root tasks instead of projects

### 5. CLI Updates

**File: `packages/cli/source/commands/index.tsx`**
- Removed project overview section
- Updated dashboard to focus on root tasks
- Added priority display in task listings
- Added 'archived' status support
- Updated statistics to include archived tasks

**File: `packages/cli/source/commands/task/list.tsx`**
- Updated to show root tasks and subtasks separately
- Added priority display
- Removed project filtering references

**File: `packages/cli/source/commands/task/add.tsx`**
- Added priority option to task creation
- Updated task creation to include priority field

## Migration Strategy

### For Existing Data

The migration script (`01_remove_projects.sql`) handles existing data by:

1. **Converting Projects to Root Tasks**: Each project becomes a root task with:
   - Same ID, title, description, created/updated timestamps
   - Status mapping: active → pending, completed → done, archived → archived
   - Priority preserved from project priority
   - parentId set to NULL (making it a root task)

2. **Preserving Task Hierarchy**: Tasks that belonged to projects become subtasks of the converted root tasks

3. **Data Integrity**: Orphaned tasks are converted to root tasks to prevent data loss

### For New Development

- **Root Tasks**: Use tasks with `parentId = null` for top-level organization
- **Priority**: All tasks now have a priority field (low/medium/high)
- **Status**: Tasks can now be 'archived' in addition to existing statuses
- **Hierarchy**: Full task hierarchy is preserved through parent-child relationships

## Benefits of This Change

1. **Simplified Architecture**: Single entity type (tasks) instead of two (projects + tasks)
2. **Flexible Hierarchy**: Unlimited nesting depth for task organization
3. **Consistent API**: All operations work on tasks, reducing complexity
4. **Better Scalability**: No artificial project boundaries
5. **Enhanced Features**: Priority field available for all tasks, not just projects

## Breaking Changes

### API Changes
- All project-related MCP tools removed
- Task creation now requires priority field
- Task listing no longer accepts projectId filter

### CLI Changes
- Project commands removed
- Dashboard shows root tasks instead of projects
- Task commands updated to show priority

### Database Changes
- Projects table removed
- Tasks table structure updated with priority field
- New 'archived' status available

## Backward Compatibility

The migration script ensures existing data is preserved and converted appropriately. However, any external integrations that relied on the projects API will need to be updated to work with root tasks instead.

## Testing Recommendations

1. **Data Migration**: Test the migration script with sample data
2. **API Compatibility**: Verify all MCP tools work with the new schema
3. **CLI Functionality**: Test all CLI commands with the updated interface
4. **Hierarchy Integrity**: Ensure parent-child relationships are maintained correctly

## Future Considerations

- Consider adding task templates or categories if project-like grouping is needed
- Monitor usage patterns to see if additional organizational features are required
- Evaluate if task priority should have more granular levels 