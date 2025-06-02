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

# List with subtasks
astrolabe list --tree

# List in JSON format
astrolabe list --json
```

**Options:**
- `--status <status>`: Filter by status (`pending`, `in-progress`, `done`, `cancelled`)
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
- `--status <status>`: Initial status
- `--priority <level>`: Priority level (`high`, `medium`, `low`)

#### `astrolabe task generate [options]`

Generate multiple tasks from a Product Requirements Document (PRD) using AI.

```bash
# Generate tasks from inline content
astrolabe task generate --content "Build a user authentication system with JWT tokens, password reset, and email verification"

# Generate tasks from a PRD file
astrolabe task generate --file ./docs/prd.md

# Generate tasks as subtasks of an existing task
astrolabe task generate --file ./feature-spec.md --parent task_123

# Preview tasks without saving (dry run)
astrolabe task generate --content "Create a dashboard with charts" --dry

# Generate with existing tasks as context
astrolabe task generate --file ./prd.md --context "task_456,task_789" --verbose

# Generate with detailed output
astrolabe task generate --file ./requirements.md --verbose
```

**Options:**
- `--content <text>`: PRD content to generate tasks from (required if no --file)
- `--file <path>`: Path to PRD file to read (alternative to --content)
- `--parent <id>`: Parent task ID for generated tasks (creates subtasks)
- `--context <ids>`: Comma-separated list of existing task IDs for context
- `--type <type>`: Generator type (currently only 'prd' supported, default: 'prd')
- `--dry`: Preview tasks without saving to database
- `--verbose`: Show detailed generation information and validation feedback

**Features:**
- **🤖 AI-Powered**: Uses OpenAI to intelligently break down requirements
- **📋 Context-Aware**: Considers existing tasks to avoid duplication
- **✅ Validation**: Validates PRD content and provides suggestions
- **🔍 Preview Mode**: Test generation without saving to database
- **📊 Detailed Feedback**: Shows generation statistics and warnings

**Example PRD Content:**
```markdown
# User Authentication System

## Requirements
- User registration with email verification
- Login with JWT tokens
- Password reset functionality
- Role-based access control
- Session management

## Technical Details
- Use bcrypt for password hashing
- JWT tokens with 24-hour expiry
- Email service integration
- Database schema for users and roles
```

This command will analyze the PRD and generate actionable implementation tasks like "Implement user registration endpoint", "Create email verification service", "Design user database schema", etc.

#### `astrolabe task expand <id> [options]`

Expand a single task into multiple subtasks using AI-powered complexity analysis.

```bash
# Basic task expansion (uses complexity analysis to determine optimal subtask count)
astrolabe task expand task_123

# Expand with additional context for better AI generation
astrolabe task expand task_123 --context "Focus on security and scalability requirements"

# Expand with detailed output showing complexity analysis
astrolabe task expand task_123 --verbose

# Force replace existing subtasks (if any)
astrolabe task expand task_123 --force

# Expand all leaf tasks under a parent (root mode)
astrolabe task expand task_123 --root parent_task_456

# Use higher complexity threshold for expansion recommendations
astrolabe task expand task_123 --threshold 7
```

**Options:**
- `--context <text>`: Additional context to guide AI subtask generation
- `--force`: Replace existing subtasks if they exist
- `--threshold <n>`: Complexity threshold (1-10, default: 5) for expansion recommendations
- `--root <root-id>`: Root task ID - expand all leaf tasks under this root
- `--verbose`: Show detailed complexity analysis and expansion information

**Features:**
- **🧠 AI-Powered Complexity Analysis**: Automatically analyzes task complexity (1-10 scale)
- **🎯 Intelligent Subtask Generation**: Creates optimal number of subtasks based on complexity
- **🔬 Research Mode**: Always enabled for enhanced analysis and better results
- **📊 Root Processing**: Expand multiple leaf tasks under a root in one operation
- **✅ Quality Assurance**: Generates well-structured, actionable subtasks

**How It Works:**
1. **Complexity Analysis**: AI evaluates the task based on technical complexity, dependencies, risk factors, and implementation requirements
2. **Subtask Recommendation**: Determines optimal number of subtasks (typically 2-12 based on complexity)
3. **Intelligent Generation**: Creates detailed, actionable subtasks with clear descriptions and acceptance criteria
4. **Hierarchy Creation**: Properly organizes subtasks with parent-child relationships

**Example Output:**
```
✅ Task expansion complete: 8 subtasks created

📋 Implement user authentication system (TASK-123)
Created 8 subtasks using complexity-guided expansion
  Complexity Score: 7/10
  Reasoning: Complex system requiring security expertise, multiple integration points,
  comprehensive testing, and proper error handling...
  
  • Design user authentication schema (TASK-123-A1)
  • Implement user registration endpoint (TASK-123-A2)
  • Create JWT token service (TASK-123-A3)
  • Build password hashing utilities (TASK-123-A4)
  • Develop login/logout functionality (TASK-123-A5)
  • Implement password reset workflow (TASK-123-A6)
  • Add email verification system (TASK-123-A7)
  • Write comprehensive auth tests (TASK-123-A8)

Total subtasks created: 8
Context slices created: 1
```

**Root Mode Example:**
```bash
# Expand all leaf tasks under a feature
astrolabe task expand any_task --root feature_authentication

# This will find all tasks under "feature_authentication" that have no children
# and expand each of them into subtasks automatically
```

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
astrolabe search "bug" --status pending
```

**Options:**
- `--in-description`: Search in task descriptions
- `--status <status>`: Filter by status
- `--limit <n>`: Limit results

### Import/Export

#### `astrolabe export [options]`

Export tasks to various formats.

```bash
# Export to JSON
astrolabe export --format json --output tasks.json

# Export to Markdown
astrolabe export --format markdown --output tasks.md
```

#### `astrolabe import <file> [options]`

Import tasks from file.

```bash
# Import from JSON
astrolabe import tasks.json
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
