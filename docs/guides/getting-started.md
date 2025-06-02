# Getting Started with Astrolabe

Welcome to Astrolabe! This guide will help you get up and running with the local-first, MCP-compatible task management platform.

## What is Astrolabe?

Astrolabe is a modern task management platform designed for both humans and AI agents. It features:

- **Local-First Architecture**: All your data stays on your machine
- **Offline Capabilities**: Full functionality without internet
- **AI Agent Integration**: Native MCP support for AI collaboration
- **Hierarchical Tasks**: Organize work with nested task structures
- **Type-Safe**: Built with TypeScript for reliability

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.0.0 or higher
- **pnpm** (recommended) or npm/yarn
- Basic familiarity with command-line tools

## Installation Options

### Option 1: Using the CLI (Recommended for Users)

Install the CLI globally for the best user experience:

```bash
# Install globally with pnpm (recommended)
pnpm add -g @astrotask/cli

# Or with npm
npm install -g @astrotask/cli

# Or with yarn
yarn global add @astrotask/cli
```

### Option 2: Using the Core Library (For Developers)

If you're building applications with Astrolabe:

```bash
# Add to your project
pnpm add @astrotask/core

# For MCP server functionality
pnpm add @astrotask/mcp
```

### Option 3: Development Setup

To contribute or run from source:

```bash
# Clone the repository
git clone https://github.com/astrotask/astrotask.git
cd astrotask

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Quick Start: CLI

### 1. Initialize Your First Project

```bash
# Create a new directory for your project
mkdir my-project
cd my-project

# Initialize Astrolabe
astrotask init --name "My First Project"
```

This creates:
- `.astrotask.json` - Configuration file
- `tasks.db` - Local SQLite database
- Basic project structure

### 2. Create Your First Task

```bash
# Create a simple task
astrotask create "Set up development environment"

# Create a task with description
astrotask create "Implement user authentication" \
  --description "Add JWT-based auth with refresh tokens"

# Create a subtask
astrotask create "Write unit tests" --parent task_123
```

### 3. View and Manage Tasks

```bash
# List all tasks
astrotask list

# Show task details
astrotask show task_123

# Update task status
astrotask update task_123 --status in-progress

# Complete a task
astrotask complete task_123
```

### 4. Organize with Projects

```bash
# Create a project
astrotask project create "Mobile App Redesign"

# Assign tasks to project
astrotask create "Design new UI" --project proj_123

# View project tasks
astrotask project show proj_123
```

## Quick Start: Programmatic Usage

### 1. Basic Task Management

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

// Initialize database and service
const store = createDatabase({ path: './tasks.db' });
const taskService = new TaskService(store);

// Create a task
const task = await taskService.createTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication system',
  status: 'pending'
});

console.log('Created task:', task.id);

// List all tasks
const tasks = await taskService.listTasks();
console.log('Total tasks:', tasks.length);

// Update task
await taskService.updateTask(task.id, {
  status: 'in-progress'
});

// Get task with context
const context = await taskService.getTaskContext(task.id, {
  includeDescendants: true
});
```

### 2. Working with Hierarchical Tasks

```typescript
// Create parent task
const parentTask = await taskService.createTask({
  title: 'Build authentication system'
});

// Create subtasks
const subtask1 = await taskService.createTask({
  title: 'Design user schema',
  parentId: parentTask.id
});

const subtask2 = await taskService.createTask({
  title: 'Implement JWT tokens',
  parentId: parentTask.id
});

// Get full task tree
const tree = await taskService.getTaskTree(parentTask.id);
console.log('Task hierarchy:', tree);
```

## Quick Start: MCP Integration

### 1. Set Up MCP Server

For AI agent integration, set up the MCP server:

```bash
# Start MCP server
npx @astrotask/mcp --database-path ./tasks.db
```

### 2. Configure with Cursor IDE

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "astrotask": {
      "command": "npx",
      "args": ["@astrotask/mcp"],
      "env": {
        "DATABASE_PATH": "./tasks.db",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 3. Use with AI Agents

Once configured, AI agents can interact with your tasks:

```json
{
  "name": "createTask",
  "arguments": {
    "title": "Refactor authentication module",
    "description": "Improve code structure and add error handling",
    "status": "pending"
  }
}
```

## Core Concepts

### Tasks

Tasks are the fundamental unit of work in Astrolabe:

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'done' | 'cancelled';
  parentId?: string;  // For subtasks
  projectId?: string; // Project assignment
  createdAt: Date;
  updatedAt: Date;
}
```

### Task Hierarchy

Tasks can be organized hierarchically:

```
📋 Build Authentication System
├── 🔧 Design user schema
├── 🔑 Implement JWT tokens
│   ├── 📝 Create token service
│   └── 🧪 Write token tests
└── 🔒 Add password hashing
```

### Projects

Projects group related tasks:

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
}
```

### Context Slices

For AI agents, context slices provide relevant information:

```typescript
interface ContextSlice {
  taskId: string;
  content: string;
  metadata: Record<string, any>;
}
```

## Configuration

### CLI Configuration

The CLI can be configured through `.astrotask.json`:

```json
{
  "database": {
    "path": "./tasks.db",
    "encrypted": false
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

Configure through environment variables:

```bash
# Database settings
ASTROLABE_DATABASE_PATH=./tasks.db
ASTROLABE_DATABASE_ENCRYPTED=true

# Display preferences
ASTROLABE_THEME=dark
ASTROLABE_LOG_LEVEL=info

# MCP server settings
MCP_SERVER_NAME=astrotask
MCP_SERVER_VERSION=1.0.0
```

### Programmatic Configuration

```typescript
import { cfg } from '@astrotask/core';

// Access current configuration
console.log('Log level:', cfg.LOG_LEVEL);
console.log('Environment:', cfg.NODE_ENV);
```

## Common Workflows

### 1. Daily Task Management

```bash
# Start your day
astrotask list --status pending

# Pick a task to work on
astrotask start task_123

# Update progress
astrotask update task_123 --description "Added user model"

# Complete the task
astrotask complete task_123 --notes "Implemented with validation"
```

### 2. Project Planning

```bash
# Create project
astrotask project create "Q1 Feature Release"

# Break down into tasks
astrotask create "User authentication" --project proj_123
astrotask create "Dashboard redesign" --project proj_123
astrotask create "Performance optimization" --project proj_123

# Create subtasks
astrotask create "Login form" --parent task_456
astrotask create "Password reset" --parent task_456
```

### 3. Team Collaboration

```bash
# Export tasks for sharing
astrotask export --format json --output team-tasks.json

# Import tasks from teammate
astrotask import teammate-tasks.json

# Sync with shared database (if using sync)
astrotask sync --remote https://sync.example.com
```

## Best Practices

### Task Organization

1. **Use Descriptive Titles**: Make task purposes clear
2. **Break Down Large Tasks**: Use subtasks for complex work
3. **Add Context**: Include relevant details in descriptions
4. **Set Realistic Statuses**: Keep status updates current

### Project Structure

1. **Group Related Work**: Use projects for cohesive features
2. **Maintain Hierarchy**: Organize tasks logically
3. **Regular Reviews**: Periodically review and update tasks
4. **Archive Completed**: Keep workspace clean

### AI Integration

1. **Provide Context**: Use context slices for better AI assistance
2. **Clear Descriptions**: Help AI understand task requirements
3. **Regular Updates**: Keep task status current for AI awareness
4. **Use PRD Fields**: Include requirements for AI reference

## Troubleshooting

### Common Issues

**Database locked error:**
```bash
# Check for running processes
astrotask status --verbose

# Force unlock if needed
astrotask config database.force-unlock true
```

**Permission errors:**
```bash
# Check file permissions
ls -la .astrotask.json

# Reset configuration
astrotask config --reset
```

**MCP connection issues:**
```bash
# Check MCP server status
DEBUG=astrotask:* npx @astrotask/mcp

# Verify configuration
cat .cursor/mcp.json
```

### Getting Help

- **Documentation**: Check the [full documentation](../README.md)
- **API Reference**: See [API docs](../api/core-api.md)
- **Examples**: Browse [example projects](../examples/)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/astrotask/astrotask/issues)

## Next Steps

Now that you're set up, explore these advanced features:

1. **[MCP Integration Guide](./mcp-integration.md)** - Deep dive into AI agent integration
2. **[Advanced Task Management](./advanced-tasks.md)** - Complex workflows and patterns
3. **[Database Management](./database-guide.md)** - Backup, sync, and migration
4. **[API Development](./api-development.md)** - Building applications with Astrolabe
5. **[Contributing Guide](./contributing.md)** - Help improve Astrolabe

## Examples

### Simple Todo App

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

class TodoApp {
  private taskService: TaskService;

  constructor() {
    const store = createDatabase({ path: './todos.db' });
    this.taskService = new TaskService(store);
  }

  async addTodo(title: string) {
    return await this.taskService.createTask({
      title,
      status: 'pending'
    });
  }

  async completeTodo(id: string) {
    return await this.taskService.updateTask(id, {
      status: 'done'
    });
  }

  async listTodos() {
    return await this.taskService.listTasks({
      status: 'pending'
    });
  }
}

// Usage
const app = new TodoApp();
await app.addTodo('Buy groceries');
await app.addTodo('Walk the dog');
const todos = await app.listTodos();
console.log('Pending todos:', todos.length);
```

### Project Management Dashboard

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

class ProjectDashboard {
  private taskService: TaskService;

  constructor() {
    const store = createDatabase({ path: './projects.db' });
    this.taskService = new TaskService(store);
  }

  async getProjectStats(projectId: string) {
    const tasks = await this.taskService.listTasks({ projectId });
    
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'done').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length
    };

    return {
      ...stats,
      completionRate: stats.total > 0 ? stats.completed / stats.total : 0
    };
  }

  async getTaskTree(projectId: string) {
    const tasks = await this.taskService.listTasks({ projectId });
    const rootTasks = tasks.filter(t => !t.parentId);
    
    return Promise.all(
      rootTasks.map(task => 
        this.taskService.getTaskTree(task.id)
      )
    );
  }
}
```

Welcome to Astrolabe! Start building better task management workflows today. 
