# @astrolabe/cli

Command-line interface for Astrolabe, providing an intuitive terminal-based experience for task management with offline-first capabilities and AI agent integration.

## Overview

The `@astrolabe/cli` package provides a beautiful, interactive command-line interface built with React and Ink. It offers full access to Astrolabe's task management capabilities through an intuitive terminal experience.

## Features

- **🎨 Beautiful Interface**: Modern terminal UI built with React and Ink
- **⚡ Fast Operations**: Optimized for quick task management workflows
- **🔄 Real-time Updates**: Live task status and progress tracking
- **📋 Hierarchical Views**: Visual representation of task relationships
- **🎯 Interactive Commands**: Guided task creation and management
- **🔍 Smart Search**: Find tasks quickly with fuzzy search
- **📊 Progress Visualization**: Charts and progress bars for project status

## Installation

```bash
# Install globally
npm install -g @astrolabe/cli

# Or with pnpm
pnpm add -g @astrolabe/cli

# Or with yarn
yarn global add @astrolabe/cli
```

## Quick Start

```bash
# Initialize a new project
astrolabe init

# Create your first task
astrolabe create "Setup development environment"

# List all tasks
astrolabe list

# Start working on a task
astrolabe start <task-id>

# Mark a task as complete
astrolabe complete <task-id>
```

## Commands

### Project Management

#### `astrolabe init [options]`

Initialize a new Astrolabe project in the current directory.

```bash
# Basic initialization
astrolabe init

# Initialize with project name
astrolabe init --name "My Project"

# Initialize with custom database path
astrolabe init --database ./custom-tasks.db
```

**Options:**
- `--name <name>`: Project name
- `--database <path>`: Custom database file path
- `--encrypted`: Enable database encryption
- `--force`: Overwrite existing configuration

#### `astrolabe status`

Show project overview and statistics.

```bash
astrolabe status
```

### Task Management

#### `astrolabe list [options]`

List tasks with optional filtering and formatting.

```bash
# List all tasks
astrolabe list

# List only pending tasks
astrolabe list --status pending

# List tasks in a specific project
astrolabe list --project proj_123

# List with subtasks
astrolabe list --tree

# List in JSON format
astrolabe list --json
```

**Options:**
- `--status <status>`: Filter by status (`pending`, `in-progress`, `done`, `cancelled`)
- `--project <id>`: Filter by project ID
- `--parent <id>`: Show subtasks of a specific parent
- `--tree`: Show hierarchical tree view
- `--json`: Output in JSON format
- `--limit <n>`: Limit number of results

#### `astrolabe create <title> [options]`

Create a new task.

```bash
# Create a simple task
astrolabe create "Implement user authentication"

# Create with description
astrolabe create "Setup CI/CD" --description "Configure GitHub Actions for automated testing"

# Create as subtask
astrolabe create "Write unit tests" --parent task_123

# Create with specific status
astrolabe create "Review PR #456" --status in-progress
```

**Options:**
- `--description <text>`: Task description
- `--parent <id>`: Parent task ID (creates subtask)
- `--project <id>`: Project ID
- `--status <status>`: Initial status
- `--priority <level>`: Priority level (`high`, `medium`, `low`)

#### `astrolabe show <id>`

Show detailed information about a specific task.

```bash
# Show task details
astrolabe show task_123

# Show with full context (ancestors and descendants)
astrolabe show task_123 --context

# Show in JSON format
astrolabe show task_123 --json
```

**Options:**
- `--context`: Include parent and child tasks
- `--json`: Output in JSON format

#### `astrolabe update <id> [options]`

Update an existing task.

```bash
# Update task title
astrolabe update task_123 --title "New title"

# Update status
astrolabe update task_123 --status done

# Update description
astrolabe update task_123 --description "Updated description"

# Move to different parent
astrolabe update task_123 --parent task_456
```

**Options:**
- `--title <text>`: New title
- `--description <text>`: New description
- `--status <status>`: New status
- `--parent <id>`: New parent task ID
- `--priority <level>`: New priority level

#### `astrolabe delete <id> [options]`

Delete a task.

```bash
# Delete a single task
astrolabe delete task_123

# Delete task and all subtasks
astrolabe delete task_123 --cascade

# Force delete without confirmation
astrolabe delete task_123 --force
```

**Options:**
- `--cascade`: Delete all subtasks
- `--force`: Skip confirmation prompt

### Task Status Management

#### `astrolabe start <id>`

Mark a task as in-progress and optionally start a timer.

```bash
# Start working on a task
astrolabe start task_123

# Start with time tracking
astrolabe start task_123 --track-time
```

#### `astrolabe complete <id>`

Mark a task as complete.

```bash
# Complete a task
astrolabe complete task_123

# Complete with notes
astrolabe complete task_123 --notes "Implemented JWT authentication with refresh tokens"
```

#### `astrolabe pause <id>`

Pause work on a task (sets status back to pending).

```bash
astrolabe pause task_123
```

### Search and Filtering

#### `astrolabe search <query> [options]`

Search tasks by title, description, or content.

```bash
# Search by title
astrolabe search "authentication"

# Search in descriptions
astrolabe search "JWT" --in-description

# Search with filters
astrolabe search "bug" --status pending --project proj_123
```

**Options:**
- `--in-description`: Search in task descriptions
- `--status <status>`: Filter by status
- `--project <id>`: Filter by project
- `--limit <n>`: Limit results

### Project Commands

#### `astrolabe project create <name> [options]`

Create a new project.

```bash
# Create a project
astrolabe project create "Mobile App Redesign"

# Create with description
astrolabe project create "API Refactor" --description "Modernize REST API architecture"
```

#### `astrolabe project list`

List all projects.

```bash
astrolabe project list
```

#### `astrolabe project show <id>`

Show project details and associated tasks.

```bash
astrolabe project show proj_123
```

### Import/Export

#### `astrolabe export [options]`

Export tasks to various formats.

```bash
# Export to JSON
astrolabe export --format json --output tasks.json

# Export to Markdown
astrolabe export --format markdown --output tasks.md

# Export specific project
astrolabe export --project proj_123 --format json
```

#### `astrolabe import <file> [options]`

Import tasks from file.

```bash
# Import from JSON
astrolabe import tasks.json

# Import with project assignment
astrolabe import tasks.json --project proj_123
```

### Configuration

#### `astrolabe config [key] [value]`

Manage CLI configuration.

```bash
# Show all configuration
astrolabe config

# Get specific value
astrolabe config database.path

# Set configuration value
astrolabe config database.path ./new-tasks.db

# Reset to defaults
astrolabe config --reset
```

## Interactive Mode

Launch interactive mode for guided task management:

```bash
astrolabe interactive
```

Interactive mode provides:
- Visual task browser
- Guided task creation
- Real-time status updates
- Keyboard shortcuts for common operations

## Configuration

The CLI can be configured through:

1. **Configuration file** (`.astrolabe.json` in project root)
2. **Environment variables**
3. **Command-line flags**

### Configuration File Example

```json
{
  "database": {
    "path": "./tasks.db",
    "encrypted": true
  },
  "display": {
    "theme": "dark",
    "showIcons": true,
    "dateFormat": "relative"
  },
  "defaults": {
    "taskStatus": "pending",
    "priority": "medium"
  }
}
```

### Environment Variables

```bash
# Database configuration
ASTROLABE_DATABASE_PATH=./tasks.db
ASTROLABE_DATABASE_ENCRYPTED=true

# Display preferences
ASTROLABE_THEME=dark
ASTROLABE_SHOW_ICONS=true

# Logging
ASTROLABE_LOG_LEVEL=info
```

## Keyboard Shortcuts (Interactive Mode)

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate tasks |
| `Enter` | View task details |
| `n` | Create new task |
| `e` | Edit selected task |
| `d` | Delete selected task |
| `s` | Start/stop task |
| `c` | Complete task |
| `/` | Search tasks |
| `q` | Quit |

## Themes

The CLI supports multiple themes:

- `default`: Standard terminal colors
- `dark`: Dark theme optimized for dark terminals
- `light`: Light theme for light terminals
- `minimal`: Minimal styling with basic colors

Set theme with:
```bash
astrolabe config display.theme dark
```

## Integration with MCP

The CLI can work alongside MCP servers for AI agent integration:

```bash
# Start CLI with MCP server integration
astrolabe --mcp-server ./mcp-server.js

# Enable AI assistance mode
astrolabe --ai-assist
```

## Troubleshooting

### Common Issues

**Database locked error:**
```bash
# Check for running processes
astrolabe status --verbose

# Force unlock database
astrolabe config database.force-unlock true
```

**Permission errors:**
```bash
# Check file permissions
ls -la .astrolabe.json

# Reset configuration
astrolabe config --reset
```

**Performance issues:**
```bash
# Enable debug logging
ASTROLABE_LOG_LEVEL=debug astrolabe list

# Check database size
astrolabe status --database-info
```

## Development

### Building from Source

```bash
# Clone repository
git clone <repository-url>
cd astrolabe

# Install dependencies
pnpm install

# Build CLI package
pnpm --filter @astrolabe/cli build

# Link for development
pnpm --filter @astrolabe/cli link --global
```

### Running Tests

```bash
# Run CLI tests
pnpm --filter @astrolabe/cli test

# Run with coverage
pnpm --filter @astrolabe/cli test --coverage

# Run in watch mode
pnpm --filter @astrolabe/cli test:watch
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `pnpm verify` to ensure quality
6. Submit a pull request

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Related Packages

- [`@astrolabe/core`](../core/README.md) - Core task management library
- [`@astrolabe/mcp`](../mcp/README.md) - MCP server for AI agent integration
