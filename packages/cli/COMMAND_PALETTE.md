# Command Palette Documentation

The Command Palette is a powerful feature in the Astrolabe Dashboard that allows you to execute commands quickly using text-based input. Press `:` to open the command palette.

## Overview

The command palette provides a unified interface for:
- Creating and managing tasks
- Updating task statuses
- Navigating between panels
- Managing dependencies
- Controlling view settings
- Accessing help and information

## How to Use

1. **Open**: Press `:` to open the command palette
2. **Type**: Enter your command using the patterns described below
3. **Navigate**: Use `↑` and `↓` arrows to navigate suggestions
4. **Execute**: Press `Enter` to execute the selected command
5. **Cancel**: Press `Escape` or `Ctrl+C` to close without executing

## Available Commands

### Task Creation

#### `add "Task Title"`
Creates a new task with the specified title.
- **Pattern**: `add "Task Title"`
- **Example**: `add "Implement user authentication"`

#### `add "Task Title" under PARENT_ID`
Creates a new task under a specific parent task.
- **Pattern**: `add "Task Title" under PARENT_ID`
- **Example**: `add "Write unit tests" under TASK-123`

#### `add editor`
Opens the editor to create a new task with detailed information.
- **Pattern**: `add editor`
- **Example**: `add editor`

#### `add editor under PARENT_ID`
Opens the editor to create a new task under a specific parent.
- **Pattern**: `add editor under PARENT_ID`
- **Example**: `add editor under PROJ-456`

### Task Editing

#### `rename TASK_ID "New Title"`
Renames an existing task.
- **Pattern**: `rename TASK_ID "New Title"`
- **Example**: `rename TASK-123 "Updated task title"`

#### `edit TASK_ID`
Opens the editor to modify an existing task.
- **Pattern**: `edit TASK_ID`
- **Example**: `edit TASK-456`

#### `delete TASK_ID`
Deletes a task by its ID.
- **Pattern**: `delete TASK_ID`
- **Example**: `delete TASK-789`

### Status Updates

#### `status TASK_ID pending`
Sets a task status to pending.
- **Pattern**: `status TASK_ID pending`
- **Example**: `status TASK-123 pending`

#### `status TASK_ID in-progress`
Sets a task status to in-progress.
- **Pattern**: `status TASK_ID (in-progress|progress|active)`
- **Examples**: 
  - `status TASK-123 in-progress`
  - `status TASK-123 progress`
  - `status TASK-123 active`

#### `status TASK_ID done`
Sets a task status to done/completed.
- **Pattern**: `status TASK_ID (done|complete|finished)`
- **Examples**:
  - `status TASK-123 done`
  - `status TASK-123 complete`
  - `status TASK-123 finished`

#### `status TASK_ID cancelled`
Sets a task status to cancelled.
- **Pattern**: `status TASK_ID (cancelled|canceled|cancel)`
- **Examples**:
  - `status TASK-123 cancelled`
  - `status TASK-123 cancel`

### Navigation

#### `select TASK_ID`
Selects and focuses on a specific task.
- **Pattern**: `(select|goto|go) TASK_ID`
- **Examples**:
  - `select TASK-123`
  - `goto TASK-456`
  - `go TASK-789`

#### `focus sidebar`
Focuses on the project sidebar panel.
- **Pattern**: `(focus|panel) (sidebar|projects)`
- **Examples**:
  - `focus sidebar`
  - `panel projects`

#### `focus tree`
Focuses on the task tree panel.
- **Pattern**: `(focus|panel) (tree|tasks)`
- **Examples**:
  - `focus tree`
  - `panel tasks`

#### `focus details`
Focuses on the details panel.
- **Pattern**: `(focus|panel) (details|info)`
- **Examples**:
  - `focus details`
  - `panel info`

### View Controls

#### `toggle completed`
Toggles the visibility of completed tasks.
- **Pattern**: `(toggle|show|hide) (completed|done)`
- **Examples**:
  - `toggle completed`
  - `show done`
  - `hide completed`

#### `toggle detail view`
Toggles the detail view mode.
- **Pattern**: `(toggle|switch) (detail|view) mode?`
- **Examples**:
  - `toggle detail mode`
  - `switch view`

#### `toggle tree view`
Toggles the tree view mode.
- **Pattern**: `(toggle|switch) tree mode?`
- **Examples**:
  - `toggle tree mode`
  - `switch tree`

### Dependencies

#### `dep TASK_ID -> DEPENDS_ON_ID`
Adds a dependency relationship between tasks.
- **Pattern**: `dep TASK_ID -> DEPENDS_ON_ID`
- **Example**: `dep TASK-123 -> TASK-456`
- **Meaning**: TASK-123 depends on TASK-456 (TASK-456 must be completed first)

#### `undep TASK_ID -> DEPENDS_ON_ID`
Removes a dependency relationship between tasks.
- **Pattern**: `undep TASK_ID -> DEPENDS_ON_ID`
- **Example**: `undep TASK-123 -> TASK-456`

### Tree Operations

#### `expand all`
Expands all task nodes in the tree view.
- **Pattern**: `expand all`
- **Example**: `expand all`

#### `collapse all`
Collapses all task nodes in the tree view.
- **Pattern**: `collapse all`
- **Example**: `collapse all`

### Data Operations

#### `reload`
Reloads data from the database.
- **Pattern**: `(reload|refresh|sync)`
- **Examples**:
  - `reload`
  - `refresh`
  - `sync`

#### `save`
Saves pending changes to the database.
- **Pattern**: `(save|flush)`
- **Examples**:
  - `save`
  - `flush`

### Help and Information

#### `help`
Shows the help overlay.
- **Pattern**: `(help|?)`
- **Examples**:
  - `help`
  - `?`

#### `commands`
Lists all available commands.
- **Pattern**: `(commands|list)`
- **Examples**:
  - `commands`
  - `list`

## Command Patterns

Commands use regular expressions for flexible input. Here are some pattern conventions:

- **Required parameters**: `TASK_ID`, `"Title"` (in quotes)
- **Optional parameters**: `under PARENT_ID`
- **Alternative keywords**: `(option1|option2|option3)` means any of these work
- **Case insensitive**: Most commands are case-insensitive

## Error Handling

The command palette includes comprehensive error handling:

- **Invalid syntax**: Shows "Unknown command" message
- **Missing parameters**: Shows specific error about required fields
- **Task not found**: Shows error when referencing non-existent tasks
- **Operation failures**: Shows detailed error messages for failed operations

## Tips and Best Practices

1. **Use quotes for titles**: Always wrap task titles in double quotes to handle spaces and special characters
2. **Tab completion**: Start typing a command to see suggestions
3. **Short task IDs**: You can often use shortened task IDs if they're unique
4. **Batch operations**: Use multiple commands in sequence for complex operations
5. **Status shortcuts**: Use shorter status names like "progress" instead of "in-progress"

## Troubleshooting

### Command Palette Won't Open
- Ensure you're pressing `:` (colon) key
- Check that no other overlay is currently open
- Try pressing `Escape` first to clear any active state

### Commands Not Working
- Check command syntax against the patterns above
- Ensure task IDs exist and are correct
- Verify you have the necessary permissions
- Check the status bar for error messages

### Performance Issues
- The command palette includes debouncing for smooth typing
- Large task lists may cause slight delays in suggestions
- Consider using specific task IDs rather than searching

### Memory Issues
- The command palette properly cleans up resources
- If you experience crashes, check the console for error messages
- Report persistent issues with specific command patterns

## Implementation Notes

The command palette is implemented with:
- **Error boundaries**: Prevents crashes from propagating
- **Memory management**: Proper cleanup of event listeners and subscriptions
- **Debounced input**: Smooth typing experience with 100ms debounce
- **Null safety**: Comprehensive null and undefined checks
- **Async handling**: Proper error handling for async operations

## Future Enhancements

Planned improvements include:
- **Fuzzy search**: Better matching for task titles and IDs
- **Command history**: Recently used commands
- **Autocomplete**: Smart suggestions based on context
- **Bulk operations**: Commands that operate on multiple tasks
- **Custom commands**: User-defined command shortcuts
- **Search integration**: Find tasks by content or metadata

## Contributing

To add new commands:
1. Add the command definition to the `createCommands()` method
2. Define the regex pattern for matching input
3. Implement the async execute function with proper error handling
4. Add documentation to this file
5. Test the command thoroughly

For bug reports or feature requests, please check the project's issue tracker. 