# Dashboard Performance Improvements

## Issue
The CLI dashboard was freezing/becoming unresponsive when making updates, particularly:
1. When changing task status (space key)
2. When creating new tasks (a/A keys)
3. When editing tasks (e key)

**Update**: There was also an issue where newly created tasks were not being saved to the database.

## Root Cause
The CRUD operations were using problematic async patterns:
- They wrapped async operations in `(async () => { ... })()` 
- This caused immediate return without waiting for database operations to complete
- Each operation immediately triggered `flushChangesImmediate()` and `reloadFromDatabase()`
- These heavy database operations blocked the UI thread
- For new tasks, the system needed to get real database IDs, making the freeze more noticeable
- **Additional Issue**: The conditional reload after task creation was not always triggering, leaving tasks with temporary IDs that weren't persisted

## Solution
Implemented optimistic updates with deferred auto-save:

### 1. Removed Immediate Async Wrappers
- Converted CRUD operations to synchronous functions
- Removed `(async () => { ... })()` pattern that was causing race conditions

### 2. Implemented Optimistic Updates
- UI updates happen immediately when user makes changes
- Changes are tracked in memory using TrackingTaskTree
- No immediate database flush after each operation (except for new tasks)

### 3. Enabled Auto-Save with Short Interval
- Auto-flush enabled by default with 2-second interval
- Only flushes when there are pending changes and not already flushing
- Prevents concurrent flush operations

### 4. Improved UI Feedback
- Status bar shows "💾 Saving..." during flush operations
- Shows "● Unsaved (auto-save active)" when changes are pending
- Shows "✓ Saved" when all changes are persisted
- Task creation shows progressive status: "Creating task..." → "Saving task..." → "Finalizing task..." → "Task created successfully"

### 5. Simplified Keyboard Handlers
- Removed try-catch blocks and async handling from space key handler
- Store subscriptions handle UI updates automatically

### 6. Optimized Task Creation Flow
- New tasks show immediately with temporary IDs
- Background flush to get real database IDs
- **Fixed**: Always reload after task creation to ensure temporary IDs are replaced with real database IDs
- Automatic ID mapping from temporary to permanent IDs
- Smart reload that preserves selection and UI state

### 7. Fixed Task Persistence Issue
- Removed conditional reload logic that was sometimes skipping the database reload
- Task creation now always performs a full reload to ensure data persistence
- Added better error handling and status reporting throughout the creation process

## Benefits
- Immediate UI response to user actions
- No freezing or blocking during updates
- Changes are automatically saved in the background
- Better visual feedback about save status
- More robust error handling
- Smoother task creation experience
- **Guaranteed task persistence** - all newly created tasks are properly saved to the database

## Debugging
If you experience issues with task creation:
1. Run `./debug-task-creation.sh` to check current task state
2. Watch the status bar during task creation for the full progression:
   - "Creating task..." → "Saving task..." → "Finalizing task..." → "Task created successfully"
3. If any step fails, an error message should appear in the status bar
4. Check that the "Finalizing task..." step completes - this is when temporary IDs are replaced with real ones

## Technical Details
The key changes were made to:
- `packages/cli/source/dashboard/store/index.ts` - Store actions
- `packages/cli/source/dashboard/ui/components/task-tree.ts` - Keyboard handlers
- `packages/cli/source/dashboard/ui/components/status-bar.ts` - Status display

The pattern now follows:
1. User action → Immediate UI update
2. Mark as having unsaved changes
3. Auto-save triggers after 2 seconds (for most operations)
4. Background flush to database
5. UI shows save status throughout

For new task creation:
1. Create task with temporary ID
2. Show in UI immediately
3. Flush to get real ID
4. **Always reload** to ensure database consistency
5. Map temporary ID to permanent ID 
6. Update UI with final state 