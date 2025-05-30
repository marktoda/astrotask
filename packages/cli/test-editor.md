# Testing Editor Fix for CLI Dashboard

## Issue
When spawning an external editor from the CLI dashboard, the editor doesn't receive all key presses and skips/doesn't run smoothly.

**Update**: After the initial fixes, the dashboard UI was not properly restored after closing the editor (everything highlighted, inputs not working, and sometimes still capturing input during editor session).

**Update 2**: After implementing the screen recreation approach, tasks created in the editor were not being saved because the execution context was lost when the screen was destroyed.

## Root Cause
1. **Initial issue**: The blessed terminal UI library was still capturing keyboard input while the external editor was running
2. **Restoration issue**: The terminal state and blessed screen weren't being properly restored after the editor closed
3. **Fundamental issue**: Trying to manage complex terminal state transitions while keeping blessed "alive" was too fragile
4. **Task saving issue**: When destroying and recreating the screen, the async execution context was lost

## Final Solution
Complete refactor using a cleaner approach with proper task data persistence:
1. **Destroy blessed screen completely** before launching editor
2. **Use synchronous execution** (`execFileSync`) to run the editor
3. **Store pending task data** in a global variable that survives screen recreation
4. **Recreate blessed screen** after editor exits
5. **Process pending task data** after dashboard reinitializes
6. **Immediate flush after task creation** to get real database IDs quickly
7. **Proper ID mapping handling** when flush operations complete

This approach completely avoids the complexity of trying to pause/resume blessed's terminal handling and ensures task data is properly saved with correct ID management.

## Temporary ID Fix
**Issue**: Tasks created through the editor got temporary IDs (like `temp-1234567890`) and when users tried to edit them immediately (before auto-flush), the dashboard would crash because the temporary IDs weren't properly handled during state transitions.

**Solution**: 
1. **Immediate flush**: After creating a task from editor template, immediately flush to database to get real IDs
2. **ID mapping preservation**: When flush operations complete, properly update all UI references (selectedTaskId, expandedTaskIds) from temporary IDs to real database IDs  
3. **Sequential flush handling**: Process tree flush first to get ID mappings, then apply those mappings to dependency operations
4. **Better error handling**: More robust error handling in case flush operations fail

This ensures that newly created tasks get real database IDs as quickly as possible, minimizing the window where temporary ID issues could occur.

## Technical Details
- Uses `execFileSync` from Node.js to run editor synchronously
- Blessed screen is destroyed with `screen.destroy()` before editor launches
- Terminal is reset to normal state with escape sequences
- Task data from editor is stored in `EditorService` static storage
- After editor exits, a custom event triggers dashboard recreation
- All UI components are recreated with fresh blessed screen instance
- Dashboard checks for pending task data and processes it after recreation

## Test Steps
1. Build the CLI: `cd packages/cli && npm run build`
2. Run the dashboard: `npm run dashboard`
3. Navigate to a task in the tree view
4. Press 'a' to add a sibling task with editor or 'A' for child task
5. Fill out the task template in the editor and save the file
6. Verify that:
   - The terminal cleanly switches to the editor
   - All keystrokes are received by the editor
   - No characters are skipped or delayed
   - The editor runs exactly as if launched normally
   - After closing the editor (save and exit), verify:
     - The dashboard is completely recreated
     - **The task you created appears in the task tree**
     - The status message shows "Created task: [your task title]"
     - All UI elements work correctly
     - No visual artifacts or highlighting issues
     - Navigation and key bindings work properly
     - Task tree state is preserved
7. **Test immediate editing after creation** (this was the reported bug):
   - Create a new task using the editor (press 'a' or 'A')
   - Immediately after the task appears in the tree, try editing it:
     - Press Space to toggle task status
     - Press 'r' to rename the task
   - Verify that:
     - The dashboard does not crash
     - The edit operations work correctly
     - Status changes are applied successfully
     - The task maintains its position in the tree
8. Press 'q' twice to exit and verify the task was persisted to the database
9. Try different editors by setting EDITOR environment variable:
   - `EDITOR=nano npm run dashboard`
   - `EDITOR=vim npm run dashboard`
   - `EDITOR=code npm run dashboard` (for VS Code)
   - `EDITOR=nvim npm run dashboard` (for Neovim)

## Expected Results
- Clean transition from dashboard to editor
- Editor works exactly as expected with no input issues
- Task data is properly saved when you save and exit the editor
- Clean transition back to dashboard after editor closes
- New task appears in the task tree with correct details
- Dashboard is fully functional after editor session
- No terminal state corruption or visual artifacts
- Task is persisted to the database

## Benefits of This Approach
1. **Simplicity**: No complex terminal state management
2. **Reliability**: Editor gets complete control of terminal
3. **Compatibility**: Works with any editor that runs in terminal
4. **Clean State**: Fresh blessed instance eliminates state corruption issues
5. **Data Persistence**: Task data survives screen recreation through static storage 