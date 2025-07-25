# @astrotask/cli

Command-line interface for Astrotask task management.

## Overview

The `@astrotask/cli` package provides a beautiful, interactive command-line interface built with React and Ink. It offers full access to Astrotask's task management capabilities through an intuitive terminal experience.

## Features

- **🎨 Beautiful Interface**: Modern terminal UI built with React and Ink
- **⚡ Fast Operations**: Optimized for quick task management workflows
- **🔄 Real-time Updates**: Live task status and progress tracking
- **📋 Hierarchical Views**: Visual representation of task relationships
- **🎯 Interactive Commands**: Guided task creation and management
- **🔍 Smart Search**: Find tasks quickly with fuzzy search
- **📊 Progress Visualization**: Charts and progress bars for project status

## Installation

### Global Installation (Recommended)

```bash
npm install -g @astrotask/cli
```

After installation, you can use the `astro` command globally:

```bash
astro --help
```

### Using npx

Run without installation:

```bash
npx @astrotask/cli --help
```

## Quick Start

```bash
# 1. Create a new workspace
mkdir my-project && cd my-project

# 2. Initialize Astrotask (creates ./data/astrotask.db)
astro init

# 3. Add a task and view it
astro task add "Ship public launch"
astro task list

# 4. Open the live dashboard
astro dashboard
```

## Commands

### Task Management

```bash
# Add tasks
astro task add "Write documentation"
astro task add "Design hero section" --parent 123e456 --priority high

# List and view tasks
astro task list
astro task next
astro task tree

# Update tasks
astro task done <id>
astro task update <id> --status done
```

### Dashboard

```bash
# Open interactive dashboard
astro dashboard
```

### Dependencies

```bash
# Manage task dependencies
astro dependency add <dependent-id> <dependency-id>
astro dependency list
astro dependency tree
```

## Configuration

The CLI uses environment variables for configuration:

```bash
# Database location
DATABASE_URI=sqlite://./data/astrotask.db

# Enable debug mode
DEBUG=true
```

## License

MIT

## Related Packages

- [`@astrotask/core`](../core/README.md) - Core task management library
- [`@astrotask/mcp`](../mcp/README.md) - MCP server for AI agent integration
