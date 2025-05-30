# Astrolabe Dashboard Design System

## Overview
The Astrolabe dashboard uses a clean, consistent design system to display task information clearly and intuitively.

## Icon System

### Task Status Icons
- `○` **Pending** - Task is ready to be worked on
- `◉` **In Progress** - Task is currently being worked on
- `✓` **Done** - Task is completed
- `✗` **Cancelled** - Task has been cancelled
- `⧈` **Archived** - Task has been archived

### Priority Icons
- `!` **High Priority** - Urgent tasks that need immediate attention
- *(no icon)* **Medium Priority** - Standard priority tasks
- `↓` **Low Priority** - Tasks that can be deferred

### Special Indicators
- `▶` / `▼` **Expand/Collapse** - Shows if a task has subtasks and their visibility state
- **Red Text** - Task is blocked by dependencies (entire row appears in red)

## Task Tree Display

### Format
```
[expand] [status] Task Title [priority]
```

### Examples
- `▶ ○ Implement authentication !` - High priority pending task with subtasks
- `▼ ◉ Create dashboard` - In-progress task with expanded subtasks
- `  ○ Add task filtering` (in red text) - Blocked subtask
- `  ✓ Setup project structure` - Completed task

## Task Details Panel

### Normal View
Shows comprehensive task information including:
- Task title, ID, status, and priority with icons
- Description (if available)
- Subtasks with status indicators
- Dependencies (tasks required before this one)
- Blocked tasks (tasks that depend on this one)
- Blocking status with clear instructions

### Dependency Graph View
Provides a visual representation of task relationships:
- Upstream dependencies (what needs to be done first)
- Current task position in the workflow
- Downstream dependents (what this task blocks)
- Flow summary with completion statistics

## Color Scheme

### Status Colors
- **Green** (`✓`) - Completed tasks
- **Yellow** (`◉`) - In-progress tasks
- **Cyan** (`○`) - Pending tasks
- **Red** (`✗`) - Cancelled tasks
- **Gray** (`⧈`) - Archived tasks

### UI Element Colors
- **Cyan** - Active borders, dependencies
- **Yellow** - Focus borders, warnings
- **Magenta** - Dependent tasks
- **Red** - Blocked status warnings
- **Gray** - Supplementary information

## Legend Display
The bottom legend shows:
1. **Icon meanings** - Quick reference for all status and priority icons
2. **Contextual key bindings** - Changes based on the active panel
3. **View mode indicator** - Shows current view (Hierarchy/Dependencies)

## Best Practices

### Visual Hierarchy
1. Use bold text for headers and important labels
2. Use color to indicate status and urgency
3. Keep blocked task indicators subtle but noticeable
4. Group related information with consistent spacing

### User Feedback
1. Show clear blocked status with actionable information
2. Provide count of blocking tasks for quick assessment
3. Use consistent icons across all views
4. Include helpful hints (e.g., "Press 'g' for dependency graph")

### Accessibility
1. Don't rely solely on color - use icons and text
2. Provide clear status text alongside icons
3. Use high contrast between text and backgrounds
4. Keep important information visible without scrolling when possible

## Technical Notes

### Unicode Considerations
- Avoid emojis in terminal interfaces as they can cause rendering artifacts
- Use ASCII characters for better compatibility across terminals
- Test rendering in different terminal environments
- Pad text appropriately to prevent ghosting when content changes 